// ============================================================
//  dartide/gldrivers.js — Ash Edge Language GL Driver Runtime
//  © 2025 DART Meadow | Radical Deepscale LLC. LEATR.
//
//  Loaded by the Ash Tree IDE when a script contains:
//    import (GLDrivers)
//
//  Registers window.ASH_GL — a set of node-driver functions
//  that each Ash GL node name maps to.  The LEATR compiler
//  calls ASH_GL.<NodeName>(params, ctx) after parsing a node.
//
//  Canvas target : #ash-gl-canvas  (injected into #visualizer-panel)
//  Three.js r128 is already present in ashtreeide.html.
// ============================================================

(function () {
'use strict';

// ── irin string parser: "key:val key2:val2" → object ─────────
function parseIrin(str) {
  if (!str) return {};
  const p = {};
  str.trim().split(/\s+/).forEach(tok => {
    const ci = tok.indexOf(':');
    if (ci < 1) return;
    const k = tok.slice(0, ci);
    let v  = tok.slice(ci + 1);
    if (/^0x[0-9a-fA-F]+$/.test(v)) v = parseInt(v, 16);
    else if (v === 'true')  v = true;
    else if (v === 'false') v = false;
    else if (!isNaN(v) && v !== '') v = parseFloat(v);
    p[k] = v;
  });
  return p;
}

// ── Canvas setup ─────────────────────────────────────────────
function ensureCanvas() {
  let canvas = document.getElementById('ash-gl-canvas');
  if (canvas) return canvas;

  const panel = document.getElementById('visualizer-panel');
  if (!panel) { console.warn('[ASH_GL] #visualizer-panel not found'); return null; }

  // Header
  const hdr = panel.querySelector('.panel-header');
  if (hdr) hdr.textContent = '3D Visualizer — ASH_GL Runtime';

  // Canvas wrapper
  const wrap = document.createElement('div');
  wrap.id = 'ash-gl-wrap';
  wrap.style.cssText = 'position:relative;width:100%;height:100%;min-height:200px;background:#000814;overflow:hidden;';

  canvas = document.createElement('canvas');
  canvas.id = 'ash-gl-canvas';
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  wrap.appendChild(canvas);

  // HUD overlay div
  const hud = document.createElement('div');
  hud.id = 'ash-gl-hud';
  hud.style.cssText = `
    position:absolute;top:8px;left:10px;pointer-events:none;
    font-family:'Courier New',monospace;font-size:0.65rem;
    color:rgba(0,255,204,0.7);line-height:1.6;`;
  wrap.appendChild(hud);

  panel.appendChild(wrap);
  return canvas;
}

// ── Shared scene context ──────────────────────────────────────
const _ctx = {
  scene:    null,
  renderer: null,
  camera:   null,
  controls: null,
  meshes:   {},
  animFns:  [],
  rafId:    null,
  clock:    null,
  started:  false
};

function _stopLoop() {
  if (_ctx.rafId) { cancelAnimationFrame(_ctx.rafId); _ctx.rafId = null; }
}
function _startLoop() {
  if (_ctx.started) return;
  _ctx.started = true;
  _ctx.clock = new THREE.Clock();
  let frames = 0, last = performance.now(), fps = 0;
  function loop() {
    _ctx.rafId = requestAnimationFrame(loop);
    const t = _ctx.clock.getElapsedTime();
    frames++;
    const now = performance.now();
    if (now - last >= 1000) { fps = frames; frames = 0; last = now; }
    _ctx.animFns.forEach(fn => fn(t, fps));
    if (_ctx.controls) _ctx.controls.update();
    if (_ctx.renderer && _ctx.scene && _ctx.camera)
      _ctx.renderer.render(_ctx.scene, _ctx.camera);
  }
  loop();
}

// ── Resize observer ───────────────────────────────────────────
function _watchResize(canvas) {
  const ro = new ResizeObserver(() => {
    if (!_ctx.renderer || !_ctx.camera) return;
    const w = canvas.clientWidth, h = canvas.clientHeight || 200;
    _ctx.renderer.setSize(w, h, false);
    _ctx.camera.aspect = w / h;
    _ctx.camera.updateProjectionMatrix();
  });
  ro.observe(canvas.parentElement || canvas);
}

// ============================================================
//  NODE DRIVERS
// ============================================================

const ASH_GL = {};

// ── ThreeScene ───────────────────────────────────────────────
ASH_GL.ThreeScene = function (irinStr) {
  _stopLoop();
  Object.assign(_ctx, { scene:null, renderer:null, camera:null, controls:null,
                         meshes:{}, animFns:[], rafId:null, clock:null, started:false });

  const p  = parseIrin(irinStr);
  const canvas = ensureCanvas();
  if (!canvas) return;

  _ctx.scene    = new THREE.Scene();
  _ctx.scene.background = new THREE.Color(typeof p.background === 'number' ? p.background : 0x000814);
  if (p.fog) _ctx.scene.fog = new THREE.FogExp2(_ctx.scene.background, 0.04);

  _ctx.renderer = new THREE.WebGLRenderer({ canvas, antialias: p.antialias !== false });
  _ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _ctx.renderer.shadowMap.enabled = true;
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 280;
  _ctx.renderer.setSize(w, h, false);

  const fov = p.fov || 60;
  _ctx.camera = new THREE.PerspectiveCamera(fov, w / h, p.near || 0.1, p.far || 1000);
  _ctx.camera.position.set(p.px || 0, p.py || 2, p.pz || 8);

  try {
    _ctx.controls = new THREE.OrbitControls
      ? new THREE.OrbitControls(_ctx.camera, canvas)
      : null;
    if (_ctx.controls) {
      _ctx.controls.enableDamping = true;
      _ctx.controls.dampingFactor = 0.08;
    }
  } catch(e) { _ctx.controls = null; }

  _watchResize(canvas);
  _ctx.log('[ThreeScene] Scene initialized');
};

// ── CameraNode ───────────────────────────────────────────────
ASH_GL.CameraNode = function (irinStr) {
  const p = parseIrin(irinStr);
  if (!_ctx.camera) return;
  _ctx.camera.fov = p.fov || 60;
  _ctx.camera.position.set(p.px || 0, p.py || 2, p.pz || 8);
  _ctx.camera.updateProjectionMatrix();
  if (p.orbit === false && _ctx.controls) { _ctx.controls.dispose(); _ctx.controls = null; }
  _ctx.log('[CameraNode] Camera positioned');
};

// ── LightNode ─────────────────────────────────────────────────
ASH_GL.LightNode = function (irinStr) {
  const p = parseIrin(irinStr);
  if (!_ctx.scene) return;
  const amb = new THREE.AmbientLight(
    typeof p.ambient === 'number' ? p.ambient : 0x223344, p.aint || 0.8);
  const dir = new THREE.DirectionalLight(
    typeof p.dir === 'number' ? p.dir : 0xffffff, p.intensity || 1.4);
  dir.position.set(p.dx || 5, p.dy || 10, p.dz || 7);
  dir.castShadow = true;
  _ctx.scene.add(amb, dir);
  _ctx.log('[LightNode] Lights added');
};

// ── GeometryNode ─────────────────────────────────────────────
ASH_GL.GeometryNode = function (irinStr) {
  const p = parseIrin(irinStr);
  const seg = p.seg || 32;
  const map = {
    box:          () => new THREE.BoxGeometry(p.w||1, p.h||1, p.d||1),
    sphere:       () => new THREE.SphereGeometry(p.r||1, seg, seg),
    torus:        () => new THREE.TorusGeometry(p.r||1.2, p.tube||0.4, seg, seg*2),
    cylinder:     () => new THREE.CylinderGeometry(p.r||0.8, p.r||0.8, p.h||2, seg),
    plane:        () => new THREE.PlaneGeometry(p.w||4, p.h||4, seg, seg),
    icosahedron:  () => new THREE.IcosahedronGeometry(p.r||1, p.detail||1),
    cone:         () => new THREE.ConeGeometry(p.r||1, p.h||2, seg)
  };
  const type = p.type || 'box';
  const geo  = (map[type] || map.box)();
  ASH_GL._lastGeometry = geo;
  _ctx.log(`[GeometryNode] ${type} geometry created`);
  return geo;
};

// ── MaterialNode ─────────────────────────────────────────────
ASH_GL.MaterialNode = function (irinStr) {
  const p = parseIrin(irinStr);
  const color    = typeof p.color    === 'number' ? p.color    : 0x00ffcc;
  const emissive = typeof p.emissive === 'number' ? p.emissive : 0x003322;
  let mat;
  const type = p.type || 'standard';
  if (type === 'phong') {
    mat = new THREE.MeshPhongMaterial({ color, emissive, shininess: p.shininess || 60 });
  } else if (type === 'basic' || type === 'wireframe') {
    mat = new THREE.MeshBasicMaterial({ color, wireframe: type === 'wireframe' || !!p.wire });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color, emissive,
      emissiveIntensity: p.emint     || 0.4,
      metalness:         p.metalness || 0.6,
      roughness:         p.roughness || 0.3,
      wireframe:         !!p.wire
    });
    if (p.opacity < 1) { mat.transparent = true; mat.opacity = p.opacity; }
  }
  ASH_GL._lastMaterial = mat;
  _ctx.log(`[MaterialNode] ${type} material created`);
  return mat;
};

