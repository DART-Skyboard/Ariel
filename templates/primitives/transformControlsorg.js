// --- modules/transformControls.js ---

// Ensure Modules namespace exists
const Modules = window.Modules || {};

Modules.TransformControls = (function() {
    let transformControls = null;
    let currentMode = 'translate'; // 'translate', 'rotate', 'scale'
    let currentObject = null;

    // UI elements
    let transformControlsGroup;
    let translateModeBtn, rotateModeBtn, scaleModeBtn;

    function init() {
        // Create the Three.js TransformControls helper
        transformControls = new THREE.TransformControls(Core.ThreeManager.getCamera(), Core.ThreeManager.getRenderer().domElement);
        transformControls.addEventListener('change', (event) => {
            // Update object's position/rotation/scale when controls are used
            // This might be complex if the object itself has its own transformation logic
            // For now, we just update the controls' object
            updateObjectTransformFromControls();
            Core.UIManager.updateSlider(`transform_${currentMode}X`, transformControls.object.position.x); // Example for translation
        });
        transformControls.addEventListener('dragging-changed', (event) => {
            Core.ThreeManager.getOrbitControls().enabled = !event.value; // Disable OrbitControls while transforming
        });

        Core.ThreeManager.getScene().add(transformControls);

        // Register UI controls for selecting transform mode
        const controlsHtml = `
            <div class="control-section" id="transform-controls-section">
                <h3>Transform Tool</h3>
                <div class="control-group transform-controls-group">
                    <label>Mode:</label>
                    <div class="transform-radio-group">
                        ${Core.UIManager.createRadioGroup('transformMode', [
                            { label: 'Translate', value: 'translate' },
                            { label: 'Rotate', value: 'rotate' },
                            { label: 'Scale', value: 'scale' }
                        ], currentMode, handleModeChange).element.outerHTML}
                    </div>
                </div>
                <!-- Optional: Sliders to show/control transform values -->
                <div id="transform-value-sliders"></div>
            </div>
        `;
        Core.UIManager.registerControls('TransformControls', controlsHtml);

        // Get references to UI elements
        transformControlsGroup = document.getElementById('transform-controls-section');
        
        // Register callbacks for selection changes to attach/detach controls
        Core.SelectionManager.addSelectionChangeListener(handleSelectionChange);

        console.log("Transform Controls module initialized.");
    }

    function handleSelectionChange(selectedObject) {
        currentObject = selectedObject;
        if (currentObject) {
            attachTransformControls(currentObject);
            // Update sliders to reflect the selected object's transform values
            updateTransformSliders(currentObject);
        } else {
            detachTransformControls();
        }
    }

    function attachTransformControls(object) {
        transformControls.attach(object);
        // Make sure the object is compatible with transform controls (usually meshes)
        if (object.isMesh) {
            // Set initial mode if not already set
            transformControls.setMode(currentMode);
        }
    }

    function detachTransformControls() {
        transformControls.detach();
    }

    // Handles changes to the transform mode (translate, rotate, scale)
    function handleModeChange(newMode) {
        currentMode = newMode;
        if (transformControls.object) { // If controls are attached to an object
            transformControls.setMode(currentMode);
            updateTransformSliders(transformControls.object); // Update sliders for the new mode
        }
    }

    // Updates the transform value sliders based on the current object and mode
    function updateTransformSliders(object) {
        const slidersContainer = document.getElementById('transform-value-sliders');
        slidersContainer.innerHTML = ''; // Clear previous sliders

        let labelPrefix = '';
        let updateFunc = null;
        let paramX = null, paramY = null, paramZ = null;

        switch (currentMode) {
            case 'translate':
                labelPrefix = 'Position';
                paramX = object.position.x;
                paramY = object.position.y;
                paramZ = object.position.z;
                updateFunc = (x, y, z) => { object.position.set(x, y, z); };
                break;
            case 'rotate':
                labelPrefix = 'Rotation';
                // Rotation is tricky. Quaternions are default. Euler angles are easier for sliders.
                // Convert to Euler first. Be mindful of gimbal lock if not using Quaternions properly.
                const euler = new THREE.Euler().setFromQuaternion(object.quaternion, 'XYZ'); // Or 'YXZ' based on Blender
                paramX = THREE.MathUtils.radToDeg(euler.x);
                paramY = THREE.MathUtils.radToDeg(euler.y);
                paramZ = THREE.MathUtils.radToDeg(euler.z);
                updateFunc = (x, y, z) => {
                    object.rotation.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'XYZ');
                };
                break;
            case 'scale':
                labelPrefix = 'Scale';
                paramX = object.scale.x;
                paramY = object.scale.y;
                paramZ = object.scale.z;
                updateFunc = (x, y, z) => { object.scale.set(x, y, z); };
                break;
        }

        if (labelPrefix) {
            const labelElem = document.createElement('label');
            labelElem.textContent = labelPrefix;
            labelElem.style.color = '#3498db';
            labelElem.style.fontWeight = 'bold';
            labelElem.style.marginBottom = '10px';
            slidersContainer.appendChild(labelElem);

            slidersContainer.appendChild(Core.UIManager.createRangeSlider(`transform_${currentMode}X`, 'X:', -100, 100, 0.1, paramX, ' units').element);
            slidersContainer.appendChild(Core.UIManager.createRangeSlider(`transform_${currentMode}Y`, 'Y:', -100, 100, 0.1, paramY, ' units').element);
            slidersContainer.appendChild(Core.UIManager.createRangeSlider(`transform_${currentMode}Z`, 'Z:', -100, 100, 0.1, paramZ, ' units').element);

            // Add event listeners to these new sliders
            document.getElementById(`transform_${currentMode}X`).addEventListener('input', (e) => updateValue(e, 'X', updateFunc));
            document.getElementById(`transform_${currentMode}Y`).addEventListener('input', (e) => updateValue(e, 'Y', updateFunc));
            document.getElementById(`transform_${currentMode}Z`).addEventListener('input', (e) => updateValue(e, 'Z', updateFunc));
        }
    }

    function updateValue(event, axis, updateFunc) {
        const sliderId = event.target.id;
        const value = parseFloat(event.target.value);
        
        // Get current values from all sliders to update in one go
        let currentX = parseFloat(document.getElementById(`transform_${currentMode}X`).value);
        let currentY = parseFloat(document.getElementById(`transform_${currentMode}Y`).value);
        let currentZ = parseFloat(document.getElementById(`transform_${currentMode}Z`).value);

        if (axis === 'X') currentX = value;
        else if (axis === 'Y') currentY = value;
        else if (axis === 'Z') currentZ = value;
        
        updateFunc(currentX, currentY, currentZ);
    }

    // Update the UI slider values if the object's transform changes externally (e.g., by OrbitControls)
    // This is more complex and might involve observing changes or polling.
    // For simplicity, we rely on manual updates via transform controls or selection re-triggering UI.

    // Function to get current mode from UI (used by handleModeChange)
    function getCurrentModeFromUI() {
        const radios = document.querySelectorAll('input[name="transformMode"]');
        for (const radio of radios) {
            if (radio.checked) {
                return radio.value;
            }
        }
        return 'translate'; // Default
    }

    // Add listeners for mode radio buttons
    document.querySelectorAll('input[name="transformMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                handleModeChange(e.target.value);
            }
        });
    });

    return {
        init,
        attachTransformControls,
        detachTransformControls,
        handleModeChange,
        currentMode // Expose current mode if needed by other modules
    };
})();