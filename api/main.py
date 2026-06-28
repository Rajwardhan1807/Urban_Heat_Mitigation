"""
Urban Heat Mitigation MVP — FastAPI Application
Main entry point for the backend server.

Serves:
- REST API endpoints (/api/*)
- Static frontend files (/)
"""
import os
import sys
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from api.routes import heatmap, drivers, scenarios, locations

# Paths
OUTPUTS_DIR = os.path.join(PROJECT_ROOT, "data", "outputs")
SCENARIOS_DIR = os.path.join(OUTPUTS_DIR, "scenarios")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

# Create FastAPI app
app = FastAPI(
    title="Urban Heat Mitigation API",
    description="AI-powered geospatial API for urban heat stress detection, "
                "driver attribution, and cooling scenario simulation.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(heatmap.router)
app.include_router(drivers.router)
app.include_router(scenarios.router)
app.include_router(locations.router)


# Stats endpoint
@app.get("/api/stats", tags=["Stats"])
def get_stats():
    """Get overall city statistics."""
    stats_path = os.path.join(OUTPUTS_DIR, "city_stats.json")
    if os.path.exists(stats_path):
        with open(stats_path, "r") as f:
            return json.load(f)
    return {"error": "Stats not generated. Run scripts/generate_and_train.py first."}
    return {"error": "Stats not generated. Run scripts/generate_and_train.py first."}
    
@app.get("/api/zones", tags=["Map Layers"])
def get_zones():
    """Get the true polygon geometries for city zones/wards."""
    zones_path = os.path.join(OUTPUTS_DIR, "zones.geojson")
    if os.path.exists(zones_path):
        return FileResponse(zones_path, media_type="application/json")
    return {"type": "FeatureCollection", "features": []}

@app.get("/api/health", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "data_loaded": os.path.exists(os.path.join(OUTPUTS_DIR, "predictions.geojson")),
    }


# Serve frontend static files
if os.path.exists(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
    if os.path.exists(os.path.join(FRONTEND_DIR, "assets")):
        app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/scenarios.html", include_in_schema=False)
    def serve_scenarios():
        return FileResponse(os.path.join(FRONTEND_DIR, "scenarios.html"))

    @app.get("/analysis.html", include_in_schema=False)
    def serve_analysis():
        return FileResponse(os.path.join(FRONTEND_DIR, "analysis.html"))


@app.on_event("startup")
async def startup_event():
    """Load data files on server startup."""
    print("\n  Urban Heat Mitigation MVP — Starting up...")
    print(f"   Data dir: {OUTPUTS_DIR}")

    if not os.path.exists(os.path.join(OUTPUTS_DIR, "predictions.geojson")):
        print("\n  No data found! Run the pipeline first:")
        print("   python scripts/generate_and_train.py\n")
        return

    print("\n Loading data files...")
    heatmap.load_data(OUTPUTS_DIR)
    drivers.load_data(OUTPUTS_DIR)
    scenarios.load_data(SCENARIOS_DIR)

    print("\n Server ready!")
    print("   Dashboard:  http://localhost:8000")
    print("   API Docs:   http://localhost:8000/api/docs\n")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[PROJECT_ROOT],
    )
