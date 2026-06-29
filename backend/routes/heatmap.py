"""
Heatmap API routes.
GET /api/heatmap — returns GeoJSON of heat stress map
GET /api/heatmap/zone/{zone_name} — filter by zone
"""
from fastapi import APIRouter, Query
from typing import Optional
import json
import os

router = APIRouter(prefix="/api/heatmap", tags=["Heatmap"])

# Data loaded at startup
_predictions_data = None


def load_data(outputs_dir):
    """Load predictions GeoJSON into memory."""
    global _predictions_data
    path = os.path.join(outputs_dir, "predictions.geojson")
    if os.path.exists(path):
        with open(path, "r") as f:
            _predictions_data = json.load(f)
        print(f"    Loaded {len(_predictions_data['features'])} grid cells")
    else:
        print(f"     predictions.geojson not found at {path}")
        _predictions_data = {"type": "FeatureCollection", "features": []}


@router.get("")
def get_heatmap(
    zone: Optional[str] = Query(None, description="Filter by zone name"),
    hsi_class: Optional[str] = Query(None, description="Filter by HSI class"),
    min_lst: Optional[float] = Query(None, description="Minimum LST filter"),
):
    """Get the full heat stress map as GeoJSON."""
    if _predictions_data is None:
        return {"error": "Data not loaded"}

    features = _predictions_data["features"]

    # Apply filters
    if zone:
        features = [f for f in features if f["properties"].get("zone_name") == zone]
    if hsi_class:
        features = [f for f in features if f["properties"].get("hsi_class") == hsi_class]
    if min_lst is not None:
        features = [f for f in features if f["properties"].get("lst", 0) >= min_lst]

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_features": len(features),
            "filters_applied": {
                "zone": zone,
                "hsi_class": hsi_class,
                "min_lst": min_lst,
            }
        }
    }


@router.get("/zones")
def get_zones():
    """Get list of all zone names with summary stats."""
    if _predictions_data is None:
        return {"error": "Data not loaded"}

    zones = {}
    for f in _predictions_data["features"]:
        zone = f["properties"].get("zone_name", "Unknown")
        if zone not in zones:
            zones[zone] = {"count": 0, "lst_sum": 0, "max_lst": 0, "hotspots": 0}
        zones[zone]["count"] += 1
        lst = f["properties"].get("lst", 0)
        zones[zone]["lst_sum"] += lst
        zones[zone]["max_lst"] = max(zones[zone]["max_lst"], lst)
        if lst > 40:
            zones[zone]["hotspots"] += 1

    result = []
    for name, data in sorted(zones.items()):
        result.append({
            "zone_name": name,
            "cell_count": data["count"],
            "avg_lst": round(data["lst_sum"] / max(data["count"], 1), 1),
            "max_lst": round(data["max_lst"], 1),
            "hotspot_count": data["hotspots"],
        })

    return {"zones": result}
