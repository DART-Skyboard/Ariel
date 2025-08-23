// --- modules/transformControls.js ---
Modules.TransformControls = (function() {
    let transformControls;

    function init() {
        const camera = Core.ThreeManager.getCamera();
        const renderer = Core.ThreeManager.getRenderer();

        transformControls = new THREE.TransformControls(camera, renderer.domElement);
        transformControls.addEventListener('dragging-changed', (event) => {
            Core.ThreeManager.getOrbitControls().enabled = !event.value;
        });

        Core.ThreeManager.getScene().add(transformControls);

        const controlsHtml = `
            <h3>Transform Tool</h3>
            ${Core.UIManager.createRadioGroup('transformMode', [
                { label: 'Translate', value: 'translate' },
                { label: 'Rotate', value: 'rotate' },
                { label: 'Scale', value: 'scale' }
            ], 'translate')}
        `;
        Core.UIManager.registerControls('TransformControls', controlsHtml);

        document.querySelectorAll('input[name="transformMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => transformControls.setMode(e.target.value));
        });

        Core.SelectionManager.addSelectionChangeListener((selectedObject) => {
            if (selectedObject) {
                transformControls.attach(selectedObject);
            } else {
                transformControls.detach();
            }
        });
    }

    return { init };
})();