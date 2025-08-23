// --- modules/arcMeasure.js ---

// Ensure Modules namespace exists
const Modules = window.Modules || {};

Modules.ArcMeasure = (function() {
    let measureResultsDisplay;
    let selectedArcObject = null; // Tracks the currently selected object for measurement

    const HYPOTHETICAL_DOC_DIAMETER = 20.0; // For display purposes

    function init() {
        const controlsHtml = `
            <div class="control-section" id="arc-measure-controls">
                <h3>Arc Measurement</h3>
                <div id="measure-results">
                    <div>
                        <span class="result-label">Arc Path Length:</span>
                        <span id="measure-arcLengthResult" class="result-value">0.0</span>
                    </div>
                    <div>
                        <span class="result-label">Doc Circ (d=${HYPOTHETICAL_DOC_DIAMETER.toFixed(1)}):</span>
                        <span id="measure-minCircleResult" class="result-value">${Core.MathUtils.docCircumference(HYPOTHETICAL_DOC_DIAMETER).toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="result-label">Doc Diameter*2:</span>
                        <span id="measure-maxCircleResult" class="result-value">${(HYPOTHETICAL_DOC_DIAMETER * 2).toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="result-label">Match Info:</span>
                        <span id="measure-matchedReportResult" class="result-value"></span>
                    </div>
                </div>
                <div class="control-group" style="text-align: center;">
                    ${Core.UIManager.createButton('measureArcBtn', 'Measure Selected', measureSelectedArc).element.outerHTML}
                </div>
            </div>
        `;
        Core.UIManager.registerControls('ArcMeasure', controlsHtml);

        measureResultsDisplay = {
            arcLength: document.getElementById('measure-arcLengthResult'),
            minCircle: document.getElementById('measure-minCircleResult'),
            maxCircle: document.getElementById('measure-maxCircleResult'),
            matchedReport: document.getElementById('measure-matchedReportResult')
        };

        // Listen for selection changes to know which object to measure
        Core.SelectionManager.addSelectionChangeListener(handleSelectionChange);

        console.log("Arc Measure module initialized.");
    }

    function handleSelectionChange(selectedObject) {
        // Store the currently selected object if it's an arc
        if (selectedObject && selectedObject.userData.module === 'ArcGenerator') {
            selectedArcObject = selectedObject;
        } else {
            selectedArcObject = null; // Deselect if something else is selected or nothing
        }
    }

    function measureSelectedArc() {
        if (!selectedArcObject) {
            alert("Please select an arc object first.");
            return;
        }

        const arcParams = selectedArcObject.userData.arcParams;
        if (!arcParams) {
            console.error("Selected object does not have arcParams!");
            return;
        }

        // Calculate arc path length using the math utility
        const calculatedArcPathLength = Core.MathUtils.calculateArcPathLength(arcParams);

        // Calculate doc-based circumference for display
        const docCirc = Core.MathUtils.docCircumference(HYPOTHETICAL_DOC_DIAMETER);

        // Debug/Match report string
        const debugReport = `PathLen=${calculatedArcPathLength.toFixed(2)} | DocCirc(${HYPOTHETICAL_DOC_DIAMETER.toFixed(1)})=${docCirc.toFixed(2)}`;

        // Update the UI display
        if (measureResultsDisplay.arcLength) measureResultsDisplay.arcLength.textContent = calculatedArcPathLength.toFixed(4);
        if (measureResultsDisplay.minCircle) measureResultsDisplay.minCircle.textContent = docCirc.toFixed(2);
        if (measureResultsDisplay.maxCircle) measureResultsDisplay.maxCircle.textContent = (HYPOTHETICAL_DOC_DIAMETER * 2).toFixed(2);
        if (measureResultsDisplay.matchedReport) measureResultsDisplay.matchedReport.textContent = debugReport;

        console.log(`Measured Arc: ${selectedArcObject.name}, Length: ${calculatedArcPathLength.toFixed(4)}`);

        // Trigger animated overlay (placeholder)
        Modules.OverlayRenderer.showMeasurementOverlay(calculatedArcPathLength, HYPOTHETICAL_DOC_DIAMETER);
    }

    return {
        init,
        measureSelectedArc,
        handleSelectionChange
    };
})();