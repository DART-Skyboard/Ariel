// --- modules/arcGenerator.js ---
Modules.ArcGenerator = (function() {
    let arcs = [null, null, null, null];
    const defaultParams = { x: 0, y: 0, z: 10, deviation: 1.5, resolution: 32 };

    function init() {
        let controlsHtml = '<h3>Arc Generator</h3>';
        for (let i = 1; i <= 3; i++) {
            controlsHtml += `
                <fieldset>
                    <legend>Arc ${i}</legend>
                    ${Core.UIManager.createRangeSlider(`arc${i}_x`, 'X:', -20, 20, 0.1, defaultParams.z)}
                    ${Core.UIManager.createRangeSlider(`arc${i}_dev`, 'Dev:', 0, 5, 0.1, defaultParams.deviation)}
                    ${Core.UIManager.createRangeSlider(`arc${i}_res`, 'Res:', 8, 128, 1, defaultParams.resolution)}
                    <div class="action-buttons-row">
                        ${Core.UIManager.createButton(`createArc${i}Btn`, `Create Arc ${i}`)}
                    </div>
                </fieldset>`;
        }
        Core.UIManager.registerControls('ArcGenerator', controlsHtml);

        for (let i = 1; i <= 3; i++) {
            document.getElementById(`createArc${i}Btn`).addEventListener('click', () => createOrUpdateArc(i));
        }

        document.querySelectorAll('#arc-generator-controls input[type="range"]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                e.target.nextElementSibling.textContent = parseFloat(e.target.value).toFixed(1);
            });
        });
    }

    function createOrUpdateArc(index, manualParams) {
        let params;
        if (manualParams) {
            params = manualParams;
        } else {
            params = {
                x: parseFloat(document.getElementById(`arc${index}_x`).value),
                deviation: parseFloat(document.getElementById(`arc${index}_dev`).value),
                resolution: parseInt(document.getElementById(`arc${index}_res`).value),
                y: 0, z: 0 // Assume default y/z from base settings
            };
        }
        const finalParams = { ...defaultParams, ...params, tubeRadius: 0.1 };

        if (arcs[index]) Core.ThreeManager.getScene().remove(arcs[index]);

        const points = [];
        for (let i = 0; i <= finalParams.resolution; i++) {
            const t = i / finalParams.resolution;
            const y = (t * finalParams.y) + Math.sin(3 * t) * finalParams.deviation;
            points.push(new THREE.Vector3(t * finalParams.x, y, t * finalParams.z));
        }
        const path = new THREE.CatmullRomCurve3(points);
        const geo = new THREE.TubeGeometry(path, finalParams.resolution, finalParams.tubeRadius, 8, false);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0095ff, metalness: 0.2, roughness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `Arc ${index}`;
        mesh.userData = { isSelectable: true, module: 'ArcGenerator', arcParams: finalParams };
        mesh.castShadow = true;
        arcs[index] = mesh;
        Core.ThreeManager.getScene().add(mesh);
    }
    return { init, createOrUpdateArc, getAllArcs: () => arcs.filter(Boolean) };
})();