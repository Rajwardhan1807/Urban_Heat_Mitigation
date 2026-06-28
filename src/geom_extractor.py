import numpy as np
import json
from scipy.spatial import Voronoi
import httpx
from shapely.geometry import Polygon, Point, mapping
import os

def generate_voronoi_zones(zones_list, bbox):
    """
    Generate contiguous Voronoi polygons for a list of zones (neighborhood centers).
    Returns a GeoJSON FeatureCollection.
    """
    if not zones_list:
        return {"type": "FeatureCollection", "features": []}
        
    lat_min, lat_max, lon_min, lon_max = bbox
    
    # Extract points (lon, lat)
    points = np.array([[z["lon"], z["lat"]] for z in zones_list])
    
    # If there's only one zone, the whole bbox is that zone
    if len(points) == 1:
        feature = {
            "type": "Feature",
            "properties": {"zone_name": zones_list[0]["name"]},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [lon_min, lat_min], [lon_max, lat_min], 
                    [lon_max, lat_max], [lon_min, lat_max], [lon_min, lat_min]
                ]]
            }
        }
        return {"type": "FeatureCollection", "features": [feature]}
        
    # Add dummy points far outside the bbox to close the Voronoi regions
    d = max(lat_max - lat_min, lon_max - lon_min) * 2
    dummy_points = np.array([
        [lon_min - d, lat_min - d], [lon_max + d, lat_min - d],
        [lon_max + d, lat_max + d], [lon_min - d, lat_max + d]
    ])
    
    all_points = np.vstack([points, dummy_points])
    vor = Voronoi(all_points)
    
    # Bounding box polygon to intersect with
    bbox_poly = Polygon([
        (lon_min, lat_min), (lon_max, lat_min), 
        (lon_max, lat_max), (lon_min, lat_max)
    ])
    
    features = []
    for i, region_index in enumerate(vor.point_region[:len(points)]):
        region = vor.regions[region_index]
        if -1 in region or not region:
            continue
            
        polygon_coords = [vor.vertices[v] for v in region]
        try:
            poly = Polygon(polygon_coords)
            # Clip by bounding box
            poly = poly.intersection(bbox_poly)
            
            if not poly.is_empty:
                features.append({
                    "type": "Feature",
                    "properties": {"zone_name": zones_list[i]["name"]},
                    "geometry": mapping(poly)
                })
        except Exception:
            continue
            
    return {"type": "FeatureCollection", "features": features}

def extract_water_geojson(bbox):
    """
    Fetch water geometries directly from OSM and format as GeoJSON.
    """
    lat_min, lat_max, lon_min, lon_max = bbox
    
    overpass_query = f"""
    [out:json][timeout:25];
    (
      way["natural"="water"]({lat_min},{lon_min},{lat_max},{lon_max});
      way["waterway"~"river|canal"]({lat_min},{lon_min},{lat_max},{lon_max});
    );
    out geom;
    """
    
    features = []
    try:
        headers = {"User-Agent": "curl/8.7.1", "Accept": "*/*"}
        resp = httpx.post("http://overpass-api.de/api/interpreter", data={"data": overpass_query}, headers=headers, timeout=30)
        print(f"[geom_extractor] OSM Water Query Status: {resp.status_code}")
        if resp.status_code == 200:
            elements = resp.json().get("elements", [])
            print(f"[geom_extractor] Extracted {len(elements)} water elements from OSM")
            for el in elements:
                geom = el.get("geometry", [])
                if not geom:
                    continue
                    
                coords = [[g["lon"], g["lat"]] for g in geom]
                
                # If first and last point are the same, it's a Polygon
                if coords[0] == coords[-1] and len(coords) >= 4:
                    geometry = {"type": "Polygon", "coordinates": [coords]}
                else:
                    geometry = {"type": "LineString", "coordinates": coords}
                    
                tags = el.get("tags", {})
                name = tags.get("name", "Water Body")
                
                features.append({
                    "type": "Feature",
                    "properties": {"name": name, "type": tags.get("natural", tags.get("waterway", "water"))},
                    "geometry": geometry
                })
    except Exception as e:
        print(f"Error fetching water geom: {e}")
        
    return {"type": "FeatureCollection", "features": features}
