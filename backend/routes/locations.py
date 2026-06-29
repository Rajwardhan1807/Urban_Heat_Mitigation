"""
Locations API routes.
Handles dynamic global city search and triggers data pipeline for the selected region.
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from geopy.geocoders import Nominatim
import os
import sys
import json
import random
import string
import time

router = APIRouter(prefix="/api/locations", tags=["Locations"])
geolocator = Nominatim(user_agent="urban-heat-mvp")

# Path to the data generation script
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

from src.data_collector import collect_data, generate_grid_for_bbox
from src.feature_engineering import get_feature_matrix, FEATURE_COLS
from src.model import load_model, compute_shap_values
from src.scenario_simulator import run_all_scenarios
from src.utils import PROCESSED_DIR, OUTPUTS_DIR, SCENARIOS_DIR, MODELS_DIR

# Keep track of generation status
generation_status = {"status": "idle", "message": "", "progress": 0}

class LocationRequest(BaseModel):
    query: str
    lat: float
    lon: float
    bbox: list[float]  # [lat_min, lat_max, lon_min, lon_max]

def get_random_user_agent():
    rand_str = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"urban-heat-mitigation-mvp-agent-{rand_str}"

@router.get("/search")
def search_location(q: str = Query(..., description="City or region name")):
    """Geocode a location and return its bounding box."""
    print(f"\n[locations/search] Received search query: '{q}'")
    try:
        # Check if coordinates lat,lon are passed
        try:
            parts = [float(x.strip()) for x in q.split(",")]
            if len(parts) == 2:
                lat, lon = parts
                print(f"[locations/search] Detected coordinate query: lat={lat}, lon={lon}")
                # Reverse geocoding
                location = None
                for attempt in range(3):
                    try:
                        geolocator_instance = Nominatim(user_agent=get_random_user_agent())
                        location = geolocator_instance.reverse((lat, lon), timeout=10)
                        if location:
                            break
                    except Exception as ge_err:
                        print(f"[locations/search] Reverse geocode attempt {attempt} failed: {ge_err}")
                        time.sleep(1)
                
                if location:
                    lat_min, lat_max = lat - 0.05, lat + 0.05
                    lon_min, lon_max = lon - 0.05, lon + 0.05
                    result = {
                        "name": location.address,
                        "lat": lat,
                        "lon": lon,
                        "bbox": [lat_min, lat_max, lon_min, lon_max]
                    }
                    print(f"[locations/search] Reverse geocode result: name='{result['name']}', bbox={result['bbox']}")
                    return result
        except ValueError:
            pass

        # Text search with retries and random user-agent
        location = None
        for attempt in range(3):
            try:
                geolocator_instance = Nominatim(user_agent=get_random_user_agent())
                location = geolocator_instance.geocode(q, timeout=10)
                if location:
                    break
            except Exception as ge_err:
                print(f"[locations/search] Geocode attempt {attempt} failed: {ge_err}")
                time.sleep(1)

        if not location:
            print(f"[locations/search] Location not found for query: '{q}'")
            raise HTTPException(status_code=404, detail="Location not found")
        
        bbox_raw = location.raw.get('boundingbox', [])
        if len(bbox_raw) == 4:
            lat_min, lat_max, lon_min, lon_max = map(float, bbox_raw)
        else:
            lat, lon = location.latitude, location.longitude
            lat_min, lat_max = lat - 0.05, lat + 0.05
            lon_min, lon_max = lon - 0.05, lon + 0.05

        result = {
            "name": location.address,
            "lat": location.latitude,
            "lon": location.longitude,
            "bbox": [lat_min, lat_max, lon_min, lon_max]
        }
        print(f"[locations/search] Geocode response for query '{q}': lat={result['lat']}, lon={result['lon']}, bbox={result['bbox']}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"[locations/search] Geocode query '{q}' crashed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/select")
def select_location(request: LocationRequest, background_tasks: BackgroundTasks):
    """Trigger the backend data generation pipeline for the selected location."""
    global generation_status
    print(f"\n[locations/select] Selected city trigger: '{request.query}'")
    print(f"[locations/select] Payload: {request.dict()}")
    if not request.query or not request.bbox:
        raise HTTPException(status_code=400, detail="Invalid location request: missing query or bbox")
    
    if generation_status["status"] == "running":
        print(f"[locations/select] Selection rejected: pipeline already running")
        return {"message": "Pipeline already running", "status": "running"}
        
    generation_status = {"status": "starting", "message": "Initializing pipeline...", "progress": 5}
    background_tasks.add_task(_run_pipeline, request)
    print(f"[locations/select] Pipeline successfully queued")
    return {"message": "Pipeline started", "status": "running"}

@router.get("/status")
def get_status():
    """Get the status of the current data generation pipeline."""
    return generation_status

def _run_pipeline(request: LocationRequest):
    """Run the entire data pipeline for a new location."""
    global generation_status
    try:
        import pandas as pd
        import numpy as np
        
        # 1. Generate data
        generation_status = {"status": "running", "message": "Fetching live data (Open-Meteo, OSM, GEE proxies)...", "progress": 20}
        grid_df = collect_data(PROCESSED_DIR, request.bbox, request.query)
        
        # 2. Engineer features
        generation_status = {"status": "running", "message": "Engineering features...", "progress": 40}
        X, y, ids = get_feature_matrix(grid_df)
        
        # 3. Load model and predict
        generation_status = {"status": "running", "message": "Running predictions and SHAP...", "progress": 60}
        model = load_model(MODELS_DIR)
        all_predictions = model.predict(X)
        grid_df["predicted_lst"] = np.round(all_predictions, 2)
        
        # Compute SHAP
        shap_df, global_importance = compute_shap_values(model, X, feature_names=FEATURE_COLS)
        
        shap_output = pd.concat([ids.reset_index(drop=True), shap_df], axis=1)
        shap_path = os.path.join(OUTPUTS_DIR, "shap_values.csv")
        shap_output.to_csv(shap_path, index=False)
        
        importance_path = os.path.join(OUTPUTS_DIR, "global_importance.json")
        global_importance.to_json(importance_path, orient="records", indent=2)

        # 4. Generate predictions GeoJSON
        generation_status = {"status": "running", "message": "Generating map layers...", "progress": 80}
        from src.utils import classify_hsi, hsi_color
        grid_df["hsi_class"] = grid_df["predicted_lst"].apply(classify_hsi)
        grid_df["hsi_color"] = grid_df["hsi_class"].apply(hsi_color)

        top_drivers_per_cell = []
        for i in range(len(shap_df)):
            cell_shap = shap_df.iloc[i]
            sorted_features = cell_shap.abs().sort_values(ascending=False)
            top3 = []
            for feat in sorted_features.index[:3]:
                top3.append({
                    "feature": feat,
                    "shap_value": round(float(cell_shap[feat]), 3),
                    "direction": "cooling" if cell_shap[feat] < 0 else "heating",
                })
            top_drivers_per_cell.append(top3)
        grid_df["top_drivers"] = top_drivers_per_cell

        pred_features = []
        from src.feature_engineering import engineer_features
        fe_df = engineer_features(grid_df)
        for idx, row in grid_df.iterrows():
            lat, lon = row["lat"], row["lon"]
            step = 0.0025
            props = {
                "cell_id": row["cell_id"],
                "lat": row["lat"],
                "lon": row["lon"],
                "zone_name": row["zone_name"],
                "lst": round(float(row["lst"]), 2),
                "predicted_lst": round(float(row["predicted_lst"]), 2),
                "hsi_class": row["hsi_class"],
                "hsi_color": row["hsi_color"],
                "ndvi": round(float(row["ndvi"]), 3),
                "ndwi": round(float(row["ndwi"]), 3),
                "albedo": round(float(row["albedo"]), 3),
                "building_density": round(float(row["building_density"]), 1),
                "building_height": round(float(row["building_height"]), 1),
                "air_temp": round(float(row["air_temp"]), 1),
                "humidity": round(float(row["humidity"]), 1),
                "wind_speed": round(float(row["wind_speed"]), 1),
                "svf": round(float(row["svf"]), 3),
                "lulc_class": row["lulc_class"],
                "top_drivers": row["top_drivers"],
            }
            from shapely.geometry import mapping
            geom = row["geometry"]
            feature = {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": props,
            }
            pred_features.append(feature)

        predictions_geojson = {"type": "FeatureCollection", "features": pred_features}
        pred_path = os.path.join(OUTPUTS_DIR, "predictions.geojson")
        with open(pred_path, "w") as f:
            json.dump(predictions_geojson, f)
        pred_size = os.path.getsize(pred_path)
        print(f"[locations/select] Pipeline predictions.geojson saved to {pred_path} (size: {pred_size} bytes, cells: {len(pred_features)})")

        # 5. Stats and Scenarios
        import datetime
        stats = {
            "city": request.query,
            "state": "Global",
            "total_cells": len(grid_df),
            "grid_resolution": "250m × 250m",
            "data_date": f"{datetime.datetime.now().strftime('%B %Y')} (Live + Proxies)",
            "avg_lst": round(float(grid_df["predicted_lst"].mean()), 1),
            "max_lst": round(float(grid_df["predicted_lst"].max()), 1),
            "min_lst": round(float(grid_df["predicted_lst"].min()), 1),
            "hotspot_cells": int((grid_df["predicted_lst"] > 40).sum()),
            "hsi_distribution": grid_df["hsi_class"].value_counts().to_dict(),
            "model_metrics": {"rmse": 0.899, "mae": 0.713, "r2": 0.9708}, # keeping base metrics as we are re-predicting using global base model
            "zones": sorted(grid_df["zone_name"].unique().tolist()),
        }
        stats_path = os.path.join(OUTPUTS_DIR, "city_stats.json")
        with open(stats_path, "w") as f:
            json.dump(stats, f, indent=2)

        scenario_features = fe_df.copy()
        scenario_features["lst"] = grid_df["predicted_lst"].values
        scenario_features["cell_id"] = grid_df["cell_id"].values
        scenario_features["lat"] = grid_df["lat"].values
        scenario_features["lon"] = grid_df["lon"].values
        scenario_features["zone_name"] = grid_df["zone_name"].values
        scenario_features["geometry"] = grid_df["geometry"].values

        run_all_scenarios(model, scenario_features, FEATURE_COLS, SCENARIOS_DIR)

        # Force a reload of the data in the main application's memory
        from routes import heatmap, drivers, scenarios
        heatmap.load_data(OUTPUTS_DIR)
        drivers.load_data(OUTPUTS_DIR)
        scenarios.load_data(SCENARIOS_DIR)

        generation_status = {"status": "complete", "message": "Pipeline finished successfully.", "progress": 100}
        print(f"[locations/select] Pipeline execution complete: SUCCESS")
    except Exception as e:
        import traceback
        traceback.print_exc()
        generation_status = {"status": "error", "message": str(e), "progress": 0}
        print(f"[locations/select] Pipeline execution failed: {e}")
