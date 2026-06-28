"use client";

import React, { useEffect, useRef, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { useDashboard } from "../../lib/DashboardContext";
import {
  BarChart2,
  Download,
  Search,
  Bot,
  Map as MapIcon,
  XCircle,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import Chart from "chart.js/auto";

interface ZoneMetric {
  zone_name: string;
  avg_lst: number;
  max_lst: number;
  cell_count: number;
  hotspot_count: number;
}

export default function Analysis() {
  const { setLoading, setLoadingText } = useDashboard();
  
  const [stats, setStats] = useState<any>(null);
  const [drivers, setDrivers] = useState<any>(null);
  const [zones, setZones] = useState<ZoneMetric[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hsiChartRef = useRef<HTMLCanvasElement | null>(null);
  const importanceChartRef = useRef<HTMLCanvasElement | null>(null);

  const hsiChartInstance = useRef<any>(null);
  const importanceChartInstance = useRef<any>(null);

  // Fetch analysis data
  useEffect(() => {
    const fetchAnalysisData = async () => {
      try {
        setLoading(true);
        setLoadingText("Loading analysis report...");

        const [statsRes, driversRes, zonesRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/drivers/global"),
          fetch("/api/heatmap/zones"),
        ]);

        if (!statsRes.ok || !driversRes.ok || !zonesRes.ok) {
          throw new Error("Failed to load analysis metrics from endpoints.");
        }

        const statsData = await statsRes.json();
        const driversData = await driversRes.json();
        const zonesData = await zonesRes.json();

        setStats(statsData);
        setDrivers(driversData);
        if (zonesData && zonesData.zones) {
          setZones(zonesData.zones);
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to load analysis report data:", err);
        setError("Failed to load analysis report data. Is the backend server running?");
        setLoading(false);
      }
    };

    fetchAnalysisData();
  }, []);

  // HSI Doughnut Chart Renderer
  useEffect(() => {
    if (!stats || !stats.hsi_distribution || !hsiChartRef.current) return;

    const ctx = hsiChartRef.current.getContext("2d");
    if (!ctx) return;

    if (hsiChartInstance.current) {
      hsiChartInstance.current.destroy();
    }

    const HSI_CHART_COLORS: Record<string, string> = {
      "Cool Zone": "#4575B4",
      "Mild Zone": "#ABD9E9",
      "Warm Zone": "#FEE090",
      "Hot Zone": "#F46D43",
      "Extreme Heat Hotspot": "#A50026",
    };

    const distribution = stats.hsi_distribution;
    const labels = Object.keys(distribution);
    const values = Object.values(distribution);
    const colors = labels.map((l) => HSI_CHART_COLORS[l] || "#ccc");

    hsiChartInstance.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: "#fff",
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              font: { family: "Inter", size: 11, weight: 500 },
              padding: 12,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: "#1C1C2E",
            titleFont: { family: "Inter", size: 12 },
            bodyFont: { family: "Inter", size: 11 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (context) => {
                const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const val = context.raw as number;
                const pct = ((val / total) * 100).toFixed(1);
                return `${context.label}: ${val} cells (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => {
      if (hsiChartInstance.current) {
        hsiChartInstance.current.destroy();
        hsiChartInstance.current = null;
      }
    };
  }, [stats]);

  // SHAP Feature Importance Bar Chart Renderer
  useEffect(() => {
    if (!drivers || !drivers.importance || !importanceChartRef.current) return;

    const ctx = importanceChartRef.current.getContext("2d");
    if (!ctx) return;

    if (importanceChartInstance.current) {
      importanceChartInstance.current.destroy();
    }

    const CATEGORY_COLORS: Record<string, string> = {
      Vegetation: "#2ecc71",
      Water: "#3498db",
      Surface: "#e67e22",
      Morphology: "#9b59b6",
      Atmospheric: "#1abc9c",
      LULC: "#34495e",
      Interaction: "#e74c3c",
    };

    const top10 = drivers.importance.slice(0, 10);
    const labels = top10.map((d: any) => d.label || d.feature);
    const values = top10.map((d: any) => d.mean_abs_shap);
    const colors = top10.map((d: any) => {
      const cat = d.category || "Other";
      return CATEGORY_COLORS[cat] || "#666";
    });

    importanceChartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Mean |SHAP| (°C)",
            data: values,
            backgroundColor: colors.map((c: any) => c + "60"),
            borderColor: colors,
            borderWidth: 2,
            borderRadius: 4,
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
            titleFont: { family: "Inter", size: 12 },
            bodyFont: { family: "Inter", size: 11 },
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Mean |SHAP Value| (°C)",
              font: { family: "Inter", size: 11, weight: 600 },
            },
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: { font: { family: "Inter", size: 10 } },
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
      if (importanceChartInstance.current) {
        importanceChartInstance.current.destroy();
        importanceChartInstance.current = null;
      }
    };
  }, [drivers]);

  // Export Zone Comparison Table to CSV
  const handleExportCSV = () => {
    if (zones.length === 0) return;

    const csv = [];
    // Add CSV header
    csv.push('"Rank","Zone Name","Avg LST (°C)","Max LST (°C)","Cells","Hotspots"');

    // Add sorted rows
    const sortedZones = [...zones].sort((a, b) => b.avg_lst - a.avg_lst);
    sortedZones.forEach((z, idx) => {
      const row = [
        `"#${idx + 1}"`,
        `"${z.zone_name.replace(/"/g, '""')}"`,
        `"${z.avg_lst}°C"`,
        `"${z.max_lst}°C"`,
        `"${z.cell_count}"`,
        `"${z.hotspot_count}"`,
      ];
      csv.push(row.join(","));
    });

    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zone_analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLSTColor = (lst: number) => {
    if (lst < 30) return "#4575B4";
    if (lst < 35) return "#1B7A78";
    if (lst < 40) return "#C0550C";
    if (lst < 45) return "#D73027";
    return "#A50026";
  };

  const renderStatusBadge = (avg_lst: number) => {
    if (avg_lst > 40) {
      return (
        <span style={{ color: "#A50026", fontWeight: 700 }} className="flex items-center gap-1">
          <XCircle className="w-4 h-4 text-[#C92A2A]" /> Critical
        </span>
      );
    }
    if (avg_lst > 37) {
      return (
        <span style={{ color: "#F46D43", fontWeight: 700 }} className="flex items-center gap-1">
          <AlertTriangle className="w-4 h-4 text-[#F59F00]" /> Warning
        </span>
      );
    }
    if (avg_lst > 34) {
      return (
        <span style={{ color: "#C0550C", fontWeight: 700 }} className="flex items-center gap-1">
          <AlertCircle className="w-4 h-4 text-[#F59F00]" /> Monitor
        </span>
      );
    }
    return (
      <span style={{ color: "#1B7A78", fontWeight: 700 }} className="flex items-center gap-1">
        <CheckCircle className="w-4 h-4 text-[#2B8A3E]" /> Normal
      </span>
    );
  };

  // Sort zones for table
  const sortedZones = [...zones].sort((a, b) => b.avg_lst - a.avg_lst);

  return (
    <DashboardLayout activeTab="analysis">
      <div className="page-content">
        <div className="page-header">
          <h1 className="flex items-center gap-2">
            <BarChart2 className="w-8 h-8 text-indigo-700" /> Analysis & Reports
          </h1>
          <p>
            Overview of urban heat stress patterns, driver attribution, and zone-level analysis for{" "}
            {stats?.city || "Pune, Maharashtra"}.
          </p>
        </div>

        {/* Key Metrics Cards */}
        <div className="analysis-grid" id="metrics-grid">
          <div className="analysis-card" id="card-avg-temp">
            <h3>Average Temperature</h3>
            <div className="big-number" id="big-avg-lst">
              {stats?.avg_lst ? `${stats.avg_lst}°C` : "—"}
            </div>
            <div className="big-label">Mean LST across all grid cells</div>
          </div>
          <div className="analysis-card" id="card-max-temp">
            <h3>Maximum Temperature</h3>
            <div className="big-number danger" id="big-max-lst">
              {stats?.max_lst ? `${stats.max_lst}°C` : "—"}
            </div>
            <div className="big-label">Hottest grid cell recorded</div>
          </div>
          <div className="analysis-card" id="card-hotspots">
            <h3>Hotspot Cells</h3>
            <div className="big-number warning" id="big-hotspots">
              {stats?.hotspot_cells !== undefined ? stats.hotspot_cells : "—"}
            </div>
            <div className="big-label">Cells exceeding 40°C threshold</div>
          </div>
          <div className="analysis-card" id="card-model">
            <h3>Model Accuracy</h3>
            <div className="big-number success" id="big-r2">
              {stats?.model_metrics?.r2 ? stats.model_metrics.r2 : "—"}
            </div>
            <div className="big-label">XGBoost R² score on test set</div>
          </div>
        </div>

        {/* HSI Distribution & Global Drivers Chart */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "24px", marginBottom: "32px" }}>
          {/* HSI Distribution */}
          <div className="comparison-section">
            <h2 style={{ color: "var(--deep-blue)", fontSize: "18px" }}>Heat Stress Distribution</h2>
            <p style={{ color: "var(--mid)", fontSize: "13px", marginBottom: "16px" }}>
              Classification of grid cells by Heat Stress Index level.
            </p>
            <div style={{ height: "300px" }}>
              <canvas ref={hsiChartRef} id="hsi-chart"></canvas>
            </div>
          </div>

          {/* Global Drivers (SHAP) */}
          <div className="comparison-section">
            <h2 style={{ color: "var(--deep-blue)", fontSize: "18px" }} className="flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-700" /> Global Driver Attribution (SHAP)
            </h2>
            <p style={{ color: "var(--mid)", fontSize: "13px", marginBottom: "16px" }}>
              Top features driving urban heat — ranked by mean absolute SHAP value across all cells.
            </p>
            <div style={{ height: "350px" }}>
              <canvas ref={importanceChartRef} id="importance-chart"></canvas>
            </div>
          </div>
        </div>

        {/* Zone Comparison Table */}
        <div className="comparison-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ color: "var(--deep-blue)", fontSize: "18px" }} className="flex items-center gap-2">
                <MapIcon className="w-5 h-5 text-indigo-700" /> Zone Comparison
              </h2>
              <p style={{ color: "var(--mid)", fontSize: "13px" }}>
                Detailed metrics per administrative zone, sorted by average temperature.
              </p>
            </div>
            <button className="btn btn-secondary btn-sm flex items-center gap-1.5" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          <table className="zone-table" id="zone-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Zone Name</th>
                <th>Avg LST (°C)</th>
                <th>Max LST (°C)</th>
                <th>Cells</th>
                <th>Hotspots</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="zone-table-body">
              {error ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "red" }}>
                    {error}
                  </td>
                </tr>
              ) : zones.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                    Loading zone data...
                  </td>
                </tr>
              ) : (
                sortedZones.map((z, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, color: "var(--mid)" }}>#{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{z.zone_name}</td>
                    <td className="temp-cell" style={{ color: getLSTColor(z.avg_lst) }}>
                      {z.avg_lst}°C
                    </td>
                    <td className="temp-cell" style={{ color: getLSTColor(z.max_lst) }}>
                      {z.max_lst}°C
                    </td>
                    <td>{z.cell_count}</td>
                    <td style={{ fontWeight: 700, color: z.hotspot_count > 0 ? "#A50026" : "#999" }}>
                      {z.hotspot_count}
                    </td>
                    <td>{renderStatusBadge(z.avg_lst)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Model Info Section */}
        <div className="comparison-section">
          <h2 style={{ color: "var(--deep-blue)", fontSize: "18px" }} className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-700" /> Model Details
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px", marginTop: "16px" }}>
            <div>
              <h4 style={{ marginBottom: "8px" }}>Architecture</h4>
              <p style={{ fontSize: "13px", color: "var(--mid)", lineHeight: "1.7" }}>
                <strong>Algorithm:</strong> XGBoost Regressor
                <br />
                <strong>Trees:</strong> 200 estimators
                <br />
                <strong>Max Depth:</strong> 6
                <br />
                <strong>Learning Rate:</strong> 0.1
                <br />
                <strong>Features:</strong> 16
              </p>
            </div>
            <div>
              <h4 style={{ marginBottom: "8px" }}>Data Sources</h4>
              <p style={{ fontSize: "13px", color: "var(--mid)", lineHeight: "1.7" }}>
                <strong>LST:</strong> Landsat 8 Band ST_B10
                <br />
                <strong>Vegetation:</strong> Sentinel-2 NDVI
                <br />
                <strong>Climate:</strong> ERA5 Reanalysis
                <br />
                <strong>Buildings:</strong> OpenStreetMap
                <br />
                <strong>LULC:</strong> ESA WorldCover
              </p>
            </div>
            <div>
              <h4 style={{ marginBottom: "8px" }}>Explainability</h4>
              <p style={{ fontSize: "13px", color: "var(--mid)", lineHeight: "1.7" }}>
                <strong>Method:</strong> SHAP TreeExplainer
                <br />
                <strong>Type:</strong> Per-cell attribution
                <br />
                <strong>Global:</strong> Mean |SHAP| ranking
                <br />
                <strong>Local:</strong> Top-5 drivers per cell
                <br />
                <strong>Validation:</strong> Spatial cross-validation
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
