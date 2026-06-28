"""
Scenario Simulator module.
Simulates cooling interventions by perturbing input features and re-predicting LST.
"""
import numpy as np
import pandas as pd
import json
import os


# Intervention definitions from the PRD
INTERVENTIONS = {
    "urban_greening": {
        "name": "Urban Greening / Tree Planting",
        "description": "Plant trees and increase vegetation cover in low-NDVI areas",
        "icon": "tree-pine",
        "mechanism": "Increased evapotranspiration (LE) + reduced sensible heat (H) via shading",
        "feature_deltas": {"ndvi": 0.3, "svf": -0.1},
        "eligible_filter": lambda df: df["ndvi"] < 0.3,
        "cost_estimate": "Medium",
        "implementation_time": "2-5 years",
    },
    "cool_roofs": {
        "name": "Cool Roofs (High-Albedo Coating)",
        "description": "Apply reflective white coating to building rooftops",
        "icon": "home",
        "mechanism": "Increased surface albedo reduces net radiation (Rn)",
        "feature_deltas": {"albedo": 0.25},
        "eligible_filter": lambda df: df["lulc_built_up"] == 1,
        "cost_estimate": "Low",
        "implementation_time": "6-12 months",
    },

    "reflective_pavements": {
        "name": "Reflective Pavements",
        "description": "Replace dark asphalt with reflective/permeable paving materials",
        "icon": "sun",
        "mechanism": "Increased albedo reduces sensible heat flux (H)",
        "feature_deltas": {"albedo": 0.15},
        "eligible_filter": lambda df: df["lulc_road"] == 1,
        "cost_estimate": "Medium",
        "implementation_time": "1-3 years",
    },
    "green_roofs": {
        "name": "Green Roofs",
        "description": "Install vegetated roof systems on buildings",
        "icon": "leaf",
        "mechanism": "Combined evapotranspiration (LE) + albedo + insulation effect",
        "feature_deltas": {"ndvi": 0.15, "albedo": 0.05},
        "eligible_filter": lambda df: df["lulc_built_up"] == 1,
        "cost_estimate": "High",
        "implementation_time": "1-2 years",
    },
}


def simulate_scenario(model, features_df, feature_cols, scenario_name, coverage_pct=100):
    """
    Simulate a cooling intervention.

    Args:
        model: Trained XGBoost model
        features_df: DataFrame with all features + cell_id, lat, lon, lst
        feature_cols: List of feature column names for the model
        scenario_name: Key from INTERVENTIONS dict
        coverage_pct: Percentage of eligible cells to apply intervention

    Returns:
        results_df: DataFrame with baseline_lst, predicted_lst, delta_t per cell
        summary: Dict with aggregate statistics
    """
    if scenario_name not in INTERVENTIONS:
        raise ValueError(f"Unknown scenario: {scenario_name}. Available: {list(INTERVENTIONS.keys())}")

    intervention = INTERVENTIONS[scenario_name]
    modified = features_df.copy()

    # Find eligible cells
    eligible_mask = intervention["eligible_filter"](modified)
    n_eligible = eligible_mask.sum()

    if n_eligible == 0:
        return None, {"error": "No eligible cells for this intervention"}

    # Apply coverage percentage
    if coverage_pct < 100:
        np.random.seed(42)
        eligible_indices = modified[eligible_mask].index.tolist()
        n_apply = max(1, int(len(eligible_indices) * coverage_pct / 100))
        selected = np.random.choice(eligible_indices, n_apply, replace=False)
        apply_mask = modified.index.isin(selected)
    else:
        apply_mask = eligible_mask

    n_applied = apply_mask.sum()

    # Apply feature perturbations
    for feature, delta in intervention["feature_deltas"].items():
        if feature in modified.columns:
            modified.loc[apply_mask, feature] = modified.loc[apply_mask, feature] + delta

    # Clip values to valid ranges
    if "ndvi" in modified.columns:
        modified["ndvi"] = modified["ndvi"].clip(-0.1, 0.85)
    if "albedo" in modified.columns:
        modified["albedo"] = modified["albedo"].clip(0.04, 0.6)
    if "ndwi" in modified.columns:
        modified["ndwi"] = modified["ndwi"].clip(-0.4, 0.6)
    if "svf" in modified.columns:
        modified["svf"] = modified["svf"].clip(0.2, 1.0)

    # Predict new LST
    X_modified = modified[feature_cols]
    new_lst = model.predict(X_modified)

    # Compute results
    results = features_df[["cell_id", "lat", "lon", "zone_name"]].copy()
    results["baseline_lst"] = features_df["lst"].values
    results["predicted_lst"] = np.round(new_lst, 2)
    results["delta_t"] = np.round(new_lst - features_df["lst"].values, 2)
    results["intervention_applied"] = apply_mask.values
    results["feasibility"] = "N/A"
    results.loc[apply_mask, "feasibility"] = _assess_feasibility(
        features_df.loc[apply_mask], scenario_name
    )

    # Summary statistics
    applied_results = results[results["intervention_applied"]]
    summary = {
        "scenario": scenario_name,
        "name": intervention["name"],
        "icon": intervention["icon"],
        "description": intervention["description"],
        "mechanism": intervention["mechanism"],
        "cost_estimate": intervention["cost_estimate"],
        "implementation_time": intervention["implementation_time"],
        "cells_eligible": int(n_eligible),
        "cells_applied": int(n_applied),
        "coverage_pct": coverage_pct,
        "avg_delta_t": round(float(applied_results["delta_t"].mean()), 2),
        "max_delta_t": round(float(applied_results["delta_t"].min()), 2),  # Most cooling
        "min_delta_t": round(float(applied_results["delta_t"].max()), 2),
        "total_area_km2": round(n_applied * 0.0625, 2),  # 250m × 250m cells
    }

    return results, summary


