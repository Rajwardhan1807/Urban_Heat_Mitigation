"""
Scenario Simulation API routes.
POST /api/simulate — run a cooling intervention simulation
GET /api/scenarios/compare — compare all pre-computed scenarios
GET /api/scenarios/{scenario_name} — get specific scenario GeoJSON
"""
from fastapi import APIRouter, HTTPException, Query
from api.models.schemas import SimulationRequest
import json
import os

router = APIRouter(prefix="/api/scenarios", tags=["Scenarios"])

_scenarios_dir = None
_comparison_data = None
_scenario_geojsons = {}


def load_data(scenarios_dir):
    """Load pre-computed scenario results."""
    global _scenarios_dir, _comparison_data, _scenario_geojsons
    _scenarios_dir = scenarios_dir
    _scenario_geojsons = {}

    # Load comparison summary
    comparison_path = os.path.join(scenarios_dir, "comparison.json")
    if os.path.exists(comparison_path):
        with open(comparison_path, "r") as f:
            _comparison_data = json.load(f)
        print(f"    Loaded {len(_comparison_data)} scenario summaries")

    # Pre-load scenario GeoJSONs
    for filename in os.listdir(scenarios_dir):
        if filename.endswith(".geojson"):
            name = filename.replace(".geojson", "")
            path = os.path.join(scenarios_dir, filename)
            with open(path, "r") as f:
                _scenario_geojsons[name] = json.load(f)
            print(f"    Loaded scenario: {name} ({len(_scenario_geojsons[name]['features'])} cells)")


@router.get("/compare")
def compare_scenarios():
    """Compare all cooling intervention scenarios side-by-side."""
    if _comparison_data is None:
        return {"error": "Scenario data not loaded"}

    # Sort by cooling effectiveness (most negative avg_delta_t first)
    sorted_scenarios = sorted(
        _comparison_data,
        key=lambda x: x.get("avg_delta_t", 0)
    )

    return {"scenarios": sorted_scenarios}


@router.get("/{scenario_name}")
def get_scenario(
    scenario_name: str,
    applied_only: bool = Query(False, description="Only return cells where intervention was applied"),
):
    """Get GeoJSON results for a specific scenario."""
    if scenario_name not in _scenario_geojsons:
        available = list(_scenario_geojsons.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{scenario_name}' not found. Available: {available}"
        )

    geojson = _scenario_geojsons[scenario_name]

    if applied_only:
        filtered_features = [
            f for f in geojson["features"]
            if f["properties"].get("intervention_applied", False)
        ]
        return {
            "type": "FeatureCollection",
            "features": filtered_features,
            "metadata": {"scenario": scenario_name, "applied_only": True}
        }

    return geojson


@router.post("/simulate")
def simulate(request: SimulationRequest):
    """
    Run a scenario simulation with custom coverage.
    For the MVP, we return pre-computed results scaled by coverage percentage.
    """
    scenario_name = request.scenario

    if scenario_name not in _scenario_geojsons:
        available = list(_scenario_geojsons.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{scenario_name}' not found. Available: {available}"
        )

    # Get pre-computed results
    geojson = _scenario_geojsons[scenario_name]
    summary = None
    if _comparison_data:
        for s in _comparison_data:
            if s["scenario"] == scenario_name:
                summary = s.copy()
                break

    # Scale by coverage percentage
    coverage = request.coverage_pct
    if summary and coverage < 100:
        summary["coverage_pct"] = coverage
        scale = coverage / 100.0
        summary["avg_delta_t"] = round(summary["avg_delta_t"] * scale, 2)
        summary["max_delta_t"] = round(summary["max_delta_t"] * scale, 2)
        summary["cells_applied"] = int(summary["cells_applied"] * scale)
        summary["total_area_km2"] = round(summary["total_area_km2"] * scale, 2)

    return {
        "summary": summary,
        "geojson": geojson,
    }
