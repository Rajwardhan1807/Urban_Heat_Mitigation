/**
 * Layout Module — Defines the <dashboard-layout> Custom Element.
 * Provides a unified dashboard structure (Navbar, Sidebar, Content, Bottombar)
 * across all pages to completely eliminate layout shifts.
 */

class DashboardLayout extends HTMLElement {
    constructor() {
        super();
        this.rendered = false;
        // Keep a copy of the original inner HTML (page-specific content)
        this.pageContentHTML = this.innerHTML;
    }

    connectedCallback() {
        // Run rendering immediately or on DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.render());
        } else {
            this.render();
        }
    }

    render() {
        if (this.rendered) return;
        this.rendered = true;

        const activeTab = this.getAttribute('active-tab') || 'dashboard';
        const savedCity = localStorage.getItem('selectedCityName') || 'Pune, Maharashtra';

        this.innerHTML = `
            <div class="loading-overlay hidden" id="loading-overlay" style="display: none;">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading urban heat data...</div>
            </div>
            <div class="dashboard" id="dashboard">
                <!-- ========== NAVIGATION BAR ========== -->
                <nav class="navbar">
                    <div class="navbar-brand">
                        <i data-lucide="thermometer-sun" style="width: 24px; height: 24px; color: #FFA07A; margin-right: 8px;"></i>
                        <div>
                            <h1>Urban Heat Mitigation</h1>
                            <span class="subtitle">AI-Powered Geospatial Dashboard</span>
                        </div>
                    </div>

                    <div class="navbar-nav">
                        <a class="nav-link ${activeTab === 'dashboard' ? 'active' : ''}" href="/" id="nav-dashboard">
                            <i data-lucide="map" style="width: 16px; height: 16px;"></i> Dashboard
                        </a>
                        <a class="nav-link ${activeTab === 'scenarios' ? 'active' : ''}" href="/scenarios.html" id="nav-scenarios">
                            <i data-lucide="trees" style="width: 16px; height: 16px;"></i> Scenarios
                        </a>
                        <a class="nav-link ${activeTab === 'analysis' ? 'active' : ''}" href="/analysis.html" id="nav-analysis">
                            <i data-lucide="bar-chart-2" style="width: 16px; height: 16px;"></i> Analysis
                        </a>
                    </div>

                    <div class="navbar-actions" style="display: flex; gap: 16px; align-items: center;">
                        <div class="search-container" style="display: flex; align-items: center; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px 8px;">
                            <i data-lucide="search" style="width: 14px; height: 14px; margin-right: 4px;"></i>
                            <input type="text" id="location-search" placeholder="Search location..." style="background: transparent; border: none; color: inherit; outline: none; font-size: 13px;">
                        </div>
                        <div class="city-badge">
                            <span class="dot"></span>
                            <span id="stat-city">${savedCity}</span>
                        </div>
                    </div>
                </nav>

                <!-- ========== LEFT SIDEBAR ========== -->
                <aside class="sidebar" id="sidebar">
                    <!-- Layer Controls -->
                    <div class="sidebar-section">
                        <div class="sidebar-title">Map Layers</div>

                        <div class="layer-toggle">
                            <div class="layer-toggle-left">
                                <div class="layer-color" style="background: linear-gradient(135deg, #F46D43, #A50026)"></div>
                                <span class="layer-label">Heat Stress Map</span>
                            </div>
                            <input type="checkbox" class="toggle" id="layer-heat" checked>
                        </div>

                        <div class="layer-toggle">
                            <div class="layer-toggle-left">
                                <div class="layer-color" style="background: linear-gradient(135deg, #27ae60, #2ecc71)"></div>
                                <span class="layer-label">Vegetation (NDVI)</span>
                            </div>
                            <input type="checkbox" class="toggle" id="layer-ndvi">
                        </div>



                        <div class="layer-toggle">
                            <div class="layer-toggle-left">
                                <div class="layer-color" style="background: linear-gradient(135deg, #7f8c8d, #95a5a6)"></div>
                                <span class="layer-label">Buildings</span>
                            </div>
                            <input type="checkbox" class="toggle" id="layer-buildings">
                        </div>

                        <div class="opacity-control">
                            <label>Layer Opacity: <span id="opacity-value">80%</span></label>
                            <input type="range" class="slider" id="opacity-slider" min="10" max="100" value="80">
                        </div>
                    </div>

                    <!-- Legend -->
                    <div class="sidebar-section">
                        <div class="sidebar-title">Heat Stress Legend</div>
                        <div class="legend">
                            <div class="legend-item">
                                <div class="legend-color" style="background: #4575B4"></div>
                                <span>Cool Zone (&lt;30°C)</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #ABD9E9"></div>
                                <span>Mild Zone (30–35°C)</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #FEE090"></div>
                                <span>Warm Zone (35–40°C)</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #F46D43"></div>
                                <span>Hot Zone (40–45°C)</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #A50026"></div>
                                <span>Extreme Hotspot (&gt;45°C)</span>
                            </div>
                        </div>
                        <div class="legend-gradient"></div>
                        <div class="legend-labels">
                            <span>25°C</span>
                            <span>32°C</span>
                            <span>38°C</span>
                            <span>44°C</span>
                            <span>50°C</span>
                        </div>
                    </div>

                    <!-- Zone Stats -->
                    <div class="sidebar-section">
                        <div class="sidebar-title">Zone Rankings</div>
                        <div id="zone-stats-list">
                            <!-- Populated by JS -->
                        </div>
                    </div>
                </aside>

                <!-- ========== MAIN PAGE CONTENT ========== -->
                ${this.pageContentHTML}

                <!-- ========== RIGHT PANEL (Detail View) ========== -->
                <aside class="detail-panel" id="detail-panel">
                    <div class="panel-header">
                        <h3 id="panel-title">Cell Details</h3>
                        <button class="panel-close" id="panel-close" title="Close">✕</button>
                    </div>
                    <div class="panel-body" id="panel-body">
                        <!-- Populated dynamically -->
                    </div>
                </aside>

                <!-- ========== BOTTOM BAR ========== -->
                <footer class="bottombar">
                    <div class="data-sources">
                        <span>Data Sources:</span>
                        <span class="source-badge"><i data-lucide="satellite" style="width: 12px; height: 12px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Landsat 8</span>
                        <span class="source-badge"><i data-lucide="leaf" style="width: 12px; height: 12px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Sentinel-2</span>
                        <span class="source-badge"><i data-lucide="cloud-sun" style="width: 12px; height: 12px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> ERA5</span>
                        <span class="source-badge"><i data-lucide="building" style="width: 12px; height: 12px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> OpenStreetMap</span>
                    </div>
                    <div>
                        <span>Model: XGBoost v1.0 | Grid: 250m | </span>
                        <span id="model-metrics">R² = — | RMSE = —</span>
                    </div>
                </footer>
            </div>
        `;

        // Re-trigger icon instantiation for Lucide icons inside the dynamically injected HTML
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

customElements.define('dashboard-layout', DashboardLayout);
