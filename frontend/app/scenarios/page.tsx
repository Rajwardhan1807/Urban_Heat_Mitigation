"use client";

import React, { useEffect, useRef, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { useDashboard } from "../../lib/DashboardContext";
import {
  Leaf,
  Trees,
  Home,
  Sun,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BarChart2,
  BookOpen,
} from "lucide-react";
import Chart from "chart.js/auto";

interface Scenario {
  scenario: string;
  name: string;
  description: string;
  avg_delta_t: number;
  max_delta_t: number;
  cells_applied: number;
  total_area_km2: number;
  cost_estimate: string;
  implementation_time: string;
  mechanism: string;
  icon?: string;
}

export default function Scenarios() {
  const { setLoading, setLoadingText } = useDashboard();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<any>(null);

  // Fetch scenarios data
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        setLoading(true);
        setLoadingText("Loading scenario data...");
        const res = await fetch("/api/scenarios/compare");
        if (!res.ok) throw new Error("Failed to load scenario metrics.");
        const data = await res.json();
        
        if (data.scenarios) {
          setScenarios(data.scenarios);
        } else {
          setError("No scenario data available.");
        }
        setLoading(false);
      } catch (err) {
        console.error("Failed to load scenarios:", err);
        setError("Failed to load scenario data. Is the server running?");
        setLoading(false);
      }
    };

    fetchScenarios();
  }, []);

  // Comparison Chart Renderer
  useEffect(() => {
    if (scenarios.length === 0 || !chartRef.current) return;

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const SCENARIO_COLORS: Record<string, string> = {
      urban_greening: "#27ae60",
      cool_roofs: "#2E6DA4",
      water_bodies: "#3498db",
      reflective_pavements: "#C0550C",
      green_roofs: "#2ecc71",
    };

    const labels = scenarios.map((s) => s.name);
    const avgDelta = scenarios.map((s) => s.avg_delta_t);
    const maxDelta = scenarios.map((s) => s.max_delta_t);
    const colors = scenarios.map((s) => SCENARIO_COLORS[s.scenario] || "#666");

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Average Cooling (°C)",
            data: avgDelta,
            backgroundColor: colors.map((c: any) => c + "80"),
            borderColor: colors,
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: "Maximum Cooling (°C)",
            data: maxDelta,
            backgroundColor: colors.map((c: any) => c + "30"),
            borderColor: colors.map((c: any) => c + "80"),
            borderWidth: 2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              font: { family: "Inter", size: 12, weight: 500 },
              padding: 16,
              usePointStyle: true,
              pointStyle: "rectRounded",
            },
          },
          tooltip: {
            backgroundColor: "#1C1C2E",
            titleFont: { family: "Inter", size: 13, weight: 600 },
            bodyFont: { family: "Inter", size: 12 },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (context) => {
                return `${context.dataset.label}: ${context.raw}°C`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: "Inter", size: 11, weight: 500 },
              color: "#1C1C2E",
              maxRotation: 15,
            },
          },
          y: {
            title: {
              display: true,
              text: "Temperature Change (°C)",
              font: { family: "Inter", size: 12, weight: 600 },
              color: "#4A4A6A",
            },
            grid: {
              color: "rgba(0,0,0,0.05)",
            },
            ticks: {
              font: { family: "Inter", size: 11 },
              color: "#4A4A6A",
              callback: (val) => val + "°C",
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
  }, [scenarios]);

  const getScenarioIcon = (scenario: string) => {
    switch (scenario) {
      case "urban_greening":
        return <Trees className="w-10 h-10 text-green-600" />;
      case "cool_roofs":
        return <Home className="w-10 h-10 text-blue-600" />;
      case "reflective_pavements":
        return <Sun className="w-10 h-10 text-orange-600" />;
      case "green_roofs":
        return <Leaf className="w-10 h-10 text-emerald-500" />;
      default:
        return <Leaf className="w-10 h-10 text-slate-500" />;
    }
  };

  const getFeasibilityIcon = (cost: string) => {
    if (cost === "Low") {
      return <CheckCircle className="w-4 h-4 inline-block align-middle mr-1 text-green-700" />;
    }
    if (cost === "Medium") {
      return <AlertTriangle className="w-4 h-4 inline-block align-middle mr-1 text-amber-600" />;
    }
    return <XCircle className="w-4 h-4 inline-block align-middle mr-1 text-red-600" />;
  };

  const getCardClass = (scenario: string) => {
    switch (scenario) {
      case "urban_greening":
        return "greening";
      case "cool_roofs":
        return "cool-roofs";
      case "reflective_pavements":
        return "pavements";
      case "green_roofs":
        return "green-roofs";
      default:
        return "";
    }
  };

  return (
    <DashboardLayout activeTab="scenarios">
      <div className="page-content">
        <div className="page-header">
          <h1 className="flex items-center gap-2">
            <Leaf className="w-8 h-8 text-emerald-600" /> Cooling Intervention Scenarios
          </h1>
          <p>
            Compare different urban cooling strategies and their estimated temperature reduction. Each scenario
            modifies relevant features and re-predicts Land Surface Temperature using our trained XGBoost model.
          </p>
        </div>

        {/* Scenario Grid */}
        <div className="scenario-grid" id="scenario-grid">
          {error ? (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <p>{error}</p>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <div className="loading-spinner"></div>
              <p style={{ marginTop: "16px" }}>Loading scenario data...</p>
            </div>
          ) : (
            scenarios.map((s, idx) => (
              <div key={idx} className={`scenario-card ${getCardClass(s.scenario)}`}>
                <div className="scenario-icon">{getScenarioIcon(s.scenario)}</div>
                <h3>{s.name}</h3>
                <p className="scenario-desc">{s.description}</p>

                <div className="scenario-stats">
                  <div className="scenario-stat">
                    <div className="scenario-stat-value negative">{s.avg_delta_t}°C</div>
                    <div className="scenario-stat-label">Avg. Cooling</div>
                  </div>
                  <div className="scenario-stat">
                    <div className="scenario-stat-value negative">{s.max_delta_t}°C</div>
                    <div className="scenario-stat-label">Max. Cooling</div>
                  </div>
                  <div className="scenario-stat">
                    <div className="scenario-stat-value" style={{ color: "var(--deep-blue)" }}>
                      {s.cells_applied}
                    </div>
                    <div className="scenario-stat-label">Cells Affected</div>
                  </div>
                  <div className="scenario-stat">
                    <div className="scenario-stat-value" style={{ color: "var(--deep-blue)" }}>
                      {s.total_area_km2}
                    </div>
                    <div className="scenario-stat-label">Area (km²)</div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span className={`feasibility-badge ${s.cost_estimate.toLowerCase()}`}>
                    {getFeasibilityIcon(s.cost_estimate)} Cost: {s.cost_estimate}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--mid)" }}>
                    <Clock className="w-3.5 h-3.5 inline-block align-middle mr-1" /> {s.implementation_time}
                  </span>
                </div>

                <p style={{ fontSize: "11px", color: "var(--mid)", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--gray-bg)" }}>
                  <strong>Mechanism:</strong> {s.mechanism}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Comparison Chart */}
        <div className="comparison-section">
          <h2 className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-indigo-700" /> Scenario Comparison
          </h2>
          <p style={{ color: "var(--mid)", marginBottom: "24px", fontSize: "14px" }}>
            Average and maximum temperature reduction across all cooling interventions.
          </p>
          <div className="chart-container">
            <canvas ref={chartRef} id="comparison-chart"></canvas>
          </div>
        </div>

        {/* Methodology Note */}
        <div className="comparison-section">
          <h2 className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-slate-700" /> Methodology
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "16px" }}>
            <div>
              <h4 style={{ marginBottom: "8px" }}>How It Works</h4>
              <p style={{ fontSize: "13px", color: "var(--mid)", lineHeight: "1.7" }}>
                Each scenario modifies specific input features (NDVI, albedo, NDWI) for eligible grid cells,
                then runs the trained XGBoost model to predict the new LST. The difference (ΔT) shows the
                estimated cooling effect. Only physically plausible perturbations are applied based on the
                PRD's intervention parameterization table.
              </p>
            </div>
            <div>
              <h4 style={{ marginBottom: "8px" }}>Feature Perturbations</h4>
              <table className="zone-table" style={{ fontSize: "12px" }}>
                <thead>
                  <tr>
                    <th>Intervention</th>
                    <th>Feature Changed</th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Urban Greening</td>
                    <td>NDVI</td>
                    <td>+0.30</td>
                  </tr>
                  <tr>
                    <td>Cool Roofs</td>
                    <td>Albedo</td>
                    <td>+0.25</td>
                  </tr>
                  <tr>
                    <td>Reflective Pavements</td>
                    <td>Albedo</td>
                    <td>+0.15</td>
                  </tr>
                  <tr>
                    <td>Green Roofs</td>
                    <td>NDVI, Albedo</td>
                    <td>+0.15, +0.05</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