// ── MeshNode ─────────────────────────────────────────────────
ASH_GL.MeshNode = function (irinStr, name) {
  const p   = parseIrin(irinStr);
  const geo = ASH_GL._lastGeometry || new THREE.SphereGeometry(1, 32, 32);
  const mat = ASH_GL._lastMaterial || new THREE.MeshStandardMaterial({ color: 0x00ffcc });
  if (!_ctx.scene) return;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(p.px || 0, p.py || 0, p.pz || 0);
  mesh.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
  mesh.scale.setScalar(p.sc || 1);
  mesh.castShadow    = p.shadow  !== false;
  mesh.receiveShadow = p.rshadow !== false;
  const meshName = name || p.name || ('mesh_' + Object.keys(_ctx.meshes).length);
  _ctx.meshes[meshName] = mesh;
  _ctx.scene.add(mesh);
  _ctx.log(`[MeshNode] "${meshName}" added to scene`);
  return mesh;
};

// ── AnimateNode ───────────────────────────────────────────────
ASH_GL.AnimateNode = function (irinStr) {
  const p      = parseIrin(irinStr);
  const target = p.target || Object.keys(_ctx.meshes)[0];
  const rx = p.rx || 0, ry = p.ry || 0.01, rz = p.rz || 0;
  const osc = p.osc || 0, amp = p.amp || 0.5, spd = p.spd || 1.0;
  const hud = document.getElementById('ash-gl-hud');

  _ctx.animFns.push((t, fps) => {
    const mesh = _ctx.meshes[target];
    if (mesh) {
      mesh.rotation.x += rx;
      mesh.rotation.y += ry;
      mesh.rotation.z += rz;
      if (osc) mesh.position.y = Math.sin(t * spd) * amp;
    }
    if (hud) hud.textContent = `FPS: ${fps}  t: ${t.toFixed(2)}`;
  });
  _ctx.log(`[AnimateNode] Animation attached to "${target}"`);
};

