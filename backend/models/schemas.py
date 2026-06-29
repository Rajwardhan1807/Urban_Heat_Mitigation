"""
Pydantic models for API request/response validation.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class DriverInfo(BaseModel):
    feature: str
    shap_value: float
    feature_value: float = 0.0
    direction: str  # "heating" or "cooling"
    label: str = ""
    category: str = ""


class CellDriversResponse(BaseModel):
    cell_id: str
    lat: float
    lon: float
    zone_name: str
    lst: float
    hsi_class: str
    top_drivers: List[DriverInfo]
    all_drivers: List[DriverInfo]


class SimulationRequest(BaseModel):
    scenario: str = Field(..., description="Scenario key, e.g. 'urban_greening'")
    coverage_pct: int = Field(default=100, ge=1, le=100)


class ScenarioSummary(BaseModel):
    scenario: str
    name: str
    icon: str
    description: str
    mechanism: str
    cost_estimate: str
    implementation_time: str
    cells_eligible: int
    cells_applied: int
    coverage_pct: int
    avg_delta_t: float
    max_delta_t: float
    min_delta_t: float
    total_area_km2: float


class StatsResponse(BaseModel):
    city: str
    state: str
    total_cells: int
    grid_resolution: str
    data_date: str
    avg_lst: float
    max_lst: float
    min_lst: float
    hotspot_cells: int
    hsi_distribution: Dict[str, int]
    model_metrics: Dict[str, Any]
    zones: List[str]
