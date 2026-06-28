"""
Data collector module.
Fetches real-time weather data from Open-Meteo and infrastructure data from OpenStreetMap.
"""
import numpy as np
import pandas as pd
import json
import os
import httpx
import time
from .geom_extractor import generate_voronoi_zones
from .utils import OUTPUTS_DIR

def generate_grid_for_bbox(bbox, step=0.0025):
    """Generate a spatial grid for a given bounding box."""
    lat_min, lat_max, lon_min, lon_max = bbox
    # Ensure lat_min < lat_max
    if lat_min > lat_max: lat_min, lat_max = lat_max, lat_min
    if lon_min > lon_max: lon_min, lon_max = lon_max, lon_min
    
    # Cap grid size for MVP performance (max ~40x40 = 1600 cells)
    lat_diff = lat_max - lat_min
    lon_diff = lon_max - lon_min
    if lat_diff > 0.1:
        center_lat = (lat_min + lat_max) / 2
        lat_min, lat_max = center_lat - 0.05, center_lat + 0.05
    if lon_diff > 0.1:
        center_lon = (lon_min + lon_max) / 2
        lon_min, lon_max = center_lon - 0.05, center_lon + 0.05

    lats = np.arange(lat_min, lat_max, step)
    lons = np.arange(lon_min, lon_max, step)

    cells = []
    for lat in lats:
        for lon in lons:
            cells.append({
                "cell_id": f"cell_{lat:.4f}_{lon:.4f}",
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "lat_max": round(lat + step, 4),
                "lon_max": round(lon + step, 4),
            })
    return pd.DataFrame(cells), (lat_min, lat_max, lon_min, lon_max)

def fetch_live_weather(lat, lon):
    """Fetch live weather from Open-Meteo."""
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m"
        resp = httpx.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            curr = data.get("current", {})
            return {
                "air_temp": curr.get("temperature_2m", 35.0),
                "humidity": curr.get("relative_humidity_2m", 45.0),
                "wind_speed": curr.get("wind_speed_10m", 3.5) / 3.6  # km/h to m/s
            }
    except Exception as e:
        print(f"Weather API error: {e}")
    return {"air_temp": 35.0, "humidity": 45.0, "wind_speed": 3.5}

def fetch_osm_features(bbox):
    """Fetch basic features from OpenStreetMap (water, roads as proxy for buildings, zones)."""
    lat_min, lat_max, lon_min, lon_max = bbox
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = f"""
    [out:json][timeout:25];
    (
      way["natural"="water"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["waterway"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["highway"~"trunk|primary|secondary|tertiary|residential"]({lat_min},{lon_min},{lat_max},{lon_max});
      node["place"~"suburb|quarter|neighbourhood"]({lat_min},{lon_min},{lat_max},{lon_max});
    );
    out center;
    """
    try:
        headers = {"User-Agent": "curl/8.7.1", "Accept": "*/*"}
        resp = httpx.post(overpass_url, data={"data": overpass_query}, headers=headers, timeout=30)
        print(f"[data_collector] OSM Features Query Status: {resp.status_code}")
        if resp.status_code == 200:
            elements = resp.json().get("elements", [])
            print(f"[data_collector] Extracted {len(elements)} OSM features")
            return elements
    except Exception as e:
        print(f"OSM API error: {e}")
    return []

