// --- modules/primitiveCreator.js ---

// Ensure Modules namespace exists
const Modules = window.Modules || {};

Modules.PrimitiveCreator = (function() {
    let primitives = []; // Stores created primitive Three.js Mesh objects
    let primitiveType = 'Cube'; // Default primitive type
    let primitiveParams = {}; // Stores current parameters for the selected primitive type

    // UI Elements references
    let primitiveControlsContainer;
    let primitiveTypeSelect;
    let primitiveParamsControlsContainer;

    const defaultPrimitiveParams = {
        Cube: { size: 10, position: { x: 0, y: 0, z: 0 }, color: 0x9b59b6, segments: 1 },
        Cylinder: { radiusTop: 3, radiusBottom: 3, height: 10, position: { x: 0, y: 0, z: 0 }, radialSegments: 32, heightSegments: 1, color: 0xe74c3c },
        Sphere: { radius: 5, position: { x: 0, y: 0, z: 0 }, widthSegments: 32, heightSegments: 16, color: 0xf1c40f }
        // Add more primitives here
    };

    function init() {
        // Register UI controls
        const controlsHtml = `
            <div class="control-section" id="primitive-creator-controls">
                <h3>Create Primitives</h3>
                <div class="control-group primitive-creator-tools">
                    ${Core.UIManager.createButton('createCubeBtn', 'Cube', () => createPrimitive('Cube'), 'tool-button').element.outerHTML}
                    ${Core.UIManager.createButton('createCylinderBtn', 'Cylinder', () => createPrimitive('Cylinder'), 'tool-button').element.outerHTML}
                    ${Core.UIManager.createButton('createSphereBtn', 'Sphere', () => createPrimitive('Sphere'), 'tool-button').element.outerHTML}
                </div>
                <fieldset id="primitive-params-fieldset">
                    <legend>Parameters</legend>
                    <div id="primitive-params-controls">
                        <!-- Dynamic params will be loaded here -->
                    </div>
                </fieldset>
                <div class="control-group" style="text-align: center;">
                    ${Core.UIManager.createButton('addPrimitiveBtn', 'Add Primitive', addCurrentPrimitive).element.outerHTML}
                </div>
            </div>
        `;
        Core.UIManager.registerControls('PrimitiveCreator', controlsHtml);

        // Get references to UI elements
        primitiveControlsContainer = document.getElementById('primitive-creator-controls');
        primitiveParamsControlsContainer = document.getElementById('primitive-params-controls');

        // Setup initial parameters and UI based on default primitive type
        updatePrimitiveParamsUI(primitiveType);

        // Listen for selection changes to potentially enable/disable transform tools
        Core.SelectionManager.addSelectionChangeListener(handleSelectionChange);

        console.log("Primitive Creator module initialized.");
    }

    // Updates the UI section with controls specific to the chosen primitive type
    function updatePrimitiveParamsUI(type) {
        primitiveType = type;
        primitiveParams = { ...defaultPrimitiveParams[type] }; // Copy default params

        // Clear previous parameter controls
        primitiveParamsControlsContainer.innerHTML = '';

        // Generate new parameter controls
        const params = primitiveParams;

        // Position Controls
        const posFieldset = document.createElement('fieldset');
        posFieldset.innerHTML = `<legend>Position</legend>`;
        posFieldset.appendChild(Core.UIManager.createRangeSlider('primParam_posX', 'X:', -50, 50, 0.5, params.position.x).element);
        posFieldset.appendChild(Core.UIManager.createRangeSlider('primParam_posY', 'Y:', -50, 50, 0.5, params.position.y).element);
        posFieldset.appendChild(Core.UIManager.createRangeSlider('primParam_posZ', 'Z:', -50, 50, 0.5, params.position.z).element);
        primitiveParamsControlsContainer.appendChild(posFieldset);

        // Type-Specific Controls
        if (type === 'Cube') {
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_size', 'Size:', 1, 50, 0.5, params.size).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_segments', 'Segments:', 1, 10, 1, params.segments).element);
        } else if (type === 'Cylinder') {
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_radiusTop', 'Radius Top:', 0.5, 20, 0.5, params.radiusTop).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_radiusBottom', 'Radius Bottom:', 0.5, 20, 0.5, params.radiusBottom).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_height', 'Height:', 1, 50, 0.5, params.height).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_radialSegments', 'Radial Segments:', 8, 128, 1, params.radialSegments).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_heightSegments', 'Height Segments:', 1, 50, 1, params.heightSegments).element);
        } else if (type === 'Sphere') {
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_radius', 'Radius:', 0.5, 30, 0.5, params.radius).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_widthSegments', 'Width Segments:', 8, 128, 1, params.widthSegments).element);
            primitiveParamsControlsContainer.appendChild(Core.UIManager.createRangeSlider('primParam_heightSegments', 'Height Segments:', 4, 64, 1, params.heightSegments).element);
        }

        // Add common controls like color if desired
        // For now, relying on default colors

        // Re-attach event listeners for dynamically created sliders
        attachParameterSliderListeners();
    }

    // Attach event listeners to parameter sliders for updating the preview/params
    function attachParameterSliderListeners() {
        document.getElementById('primParam_posX').addEventListener('input', updateParam('position.x'));
        document.getElementById('primParam_posY').addEventListener('input', updateParam('position.y'));
        document.getElementById('primParam_posZ').addEventListener('input', updateParam('position.z'));

        if (primitiveType === 'Cube') {
            document.getElementById('primParam_size').addEventListener('input', updateParam('size'));
            document.getElementById('primParam_segments').addEventListener('input', updateParam('segments', true));
        } else if (primitiveType === 'Cylinder') {
            document.getElementById('primParam_radiusTop').addEventListener('input', updateParam('radiusTop'));
            document.getElementById('primParam_radiusBottom').addEventListener('input', updateParam('radiusBottom'));
            document.getElementById('primParam_height').addEventListener('input', updateParam('height'));
            document.getElementById('primParam_radialSegments').addEventListener('input', updateParam('radialSegments', true));
            document.getElementById('primParam_heightSegments').addEventListener('input', updateParam('heightSegments', true));
        } else if (primitiveType === 'Sphere') {
            document.getElementById('primParam_radius').addEventListener('input', updateParam('radius'));
            document.getElementById('primParam_widthSegments').addEventListener('input', updateParam('widthSegments', true));
            document.getElementById('primParam_heightSegments').addEventListener('input', updateParam('heightSegments', true));
        }
    }

    // Helper function to create an update listener for a parameter
    function updateParam(paramKey, isInt = false) {
        return (e) => {
            const value = isInt ? parseInt(e.target.value) : parseFloat(e.target.value);
            if (paramKey.includes('.')) { // Handle nested properties like position.x
                const keys = paramKey.split('.');
                primitiveParams[keys[0]][keys[1]] = value;
            } else {
                primitiveParams[paramKey] = value;
            }
            // Potentially update a preview object here if we were doing real-time previews
        };
    }

    // Add button listeners for primitive selection
    document.getElementById('createCubeBtn').addEventListener('click', () => updatePrimitiveParamsUI('Cube'));
    document.getElementById('createCylinderBtn').addEventListener('click', () => updatePrimitiveParamsUI('Cylinder'));
    document.getElementById('createSphereBtn').addEventListener('click', () => updatePrimitiveParamsUI('Sphere'));
    document.getElementById('addPrimitiveBtn').addEventListener('click', addCurrentPrimitive);


    // Creates a primitive with the current parameters
    function addCurrentPrimitive() {
        const params = {
            ...primitiveParams, // Use current parameters
            color: primitiveParams.color || defaultPrimitiveParams[primitiveType].color, // Ensure color
            position: { ...primitiveParams.position }, // Deep copy position
            module: 'PrimitiveCreator',
            isSelectable: true
        };
        createPrimitive(primitiveType, params);
    }

    // Creates and adds a primitive to the scene
    function createPrimitive(type, params = null) {
        let geometry = null;
        let mesh = null;
        const finalParams = params ? { ...defaultPrimitiveParams[type], ...params } : { ...defaultPrimitiveParams[type] };

        const name = `${finalParams.namePrefix || type} ${primitives.filter(p => p && p.name.startsWith(finalParams.namePrefix || type)).length + 1}`;

        switch (type) {
            case 'Cube':
                geometry = new THREE.BoxGeometry(finalParams.size, finalParams.size, finalParams.size, finalParams.segments, finalParams.segments, finalParams.segments);
                break;
            case 'Cylinder':
                geometry = new THREE.CylinderGeometry(finalParams.radiusTop, finalParams.radiusBottom, finalParams.height, finalParams.radialSegments, finalParams.heightSegments);
                break;
            case 'Sphere':
                geometry = new THREE.SphereGeometry(finalParams.radius, finalParams.widthSegments, finalParams.heightSegments);
                break;
            default:
                console.error("Unsupported primitive type:", type);
                return;
        }

        const material = new THREE.MeshStandardMaterial({
            color: finalParams.color,
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.1
        });

        mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(finalParams.position.x, finalParams.position.y, finalParams.position.z);
        mesh.castShadow = true; // Enable shadows for primitives
        mesh.receiveShadow = true;

        mesh.userData = {
            isSelectable: finalParams.isSelectable,
            primitiveType: type,
            primitiveParams: { ...finalParams }, // Store original creation params
            module: 'PrimitiveCreator'
        };

        Core.ThreeManager.addObject(mesh);
        primitives.push(mesh);
        console.log(`Primitive '${name}' created.`);
        return mesh;
    }

    function getAllPrimitives() {
        return primitives.filter(p => p !== null);
    }

    // Called when selection changes
    function handleSelectionChange(selectedObject) {
        // If a primitive is selected, update the parameters UI
        if (selectedObject && selectedObject.userData.module === 'PrimitiveCreator') {
            const params = selectedObject.userData.primitiveParams;
            const type = selectedObject.userData.primitiveType;

            updatePrimitiveParamsUI(type); // Re-render UI based on selected primitive's type

            // Manually update the slider values to reflect the selected object's state
            const baseId = 'primParam_';
            document.getElementById(baseId + 'posX').value = params.position.x;
            document.getElementById(baseId + 'posY').value = params.position.y;
            document.getElementById(baseId + 'posZ').value = params.position.z;

            if (type === 'Cube') {
                document.getElementById(baseId + 'size').value = params.size;
                document.getElementById(baseId + 'segments').value = params.segments;
            } else if (type === 'Cylinder') {
                document.getElementById(baseId + 'radiusTop').value = params.radiusTop;
                document.getElementById(baseId + 'radiusBottom').value = params.radiusBottom;
                document.getElementById(baseId + 'height').value = params.height;
                document.getElementById(baseId + 'radialSegments').value = params.radialSegments;
                document.getElementById(baseId + 'heightSegments').value = params.heightSegments;
            } else if (type === 'Sphere') {
                document.getElementById(baseId + 'radius').value = params.radius;
                document.getElementById(baseId + 'widthSegments').value = params.widthSegments;
                document.getElementById(baseId + 'heightSegments').value = params.heightSegments;
            }

            // Update displayed values
            attachParameterSliderListeners(); // Re-attach listeners as they might be recreated by updatePrimitiveParamsUI
        }
    }

    return {
        init,
        createPrimitive,
        addCurrentPrimitive,
        getAllPrimitives,
        handleSelectionChange
    };
})();