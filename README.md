# Urban Heat Mitigation MVP

> AI-powered geospatial dashboard for detecting urban heat hotspots, explaining their causes, and simulating cooling interventions.

## 🚀 Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Generate data & train model
python scripts/generate_and_train.py

# 3. Run the app
python api/main.py

# 4. Open in browser
# http://localhost:8000
```

## 🏗️ Architecture

```
Google Earth Engine (Data) → Python ML Pipeline → FastAPI Backend → Leaflet.js Dashboard
```

## 📊 Features

- 🗺️ Interactive heat stress map of Pune, India
- 🔍 Click any zone to see WHY it's hot (SHAP explainability)
- 🌳 Simulate cooling interventions (tree planting, cool roofs, water bodies)
- 📊 Compare scenarios side-by-side
- 📥 Export results as GeoJSON

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Data | Google Earth Engine, ERA5, OpenStreetMap |
| ML | XGBoost, SHAP, scikit-learn |
| Backend | FastAPI, Python 3.11+ |
| Frontend | Leaflet.js, Chart.js, Vanilla JS |
| Database | SQLite + GeoJSON |

## 📁 Project Structure

```
urban-heat-mvp/
├── api/          # FastAPI backend
├── frontend/     # HTML/CSS/JS dashboard
├── src/          # Core ML modules
├── data/         # Raw & processed data
├── models/       # Saved ML models
├── scripts/      # Setup & data generation
└── notebooks/    # Jupyter exploration
```

## 📄 License

MIT
# Urban-Heat-Mitigation
# Urban_Heat_Mitigation
