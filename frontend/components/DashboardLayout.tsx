"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDashboard } from "../lib/DashboardContext";
import {
  ThermometerSun,
  Map as MapIcon,
  Trees,
  BarChart2,
  Search,
  Satellite,
  Leaf,
  CloudSun,
  Building,
  Download,
  Home,
  Sun,
  Clock,
  X,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import Chart from "chart.js/auto";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: "dashboard" | "scenarios" | "analysis";
}

export default function DashboardLayout({ children, activeTab }: DashboardLayoutProps) {
  const {
    selectedCity,
    setSelectedCity,
    stats,
    zoneRankings,
    selectedCell,
    setSelectedCell,
    isPanelOpen,
    setIsPanelOpen,
    activeLayers,
    setActiveLayers,
    opacity,
    setOpacity,
    loading,
    setLoading,
    loadingText,
    setLoadingText,
    driverData,
    setDriverData,
  } = useDashboard();

  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<any>(null);
  const statusInterval = useRef<NodeJS.Timeout | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (statusInterval.current) clearInterval(statusInterval.current);
    };
  }, []);

  // Update Driver Attribution Chart when driverData changes
  useEffect(() => {
    if (!isPanelOpen || !selectedCell || !driverData || !chartRef.current) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
      return;
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const top5 = (driverData.all_drivers || driverData.top_drivers || []).slice(0, 8);
    const labels = top5.map((d: any) => d.label || d.feature);
    const values = top5.map((d: any) => d.shap_value);
    const colors = top5.map((d: any) => {
      if (d.category_color) return d.category_color;
      return d.shap_value > 0 ? "#D73027" : "#1B7A78";
    });

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "SHAP Value (°C contribution)",
            data: values,
            backgroundColor: colors.map((c: string) => c + "40"),
            borderColor: colors,
            borderWidth: 2,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1C1C2E",
            titleFont: { family: "Inter", size: 12, weight: 600 },
            bodyFont: { family: "Inter", size: 11 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (context) => {
                const val = context.raw as number;
                const dir = val > 0 ? "Heating" : "Cooling";
                return `${dir}: ${val > 0 ? "+" : ""}${val.toFixed(3)}°C`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "SHAP Value (°C)",
              font: { family: "Inter", size: 11, weight: 600 },
              color: "#4A4A6A",
            },
            grid: {
              color: "rgba(0,0,0,0.05)",
            },
            ticks: {
              font: { family: "Inter", size: 10 },
              color: "#4A4A6A",
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              font: { family: "Inter", size: 11, weight: 500 },
              color: "#1C1C2E",
            },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [isPanelOpen, selectedCell, driverData]);

  // Search trigger geocoding pipeline
  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    console.log(`[Search] Initiating search for query: ${query}`);
    setLoading(true);
    setLoadingText("Searching location...");

    try {
      const locationRes = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
      const location = await locationRes.json();
      console.log("[Search] Geocoding API response received:", location);

      if (location && location.bbox) {
        setLoadingText("Starting pipeline...");
        setSelectedCity(location.name);

        const selectRes = await fetch("/api/locations/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: location.name,
            lat: location.lat,
            lon: location.lon,
            bbox: location.bbox,
          }),
        });
        const selectData = await selectRes.json();
        console.log("[Search] Backend select trigger response:", selectData);

        if (selectData && selectData.status === "running") {
          monitorPipeline();
        } else {
          setLoading(false);
          alert("Failed to start pipeline.");
        }
      } else {
        setLoading(false);
        alert("Location not found.");
      }
    } catch (err) {
      console.error("[Search] Failed to search:", err);
      setLoading(false);
      alert("Error occurred during location search.");
    }
  };

  const monitorPipeline = () => {
    if (statusInterval.current) clearInterval(statusInterval.current);

    statusInterval.current = setInterval(async () => {
      try {
        const res = await fetch("/api/locations/status");
        const status = await res.json();
        console.log("[Pipeline] Polled status:", status);

        if (status) {
          setLoadingText(`${status.message} (${status.progress}%)`);

          if (status.status === "complete" || status.status === "error") {
            if (statusInterval.current) clearInterval(statusInterval.current);
            setTimeout(() => {
              if (status.status === "complete") {
                console.log("[Pipeline] Pipeline finished successfully. Refreshing page.");
                window.location.reload();
              } else {
                alert("Pipeline Error: " + status.message);
                setLoading(false);
              }
            }, 1000);
          }
        }
      } catch (err) {
        console.error("[Pipeline] Status polling error:", err);
      }
    }, 2000);
  };

  // Export Cell Data as JSON
  const handleExportCellData = () => {
    if (!selectedCell) return;
    const blob = new Blob([JSON.stringify(selectedCell, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedCell.cell_id || "cell"}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getHSIBadgeClass = (hsiClass: string) => {
    const map: Record<string, string> = {
      "Cool Zone": "cool",
      "Mild Zone": "mild",
      "Warm Zone": "warm",
      "Hot Zone": "hot",
      "Extreme Heat Hotspot": "extreme",
    };
    return map[hsiClass] || "warm";
  };

  const getLSTTextColor = (lst: number) => {
    if (lst < 30) return "#4575B4";
    if (lst < 35) return "#1B7A78";
    if (lst < 40) return "#C0550C";
    if (lst < 45) return "#D73027";
    return "#A50026";
  };

  // Calculate Region Area Details
  const totalCells = stats?.total_cells || 0;
  const totalAreaKm2 = (totalCells * 0.0625).toFixed(2);
  const totalAreaHa = (totalCells * 6.25).toFixed(1);
  const totalAreaM2 = (totalCells * 62500).toLocaleString();

  return (
    <>
      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay" id="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">{loadingText}</div>
        </div>
      )}

      <div
        className={`dashboard ${isPanelOpen ? "panel-open" : ""} ${
          activeTab !== "dashboard" ? "sidebar-collapsed" : ""
        }`}
        id="dashboard"
      >
        {/* Navigation Bar */}
        <nav className="navbar">
          <div className="navbar-brand">
            <ThermometerSun style={{ width: "24px", height: "24px", color: "#FFA07A", marginRight: "8px" }} />
            <div>
              <h1>Urban Heat Mitigation</h1>
              <span className="subtitle">AI-Powered Geospatial Dashboard</span>
            </div>
          </div>

          <div className="navbar-nav">
            <Link className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`} href="/" id="nav-dashboard">
              <MapIcon style={{ width: "16px", height: "16px" }} /> Dashboard
            </Link>
            <Link className={`nav-link ${activeTab === "scenarios" ? "active" : ""}`} href="/scenarios" id="nav-scenarios">
              <Trees style={{ width: "16px", height: "16px" }} /> Scenarios
            </Link>
            <Link className={`nav-link ${activeTab === "analysis" ? "active" : ""}`} href="/analysis" id="nav-analysis">
              <BarChart2 style={{ width: "16px", height: "16px" }} /> Analysis
            </Link>
          </div>

          <div className="navbar-actions" style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div
              className="search-container"
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "4px",
                padding: "4px 8px",
              }}
            >
              <Search
                style={{ width: "14px", height: "14px", marginRight: "4px", cursor: "pointer" }}
                onClick={handleSearch}
              />
              <input
                type="text"
                id="location-search"
                placeholder="Search location..."
                style={{ background: "transparent", border: "none", color: "inherit", outline: "none", fontSize: "13px" }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
              />
            </div>
            <div className="city-badge">
              <span className="dot"></span>
              <span id="stat-city">{selectedCity}</span>
            </div>
          </div>
        </nav>

        {/* Left Sidebar */}
        <aside className="sidebar" id="sidebar">
          {/* Layer Controls */}
          <div className="sidebar-section">
            <div className="sidebar-title">Map Layers</div>

            <div className="layer-toggle">
              <div className="layer-toggle-left">
                <div className="layer-color" style={{ background: "linear-gradient(135deg, #F46D43, #A50026)" }}></div>
                <span className="layer-label">Heat Stress Map</span>
              </div>
              <input
                type="checkbox"
                className="toggle"
                id="layer-heat"
                checked={activeLayers.heat}
                onChange={(e) =>
                  setActiveLayers((prev) => ({ ...prev, heat: e.target.checked }))
                }
              />
            </div>

            <div className="layer-toggle">
              <div className="layer-toggle-left">
                <div className="layer-color" style={{ background: "linear-gradient(135deg, #27ae60, #2ecc71)" }}></div>
                <span className="layer-label">Vegetation (NDVI)</span>
              </div>
              <input
                type="checkbox"
                className="toggle"
                id="layer-ndvi"
                checked={activeLayers.ndvi}
                onChange={(e) =>
                  setActiveLayers((prev) => ({ ...prev, ndvi: e.target.checked }))
                }
              />
            </div>

            <div className="layer-toggle">
              <div className="layer-toggle-left">
                <div className="layer-color" style={{ background: "linear-gradient(135deg, #7f8c8d, #95a5a6)" }}></div>
                <span className="layer-label">Buildings</span>
              </div>
              <input
                type="checkbox"
                className="toggle"
                id="layer-buildings"
                checked={activeLayers.buildings}
                onChange={(e) =>
                  setActiveLayers((prev) => ({ ...prev, buildings: e.target.checked }))
                }
              />
            </div>

            <div className="opacity-control">
              <label>
                Layer Opacity: <span id="opacity-value">{opacity}%</span>
              </label>
              <input
                type="range"
                className="slider"
                id="opacity-slider"
                min="10"
                max="100"
                value={opacity}
                onChange={(e) => setOpacity(parseInt(e.target.value))}
              />
            </div>
          </div>

          {/* Legend */}
          <div className="sidebar-section">
            <div className="sidebar-title">Heat Stress Legend</div>
            <div className="legend">
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: "#4575B4" }}></div>
                <span>Cool Zone (&lt;30°C)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: "#ABD9E9" }}></div>
                <span>Mild Zone (30–35°C)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: "#FEE090" }}></div>
                <span>Warm Zone (35–40°C)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: "#F46D43" }}></div>
                <span>Hot Zone (40–45°C)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: "#A50026" }}></div>
                <span>Extreme Hotspot (&gt;45°C)</span>
              </div>
            </div>
            <div className="legend-gradient"></div>
            <div className="legend-labels">
              <span>25°C</span>
              <span>32°C</span>
              <span>38°C</span>
              <span>44°C</span>
              <span>50°C</span>
            </div>
          </div>

          {/* Zone Stats */}
          <div className="sidebar-section">
            <div className="sidebar-title">Zone Rankings</div>
            <div id="zone-stats-list">
              {zoneRankings && zoneRankings.length > 0 ? (
                zoneRankings.slice(0, 12).map((zone, idx) => (
                  <div
                    key={idx}
                    className="zone-stat"
                    onClick={() => console.log(`Filtering by zone: ${zone.zone_name}`)}
                  >
                    <div>
                      <span className="zone-name">{zone.zone_name}</span>
                      {zone.hotspot_count > 0 && (
                        <span style={{ color: "#A50026", fontSize: "10px", marginLeft: "4px", fontWeight: "bold" }}>(Hotspot)</span>
                      )}
                    </div>
                    <span className="zone-temp" style={{ color: getLSTTextColor(zone.avg_lst) }}>
                      {zone.avg_lst}°C
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: "8px 0", color: "#999", fontSize: "12px" }}>No zones loaded.</div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        {children}

        {/* Right Sidebar Detail Panel */}
        <aside className="detail-panel" id="detail-panel">
          <div className="panel-header">
            <h3 id="panel-title">{selectedCell ? selectedCell.zone_name || "Cell Details" : "Cell Details"}</h3>
            <button className="panel-close" id="panel-close" title="Close" onClick={() => setIsPanelOpen(false)}>
              <X style={{ width: "16px", height: "16px" }} />
            </button>
          </div>
          <div className="panel-body" id="panel-body">
            {selectedCell ? (
              <>
                {/* LST and HSI Badge */}
                <div className="panel-section animate-in">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span className={`hsi-badge ${getHSIBadgeClass(selectedCell.hsi_class)}`}>
                      {selectedCell.hsi_class}
                    </span>
                    <span
                      style={{
                        fontSize: "28px",
                        fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: getLSTTextColor(selectedCell.lst),
                      }}
                    >
                      {selectedCell.lst}°C
                    </span>
                  </div>
                </div>

                {/* Properties Grid */}
                <div className="panel-section animate-in" style={{ animationDelay: "0.1s" }}>
                  <div className="panel-section-title">Cell Properties</div>
                  <div className="prop-grid">
                    <div className="prop-item">
                      <div className="prop-label">NDVI</div>
                      <div className="prop-value" style={{ color: "#27ae60" }}>
                        {(selectedCell.ndvi || 0).toFixed(3)}
                      </div>
                    </div>
                    <div className="prop-item">
                      <div className="prop-label">Albedo</div>
                      <div className="prop-value">{(selectedCell.albedo || 0).toFixed(3)}</div>
                    </div>
                    <div className="prop-item">
                      <div className="prop-label">Bldg Density</div>
                      <div className="prop-value">{(selectedCell.building_density || 0).toFixed(0)}/km²</div>
                    </div>
                    <div className="prop-item">
                      <div className="prop-label">Wind Speed</div>
                      <div className="prop-value">{(selectedCell.wind_speed || 0).toFixed(1)} m/s</div>
                    </div>
                    <div className="prop-item">
                      <div className="prop-label">Land Use</div>
                      <div className="prop-value" style={{ fontSize: "13px", textTransform: "capitalize" }}>
                        {(selectedCell.lulc_class || "—").replace("_", " ")}
                      </div>
                    </div>
                    <div className="prop-item">
                      <div className="prop-label">Sky View</div>
                      <div className="prop-value">{(selectedCell.svf || 0).toFixed(2)}</div>
                    </div>
                    <div className="prop-item" style={{ gridColumn: "span 2" }}>
                      <div className="prop-label">Grid Cell Size</div>
                      <div className="prop-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}>
                        250m × 250m
                      </div>
                    </div>
                    <div className="prop-item" style={{ gridColumn: "span 2" }}>
                      <div className="prop-label">Cell Area</div>
                      <div
                        className="prop-value"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", lineHeight: "1.4" }}
                      >
                        62,500 m² | 6.25 ha | 0.0625 km²
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Drivers */}
                <div className="panel-section animate-in" style={{ animationDelay: "0.15s" }}>
                  <div className="panel-section-title">Top Heat Drivers (SHAP)</div>
                  {driverData && driverData.top_drivers && driverData.top_drivers.length > 0 ? (
                    driverData.top_drivers.slice(0, 3).map((d: any, idx: number) => (
                      <div key={idx} className="popup-driver">
                        <span className="popup-driver-name">{d.label || d.feature}</span>
                        <span className={`popup-driver-value ${d.direction || (d.shap_value > 0 ? "heating" : "cooling")}`}>
                          {d.shap_value > 0 ? "+" : ""}
                          {d.shap_value.toFixed(2)}°C
                        </span>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "#999", fontSize: "12px" }}>No driver data available</p>
                  )}
                </div>

                {/* Driver Chart */}
                <div className="panel-section animate-in" style={{ animationDelay: "0.2s" }}>
                  <div className="panel-section-title">Driver Attribution Chart</div>
                  <div className="driver-chart-container">
                    <canvas ref={chartRef} id="driver-chart"></canvas>
                  </div>
                </div>

                {/* Actions */}
                <div className="panel-section animate-in" style={{ animationDelay: "0.25s" }}>
                  <Link href="/scenarios" className="btn btn-teal btn-block text-center" style={{ color: "white" }}>
                    <Trees style={{ width: "16px", height: "16px", marginRight: "6px", display: "inline-block", verticalAlign: "middle" }} /> Simulate Cooling Interventions
                  </Link>
                  <div style={{ marginTop: "8px" }}>
                    <button className="btn btn-secondary btn-block btn-sm" onClick={handleExportCellData}>
                      <Download style={{ width: "14px", height: "14px", marginRight: "6px", display: "inline-block", verticalAlign: "middle" }} /> Export Cell Data
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><HelpCircle style={{ width: "24px", height: "24px", color: "var(--teal)" }} /></div>
                <p>Click any grid cell on the map to display its details, metrics, and SHAP driver analysis.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Footer / Bottom Bar */}
        <footer className="bottombar">
          <div className="data-sources">
            <span>Data Sources:</span>
            <span className="source-badge">
              <Satellite style={{ width: "12px", height: "12px", marginRight: "4px" }} /> Landsat 8
            </span>
            <span className="source-badge">
              <Leaf style={{ width: "12px", height: "12px", marginRight: "4px" }} /> Sentinel-2
            </span>
            <span className="source-badge">
              <CloudSun style={{ width: "12px", height: "12px", marginRight: "4px" }} /> ERA5
            </span>
            <span className="source-badge">
              <Building style={{ width: "12px", height: "12px", marginRight: "4px" }} /> OpenStreetMap
            </span>
          </div>
          <div>
            <span>Model: XGBoost v1.0 | Grid: 250m | </span>
            <span id="model-metrics">
              {stats?.model_metrics
                ? `R² = ${stats.model_metrics.r2} | RMSE = ${stats.model_metrics.rmse}°C`
                : "R² = — | RMSE = —"}
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
