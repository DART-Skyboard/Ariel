// --- modules/arcGenerator.js ---

// Ensure Modules namespace exists
const Modules = window.Modules || {};

Modules.ArcGenerator = (function() {
    let arcs = []; // Stores Three.js Mesh objects
    const defaultParams = {
        x: 0, y: 0, z: 0,
        deviation: 1.5,
        resolution: 32,
        tubeRadius: 0.1,
        crossSeg: 8,
        color: 0x3498db, // Default blue
        isSelectable: true,
        namePrefix: "Arc"
    };

    function init() {
        // Register UI controls
        const controlsHtml = `
            <div class="control-section" id="arc-generator-controls">
                <h3>Arc Generator</h3>
                ${createArcControls(1)}
                ${createArcControls(2)}
                <div class="control-group action-buttons-row" style="display: flex; justify-content: space-between;">
                    ${Core.UIManager.createButton('createArc1Btn', 'Create/Update Arc 1', () => createOrUpdateArc(1)).element.outerHTML}
                    ${Core.UIManager.createButton('createArc2Btn', 'Create/Update Arc 2', () => createOrUpdateArc(2)).element.outerHTML}
                </div>
                 <div class="control-group action-buttons-row" style="display: flex; justify-content: center;">
                    ${Core.UIManager.createButton('createArc3Btn', 'Create/Update Arc 3', () => createOrUpdateArc(3)).element.outerHTML}
                </div>
            </div>
        `;
        Core.UIManager.registerControls('ArcGenerator', controlsHtml);

        // Set initial slider values from defaults
        updateAllSliderDisplays();

        // Listen for selection changes to update UI if an arc is selected
        Core.SelectionManager.addSelectionChangeListener(handleSelectionChange);

        console.log("Arc Generator module initialized.");
    }

    // Helper to create HTML for one arc's controls
    function createArcControls(arcIndex) {
        const baseId = `arc${arcIndex}`;
        const params = defaultParams;

        return `
            <fieldset>
                <legend>${params.namePrefix} ${arcIndex}</legend>
                <div class="control-group">
                    <label>${params.namePrefix} ${arcIndex} Path:</label>
                    <div class="slider-container">
                        <label for="${baseId}_x">X:</label>
                        ${Core.UIManager.createRangeSlider(baseId + '_x', 'X', -20, 20, 0.1, params.x, '').element.outerHTML}
                    </div>
                    <div class="slider-container">
                        <label for="${baseId}_y">Y:</label>
                        ${Core.UIManager.createRangeSlider(baseId + '_y', 'Y', -20, 20, 0.1, params.y, '').element.outerHTML}
                    </div>
                    <div class="slider-container">
                        <label for="${baseId}_z">Z:</label>
                        ${Core.UIManager.createRangeSlider(baseId + '_z', 'Z', -20, 20, 0.1, params.z, '').element.outerHTML}
                    </div>
                </div>
                <div class="control-group">
                    <label>${params.namePrefix} ${arcIndex} Properties:</label>
                    ${Core.UIManager.createRangeSlider(baseId + '_deviation', 'Deviation:', 0, 5, 0.1, params.deviation, '').element.outerHTML}
                    ${Core.UIManager.createRangeSlider(baseId + '_resolution', 'Resolution:', 8, 128, 1, params.resolution, '').element.outerHTML}
                    ${Core.UIManager.createRangeSlider(baseId + '_tubeRadius', 'Tube Radius:', 0.05, 0.5, 0.01, params.tubeRadius, '').element.outerHTML}
                </div>
            </fieldset>
        `;
    }

    // Update all slider value displays based on current HTML values
    function updateAllSliderDisplays() {
        for (let i = 1; i <= 3; i++) {
            const baseId = `arc${i}`;
            Core.UIManager.updateSlider(baseId + '_x', document.getElementById(baseId + '_x').value);
            Core.UIManager.updateSlider(baseId + '_y', document.getElementById(baseId + '_y').value);
            Core.UIManager.updateSlider(baseId + '_z', document.getElementById(baseId + '_z').value);
            Core.UIManager.updateSlider(baseId + '_deviation', document.getElementById(baseId + '_deviation').value);
            Core.UIManager.updateSlider(baseId + '_resolution', document.getElementById(baseId + '_resolution').value, true);
            Core.UIManager.updateSlider(baseId + '_tubeRadius', document.getElementById(baseId + '_tubeRadius').value);
        }
    }

    // Create or update an arc based on its index (1, 2, or 3)
    function createOrUpdateArc(arcIndex, manualParams = null) {
        const baseId = `arc${arcIndex}`;
        let params;

        if (manualParams) {
            // Use provided parameters directly
            params = { ...defaultParams, ...manualParams, namePrefix: defaultParams.namePrefix };
        } else {
            // Read from UI
            const x = parseFloat(document.getElementById(baseId + '_x').value);
            const y = parseFloat(document.getElementById(baseId + '_y').value);
            const z = parseFloat(document.getElementById(baseId + '_z').value);
            const deviation = parseFloat(document.getElementById(baseId + '_deviation').value);
            const resolution = parseInt(document.getElementById(baseId + '_resolution').value);
            const tubeRadius = parseFloat(document.getElementById(baseId + '_tubeRadius').value);
            params = { x, y, z, deviation, resolution, tubeRadius, namePrefix: defaultParams.namePrefix, color: defaultParams.color };
        }

        // Remove existing arc if it exists
        const existingArcIndex = arcIndex - 1;
        if (arcs[existingArcIndex]) {
            Core.ThreeManager.removeObject(arcs[existingArcIndex]);
            arcs[existingArcIndex] = null; // Clear the reference
        }

        // Create new geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];

        // Calculate arc path vertices
        const arcPathVerts = [];
        for (let i = 0; i <= params.resolution; i++) {
            const t = i / params.resolution;
            const px = t * params.x;
            const py = t * params.y;
            const pz = t * params.z;
            const deviatedY = py + Math.sin(3 * t) * params.deviation; // Python's deviation math
            arcPathVerts.push(new THREE.Vector3(px, deviatedY, pz));
        }

        // Generate tube vertices and faces
        const numPoints = arcPathVerts.length;
        for (let i = 0; i < numPoints; i++) {
            const center = arcPathVerts[i];
            // Determine orientation for the tube cross-section
            const pathDir = new THREE.Vector3(params.x, params.y, params.z).normalize();
            let upDir = new THREE.Vector3(0, 0, 1);
            // Handle cases where pathDir is parallel to upDir
            if (Math.abs(pathDir.dot(upDir)) > 0.99) {
                upDir = new THREE.Vector3(0, 1, 0);
            }
            const rightDir = new THREE.Vector3().crossVectors(pathDir, upDir).normalize();
            const normalDir = new THREE.Vector3().crossVectors(pathDir, rightDir).normalize();

            for (let c = 0; c < params.crossSeg; c++) {
                const theta = 2.0 * 3 * (c / params.crossSeg); // Doc-based theta
                const localX = params.tubeRadius * Math.sin(theta);
                const localZ = params.tubeRadius * Math.cos(theta);

                const vertex = new THREE.Vector3();
                vertex.addScaledVector(rightDir, localX);
                vertex.addScaledVector(normalDir, localZ);
                vertex.add(center);
                vertices.push(vertex);
            }
        }

        // Connect vertices to form faces
        for (let i = 0; i < numPoints - 1; i++) {
            const startVertexIndex = i * params.crossSeg;
            const endVertexIndex = (i + 1) * params.crossSeg;
            for (let c = 0; c < params.crossSeg; c++) {
                const cNext = (c + 1) % params.crossSeg;
                const v1 = startVertexIndex + c;
                const v2 = startVertexIndex + cNext;
                const v3 = endVertexIndex + cNext;
                const v4 = endVertexIndex + c;
                indices.push(v1, v2, v3, v1, v3, v4); // Two triangles for each quad
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: params.color,
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${params.namePrefix} ${arcIndex}`;
        mesh.userData = {
            isSelectable: params.isSelectable,
            arcParams: { ...params },
            module: 'ArcGenerator'
        };

        Core.ThreeManager.addObject(mesh);
        arcs[existingArcIndex] = mesh;

        console.log(`Arc ${arcIndex} created/updated.`);
        return mesh;
    }

    function getAllArcs() {
        return arcs.filter(arc => arc !== null);
    }

    // Update UI sliders when an arc is selected
    function handleSelectionChange(selectedObject) {
        if (selectedObject && selectedObject.userData.module === 'ArcGenerator') {
            const arcIndex = parseInt(selectedObject.name.split(' ')[1]);
            const params = selectedObject.userData.arcParams;

            if (params) {
                const baseId = `arc${arcIndex}`;
                Core.UIManager.updateSlider(baseId + '_x', params.x);
                Core.UIManager.updateSlider(baseId + '_y', params.y);
                Core.UIManager.updateSlider(baseId + '_z', params.z);
                Core.UIManager.updateSlider(baseId + '_deviation', params.deviation);
                Core.UIManager.updateSlider(baseId + '_resolution', params.resolution, true);
                Core.UIManager.updateSlider(baseId + '_tubeRadius', params.tubeRadius);
            }
        }
    }

    return {
        init,
        createOrUpdateArc,
        getAllArcs,
        handleSelectionChange
    };
})();