// ── ShaderNode ────────────────────────────────────────────────
ASH_GL.ShaderNode = function (irinStr) {
  const p     = parseIrin(irinStr);
  const color = typeof p.color === 'number' ? p.color : 0x00ffcc;
  const c     = new THREE.Color(color);
  const presets = {
    glow: {
      uniforms: { uTime:{ value:0 }, uColor:{ value: c } },
      vertexShader: `varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vNormal; void main(){ float rim=1.0-abs(dot(vNormal,vec3(0,0,1))); gl_FragColor=vec4(uColor*rim*1.8+uColor*0.2,1.0); }`
    },
    pulse: {
      uniforms: { uTime:{ value:0 }, uColor:{ value: c } },
      vertexShader: `varying vec3 vNormal; varying vec3 vPos; void main(){ vNormal=normal; vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vNormal; void main(){ float p=sin(uTime*2.0)*0.5+0.5; gl_FragColor=vec4(uColor*p,1.0); }`
    },
    wave: {
      uniforms: { uTime:{ value:0 }, uColor:{ value: c } },
      vertexShader: `varying vec2 vUv; uniform float uTime; void main(){ vUv=uv; vec3 p=position; p.z+=sin(p.x*3.0+uTime)*0.2; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main(){ gl_FragColor=vec4(uColor*(0.5+vUv.y*0.5),1.0); }`
    }
  };
  const preset = presets[p.preset] || presets.glow;
  const mat    = new THREE.ShaderMaterial({ ...preset, transparent: true });
  _ctx.animFns.push((t) => { if (mat.uniforms.uTime) mat.uniforms.uTime.value = t; });
  ASH_GL._lastMaterial = mat;
  _ctx.log(`[ShaderNode] "${p.preset||'glow'}" shader created`);
  return mat;
};