def _assess_feasibility(eligible_df, scenario_name):
    """Assess implementation feasibility per cell."""
    n = len(eligible_df)
    feasibility = pd.Series(["Medium"] * n, index=eligible_df.index)

    if scenario_name == "urban_greening":
        # High feasibility where there's bare land or low building density
        feasibility[eligible_df["building_density"] < 30] = "High"
        feasibility[eligible_df["building_density"] > 100] = "Low"
    elif scenario_name == "cool_roofs":
        # Generally high feasibility on existing buildings
        feasibility[:] = "High"
        feasibility[eligible_df["building_height"] > 30] = "Medium"

    elif scenario_name == "reflective_pavements":
        feasibility[:] = "High"
    elif scenario_name == "green_roofs":
        feasibility[eligible_df["building_height"] < 20] = "High"
        feasibility[eligible_df["building_height"] > 30] = "Low"

    return feasibility


def run_all_scenarios(model, features_df, feature_cols, output_dir):
    """Run all intervention scenarios and save results."""
    os.makedirs(output_dir, exist_ok=True)
    all_summaries = []

    for scenario_name in INTERVENTIONS:
        print(f"\n Simulating: {INTERVENTIONS[scenario_name]['name']}...")
        results, summary = simulate_scenario(
            model, features_df, feature_cols, scenario_name
        )

        if results is not None:
            # Save scenario GeoJSON
            geojson = _results_to_geojson(results)
            path = os.path.join(output_dir, f"{scenario_name}.geojson")
            with open(path, "w") as f:
                json.dump(geojson, f)
            print(f"   Avg ΔT: {summary['avg_delta_t']}°C | "
                  f"Max cooling: {summary['max_delta_t']}°C | "
                  f"Cells: {summary['cells_applied']}")

            all_summaries.append(summary)

    # Save comparison summary
    summary_path = os.path.join(output_dir, "comparison.json")
    with open(summary_path, "w") as f:
        json.dump(all_summaries, f, indent=2)
    print(f"\n Saved scenario comparison: {summary_path}")

    return all_summaries


def _results_to_geojson(results_df):
    """Convert scenario results to GeoJSON."""
    features = []
    for _, row in results_df.iterrows():
        lat, lon = row["lat"], row["lon"]
        step = 0.0025
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [lon, lat], [lon + step, lat],
                    [lon + step, lat + step], [lon, lat + step],
                    [lon, lat],
                ]]
            },
            "properties": {
                "cell_id": row["cell_id"],
                "zone_name": row["zone_name"],
                "baseline_lst": row["baseline_lst"],
                "predicted_lst": row["predicted_lst"],
                "delta_t": row["delta_t"],
                "intervention_applied": bool(row["intervention_applied"]),
                "feasibility": row["feasibility"],
            }
        }
        features.append(feature)
    return {"type": "FeatureCollection", "features": features}
