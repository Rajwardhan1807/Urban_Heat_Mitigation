"use client";

import React from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "../components/DashboardLayout";
import { useDashboard } from "../lib/DashboardContext";

// Dynamically import MapComponent to disable server-side rendering (SSR) for Leaflet
const MapComponent = dynamic(() => import("../components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="empty-state" style={{ paddingTop: "200px" }}>
      <div className="loading-spinner"></div>
      <p style={{ marginTop: "16px" }}>Initializing Leaflet Map...</p>
    </div>
  ),
});

export default function Home() {
  const { stats } = useDashboard();

  // Metrics details
  const avgLst = stats?.avg_lst !== undefined ? `${stats.avg_lst}°C` : "—";
  const maxLst = stats?.max_lst !== undefined ? `${stats.max_lst}°C` : "—";
  const hotspots = stats?.hotspot_cells !== undefined ? stats.hotspot_cells : "—";
  const totalCells = stats?.total_cells !== undefined ? stats.total_cells : "—";

  // Calculate Region Area Details
  const totalAreaKm2 = stats?.total_cells ? (stats.total_cells * 0.0625).toFixed(2) : "—";
  const totalAreaHa = stats?.total_cells ? (stats.total_cells * 6.25).toFixed(1) : "—";

  return (
    <DashboardLayout activeTab="dashboard">
      <main className="map-container">
        {/* Stats Cards Overlay */}
        <div className="map-stats" id="map-stats">
          <div className="stat-card">
            <div className="stat-label">Avg. Temperature</div>
            <div className="stat-value" id="stat-avg-lst">
              {avgLst}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Max Temperature</div>
            <div className="stat-value hot" id="stat-max-lst">
              {maxLst}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Hotspot Cells</div>
            <div className="stat-value warning" id="stat-hotspots">
              {hotspots}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Cells</div>
            <div className="stat-value" id="stat-total">
              {totalCells}
            </div>
            {stats?.total_cells && (
              <div
                className="stat-sublabel"
                id="stat-total-area"
                style={{ fontSize: "11px", opacity: 0.8, marginTop: "4px", fontFamily: "'JetBrains Mono', monospace" }}
                title={`Estimated Region Area: ${(stats.total_cells * 62500).toLocaleString()} m²`}
              >
                {totalAreaKm2} km² ({totalAreaHa} ha)
              </div>
            )}
          </div>
        </div>

        {/* The Leaflet Map Component */}
        <MapComponent />
      </main>
    </DashboardLayout>
  );
}