// ── ParticleNode ──────────────────────────────────────────────
ASH_GL.ParticleNode = function (irinStr) {
  const p      = parseIrin(irinStr);
  const count  = p.count  || 2000;
  const spread = p.spread || 8;
  const size   = p.size   || 0.06;
  const speed  = p.speed  || 0.3;
  const color  = typeof p.color === 'number' ? p.color : 0x00ffcc;
  if (!_ctx.scene) return;

  const positions = new Float32Array(count * 3);
  const vels      = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i*3]   = (Math.random()-0.5)*spread;
    positions[i*3+1] = (Math.random()-0.5)*spread;
    positions[i*3+2] = (Math.random()-0.5)*spread;
    vels[i*3+1] = (Math.random()*0.5+0.5) * speed;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation:true, transparent:true, opacity:0.75 });
  const pts = new THREE.Points(geo, mat);
  _ctx.scene.add(pts);

  const half = spread / 2;
  _ctx.animFns.push(() => {
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i*3+1] += vels[i*3+1] * 0.016;
      if (pos[i*3+1] > half) pos[i*3+1] = -half;
    }
    geo.attributes.position.needsUpdate = true;
  });
  _ctx.log(`[ParticleNode] ${count} particles initialized`);
};

// ── UIOverlayNode ─────────────────────────────────────────────
ASH_GL.UIOverlayNode = function (irinStr) {
  const p   = parseIrin(irinStr);
  const hud = document.getElementById('ash-gl-hud');
  if (!hud) return;
  hud.innerHTML = `<span style="color:#00ffcc;font-weight:bold">${p.label||'ASH_GL'}</span>`;
  if (p.fps !== false) {
    _ctx.animFns.push((t, fps) => {
      hud.innerHTML = `<span style="color:#00ffcc">${p.label||'ASH_GL'}</span>` +
        `&nbsp;&nbsp;<span style="color:#ffd700">FPS: ${fps}</span>` +
        (p.stats ? `&nbsp;&nbsp;<span style="color:#bf5fff">t: ${t.toFixed(1)}s</span>` : '');
    });
  }
  _ctx.log('[UIOverlayNode] HUD overlay active');
};

// ── GLBLoader ────────────────────────────────────────────────
ASH_GL.GLBLoader = function (irinStr) {
  const p = parseIrin(irinStr);
  if (!_ctx.scene) return;
  if (typeof THREE.GLTFLoader === 'undefined') {
    _ctx.log('[GLBLoader] GLTFLoader not available in this build — use ashtreeide with Three.js addons');
    return;
  }
  const loader = new THREE.GLTFLoader();
  loader.load(p.url || '', gltf => {
    if (p.center !== false) {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const c   = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(c);
    }
    gltf.scene.scale.setScalar(p.scale || 1);
    _ctx.scene.add(gltf.scene);
    _ctx.log(`[GLBLoader] Model loaded: ${p.url}`);
  }, undefined, err => _ctx.log(`[GLBLoader] Error: ${err.message}`));
};

