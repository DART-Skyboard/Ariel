// --- core/selectionManager.js ---
Core.SelectionManager = (function() {
    let selectedObject = null;
    const listeners = [];

    function init() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        Core.ThreeManager.getRenderer().domElement.addEventListener('pointerdown', (event) => {
            // Ignore clicks on the transform gizmo
            if (event.target.tagName.toLowerCase() !== 'canvas') return;

            const bounds = event.target.getBoundingClientRect();
            mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
            mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
            raycaster.setFromCamera(mouse, Core.ThreeManager.getCamera());

            const intersects = raycaster.intersectObjects(Core.ThreeManager.getScene().children, true);
            let newSelection = null;
            if (intersects.length > 0) {
                let obj = intersects[0].object;
                while (obj) {
                    if (obj.userData.isSelectable) { newSelection = obj; break; }
                    obj = obj.parent;
                }
            }
            selectObject(newSelection);
        });
    }

    function selectObject(object) {
        if (selectedObject === object) return;

        if (selectedObject && selectedObject.material.emissive) {
            selectedObject.material.emissive.setHex(selectedObject.userData.originalEmissive || 0x000000);
        }

        selectedObject = object;

        if (selectedObject && selectedObject.material.emissive) {
            selectedObject.userData.originalEmissive = selectedObject.material.emissive.getHex();
            selectedObject.material.emissive.setHex(0xaaaa00); // Yellowish glow
        }
        
        listeners.forEach(cb => cb(selectedObject));
    }
    
    return {
        init,
        addSelectionChangeListener: (cb) => listeners.push(cb),
        getSelectedObject: () => selectedObject
    };
})();