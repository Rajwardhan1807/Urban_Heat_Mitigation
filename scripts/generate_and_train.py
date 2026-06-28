"""
Master script: Generate data, train model, compute SHAP, run scenarios.
Run this once to set up all data for the dashboard.

Usage:
    python scripts/generate_and_train.py
"""
import sys
import os

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from src.utils import PROCESSED_DIR, OUTPUTS_DIR, SCENARIOS_DIR, MODELS_DIR, ensure_dirs
from src.data_collector import collect_data
from src.feature_engineering import engineer_features, get_feature_matrix, FEATURE_COLS
from src.model import train_model, compute_shap_values
from src.scenario_simulator import run_all_scenarios

import pandas as pd
import numpy as np
import json


def main():
    print("=" * 60)
    print("  URBAN HEAT MITIGATION MVP — Data Pipeline")
    print("=" * 60)

    # Step 0: Create directories
    ensure_dirs()

    # Step 1: Generate / collect data
    print("\n" + "=" * 60)
    print(" STEP 1: Data Collection")
    print("=" * 60)
    grid_df = collect_data(PROCESSED_DIR)

    # Step 2: Feature engineering
    print("\n" + "=" * 60)
    print("  STEP 2: Feature Engineering")
    print("=" * 60)
    X, y, ids = get_feature_matrix(grid_df)
    print(f"   Features: {X.shape[1]} columns")
    print(f"   Samples:  {X.shape[0]} cells")
    print(f"   Target:   LST ({y.min():.1f}°C – {y.max():.1f}°C)")

    # Step 3: Train model
    print("\n" + "=" * 60)
    print(" STEP 3: Model Training (XGBoost)")
    print("=" * 60)
    model, metrics, X_test, y_test = train_model(X, y, save_dir=MODELS_DIR)

    # Step 4: SHAP analysis
    print("\n" + "=" * 60)
    print(" STEP 4: SHAP Driver Attribution")
    print("=" * 60)
    shap_df, global_importance = compute_shap_values(model, X, feature_names=FEATURE_COLS)

    # Save SHAP values (per cell)
    shap_output = pd.concat([ids.reset_index(drop=True), shap_df], axis=1)
    shap_path = os.path.join(OUTPUTS_DIR, "shap_values.csv")
    shap_output.to_csv(shap_path, index=False)
    print(f" Saved SHAP values: {shap_path}")

    # Save global importance
    importance_path = os.path.join(OUTPUTS_DIR, "global_importance.json")
    global_importance.to_json(importance_path, orient="records", indent=2)
    print(f" Saved global importance: {importance_path}")

    print("\n Top 5 Heat Drivers:")
    for _, row in global_importance.head(5).iterrows():
        direction = "heating" if row["mean_shap"] > 0 else "cooling"
        print(f"   {row['feature']:25s} |SHAP| = {row['mean_abs_shap']:.3f}  ({direction})")

    # Step 5: Generate predictions GeoJSON for dashboard
    print("\n" + "=" * 60)
    print("  STEP 5: Generating Dashboard Data")
    print("=" * 60)

    # Full predictions
    all_predictions = model.predict(X)
    grid_df["predicted_lst"] = np.round(all_predictions, 2)

    # Add HSI classification
    from src.utils import classify_hsi, hsi_color
    grid_df["hsi_class"] = grid_df["predicted_lst"].apply(classify_hsi)
    grid_df["hsi_color"] = grid_df["hsi_class"].apply(hsi_color)

    # Merge SHAP top drivers per cell
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

    # Build predictions GeoJSON
    pred_features = []
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
            "properties": props,
        }
        pred_features.append(feature)

    predictions_geojson = {"type": "FeatureCollection", "features": pred_features}
    pred_path = os.path.join(OUTPUTS_DIR, "predictions.geojson")
    with open(pred_path, "w") as f:
        json.dump(predictions_geojson, f)
    print(f" Saved predictions GeoJSON: {pred_path}")

    # City stats
    stats = {
        "city": "Pune",
        "state": "Maharashtra, India",
        "total_cells": len(grid_df),
        "grid_resolution": "250m × 250m",
        "data_date": "May 2024 (Simulated)",
        "avg_lst": round(float(grid_df["lst"].mean()), 1),
        "max_lst": round(float(grid_df["lst"].max()), 1),
        "min_lst": round(float(grid_df["lst"].min()), 1),
        "hotspot_cells": int((grid_df["lst"] > 40).sum()),
        "hsi_distribution": grid_df["hsi_class"].value_counts().to_dict(),
        "model_metrics": metrics,
        "zones": sorted(grid_df["zone_name"].unique().tolist()),
    }
    stats_path = os.path.join(OUTPUTS_DIR, "city_stats.json")
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2)
    print(f" Saved city stats: {stats_path}")

    # Step 6: Run all scenarios
    print("\n" + "=" * 60)
    print("  STEP 6: Scenario Simulation")
    print("=" * 60)

    # Prepare features for scenario simulation
    scenario_features = fe_df.copy()
    scenario_features["lst"] = grid_df["lst"].values
    scenario_features["cell_id"] = grid_df["cell_id"].values
    scenario_features["lat"] = grid_df["lat"].values
    scenario_features["lon"] = grid_df["lon"].values
    scenario_features["zone_name"] = grid_df["zone_name"].values

    summaries = run_all_scenarios(model, scenario_features, FEATURE_COLS, SCENARIOS_DIR)

    # Done!
    print("\n" + "=" * 60)
    print(" PIPELINE COMPLETE!")
    print("=" * 60)
    print(f"\n Output files:")
    print(f"    {pred_path}")
    print(f"    {shap_path}")
    print(f"    {importance_path}")
    print(f"    {stats_path}")
    print(f"     {SCENARIOS_DIR}/")
    for s in summaries:
        print(f"      └─ {s['scenario']}.geojson  (ΔT: {s['avg_delta_t']}°C)")
    print(f"\n Ready to launch dashboard: python api/main.py")


if __name__ == "__main__":
    main()
