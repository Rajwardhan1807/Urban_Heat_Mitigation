/**
 * Scenarios page interaction module.
 * Handles scenario map visualization on the main dashboard.
 */

const ScenariosModule = (() => {
    let activeScenarioLayer = null;

    /**
     * Load and display a scenario overlay on the map.
     */
    async function showScenarioOnMap(scenarioName) {
        try {
            const response = await fetch(`/api/scenarios/${scenarioName}?applied_only=false`);
            const geojson = await response.json();

            // Remove previous overlay
            if (activeScenarioLayer) {
                MapModule.getMap().removeLayer(activeScenarioLayer);
            }

            // Add new overlay
            activeScenarioLayer = MapModule.renderScenarioOverlay(geojson, scenarioName);

        } catch (err) {
            console.error(`Failed to load scenario ${scenarioName}:`, err);
        }
    }

    /**
     * Clear scenario overlay from map.
     */
    function clearScenarioOverlay() {
        if (activeScenarioLayer) {
            MapModule.getMap().removeLayer(activeScenarioLayer);
            activeScenarioLayer = null;
        }
    }

    return {
        showScenarioOnMap,
        clearScenarioOverlay,
    };
})();
