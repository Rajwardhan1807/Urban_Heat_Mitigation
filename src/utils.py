"""
Utility functions for the Urban Heat Mitigation MVP.
"""
import json
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
OUTPUTS_DIR = os.path.join(DATA_DIR, "outputs")
SCENARIOS_DIR = os.path.join(OUTPUTS_DIR, "scenarios")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")


def ensure_dirs():
    """Create all required directories."""
    for d in [RAW_DIR, PROCESSED_DIR, OUTPUTS_DIR, SCENARIOS_DIR, MODELS_DIR]:
        os.makedirs(d, exist_ok=True)


def load_geojson(filepath):
    """Load a GeoJSON file."""
    with open(filepath, "r") as f:
        return json.load(f)


def save_geojson(data, filepath):
    """Save data as GeoJSON."""
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)


def classify_hsi(lst):
    """Classify Land Surface Temperature into Heat Stress Index classes."""
    if lst < 30:
        return "Cool Zone"
    elif lst < 35:
        return "Mild Zone"
    elif lst < 40:
        return "Warm Zone"
    elif lst < 45:
        return "Hot Zone"
    else:
        return "Extreme Heat Hotspot"


def hsi_color(hsi_class):
    """Return color for HSI class using the PRD thermal diverging scale."""
    colors = {
        "Cool Zone": "#4575B4",
        "Mild Zone": "#ABD9E9",
        "Warm Zone": "#FEE090",
        "Hot Zone": "#F46D43",
        "Extreme Heat Hotspot": "#A50026",
    }
    return colors.get(hsi_class, "#999999")