def assign_features(grid_df, osm_elements, weather_data, query_name="City Zone"):
    """Assign features to grid cells based on OSM data and live weather."""
    n = len(grid_df)
    
    water_centers = []
    road_centers = []
    zones = []
    
    for el in osm_elements:
        tags = el.get("tags", {})
        if "center" in el or "lat" in el:
            lat = el.get("lat") or el["center"]["lat"]
            lon = el.get("lon") or el["center"]["lon"]
            c = (lat, lon)
            
            if "highway" in tags:
                road_centers.append(c)
            elif "water" in tags or "natural" in tags or "waterway" in tags:
                water_centers.append(c)
            elif "place" in tags:
                zones.append({"name": tags.get("name", "Unnamed Zone"), "lat": lat, "lon": lon})
                
    water_centers = np.array(water_centers) if water_centers else np.empty((0, 2))
    road_centers = np.array(road_centers) if road_centers else np.empty((0, 2))

    lulc_classes = []
    ndvis, ndwis, albedos = [], [], []
    b_densities, b_heights = [], []
    zone_names = []
    
    # Calculate city center for fallback urban density
    center_lat = grid_df["lat"].mean()
    center_lon = grid_df["lon"].mean()
    
    for _, row in grid_df.iterrows():
        lat, lon = row["lat"], row["lon"]
        
        # Zone assignment
        if zones:
            dist_sq_zones = [(z["lat"] - lat)**2 + (z["lon"] - lon)**2 for z in zones]
            zone_names.append(zones[np.argmin(dist_sq_zones)]["name"])
        else:
            zone_names.append(query_name)
            
        w_count = 0
        r_count = 0
        
        if len(road_centers) > 0:
            dist_sq = (road_centers[:, 0] - lat)**2 + (road_centers[:, 1] - lon)**2
            r_count = np.sum(dist_sq < 0.0025**2)
            
        if len(water_centers) > 0:
            dist_sq = (water_centers[:, 0] - lat)**2 + (water_centers[:, 1] - lon)**2
            w_count = np.sum(dist_sq < 0.003**2)
            
        # robust fallback if no roads found (simulate city center density)
        if len(road_centers) == 0:
            dist_to_center = np.sqrt((lat - center_lat)**2 + (lon - center_lon)**2)
            intensity = max(0, 1 - (dist_to_center / 0.05))
            r_count = int(intensity * 8) + np.random.randint(0, 2)
            
        if w_count > 0:
            lulc_classes.append("water")
            ndvis.append(0.05 + np.random.normal(0, 0.02))
            ndwis.append(0.45 + np.random.normal(0, 0.05))
            albedos.append(0.06 + np.random.normal(0, 0.01))
            b_densities.append(0)
            b_heights.append(0)
        elif r_count > 3:
            lulc_classes.append("built_up")
            ndvis.append(0.12 + np.random.normal(0, 0.02))
            ndwis.append(-0.15 + np.random.normal(0, 0.05))
            albedos.append(0.15 + np.random.normal(0, 0.02))
            b_densities.append(min(r_count * 15, 250))
            b_heights.append(12 + np.random.normal(0, 3))
        elif r_count > 0:
            lulc_classes.append(np.random.choice(["built_up", "road"]))
            ndvis.append(0.20 + np.random.normal(0, 0.05))
            ndwis.append(-0.1 + np.random.normal(0, 0.05))
            albedos.append(0.12 + np.random.normal(0, 0.02))
            b_densities.append(r_count * 15)
            b_heights.append(8 + np.random.normal(0, 2))
        else:
            lulc_classes.append(np.random.choice(["vegetation", "bare"], p=[0.7, 0.3]))
            is_veg = lulc_classes[-1] == "vegetation"
            ndvis.append(0.55 if is_veg else 0.08 + np.random.normal(0, 0.05))
            ndwis.append(0.05 if is_veg else -0.1 + np.random.normal(0, 0.05))
            albedos.append(0.20 if is_veg else 0.25 + np.random.normal(0, 0.02))
            b_densities.append(0)
            b_heights.append(0)
            
    grid_df["lulc_class"] = lulc_classes
    grid_df["ndvi"] = np.clip(ndvis, -0.1, 0.85)
    grid_df["ndwi"] = np.clip(ndwis, -0.4, 0.6)
    grid_df["albedo"] = np.clip(albedos, 0.04, 0.45)
    grid_df["building_density"] = np.clip(b_densities, 0, 250)
    grid_df["building_height"] = np.clip(b_heights, 0, 45)
    grid_df["zone_name"] = zone_names
    
    # Assign weather + noise
    grid_df["air_temp"] = weather_data["air_temp"] + np.random.normal(0, 0.5, n)
    # Urban heat island base effect (warmer in dense areas)
    grid_df["air_temp"] += (grid_df["building_density"] / 100) * 1.5
    
    grid_df["humidity"] = weather_data["humidity"] - (grid_df["building_density"] / 100) * 4 + np.random.normal(0, 2, n)
    grid_df["wind_speed"] = weather_data["wind_speed"] - (grid_df["building_density"] / 100) * 1 + np.random.normal(0, 0.4, n)
    grid_df["wind_speed"] = grid_df["wind_speed"].clip(0.5, 7)
    
    grid_df["svf"] = np.clip(0.85 - (grid_df["building_density"] / 300) + np.random.normal(0, 0.05, n), 0.2, 1.0)
    # Re-predict LST exactly as we did in synthetic for consistency if model expects lst
    lst = (
        0.6 * grid_df["air_temp"]
        - 12.0 * grid_df["ndvi"]
        - 8.0 * grid_df["albedo"]
        - 5.0 * grid_df["ndwi"]
        + 0.04 * grid_df["building_density"]
        + 0.08 * grid_df["building_height"]
        - 0.5 * grid_df["wind_speed"]
        - 0.03 * grid_df["humidity"]
        - 3.0 * grid_df["svf"]
        + 18.0
        + np.random.normal(0, 0.8, n)
    )
    grid_df["lst"] = lst.round(2)

    return grid_df, zones

