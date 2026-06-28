/**
 * Charts Module — Chart.js visualizations for driver attribution and scenario comparison.
 */

const ChartsModule = (() => {
    let driverChart = null;
    let comparisonChart = null;

    // Category colors matching the API
    const CATEGORY_COLORS = {
        Vegetation: '#2ecc71',
        Water: '#3498db',
        Surface: '#e67e22',
        Morphology: '#9b59b6',
        Atmospheric: '#1abc9c',
        LULC: '#34495e',
        Interaction: '#e74c3c',
    };

    /**
     * Create a horizontal bar chart for SHAP driver attribution.
     * @param {string} canvasId - Canvas element ID
     * @param {Array} drivers - Array of driver objects with feature, shap_value, label, category
     */
    function createDriverChart(canvasId, drivers) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Destroy existing chart
        if (driverChart) {
            driverChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        const top5 = drivers.slice(0, 8);

        const labels = top5.map(d => d.label || d.feature);
        const values = top5.map(d => d.shap_value);
        const colors = top5.map(d => {
            if (d.category_color) return d.category_color;
            return d.shap_value > 0 ? '#D73027' : '#1B7A78';
        });
        const borderColors = colors.map(c => c);

        driverChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'SHAP Value (°C contribution)',
                    data: values,
                    backgroundColor: colors.map(c => c + '40'),
                    borderColor: borderColors,
                    borderWidth: 2,
                    borderRadius: 4,
                    borderSkipped: false,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1C1C2E',
                        titleFont: { family: 'Inter', size: 12, weight: '600' },
                        bodyFont: { family: 'Inter', size: 11 },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                const dir = val > 0 ? 'Heating' : 'Cooling';
                                return `${dir}: ${val > 0 ? '+' : ''}${val.toFixed(3)}°C`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'SHAP Value (°C)',
                            font: { family: 'Inter', size: 11, weight: '600' },
                            color: '#4A4A6A',
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.05)',
                        },
                        ticks: {
                            font: { family: 'Inter', size: 10 },
                            color: '#4A4A6A',
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Inter', size: 11, weight: '500' },
                            color: '#1C1C2E',
                        }
                    }
                }
            }
        });

        return driverChart;
    }

    /**
     * Create a comparison bar chart for scenarios.
     * @param {string} canvasId - Canvas element ID
     * @param {Array} scenarios - Array of scenario summary objects
     */
    function createComparisonChart(canvasId, scenarios) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (comparisonChart) {
            comparisonChart.destroy();
        }

        const ctx = canvas.getContext('2d');

        const SCENARIO_COLORS = {
            urban_greening: '#27ae60',
            cool_roofs: '#2E6DA4',
            water_bodies: '#3498db',
            reflective_pavements: '#C0550C',
            green_roofs: '#2ecc71',
        };

        const labels = scenarios.map(s => s.name);
        const avgDelta = scenarios.map(s => s.avg_delta_t);
        const maxDelta = scenarios.map(s => s.max_delta_t);
        const colors = scenarios.map(s => SCENARIO_COLORS[s.scenario] || '#666');

        comparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Average Cooling (°C)',
                        data: avgDelta,
                        backgroundColor: colors.map(c => c + '80'),
                        borderColor: colors,
                        borderWidth: 2,
                        borderRadius: 6,
                    },
                    {
                        label: 'Maximum Cooling (°C)',
                        data: maxDelta,
                        backgroundColor: colors.map(c => c + '30'),
                        borderColor: colors.map(c => c + '80'),
                        borderWidth: 2,
                        borderRadius: 6,
                        borderDash: [4, 4],
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { family: 'Inter', size: 12, weight: '500' },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1C1C2E',
                        titleFont: { family: 'Inter', size: 13, weight: '600' },
                        bodyFont: { family: 'Inter', size: 12 },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.raw}°C`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Inter', size: 11, weight: '500' },
                            color: '#1C1C2E',
                            maxRotation: 15,
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Temperature Change (°C)',
                            font: { family: 'Inter', size: 12, weight: '600' },
                            color: '#4A4A6A',
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.05)',
                        },
                        ticks: {
                            font: { family: 'Inter', size: 11 },
                            color: '#4A4A6A',
                            callback: (val) => val + '°C',
                        }
                    }
                }
            }
        });

        return comparisonChart;
    }

    /**
     * Create a global feature importance chart.
     */
    function createGlobalImportanceChart(canvasId, importance) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const top10 = importance.slice(0, 10);

        const labels = top10.map(d => d.label || d.feature);
        const values = top10.map(d => d.mean_abs_shap);
        const colors = top10.map(d => {
            const cat = d.category || 'Other';
            return CATEGORY_COLORS[cat] || '#666';
        });

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Mean |SHAP| (°C)',
                    data: values,
                    backgroundColor: colors.map(c => c + '60'),
                    borderColor: colors,
                    borderWidth: 2,
                    borderRadius: 4,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1C1C2E',
                        titleFont: { family: 'Inter', size: 12 },
                        bodyFont: { family: 'Inter', size: 11 },
                        padding: 10,
                        cornerRadius: 8,
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Mean |SHAP Value| (°C)',
                            font: { family: 'Inter', size: 11, weight: '600' },
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { family: 'Inter', size: 10 } },
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Inter', size: 11, weight: '500' },
                            color: '#1C1C2E',
                        }
                    }
                }
            }
        });
    }

    /**
     * Create an HSI distribution doughnut chart.
     */
    function createHSIChart(canvasId, distribution) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const HSI_CHART_COLORS = {
            'Cool Zone': '#4575B4',
            'Mild Zone': '#ABD9E9',
            'Warm Zone': '#FEE090',
            'Hot Zone': '#F46D43',
            'Extreme Heat Hotspot': '#A50026',
        };

        const labels = Object.keys(distribution);
        const values = Object.values(distribution);
        const colors = labels.map(l => HSI_CHART_COLORS[l] || '#ccc');

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#fff',
                    borderWidth: 2,
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: 'Inter', size: 11, weight: '500' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle',
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1C1C2E',
                        titleFont: { family: 'Inter', size: 12 },
                        bodyFont: { family: 'Inter', size: 11 },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} cells (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    return {
        createDriverChart,
        createComparisonChart,
        createGlobalImportanceChart,
        createHSIChart,
    };
})();
