"""
Driver Attribution API routes.
GET /api/drivers/{cell_id} — SHAP-based driver attribution for a cell
GET /api/drivers/global — global feature importance
"""
from fastapi import APIRouter, HTTPException
import pandas as pd
import json
import os

router = APIRouter(prefix="/api/drivers", tags=["Drivers"])

_shap_data = None
_global_importance = None
_predictions_data = None

# Feature labels and categories
FEATURE_LABELS = {
    "ndvi": "Vegetation Index (NDVI)",
    "ndwi": "Water Index (NDWI)",
    "albedo": "Surface Reflectance",
    "building_density": "Building Density",
    "building_height": "Building Height",
    "air_temp": "Air Temperature",
    "humidity": "Humidity",
    "wind_speed": "Wind Speed",
    "svf": "Sky View Factor",
    "lulc_water": "Water Bodies (LULC)",
    "lulc_vegetation": "Vegetation (LULC)",
    "lulc_built_up": "Built-up Area (LULC)",
    "lulc_road": "Roads (LULC)",
    "lulc_bare": "Bare Soil (LULC)",
    "ndvi_x_albedo": "Vegetation × Reflectance",
    "bldg_density_x_wind": "Density × Wind",
}

FEATURE_CATEGORIES = {
    "ndvi": "Vegetation", "ndwi": "Water", "albedo": "Surface",
    "building_density": "Morphology", "building_height": "Morphology",
    "air_temp": "Atmospheric", "humidity": "Atmospheric", "wind_speed": "Atmospheric",
    "svf": "Morphology",
    "lulc_water": "LULC", "lulc_vegetation": "LULC", "lulc_built_up": "LULC",
    "lulc_road": "LULC", "lulc_bare": "LULC",
    "ndvi_x_albedo": "Interaction", "bldg_density_x_wind": "Interaction",
}

CATEGORY_COLORS = {
    "Vegetation": "#2ecc71",
    "Water": "#3498db",
    "Surface": "#e67e22",
    "Morphology": "#9b59b6",
    "Atmospheric": "#1abc9c",
    "LULC": "#34495e",
    "Interaction": "#e74c3c",
}


def load_data(outputs_dir):
    """Load SHAP data and predictions."""
    global _shap_data, _global_importance, _predictions_data

    shap_path = os.path.join(outputs_dir, "shap_values.csv")
    if os.path.exists(shap_path):
        _shap_data = pd.read_csv(shap_path)
        print(f"    Loaded SHAP values: {len(_shap_data)} cells")

    importance_path = os.path.join(outputs_dir, "global_importance.json")
    if os.path.exists(importance_path):
        with open(importance_path, "r") as f:
            _global_importance = json.load(f)
        print(f"    Loaded global importance: {len(_global_importance)} features")

    pred_path = os.path.join(outputs_dir, "predictions.geojson")
    if os.path.exists(pred_path):
        with open(pred_path, "r") as f:
            _predictions_data = json.load(f)


@router.get("/global")
def get_global_importance():
    """Get global feature importance ranked by mean |SHAP|."""
    if _global_importance is None:
        return {"error": "SHAP data not loaded"}

    enriched = []
    for item in _global_importance:
        feat = item["feature"]
        enriched.append({
            **item,
            "label": FEATURE_LABELS.get(feat, feat),
            "category": FEATURE_CATEGORIES.get(feat, "Other"),
            "category_color": CATEGORY_COLORS.get(
                FEATURE_CATEGORIES.get(feat, "Other"), "#999"
            ),
            "direction": "heating" if item.get("mean_shap", 0) > 0 else "cooling",
        })

    return {"importance": enriched}


@router.get("/{cell_id}")
def get_cell_drivers(cell_id: str):
    """Get SHAP driver attribution for a specific cell."""
    if _shap_data is None:
        raise HTTPException(status_code=503, detail="SHAP data not loaded")

    cell_row = _shap_data[_shap_data["cell_id"] == cell_id]
    if cell_row.empty:
        raise HTTPException(status_code=404, detail=f"Cell {cell_id} not found")

    cell = cell_row.iloc[0]

    # Get cell properties from predictions
    cell_props = {}
    if _predictions_data:
        for f in _predictions_data["features"]:
            if f["properties"].get("cell_id") == cell_id:
                cell_props = f["properties"]
                break

    # Build drivers list from SHAP columns
    shap_cols = [c for c in _shap_data.columns if c not in [
        "cell_id", "lat", "lon", "zone_name", "hsi_class"
    ]]

    drivers = []
    for feat in shap_cols:
        sv = float(cell[feat])
        drivers.append({
            "feature": feat,
            "label": FEATURE_LABELS.get(feat, feat),
            "category": FEATURE_CATEGORIES.get(feat, "Other"),
            "category_color": CATEGORY_COLORS.get(
                FEATURE_CATEGORIES.get(feat, "Other"), "#999"
            ),
            "shap_value": round(sv, 3),
            "feature_value": round(float(cell_props.get(feat, 0)), 3),
            "direction": "cooling" if sv < 0 else "heating",
        })

    drivers.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    return {
        "cell_id": cell_id,
        "lat": cell_props.get("lat", float(cell.get("lat", 0))),
        "lon": cell_props.get("lon", float(cell.get("lon", 0))),
        "zone_name": cell_props.get("zone_name", str(cell.get("zone_name", ""))),
        "lst": cell_props.get("lst", 0),
        "hsi_class": cell_props.get("hsi_class", ""),
        "top_drivers": drivers[:5],
        "all_drivers": drivers,
    }
