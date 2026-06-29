# Urban Heat Mitigation — Project Folder Structure

This file provides an overview of the directory structure and file layout of the Urban Heat Mitigation project.

```text
Urban-Heat-Mitigation/
├── backend/                        # Python FastAPI backend server
│   ├── main.py                     # Backend entry point (Uvicorn host, API router registration)
│   ├── requirements.txt            # Backend Python dependencies
│   ├── models/                     # Pydantic schemas for data validation
│   │   ├── __init__.py
│   │   └── schemas.py
│   └── routes/                     # API endpoint route handlers
│       ├── __init__.py
│       ├── drivers.py              # Driver attribution endpoints (SHAP analyses)
│       ├── heatmap.py              # LST heat stress map and zoning endpoints
│       ├── locations.py            # Nominatim search and dynamic background pipeline triggering
│       └── scenarios.py            # Cooling intervention simulation endpoints
│
├── data/                           # Data directory for pipeline input and output files
│   ├── outputs/                    # Processed output GeoJSONs and metadata
│   │   └── scenarios/              # GeoJSON outputs for simulated scenarios
│   ├── processed/                  # Placeholders for processed intermediate data
│   └── raw/                        # Placeholders for raw fetched datasets
│
├── frontend/                       # Next.js frontend application
│   ├── package.json                # Frontend package configuration and scripts
│   ├── tsconfig.json               # TypeScript configuration
│   ├── app/                        # Next.js App Router routes and pages
│   │   ├── page.tsx                # Main dashboard page (Interactive Leaflet Map)
│   │   ├── layout.tsx              # Root HTML wrapper layout
│   │   ├── analysis/               # Analysis view route
│   │   │   └── page.tsx            # SHAP global and local analytics page
│   │   └── scenarios/              # Simulation view route
│   │       └── page.tsx            # Cooling scenario comparisons and simulations
│   ├── components/                 # Shared React layout & UI components
│   │   ├── DashboardLayout.tsx     # Main dashboard interface wrapper (navigation, panels, loading)
│   │   └── MapComponent.tsx        # Leaflet interactive map implementation (GeoJSON layers, clicks)
│   ├── lib/                        # Client-side utility functions and state context
│   │   └── DashboardContext.tsx    # React context hook for global state sharing
│   └── styles/                     # CSS stylesheets and global styles
│
├── models/                         # Persistent machine learning model artifacts
│   ├── xgboost_lst.json            # Trained XGBoost regression model for LST prediction
│   └── metrics.json                # Saved model evaluation metrics (RMSE, MAE, R²)
│
├── notebooks/                      # Jupyter notebooks for testing and exploratory analysis
│
├── scripts/                        # Utility & batch execution scripts
│   └── generate_and_train.py       # Main offline pipeline execution (grid generation, ML training)
│
├── src/                            # Shared core source modules (Pipeline logic)
│   ├── __init__.py
│   ├── data_collector.py           # Fetches external API data (OSM, Open-Meteo) & generates grid
│   ├── feature_engineering.py      # Cleans, encodes, and creates ML interaction matrices
│   ├── geom_extractor.py           # Extracts Voronoi polygons for administrative wards/zones
│   ├── model.py                    # XGBoost training wrapper and SHAP evaluation functions
│   ├── scenario_simulator.py       # Cooling intervention definitions and delta calculations
│   └── utils.py                    # Directory variables, constants, and helper wrappers
│
├── requirements.txt                # Global Python dependencies
├── test_overpass.py                # OSM overpass testing script
├── test_overpass_geom.py           # OSM geometry mapping testing script
└── replace_emojis.py               # Emojis cleaner utility script
```

## Key Directory Descriptions

- **`backend/`**: A lightweight [FastAPI](https://fastapi.tiangolo.com/) application that serves the frontend, exposes API endpoints, and coordinates background data pipelines when selecting a new city.
- **`frontend/`**: A modern [Next.js](https://nextjs.org/) (v15) application styled with modular layout styles and powered by [Leaflet.js](https://leafletjs.com/) for interactive map layers.
- **`src/`**: Contains the core python logic of the project. Includes raw data extraction, ML prediction logic via **XGBoost**, and explainability using **SHAP**.
- **`data/outputs/`**: This directory acts as the central data storage repository. The API endpoints load these files into memory at startup.