def build_geojson(grid_df):
    """Convert the grid DataFrame into a GeoJSON FeatureCollection."""
    features = []
    for _, row in grid_df.iterrows():
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [row["lon"], row["lat"]],
                    [row["lon_max"], row["lat"]],
                    [row["lon_max"], row["lat_max"]],
                    [row["lon"], row["lat_max"]],
                    [row["lon"], row["lat"]],
                ]]
            },
            "properties": {
                k: v for k, v in row.items()
                if k not in ["lat_max", "lon_max"]
            }
        }
        features.append(feature)
    return {"type": "FeatureCollection", "features": features}

def collect_data(output_dir, bbox=None, location_name="Pune"):
    """Main data collection pipeline using live API sources."""
    # Default Pune bbox if none provided
    if not bbox:
        bbox = [18.45, 18.58, 73.78, 73.92]
        
    print(f"Generating spatial grid for {location_name}...")
    grid, final_bbox = generate_grid_for_bbox(bbox)
    
    center_lat = (final_bbox[0] + final_bbox[1]) / 2
    center_lon = (final_bbox[2] + final_bbox[3]) / 2
    
    print("Fetching live weather data...")
    weather = fetch_live_weather(center_lat, center_lon)
    
    print("Fetching infrastructure from OpenStreetMap...")
    osm_elements = fetch_osm_features(final_bbox)
    
    print("Assigning features and calculating parameters...")
    grid, zones = assign_features(grid, osm_elements, weather, location_name)
    
    # Classify heat stress
    grid["hsi_class"] = grid["lst"].apply(
        lambda x: "Cool Zone" if x < 30
        else "Mild Zone" if x < 35
        else "Warm Zone" if x < 40
        else "Hot Zone" if x < 45
        else "Extreme Heat Hotspot"
    )

    # Save CSV
    csv_path = os.path.join(output_dir, "feature_matrix.csv")
    grid.to_csv(csv_path, index=False)

    # Save GeoJSON
    geojson = build_geojson(grid)
    geojson_path = os.path.join(output_dir, "grid_cells.geojson")
    with open(geojson_path, "w") as f:
        json.dump(geojson, f)



    # Save Voronoi Zones GeoJSON
    print("Extracting administrative zone polygons...")
    zones_geojson = generate_voronoi_zones(zones, final_bbox)
    zones_path = os.path.join(OUTPUTS_DIR, "zones.geojson")
    with open(zones_path, "w") as f:
        json.dump(zones_geojson, f)
    print(f"[data_collector] Saved zones to {zones_path} (size: {os.path.getsize(zones_path)} bytes, features: {len(zones_geojson['features'])})")

    return grid
