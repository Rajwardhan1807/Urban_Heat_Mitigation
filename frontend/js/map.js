/**
 * Map Module — Leaflet.js map initialization and heat layer rendering.
 * Handles grid cell rendering, click interactions, and layer management.
 */

const MapModule = (() => {
    let map = null;
    let heatLayer = null;
    let ndviLayer = null;
    let buildingsLayer = null;
    let zonesLayer = null;
    let selectedCellLayer = null;
    let layerOpacity = 0.8;

    // HSI color mapping (from PRD thermal diverging scale)
    const HSI_COLORS = {
        'Cool Zone': '#4575B4',
        'Mild Zone': '#ABD9E9',
        'Warm Zone': '#FEE090',
        'Hot Zone': '#F46D43',
        'Extreme Heat Hotspot': '#A50026',
    };

    /**
     * Get color from continuous LST value using thermal diverging scale.
     */
    function getLSTColor(lst) {
        if (lst < 28) return '#313695';
        if (lst < 30) return '#4575B4';
        if (lst < 32) return '#74ADD1';
        if (lst < 34) return '#ABD9E9';
        if (lst < 36) return '#E0F3F8';
        if (lst < 38) return '#FEE090';
        if (lst < 40) return '#FDAE61';
        if (lst < 42) return '#F46D43';
        if (lst < 44) return '#D73027';
        return '#A50026';
    }

    /**
     * Get color for NDVI visualization.
     */
    function getNDVIColor(ndvi) {
        if (ndvi < 0.05) return '#d4a574';
        if (ndvi < 0.15) return '#e8d5a0';
        if (ndvi < 0.25) return '#c8e6a0';
        if (ndvi < 0.35) return '#90d468';
        if (ndvi < 0.50) return '#52b845';
        return '#1a8c20';
    }

    /**
     * Initialize the Leaflet map.
     */
    function init() {
        const mapEl = document.getElementById('map');
        if (!mapEl) {
            console.log("[MapModule.init] No map container found. Skipping Leaflet initialization.");
            return null;
        }

        // Pune center coordinates
        map = L.map('map', {
            center: [18.515, 73.855],
            zoom: 13,
            zoomControl: false,
            attributionControl: true,
        });

        // Add zoom control to bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // CartoDB Positron base map (clean, light style)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(map);

        // Add professional GIS map scale bar to the bottom-left corner
        L.control.scale({
            metric: true,
            imperial: false,
            position: 'bottomleft'
        }).addTo(map);

        return map;
    }

    /**
     * Render heat stress grid cells on the map.
     */
    function renderHeatLayer(geojsonData, onCellClick) {
        if (!map) return null;
        if (heatLayer) {
            map.removeLayer(heatLayer);
        }

        console.log(`[MapModule.renderHeatLayer] Rendering Heat Stress layer. Feature count: ${geojsonData ? (geojsonData.features ? geojsonData.features.length : 0) : 0}`);
        heatLayer = L.geoJSON(geojsonData, {
            style: (feature) => {
                const props = feature.properties;
                return {
                    fillColor: getLSTColor(props.lst),
                    fillOpacity: layerOpacity,
                    color: 'rgba(255,255,255,0.3)',
                    weight: 0.5,
                };
            },
            onEachFeature: (feature, layer) => {
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

                const driversHTML = (props.top_drivers || []).map((d) => {
                    const featName = d.feature.replace(/_/g, " ");
                    const sign = d.shap_value > 0 ? "+" : "";
                    const colorClass = d.direction === "heating" ? "heating" : "cooling";
                    return `<div class="heat-tooltip-driver">` +
                        `<span class="heat-tooltip-driver-name">${featName}</span>` +
                        `<span class="heat-tooltip-driver-val ${colorClass}">${sign}${d.shap_value.toFixed(2)}°C</span>` +
                    `</div>`;
                }).join("");

                // Hover tooltip
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

                // Click handler
                layer.on('click', (e) => {
                    if (e && e.originalEvent) {
                        e.originalEvent.stopPropagation();
                    }
                    highlightCell(layer);
                    if (onCellClick) onCellClick(props);
                });

                // Hover effects
                layer.on('mouseover', () => {
                    layer.setStyle({
                        weight: 2,
                        color: '#fff',
                        fillOpacity: Math.min(layerOpacity + 0.15, 1),
                    });
                    layer.bringToFront();
                });

                layer.on('mouseout', () => {
                    if (selectedCellLayer !== layer) {
                        heatLayer.resetStyle(layer);
                    }
                });
            }
        }).addTo(map);
        console.log("[MapModule.renderHeatLayer] Heat Layer render status: SUCCESS");

        return heatLayer;
    }

    /**
     * Render NDVI (vegetation) layer.
     */
    function renderNDVILayer(geojsonData) {
        if (!map) return null;
        if (ndviLayer) map.removeLayer(ndviLayer);

        ndviLayer = L.geoJSON(geojsonData, {
            style: (feature) => ({
                fillColor: getNDVIColor(feature.properties.ndvi),
                fillOpacity: layerOpacity * 0.7,
                color: 'rgba(255,255,255,0.2)',
                weight: 0.5,
            }),
            onEachFeature: (feature, layer) => {
                layer.bindTooltip(
                    `NDVI: <strong>${feature.properties.ndvi.toFixed(2)}</strong>`,
                    { sticky: true }
                );
            }
        });

        return ndviLayer;
    }

    /**


    /**
     * Render city zones using Voronoi polygons.
     */
    function renderZonesLayer(geojsonData) {
        if (!map) return null;
        if (zonesLayer) map.removeLayer(zonesLayer);

        console.log(`[MapModule.renderZonesLayer] Rendering city zones layer. Feature count: ${geojsonData ? (geojsonData.features ? geojsonData.features.length : 0) : 0}`);
        zonesLayer = L.geoJSON(geojsonData, {
            interactive: false,
            style: () => ({
                fillColor: 'transparent',
                fillOpacity: 0,
                color: '#F39C12',
                weight: 2,
                dashArray: '5, 5'
            })
        }).addTo(map);
        console.log("[MapModule.renderZonesLayer] Zones Layer render status: SUCCESS (added to map)");

        return zonesLayer;
    }

    /**
     * Render buildings layer (built-up areas).
     */
    function renderBuildingsLayer(geojsonData) {
        if (!map) return null;
        if (buildingsLayer) map.removeLayer(buildingsLayer);

        buildingsLayer = L.geoJSON(geojsonData, {
            filter: (feature) => feature.properties.lulc_class === 'built_up',
            style: (feature) => {
                const density = feature.properties.building_density || 0;
                const intensity = Math.min(density / 200, 1);
                return {
                    fillColor: `rgba(100, 100, 120, ${0.3 + intensity * 0.5})`,
                    fillOpacity: layerOpacity * 0.6,
                    color: 'rgba(80, 80, 100, 0.3)',
                    weight: 0.5,
                };
            },
        });

        return buildingsLayer;
    }

    /**
     * Render a scenario overlay (delta T visualization).
     */
    function renderScenarioOverlay(geojsonData, scenarioName) {
        const scenarioLayer = L.geoJSON(geojsonData, {
            style: (feature) => {
                const deltaT = feature.properties.delta_t || 0;
                const applied = feature.properties.intervention_applied;

                if (!applied) {
                    return {
                        fillColor: '#ccc',
                        fillOpacity: 0.1,
                        color: 'transparent',
                        weight: 0,
                    };
                }

                // Green = cooling, intensity proportional to delta
                const intensity = Math.min(Math.abs(deltaT) / 5, 1);
                return {
                    fillColor: deltaT < 0 ? '#1B7A78' : '#D73027',
                    fillOpacity: 0.3 + intensity * 0.5,
                    color: deltaT < 0 ? '#1B7A78' : '#D73027',
                    weight: 1,
                };
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                if (props.intervention_applied) {
                    layer.bindTooltip(
                        `<strong>ΔT: ${props.delta_t > 0 ? '+' : ''}${props.delta_t}°C</strong><br>` +
                        `${props.baseline_lst}°C → ${props.predicted_lst}°C`,
                        { sticky: true }
                    );
                }
            }
        }).addTo(map);

        return scenarioLayer;
    }

    /**
     * Highlight a selected cell.
     */
    function highlightCell(layer) {
        // Reset previous selection
        if (selectedCellLayer) {
            heatLayer.resetStyle(selectedCellLayer);
        }

        selectedCellLayer = layer;
        layer.setStyle({
            weight: 3,
            color: '#1A3557',
            fillOpacity: 0.95,
        });
        layer.bringToFront();
    }

    /**
     * Toggle a layer on/off.
     */
    function toggleLayer(layerObj, show) {
        if (!layerObj) return;
        if (show) {
            layerObj.addTo(map);
        } else {
            map.removeLayer(layerObj);
        }
    }

    /**
     * Set opacity for all layers.
     */
    function setOpacity(value) {
        layerOpacity = value;
        if (heatLayer) {
            heatLayer.eachLayer(layer => {
                const style = layer.options;
                layer.setStyle({ fillOpacity: value });
            });
        }
    }

    /**
     * Fit map bounds to data.
     */
    function fitToBounds() {
        if (heatLayer) {
            map.fitBounds(heatLayer.getBounds(), { padding: [20, 20] });
        }
    }

    // Public API
    return {
        init,
        renderHeatLayer,
        renderNDVILayer,
        renderZonesLayer,
        renderBuildingsLayer,
        renderScenarioOverlay,
        getLayers: () => ({ heatLayer, ndviLayer, zonesLayer, buildingsLayer }),
        toggleLayer,
        setOpacity,
        fitToBounds,
        getMap: () => map,
        getHeatLayer: () => heatLayer,
        getNDVILayer: () => ndviLayer,
        getZonesLayer: () => zonesLayer,
        getBuildingsLayer: () => buildingsLayer,
    };
})();