// ── Start render loop (called after all nodes processed) ──────
ASH_GL.startRenderLoop = function () {
  _startLoop();
  _ctx.log('[ASH_GL] Render loop started');
};

// ── Internal log helper ───────────────────────────────────────
_ctx.log = function (msg) {
  const dartOut = document.getElementById('dart-output-panel');
  if (dartOut) {
    const p = document.createElement('p');
    p.className = 'output-gl';
    p.style.color = '#00e5ff';
    p.textContent = msg;
    dartOut.appendChild(p);
    dartOut.scrollTop = dartOut.scrollHeight;
  }
  console.log('%c' + msg, 'color:#00ffcc');
};

// ── ArcEdgeNode ─────────────────────────────────────────────
// Implements Arc Edge math from LEATR documentation (Justin Craig Venable)
//
// ArcEdge Section 1 (Builder):  y = ((x*2)+1)/x   z = x + y + ((x*2)+1)/x
// ArcEdge Section 2 (Measure):  circumference = sqrt((d*3)^2)   area = circ^2
//                                sphere_vol = area^3             sphere_sa = vol*0.25
// ArcEdge Section 3:            arc length via 1/8-circle (0.125) triangulation
//
// Each arc segment is 1/8 of a circle (xc = 0.125 of circumference)
// Branches are generated using the ArcEdge Builder formula to space them
ASH_GL.ArcEdgeNode = function(irinStr, name) {
  const p = parseIrin(irinStr);
  if (!_ctx.scene) return;

  const group = new THREE.Group();
  const d     = p.d    || 2;       // base diameter for circumference calc
  const segs  = p.segs || 16;      // arc tube segments
  const levels= p.levels|| 5;      // branch levels (depth of ash tree)
  const color = typeof p.color === 'number' ? p.color : 0x00ffcc;
  const emissive = typeof p.emissive === 'number' ? p.emissive : 0x003322;
  const wire  = !!p.wire;

  // ── Arc Edge math functions ──────────────────────────────────
  // Circumference: sqrt((d*3)^2)
  const arcCirc    = (diam) => Math.sqrt(Math.pow(diam * 3, 2));
  // Area: circ^2
  const arcArea    = (diam) => Math.pow(arcCirc(diam), 2);
  // Sphere volume: area^3
  const arcVol     = (diam) => Math.pow(arcArea(diam), 3);
  // Sphere surface area: vol * 0.25
  const arcSphSA   = (diam) => arcVol(diam) * 0.25;

  // ArcEdge Builder — produces branch spacing:  y = ((x*2)+1)/x
  const arcBuilder = (x)   => ((x * 2) + 1) / x;
  // ArcLength via 1/8-circle triangulation
  // xc = 0.125 * circumference (1/8 of circle)
  const arcLength  = (diam) => 0.125 * arcCirc(diam);

  // ── Shared arc material ──────────────────────────────────────
  const mat = wire
    ? new THREE.MeshBasicMaterial({ color, wireframe: true })
    : new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: 0.5,
        metalness: 0.4, roughness: 0.35
      });

  // ── Recursive arc-branch generator ──────────────────────────
  // Each branch is an arc (tube along a curved path) sized by ArcEdge math
  function buildBranch(level, parentPos, parentDir, parentDiam) {
    if (level > levels) return;

    const diam    = parentDiam * 0.62;          // taper each level
    const circ    = arcCirc(diam);
    const arcLen  = arcLength(diam);            // 1/8 of circle = one arc segment
    const spacing = arcBuilder(Math.max(diam, 0.01)); // ArcEdge Builder spacing
    const tubeR   = Math.max(diam * 0.08, 0.02);

    // Build arc curve — 1/8 circle sweep upward, fanned by level angle
    const sweepAngle = Math.PI * 0.25;         // 45° = 1/8 of full circle
    const numBranches = level === 1 ? 1 : (level < 3 ? 3 : (level < 5 ? 5 : 7));

    for (let b = 0; b < numBranches; b++) {
      // Fan angle: distribute branches around parent direction
      const fanAngle  = numBranches > 1
        ? (b / (numBranches - 1) - 0.5) * (Math.PI * 0.75)
        : 0;
      // Build arc path points using ArcEdge 1/8-circle segments
      const points = [];
      const arcSegs = segs;
      for (let s = 0; s <= arcSegs; s++) {
        const t = s / arcSegs;
        const angle = t * sweepAngle;
        // x: lateral fan spread using ArcEdge builder ratio
        const lateralR = arcLen * spacing * 0.5 * Math.sin(fanAngle);
        const x = parentPos.x + Math.sin(angle) * lateralR;
        // y: upward arc, length determined by arcLength (1/8 circ)
        const y = parentPos.y + Math.sin(angle) * arcLen;
        // z: depth spread
        const z = parentPos.z + Math.cos(fanAngle) * Math.sin(angle) * arcLen * 0.4;
        points.push(new THREE.Vector3(x, y, z));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const geo   = new THREE.TubeGeometry(curve, arcSegs, tubeR, 6, false);
      const mesh  = new THREE.Mesh(geo, mat);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Recurse from tip of this arc
      const tipPt = points[points.length - 1];
      const tipDir = new THREE.Vector3(0, 1, 0);
      buildBranch(level + 1, tipPt, tipDir, diam);
    }
  }

  // ── Build trunk (Level 1) as single vertical arc ─────────────
  const trunkDiam  = d;
  const trunkCirc  = arcCirc(trunkDiam);
  const trunkLen   = arcLength(trunkDiam) * 3;  // trunk = 3× arc segment
  const trunkTubeR = trunkDiam * 0.12;
  const trunkPts   = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // Gentle S-curve: slight lean using ArcEdge builder
    const lean = arcBuilder(trunkDiam) * 0.05;
    trunkPts.push(new THREE.Vector3(
      Math.sin(t * Math.PI * 0.2) * lean,
      t * trunkLen,
      0
    ));
  }
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
  const trunkGeo   = new THREE.TubeGeometry(trunkCurve, segs, trunkTubeR, 8, false);
  const trunkMesh  = new THREE.Mesh(trunkGeo, mat);
  trunkMesh.castShadow = true;
  group.add(trunkMesh);

  // ── Branch from trunk top ────────────────────────────────────
  const trunkTip = trunkPts[trunkPts.length - 1];
  buildBranch(2, trunkTip, new THREE.Vector3(0, 1, 0), trunkDiam * 0.72);

  // Position and name the group
  group.position.set(p.px || 0, p.py || -2, p.pz || 0);
  const meshName = name || p.name || 'ashTree';
  _ctx.meshes[meshName] = group;
  _ctx.scene.add(group);

  // Slow ambient rotation in animate loop
  const rx = p.rx || 0, ry = p.ry || 0.003, rz = p.rz || 0;
  if (rx || ry || rz) {
    _ctx.animFns.push(() => {
      group.rotation.x += rx;
      group.rotation.y += ry;
      group.rotation.z += rz;
    });
  }

  _ctx.log(`[ArcEdgeNode] Ash Tree built — ${levels} branch levels, d=${d}, arcLen=${arcLength(d).toFixed(3)}, circ=${arcCirc(d).toFixed(3)}`);
  return group;
};

// ── Expose globally ───────────────────────────────────────────
window.ASH_GL         = ASH_GL;
// ArcEdgeNode registered — accessible as ASH_GL.ArcEdgeNode
window.ASH_GL_CTX     = _ctx;
window.ASH_GL_DRIVERS = true;

console.log('%c[ASH_GL] GL Drivers v1.0 loaded — import (GLDrivers) ready', 'color:#00ffcc;font-weight:bold');

})();
