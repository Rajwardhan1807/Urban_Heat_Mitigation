/**
 * Main Application Module — Orchestrates data loading, map rendering,
 * panel interactions, and layer toggling.
 */

const App = (() => {
    const API_BASE = '/api';
    let heatmapData = null;
    let statsData = null;
    let scenariosData = null;

    /**
     * Fetch JSON from API.
     */
    async function fetchAPI(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, options);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error(`Failed to fetch ${endpoint}:`, err);
            return null;
        }
    }

    /**
     * Initialize the dashboard.
     */
    async function init() {
        console.log('[App.init] Urban Heat Mitigation Dashboard — Initializing...');

        // Initialize map
        const map = MapModule.init();
        setupSearch();

        const savedCity = localStorage.getItem('selectedCityName');
        const cityBadge = document.getElementById('stat-city');
        if (savedCity && cityBadge) {
            console.log(`[App.init] Restored city badge text from localStorage: '${savedCity}'`);
            cityBadge.textContent = savedCity;
        }

        // Setup interactive map click selection
        if (map) {
            console.log('[App.init] Registering map click geocoder listener...');
            map.on('click', async (e) => {
                const { lat, lng } = e.latlng;
                console.log(`[App.init] Map click detected at coordinate: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                await searchLocation(`${lat}, ${lng}`);
            });
        }

        // Load data in parallel
        console.log('[App.init] Fetching datasets from API...');
        const [heatmapData, stats, zones, zonesData, globalDrivers] = await Promise.all([
            fetchAPI('/heatmap'),
            fetchAPI('/stats'),
            fetchAPI('/heatmap/zones'),
            fetchAPI('/zones'),
            fetchAPI('/drivers/global')
        ]);
        
        // Log datasets details
        console.log('[App.init] Heatmap data received:', heatmapData);
        console.log('[App.init] Stats data received:', stats);
        console.log('[App.init] Zones data received:', zonesData);

        if (heatmapData) {
            console.log(`[App.init] Heat Stress Map Feature count: ${heatmapData.features ? heatmapData.features.length : 0}`);
            console.log(`[App.init] Heat Stress Map GeoJSON character size: ${JSON.stringify(heatmapData).length}`);
        }
        if (zonesData) {
            console.log(`[App.init] City Zones Layer Feature count: ${zonesData.features ? zonesData.features.length : 0}`);
            console.log(`[App.init] City Zones GeoJSON character size: ${JSON.stringify(zonesData).length}`);
        }
        
        statsData = stats;

        if (stats && stats.city) {
            console.log(`[App.init] Syncing city badge with actual backend city name: '${stats.city}'`);
            if (cityBadge) {
                cityBadge.textContent = stats.city;
            }
            localStorage.setItem('selectedCityName', stats.city);
        }

        if (!heatmapData || !heatmapData.features || heatmapData.features.length === 0) {
            hideLoading();
            showError('No data loaded. Please run: python scripts/generate_and_train.py');
            return;
        }

        // Render heat map
        MapModule.renderHeatLayer(heatmapData, onCellClick);

        // Prepare auxiliary layers (not shown by default)
        MapModule.renderNDVILayer(heatmapData);
        MapModule.renderZonesLayer(zonesData);
        MapModule.renderBuildingsLayer(heatmapData);

        // Fit map to data bounds
        MapModule.fitToBounds();

        // Update stats cards
        if (stats) {
            updateStatsCards(stats);
            updateModelMetrics(stats.model_metrics);
        }

        // Update zone rankings
        if (zones && zones.zones) {
            renderZoneRankings(zones.zones);
        }

        // Setup event listeners
        setupLayerToggles();
        setupOpacitySlider();
        setupPanelClose();

        // Hide loading overlay
        hideLoading();

        console.log(' [App.init] Dashboard ready!');
    }

    /**
     * Handle cell click — open detail panel.
     */
    async function onCellClick(cellProps) {
        const dashboard = document.getElementById('dashboard');
        dashboard.classList.add('panel-open');

        const panel = document.getElementById('panel-body');
        const panelTitle = document.getElementById('panel-title');

        panelTitle.textContent = cellProps.zone_name || 'Cell Details';

        // Show loading in panel
        panel.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div><p>Loading driver analysis...</p></div>';

        // Fetch detailed driver attribution
        const driversData = await fetchAPI(`/drivers/${cellProps.cell_id}`);

        // Build panel content
        panel.innerHTML = buildPanelContent(cellProps, driversData);

        // Render driver chart
        if (driversData && driversData.top_drivers) {
            setTimeout(() => {
                ChartsModule.createDriverChart('driver-chart', driversData.all_drivers || driversData.top_drivers);
            }, 100);
        }
    }

    /**
     * Build the HTML for the detail panel.
     */
    function buildPanelContent(props, drivers) {
        const hsiBadgeClass = getHSIBadgeClass(props.hsi_class);

        const topDriversHTML = (drivers && drivers.top_drivers)
            ? drivers.top_drivers.slice(0, 3).map(d => `
                <div class="popup-driver">
                    <span class="popup-driver-name">${d.label || d.feature}</span>
                    <span class="popup-driver-value ${d.direction}">
                        ${d.shap_value > 0 ? '+' : ''}${d.shap_value.toFixed(2)}°C
                    </span>
                </div>
            `).join('')
            : '<p style="color: #999; font-size: 12px;">No driver data available</p>';

        return `
            <!-- HSI Classification -->
            <div class="panel-section animate-in">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span class="hsi-badge ${hsiBadgeClass}">${props.hsi_class}</span>
                    <span style="font-size: 28px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: ${getLSTTextColor(props.lst)};">
                        ${props.lst}°C
                    </span>
                </div>
            </div>

            <!-- Properties Grid -->
            <div class="panel-section animate-in" style="animation-delay: 0.1s;">
                <div class="panel-section-title">Cell Properties</div>
                <div class="prop-grid">
                    <div class="prop-item">
                        <div class="prop-label">NDVI</div>
                        <div class="prop-value" style="color: #27ae60;">${(props.ndvi || 0).toFixed(3)}</div>
                    </div>
                    <div class="prop-item">
                        <div class="prop-label">Albedo</div>
                        <div class="prop-value">${(props.albedo || 0).toFixed(3)}</div>
                    </div>
                    <div class="prop-item">
                        <div class="prop-label">Bldg Density</div>
                        <div class="prop-value">${(props.building_density || 0).toFixed(0)}/km²</div>
                    </div>
                    <div class="prop-item">
                        <div class="prop-label">Wind Speed</div>
                        <div class="prop-value">${(props.wind_speed || 0).toFixed(1)} m/s</div>
                    </div>
                    <div class="prop-item">
                        <div class="prop-label">Land Use</div>
                        <div class="prop-value" style="font-size: 13px; text-transform: capitalize;">${(props.lulc_class || '—').replace('_', ' ')}</div>
                    </div>
                    <div class="prop-item">
                        <div class="prop-label">Sky View</div>
                        <div class="prop-value">${(props.svf || 0).toFixed(2)}</div>
                    </div>
                    <div class="prop-item" style="grid-column: span 2;">
                        <div class="prop-label">Grid Cell Size</div>
                        <div class="prop-value" style="font-family: 'JetBrains Mono', monospace; font-size: 13px;">250m × 250m</div>
                    </div>
                    <div class="prop-item" style="grid-column: span 2;">
                        <div class="prop-label">Cell Area</div>
                        <div class="prop-value" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.4;">62,500 m² | 6.25 ha | 0.0625 km²</div>
                    </div>
                </div>
            </div>

            <!-- Top Drivers -->
            <div class="panel-section animate-in" style="animation-delay: 0.15s;">
                <div class="panel-section-title">Top Heat Drivers (SHAP)</div>
                ${topDriversHTML}
            </div>

            <!-- Driver Chart -->
            <div class="panel-section animate-in" style="animation-delay: 0.2s;">
                <div class="panel-section-title">Driver Attribution Chart</div>
                <div class="driver-chart-container">
                    <canvas id="driver-chart"></canvas>
                </div>
            </div>

            <!-- Actions -->
            <div class="panel-section animate-in" style="animation-delay: 0.25s;">
                <a href="/scenarios.html" class="btn btn-teal btn-block" style="text-align: center; color: white;">
                    Simulate Cooling Interventions
                </a>
                <div style="margin-top: 8px;">
                    <button class="btn btn-secondary btn-block btn-sm" onclick="App.exportCellData('${props.cell_id}')">
                        Export Cell Data
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Export cell data as JSON download.
     */
    function exportCellData(cellId) {
        if (!heatmapData) return;

        const cell = heatmapData.features.find(f => f.properties.cell_id === cellId);
        if (!cell) return;

        const blob = new Blob([JSON.stringify(cell, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cellId}_data.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Update the stat cards on the map.
     */
    function updateStatsCards(stats) {
        setText('stat-avg-lst', `${stats.avg_lst}°C`);
        setText('stat-max-lst', `${stats.max_lst}°C`);
        setText('stat-hotspots', stats.hotspot_cells);
        setText('stat-total', stats.total_cells);

        // Compute total area details (each cell is 250m x 250m = 62,500 m^2 = 6.25 hectares = 0.0625 km^2)
        const totalCells = stats.total_cells || 0;
        const totalAreaKm2 = (totalCells * 0.0625).toFixed(2);
        const totalAreaHa = (totalCells * 6.25).toFixed(1);
        const totalAreaM2 = (totalCells * 62500).toLocaleString();

        setText('stat-total-area', `${totalAreaKm2} km² (${totalAreaHa} ha)`);

        // Set title attribute tooltip to show square meters as well
        const areaBadge = document.getElementById('stat-total-area');
        if (areaBadge) {
            areaBadge.title = `Estimated Region Area: ${totalAreaM2} m²`;
        }
    }

    /**
     * Update model metrics in bottom bar.
     */
    function updateModelMetrics(metrics) {
        if (!metrics) return;
        setText('model-metrics', `R² = ${metrics.r2} | RMSE = ${metrics.rmse}°C`);
    }

    /**
     * Render zone rankings in sidebar.
     */
    function renderZoneRankings(zones) {
        const container = document.getElementById('zone-stats-list');
        if (!container) return;

        // Sort by avg LST descending (hottest first)
        zones.sort((a, b) => b.avg_lst - a.avg_lst);

        container.innerHTML = zones.slice(0, 12).map(zone => `
            <div class="zone-stat" onclick="App.filterByZone('${zone.zone_name}')">
                <div>
                    <span class="zone-name">${zone.zone_name}</span>
                    ${zone.hotspot_count > 0 ? '<span style="color: #A50026; font-size: 10px; margin-left: 4px;">(Hotspot)</span>' : ''}
                </div>
                <span class="zone-temp" style="color: ${getLSTTextColor(zone.avg_lst)}">
                    ${zone.avg_lst}°C
                </span>
            </div>
        `).join('');
    }

    /**
     * Filter map by zone (placeholder - just zooms to area).
     */
    function filterByZone(zoneName) {
        console.log(`Filtering by zone: ${zoneName}`);
        // Future: filter features and zoom to zone bounds
    }

    /**
     * Setup layer toggle event listeners.
     */
    function setupLayerToggles() {
        const layers = {
            'layer-heat': { get: () => MapModule.getHeatLayer() },
            'layer-ndvi': { get: () => MapModule.getNDVILayer() },
            'layer-buildings': { get: () => MapModule.getBuildingsLayer() },
        };

        for (const [id, layer] of Object.entries(layers)) {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    MapModule.toggleLayer(layer.get(), e.target.checked);
                });
            }
        }
    }

    /**
     * Setup opacity slider.
     */
    function setupOpacitySlider() {
        const slider = document.getElementById('opacity-slider');
        const label = document.getElementById('opacity-value');

        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                label.textContent = `${val}%`;
                MapModule.setOpacity(val / 100);
            });
        }
    }

    /**
     * Setup panel close button.
     */
    function setupPanelClose() {
        const closeBtn = document.getElementById('panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('dashboard').classList.remove('panel-open');
            });
        }
    }

    /**
     * Helper: Set text content of an element.
     */
    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    /**
     * Get HSI badge CSS class.
     */
    function getHSIBadgeClass(hsiClass) {
        const map = {
            'Cool Zone': 'cool',
            'Mild Zone': 'mild',
            'Warm Zone': 'warm',
            'Hot Zone': 'hot',
            'Extreme Heat Hotspot': 'extreme',
        };
        return map[hsiClass] || 'warm';
    }

    /**
     * Get text color based on LST value.
     */
    function getLSTTextColor(lst) {
        if (lst < 30) return '#4575B4';
        if (lst < 35) return '#1B7A78';
        if (lst < 40) return '#C0550C';
        if (lst < 45) return '#D73027';
        return '#A50026';
    }

    /**
     * Hide loading overlay.
     */
    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.style.display = 'none', 500);
        }
    }

    /**
     * Show error message.
     */
    function showError(msg) {
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.innerHTML = `
                <div class="empty-state" style="padding-top: 200px;">
                    <div class="empty-state-icon"></div>
                    <p>${msg}</p>
                </div>
            `;
        }
    }

    let statusInterval = null;

    function setupSearch() {
        const searchInput = document.getElementById('location-search');
        if (!searchInput) return;

        searchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    console.log(`[setupSearch] Search triggered via Enter. Query: '${query}'`);
                    await searchLocation(query);
                }
            }
        });

        // Search icon click listener
        const searchIcon = document.querySelector('.search-container [data-lucide="search"]') || document.querySelector('.search-container i');
        if (searchIcon) {
            searchIcon.style.cursor = 'pointer';
            searchIcon.addEventListener('click', async () => {
                const query = searchInput.value.trim();
                if (query) {
                    console.log(`[setupSearch] Search triggered via click. Query: '${query}'`);
                    await searchLocation(query);
                }
            });
            console.log("[setupSearch] Registered click event on search icon.");
        }
    }

    async function searchLocation(query) {
        console.log(`[searchLocation] Initiating location geocode search for: '${query}'`);
        document.getElementById('loading-overlay').style.display = 'flex';
        const loadText = document.querySelector('.loading-text');
        if (loadText) loadText.textContent = 'Searching location...';
        
        const location = await fetchAPI(`/locations/search?q=${encodeURIComponent(query)}`);
        console.log("[searchLocation] Geocoding API response received:", location);
        
        if (location && location.bbox) {
            if (loadText) loadText.textContent = 'Starting pipeline...';
            
            // Instant city badge update to reflect selection
            const cityBadge = document.getElementById('stat-city');
            if (cityBadge) {
                cityBadge.textContent = location.name;
            }
            localStorage.setItem('selectedCityName', location.name);
            console.log(`[searchLocation] Instant city badge update: '${location.name}'`);

            // Trigger backend pipeline
            console.log("[searchLocation] Triggering backend location select pipeline...");
            const response = await fetchAPI('/locations/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: location.name,
                    lat: location.lat,
                    lon: location.lon,
                    bbox: location.bbox
                })
            });
            console.log("[searchLocation] Backend selection trigger response:", response);

            if (response && response.status === 'running') {
                monitorPipeline();
            } else {
                document.getElementById('loading-overlay').style.display = 'none';
                alert("Failed to start pipeline.");
            }
        } else {
            document.getElementById('loading-overlay').style.display = 'none';
            alert("Location not found.");
        }
    }

    function monitorPipeline() {
        const msgEl = document.querySelector('.loading-text');

        if (statusInterval) clearInterval(statusInterval);

        statusInterval = setInterval(async () => {
            const status = await fetchAPI('/locations/status');
            console.log("[monitorPipeline] Polled status:", status);
            if (status) {
                if (msgEl) msgEl.textContent = status.message + ` (${status.progress}%)`;

                if (status.status === 'complete' || status.status === 'error') {
                    clearInterval(statusInterval);
                    setTimeout(() => {
                        if (status.status === 'complete') {
                            console.log("[monitorPipeline] Pipeline finished successfully. Triggering page refresh.");
                            window.location.reload(); // Reload UI to fetch new data
                        } else {
                            alert("Pipeline Error: " + status.message);
                            document.getElementById('loading-overlay').style.display = 'none';
                        }
                    }, 1000);
                }
            }
        }, 2000);
    }

    // Public API
    return {
        init,
        exportCellData,
        filterByZone,
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
