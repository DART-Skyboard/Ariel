// --- modules/overlayRenderer.js ---

// Ensure Modules namespace exists
const Modules = window.Modules || {};

Modules.OverlayRenderer = (function() {
    let overlayContainer;
    let measurementOverlayElements = []; // Stores active overlay graphics

    function init() {
        overlayContainer = document.getElementById('overlay-graphics');
        if (!overlayContainer) {
            console.error("Overlay Renderer Error: 'overlay-graphics' element not found!");
            return;
        }
        console.log("Overlay Renderer initialized.");
    }

    // Shows simple measurement-related overlays. This is a placeholder.
    // A more robust implementation would use CSS3DRenderer or draw custom geometries.
    function showMeasurementOverlay(arcLength, docDiameter) {
        clearOverlay(); // Clear previous overlays

        // Example 1: Text Overlay
        const textElement = document.createElement('div');
        textElement.className = 'overlay-element';
        textElement.style.left = '50%';
        textElement.style.top = '50%';
        textElement.style.transform = 'translate(-50%, -50%)';
        textElement.style.backgroundColor = 'rgba(52, 152, 219, 0.6)';
        textElement.style.padding = '8px 12px';
        textElement.style.borderRadius = '5px';
        textElement.textContent = `Arc Length: ${arcLength.toFixed(2)}`;
        overlayContainer.appendChild(textElement);
        measurementOverlayElements.push(textElement);

        // Example 2: Doc Circle (simplified)
        const docCircleElement = document.createElement('div');
        docCircleElement.className = 'overlay-element';
        docCircleElement.style.left = '20%';
        docCircleElement.style.top = '30%';
        docCircleElement.style.width = '80px';
        docCircleElement.style.height = '80px';
        docCircleElement.style.borderRadius = '50%';
        docCircleElement.style.backgroundColor = 'rgba(52, 152, 219, 0.4)';
        docCircleElement.style.transform = 'translate(-50%, -50%)';
        overlayContainer.appendChild(docCircleElement);
        measurementOverlayElements.push(docCircleElement);

        // Example 3: Doc Arc (simplified)
        const docArcElement = document.createElement('div');
        docArcElement.className = 'overlay-element';
        docArcElement.style.left = '70%';
        docArcElement.style.top = '70%';
        docArcElement.style.width = '60px';
        docArcElement.style.height = '120px';
        docArcElement.style.borderTop = '5px solid rgba(231, 76, 60, 0.7)';
        docArcElement.style.borderLeft = '5px solid rgba(231, 76, 60, 0.7)';
        docArcElement.style.borderRadius = '0 0 0 50%';
        docArcElement.style.transform = 'translate(-50%, -50%)';
        overlayContainer.appendChild(docArcElement);
        measurementOverlayElements.push(docArcElement);

        console.log("Measurement overlay shown.");
    }

    // Clears all currently displayed overlay elements
    function clearOverlay() {
        measurementOverlayElements.forEach(element => {
            if (element.parentNode === overlayContainer) {
                overlayContainer.removeChild(element);
            }
        });
        measurementOverlayElements = [];
    }

    // Called by ThreeManager's animation loop
    function update() {
        // This is where you'd add animations for the overlays
        // Example: Making the text element pulse
        if (measurementOverlayElements.length > 0) {
            // For simplicity, this is just a placeholder for animation logic.
            // Real animation would use requestAnimationFrame/tween.js.
        }
    }

    return {
        init,
        showMeasurementOverlay,
        clearOverlay,
        update
    };
})();