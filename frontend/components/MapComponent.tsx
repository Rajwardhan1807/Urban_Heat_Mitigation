"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useDashboard } from "../lib/DashboardContext";

export default function MapComponent() {
  const {
    activeLayers,
    opacity,
    setSelectedCell,
    setIsPanelOpen,
    setDriverData,
    setStats,
    setZoneRankings,
    setLoading,
    setLoadingText,
  } = useDashboard();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // Layer references
  const heatLayerRef = useRef<L.GeoJSON | null>(null);
  const ndviLayerRef = useRef<L.GeoJSON | null>(null);
  const buildingsLayerRef = useRef<L.GeoJSON | null>(null);
  const zonesLayerRef = useRef<L.GeoJSON | null>(null);
  const selectedCellLayerRef = useRef<L.Path | null>(null);

  // Loaded data state to prevent double fetches
  const [dataLoaded, setDataLoaded] = useState(false);
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [zonesGeojsonData, setZonesGeojsonData] = useState<any>(null);

  const lastRenderedGeojsonRef = useRef<any>(null);
  const lastRenderedZonesRef = useRef<any>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    console.log("[MapComponent] Initializing Leaflet map...");

    // Pune center coordinates
    const map = L.map(mapContainerRef.current, {
      center: [18.515, 73.855],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    mapRef.current = map;

    // Add zoom control to bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // CartoDB Positron base map (clean, light style)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Add scale bar
    L.control.scale({
      metric: true,
      imperial: false,
      position: "bottomleft",
    }).addTo(map);

    // Geocoding on map click
    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      console.log(`[MapComponent] Map click detected at coordinates: ${lat}, ${lng}`);
      // Triggers query search using lat, lng string
      const searchInput = document.getElementById("location-search") as HTMLInputElement;
      if (searchInput) {
        searchInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        // Dispatch custom change event to update state in DashboardLayout
        const event = new Event("input", { bubbles: true });
        searchInput.dispatchEvent(event);
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Fetch geospatial datasets from API
  useEffect(() => {
    if (dataLoaded) return;

    const loadData = async () => {
      try {
        console.log("[MapComponent] Fetching map layers and statistics...");
        setLoading(true);
        setLoadingText("Fetching urban heat data...");

        const [heatmapRes, statsRes, rankingsRes, zonesRes] = await Promise.all([
          fetch("/api/heatmap"),
          fetch("/api/stats"),
          fetch("/api/heatmap/zones"),
          fetch("/api/zones"),
        ]);

        const heatmap = await heatmapRes.json();
        const stats = await statsRes.json();
        const rankings = await rankingsRes.json();
        const zonesGeojson = await zonesRes.json();

        setStats(stats);
        if (rankings && rankings.zones) {
          setZoneRankings(rankings.zones);
        }

        setGeojsonData(heatmap);
        setZonesGeojsonData(zonesGeojson);
        setDataLoaded(true);
        setLoading(false);
      } catch (err) {
        console.error("[MapComponent] Failed to load data:", err);
        setLoading(false);
      }
    };

    loadData();
  }, [dataLoaded]);

  // LST Temperature to Color Mapper
  const getLSTColor = (lst: number) => {
    if (lst < 28) return "#313695";
    if (lst < 30) return "#4575B4";
    if (lst < 32) return "#74ADD1";
    if (lst < 34) return "#ABD9E9";
    if (lst < 36) return "#E0F3F8";
    if (lst < 38) return "#FEE090";
    if (lst < 40) return "#FDAE61";
    if (lst < 42) return "#F46D43";
    if (lst < 44) return "#D73027";
    return "#A50026";
  };

  // NDVI to Color Mapper
  const getNDVIColor = (ndvi: number) => {
    if (ndvi < 0.05) return "#d4a574";
    if (ndvi < 0.15) return "#e8d5a0";
    if (ndvi < 0.25) return "#c8e6a0";
    if (ndvi < 0.35) return "#90d468";
    if (ndvi < 0.50) return "#52b845";
    return "#1a8c20";
  };

  // Render & Sync Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dataLoaded || !geojsonData) return;

    // Detect data changes (changing cities) and clean up old layers
    const hasDataChanged =
      lastRenderedGeojsonRef.current !== geojsonData ||
      lastRenderedZonesRef.current !== zonesGeojsonData;

    if (hasDataChanged) {
      console.log("[MapComponent] Data changed. Clearing old layers...");
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      if (ndviLayerRef.current) {
        map.removeLayer(ndviLayerRef.current);
        ndviLayerRef.current = null;
      }
      if (buildingsLayerRef.current) {
        map.removeLayer(buildingsLayerRef.current);
        buildingsLayerRef.current = null;
      }
      if (zonesLayerRef.current) {
        map.removeLayer(zonesLayerRef.current);
        zonesLayerRef.current = null;
      }
      if (selectedCellLayerRef.current) {
        selectedCellLayerRef.current = null;
      }
      lastRenderedGeojsonRef.current = geojsonData;
      lastRenderedZonesRef.current = zonesGeojsonData;
    }

    const opVal = opacity / 100;

    // 1. Heat Stress Layer
    if (!heatLayerRef.current) {
      console.log("[MapComponent] Rendering Heat Layer...");
      heatLayerRef.current = L.geoJSON(geojsonData, {
        style: (feature) => {
          const props = feature?.properties;
          return {
            fillColor: getLSTColor(props?.lst || 0),
            fillOpacity: opVal,
            color: "rgba(255,255,255,0.3)",
            weight: 0.5,
          };
        },
        onEachFeature: (feature, layer: L.Path) => {
          const props = feature.properties;
          const gridId = props.cell_id || "N/A";
          const temp = (props.predicted_lst !== undefined ? props.predicted_lst : props.lst).toFixed(1);
          
          let score = 5.0;
          const lstVal = props.predicted_lst !== undefined ? props.predicted_lst : props.lst || 35;
          score = Math.max(1, Math.min(10, ((lstVal - 25) / 20) * 9 + 1));
          const heatRisk = `${score.toFixed(1)}/10`;

          const ndviVal = props.ndvi !== undefined ? props.ndvi : 0.0;
          const ndvi = `${ndviVal.toFixed(3)}`;
          const ndbiVal = Math.max(-1.0, Math.min(1.0, (props.building_density || 0) / 125.0 - 1.0));
          const ndbi = `${ndbiVal.toFixed(2)}`;

          const albedo = props.albedo !== undefined ? props.albedo.toFixed(3) : "N/A";
          const svf = props.svf !== undefined ? props.svf.toFixed(3) : "N/A";
          const airTemp = props.air_temp !== undefined ? `${props.air_temp.toFixed(1)}°C` : "N/A";
          const humidity = props.humidity !== undefined ? `${props.humidity.toFixed(1)}%` : "N/A";
          const windSpeed = props.wind_speed !== undefined ? `${props.wind_speed.toFixed(1)} m/s` : "N/A";
          const popDensity = "Not Available";
          const bldgDensity = props.building_density !== undefined ? `${props.building_density.toFixed(1)}%` : "0.0%";
          const bldgHeight = props.building_height !== undefined ? `${props.building_height.toFixed(1)}m` : "N/A";
          const lulcClass = props.lulc_class || "N/A";

          let intervention = props.recommended_intervention;
          if (!intervention) {
            const cls = (props.hsi_class || "").toLowerCase();
            if (cls.includes("extreme") || cls.includes("hot") || cls.includes("warm")) {
              intervention = "Cool Roofs & Urban Greening";
            } else if (cls.includes("mild")) {
              intervention = "Green Roofs & Reflective Pavements";
            } else {
              intervention = "None Required (Stable Zone)";
            }
          }

          const coolingPotentialVal = (0.5 + (props.building_density || 0) * 0.01 + (1 - (props.ndvi || 0)) * 0.5);
          const estCooling = `-${coolingPotentialVal.toFixed(1)}°C`;

          const driversHTML = (props.top_drivers || []).map((d: any) => {
              const featName = d.feature.replace(/_/g, " ");
              const sign = d.shap_value > 0 ? "+" : "";
              const colorClass = d.direction === "heating" ? "heating" : "cooling";
              return `<div class="heat-tooltip-driver">` +
                  `<span class="heat-tooltip-driver-name">${featName}</span>` +
                  `<span class="heat-tooltip-driver-val ${colorClass}">${sign}${d.shap_value.toFixed(2)}°C</span>` +
              `</div>`;
          }).join("");

          layer.bindTooltip(
            `<div class="heat-tooltip-header">` +
              `<span>${props.zone_name || "Zone"}</span>` +
              `<span class="heat-tooltip-hsi" style="background-color: ${props.hsi_color || '#ccc'}; color: #fff;">${props.hsi_class}</span>` +
            `</div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Grid ID:</span><span class="heat-tooltip-value">${gridId}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Predicted LST:</span><span class="heat-tooltip-value" style="color: #fca5a5;">${temp}°C</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Heat Risk Score:</span><span class="heat-tooltip-value">${heatRisk}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">NDVI (Vegetation):</span><span class="heat-tooltip-value">${ndvi}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">NDBI (Built-up):</span><span class="heat-tooltip-value">${ndbi}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Albedo / SVF:</span><span class="heat-tooltip-value">${albedo} / ${svf}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Air Temp / Humidity:</span><span class="heat-tooltip-value">${airTemp} / ${humidity}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Wind Speed:</span><span class="heat-tooltip-value">${windSpeed}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Building Density:</span><span class="heat-tooltip-value">${bldgDensity}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Building Height:</span><span class="heat-tooltip-value">${bldgHeight}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Pop. Density / LULC:</span><span class="heat-tooltip-value">${popDensity} / ${lulcClass}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">AI Intervention:</span><span class="heat-tooltip-value" style="color: #60a5fa; font-size: 10px; text-align: right;">${intervention}</span></div>` +
            `<div class="heat-tooltip-row"><span class="heat-tooltip-label">Cooling Potential:</span><span class="heat-tooltip-value" style="color: #34d399;">${estCooling}</span></div>` +
            `<div class="heat-tooltip-driver-title">Key Heat Drivers (SHAP)</div>` +
            (driversHTML || `<div style="font-size: 10px; color: #9ca3af;">No drivers available</div>`),
            { sticky: true, className: "heat-tooltip", direction: "auto", opacity: 0.95 }
          );

          layer.on("click", async (e: L.LeafletMouseEvent) => {
            if (e && e.originalEvent) {
              e.originalEvent.stopPropagation();
            }

            // Highlight selected cell
            if (selectedCellLayerRef.current) {
              heatLayerRef.current?.resetStyle(selectedCellLayerRef.current);
            }
            selectedCellLayerRef.current = layer;
            layer.setStyle({
              weight: 3,
              color: "#1A3557",
              fillOpacity: 0.95,
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
              layer.bringToFront();
            }

            // Set cell details in context
            setSelectedCell(props);
            setIsPanelOpen(true);

            // Fetch SHAP drivers
            try {
              const driverRes = await fetch(`/api/drivers/${props.cell_id}`);
              const driverData = await driverRes.json();
              setDriverData(driverData);
            } catch (err) {
              console.error("Failed to load driver analysis:", err);
            }
          });

          layer.on("mouseover", () => {
            if (selectedCellLayerRef.current !== layer) {
              layer.setStyle({
                weight: 2,
                color: "#fff",
                fillOpacity: Math.min(opVal + 0.15, 1),
              });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                layer.bringToFront();
              }
            }
          });

          layer.on("mouseout", () => {
            if (selectedCellLayerRef.current !== layer) {
              heatLayerRef.current?.resetStyle(layer);
            }
          });
        },
      });

      // Fit map to bounds on first render
      const bounds = heatLayerRef.current.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }

    // Toggle Heat Stress Map
    if (activeLayers.heat) {
      if (!map.hasLayer(heatLayerRef.current)) {
        map.addLayer(heatLayerRef.current);
      }
      heatLayerRef.current.eachLayer((layer: any) => {
        if (layer !== selectedCellLayerRef.current) {
          layer.setStyle({ fillOpacity: opVal });
        }
      });
    } else {
      if (map.hasLayer(heatLayerRef.current)) {
        map.removeLayer(heatLayerRef.current);
      }
    }

    // 2. NDVI Layer
    if (!ndviLayerRef.current) {
      console.log("[MapComponent] Rendering NDVI Layer...");
      ndviLayerRef.current = L.geoJSON(geojsonData, {
        style: (feature) => ({
          fillColor: getNDVIColor(feature?.properties?.ndvi || 0),
          fillOpacity: opVal * 0.7,
          color: "rgba(255,255,255,0.2)",
          weight: 0.5,
        }),
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(`NDVI: <strong>${(feature?.properties?.ndvi || 0).toFixed(2)}</strong>`, {
            sticky: true,
          });
        },
      });
    }

    // Toggle NDVI
    if (activeLayers.ndvi) {
      if (!map.hasLayer(ndviLayerRef.current)) {
        map.addLayer(ndviLayerRef.current);
      }
      ndviLayerRef.current.eachLayer((layer: any) => {
        layer.setStyle({ fillOpacity: opVal * 0.7 });
      });
    } else {
      if (map.hasLayer(ndviLayerRef.current)) {
        map.removeLayer(ndviLayerRef.current);
      }
    }

    // 3. Buildings Layer
    if (!buildingsLayerRef.current) {
      console.log("[MapComponent] Rendering Buildings Layer...");
      buildingsLayerRef.current = L.geoJSON(geojsonData, {
        filter: (feature) => feature?.properties?.lulc_class === "built_up",
        style: (feature) => {
          const density = feature?.properties?.building_density || 0;
          const intensity = Math.min(density / 200, 1);
          return {
            fillColor: `rgba(100, 100, 120, ${0.3 + intensity * 0.5})`,
            fillOpacity: opVal * 0.6,
            color: "rgba(80, 80, 100, 0.3)",
            weight: 0.5,
          };
        },
      });
    }

    // Toggle Buildings
    if (activeLayers.buildings) {
      if (!map.hasLayer(buildingsLayerRef.current)) {
        map.addLayer(buildingsLayerRef.current);
      }
      buildingsLayerRef.current.eachLayer((layer: any) => {
        layer.setStyle({ fillOpacity: opVal * 0.6 });
      });
    } else {
      if (map.hasLayer(buildingsLayerRef.current)) {
        map.removeLayer(buildingsLayerRef.current);
      }
    }

    // 4. City Zones Boundary Layer (voronoi wards)
    if (!zonesLayerRef.current && zonesGeojsonData) {
      console.log("[MapComponent] Rendering Wards Boundary Layer...");
      zonesLayerRef.current = L.geoJSON(zonesGeojsonData, {
        interactive: false,
        style: () => ({
          fillColor: "transparent",
          fillOpacity: 0,
          color: "#F39C12",
          weight: 2,
          dashArray: "5, 5",
        }),
      }).addTo(map); // Wards bounding overlay displayed by default on map load
    }
  }, [dataLoaded, geojsonData, zonesGeojsonData, activeLayers, opacity]);

  return <div ref={mapContainerRef} id="map" style={{ width: "100%", height: "100%" }}></div>;
}
