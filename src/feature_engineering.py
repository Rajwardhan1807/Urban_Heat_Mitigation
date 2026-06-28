"""
Feature engineering module.
Transforms raw data into ML-ready features.
"""
import pandas as pd
import numpy as np


# Feature columns for the model (order matters for consistency)
FEATURE_COLS = [
    "ndvi", "ndwi", "albedo", "building_density", "building_height",
    "air_temp", "humidity", "wind_speed", "svf",
    "lulc_water", "lulc_vegetation", "lulc_built_up", "lulc_road", "lulc_bare",
    "ndvi_x_albedo", "bldg_density_x_wind",
]

TARGET_COL = "lst"

ID_COLS = ["cell_id", "lat", "lon", "zone_name", "hsi_class"]


def engineer_features(df):
    """
    Create ML features from raw data.
    - One-hot encode LULC classes
    - Create interaction terms
    - Return feature matrix and target
    """
    df = df.copy()

    # One-hot encode LULC
    lulc_dummies = pd.get_dummies(df["lulc_class"], prefix="lulc").astype(float)
    # Ensure all expected LULC columns exist
    for col in ["lulc_water", "lulc_vegetation", "lulc_built_up", "lulc_road", "lulc_bare"]:
        if col not in lulc_dummies.columns:
            lulc_dummies[col] = 0.0
    df = pd.concat([df, lulc_dummies], axis=1)

    # Interaction terms (domain-relevant)
    df["ndvi_x_albedo"] = df["ndvi"] * df["albedo"]
    df["bldg_density_x_wind"] = df["building_density"] * df["wind_speed"]

    return df


def get_feature_matrix(df):
    """Extract X (features) and y (target) for ML."""
    df = engineer_features(df)
    X = df[FEATURE_COLS].copy()
    y = df[TARGET_COL].copy()
    ids = df[ID_COLS].copy() if all(c in df.columns for c in ID_COLS) else None
    return X, y, ids


def get_feature_descriptions():
    """Human-readable descriptions for each feature."""
    return {
        "ndvi": "Vegetation Index (NDVI)",
        "ndwi": "Water Index (NDWI)",
        "albedo": "Surface Reflectance (Albedo)",
        "building_density": "Building Density (per km²)",
        "building_height": "Mean Building Height (m)",
        "air_temp": "Air Temperature (°C)",
        "humidity": "Relative Humidity (%)",
        "wind_speed": "Wind Speed (m/s)",
        "svf": "Sky View Factor",
        "lulc_water": "Land Use: Water",
        "lulc_vegetation": "Land Use: Vegetation",
        "lulc_built_up": "Land Use: Built-up",
        "lulc_road": "Land Use: Road",
        "lulc_bare": "Land Use: Bare Soil",
        "ndvi_x_albedo": "Vegetation × Reflectance",
        "bldg_density_x_wind": "Building Density × Wind",
    }


def get_driver_category(feature_name):
    """Categorize features for driver attribution charts."""
    categories = {
        "ndvi": "Vegetation",
        "ndwi": "Water",
        "albedo": "Surface",
        "building_density": "Morphology",
        "building_height": "Morphology",
        "air_temp": "Atmospheric",
        "humidity": "Atmospheric",
        "wind_speed": "Atmospheric",
        "svf": "Morphology",
        "lulc_water": "LULC",
        "lulc_vegetation": "LULC",
        "lulc_built_up": "LULC",
        "lulc_road": "LULC",
        "lulc_bare": "LULC",
        "ndvi_x_albedo": "Interaction",
        "bldg_density_x_wind": "Interaction",
    }
    return categories.get(feature_name, "Other")
