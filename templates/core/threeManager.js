// --- core/threeManager.js ---
Core.ThreeManager = (function() {
    let scene, camera, renderer, orbitControls;

    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color('#1a1a1a');
        const container = document.getElementById('canvas-container');

        camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(15, 20, 35);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('3d-canvas'), antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(20, 30, 20);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const gridHelper = new THREE.GridHelper(200, 200, 0x444444, 0x888888);
        scene.add(gridHelper);
        
        const axesHelper = new THREE.AxesHelper(10);
        axesHelper.setColors(new THREE.Color(0xff3b30), new THREE.Color(0x34c759), new THREE.Color(0x0095ff));
        scene.add(axesHelper);

        orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;

        window.addEventListener('resize', onWindowResize);
        onWindowResize(); // Set initial size
    }

    function onWindowResize() {
        const container = document.getElementById('canvas-container');
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        orbitControls.update();
        renderer.render(scene, camera);
    }

    return {
        init, animate,
        getScene: () => scene, getCamera: () => camera,
        getRenderer: () => renderer, getOrbitControls: () => orbitControls
    };
})();