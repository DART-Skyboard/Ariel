/*
 * LEATR Session Cube · Demo — embeddable maze cube for documentation pages.
 *
 * Port of radicaldeepscale.com live-cube.js / cube.leatr.xyz Session Cube
 * buildModel() (frosted red wall panes, blue path + event nodes, traveler
 * walk). Demo-only: generates a local maze with dense example-prompt events.
 * NEVER polls GitHub, GAS, or the LEATR node bus.
 *
 * Drop onto any page:
 *   <div data-session-cube-demo style="width:100%;height:100%"></div>
 *   <script src="session-cube-demo.js" defer></script>
 *
 * Optional attributes:
 *   data-href="https://cube.leatr.xyz"  SESSION CUBE label link
 *   data-log="4"                        event log lines (0 hides)
 *   data-size="7"                       maze edge length (default 7)
 *
 * API:
 *   window.SessionCubeDemo.regenerate(el?, labels?)
 *   window.SessionCubeDemo.pulse(el?)   — restart walk + flash status
 */
(function () {
  "use strict";

  var GAS = ""; // demo-only: no Apps Script / node bus
  var THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r132/three.min.js";
  var POLL_MS = 30000; // the feed changes at most every minute or two; each poll is a GitHub read through the Apps Script bridge
  var SPIN = 0.12; // rad/s turntable
  var WALK_SPEED = 28; // path steps/s, same as the Session Cube's play
  var CUBE_SCALE_BACKOFF = 1.33; // camera pulled back so the cube reads ~25% smaller
  var COLORS = {
    corridor: "#ff5446",
    shell: "#d23c32",
    quiet: "#b3302a",
    path: "#3aa8ff",
    event: "#9fdcff",
    head: "#e6f6ff",
  };

  // Journey of the Skyboard cube: deep transparent blue walls, soft 18k gold path.
  var MINI_SCALE = 0.15;
  var MINI = {
    corridor: "#2f5dff",
    shell: "#1c3fbf",
    quiet: "#12297d",
    path: "#e9cc8c",
    event: "#fff0cf",
    head: "#fffaf0",
  };
  var JOTS_NODE_PREFIX = "jots_"; // the game's sessions on the LEATR node bus

  var FACE_STEP = {
    left: [-1, 0, 0],
    right: [1, 0, 0],
    bottom: [0, -1, 0],
    top: [0, 1, 0],
    back: [0, 0, -1],
    front: [0, 0, 1],
  };
  var FACES = ["right", "front", "top", "left", "back", "bottom"];

  function withThree(cb) {
    if (window.THREE && window.THREE.InstancedMesh) return cb(window.THREE);
    var s = document.createElement("script");
    s.src = THREE_URL;
    s.onload = function () {
      cb(window.THREE);
    };
    document.head.appendChild(s);
  }

  function readLive(path) {
    return Promise.resolve(null);
  }

  function fetchLive() {
    return Promise.resolve(null);
  }


  function key(x, y, z) {
    return x + "," + y + "," + z;
  }

  // Port of the Session Cube's buildModel(): walked path from layer 0 in
  // order, and each shared wall drawn once, classed by whether it lines the
  // path (corridor), sits on the outer shell, or neither (quiet).
  function buildModel(raw) {
    var cube = raw.cube;
    var layer = (raw.pathIndex && raw.pathIndex[0] && raw.pathIndex[0].path) || [];
    var path = layer.slice().sort(function (a, b) {
      return a.order - b.order;
    });
    var onPath = {};
    path.forEach(function (n) {
      onPath[key(n.x, n.y, n.z)] = 1;
    });
    var walls = { corridor: [], shell: [], quiet: [] };
    var w = cube.width;
    var h = cube.height;
    var d = cube.depth;
    cube.cells.forEach(function (cell) {
      if (!cell.walls) return;
      FACES.forEach(function (face) {
        if (!cell.walls[face]) return;
        if (face === "left" && cell.x !== 0) return;
        if (face === "back" && cell.z !== 0) return;
        if (face === "bottom" && cell.y !== 0) return;
        var s = FACE_STEP[face];
        var touches = onPath[key(cell.x, cell.y, cell.z)] || onPath[key(cell.x + s[0], cell.y + s[1], cell.z + s[2])];
        var shell =
          (face === "left" && cell.x === 0) ||
          (face === "right" && cell.x === w - 1) ||
          (face === "bottom" && cell.y === 0) ||
          (face === "top" && cell.y === h - 1) ||
          (face === "back" && cell.z === 0) ||
          (face === "front" && cell.z === d - 1);
        walls[touches ? "corridor" : shell ? "shell" : "quiet"].push([cell.x, cell.y, cell.z, s]);
      });
    });
    var events = [];
    path.forEach(function (n) {
      (n.events || []).forEach(function (e) {
        events.push(e);
      });
    });
    return { width: w, height: h, depth: d, path: path, walls: walls, events: events };
  }

  // Dense random maze + walk with example-prompt event markers along the path.
  // Same cell/wall/path generation the Session Cube / live-cube.js uses.
  var DEFAULT_LABELS = [
    "parentheses", "exponents", "volume", "taste", "sound",
    "maze", "puzzle", "envelope", "hammer", "stack",
    "inbound", "outbound", "verification", "allocation", "connection",
    "foundation", "reflex", "performance", "buoyancy", "shell_64",
    "ash_canvas", "natural_tools", "orders", "build", "self_analysis"
  ];

  function demoRaw(n, labels) {
    n = Math.max(4, Math.min(9, n || 7));
    labels = labels && labels.length ? labels : DEFAULT_LABELS;
    var cells = {};
    var all = [];
    for (var x = 0; x < n; x++)
      for (var y = 0; y < n; y++)
        for (var z = 0; z < n; z++) {
          var c = { x: x, y: y, z: z, walls: { left: true, right: true, top: true, bottom: true, front: true, back: true } };
          cells[key(x, y, z)] = c;
          all.push(c);
        }
    var opposite = { left: "right", right: "left", top: "bottom", bottom: "top", front: "back", back: "front" };
    var seen = {};
    var stack = [cells[key(0, 0, 0)]];
    var path = [];
    seen[key(0, 0, 0)] = 1;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      path.push({ order: path.length, x: cur.x, y: cur.y, z: cur.z, events: [] });
      var options = [];
      for (var f in FACE_STEP) {
        var s = FACE_STEP[f];
        var nk = key(cur.x + s[0], cur.y + s[1], cur.z + s[2]);
        if (cells[nk] && !seen[nk]) options.push([f, cells[nk]]);
      }
      if (!options.length) {
        stack.pop();
        continue;
      }
      var pick = options[Math.floor(Math.random() * options.length)];
      cur.walls[pick[0]] = false;
      pick[1].walls[opposite[pick[0]]] = false;
      seen[key(pick[1].x, pick[1].y, pick[1].z)] = 1;
      stack.push(pick[1]);
    }
    // Walk ~70% of the DFS trail; stamp dense example events every few steps.
    var walkLen = Math.max(8, Math.floor(path.length * 0.7));
    var walk = path.slice(0, walkLen);
    var totalEvents = 0;
    var now = Date.now();
    for (var i = 0; i < walk.length; i++) {
      // denser than live feed: ~1 event every 2–3 cells + endpoints
      if (i === 0 || i === walk.length - 1 || i % 2 === 0) {
        var lab = labels[totalEvents % labels.length];
        walk[i].events = [
          {
            label: lab,
            detail: "demo",
            ts: new Date(now + i * 420).toISOString(),
            category: "example_prompt",
          },
        ];
        totalEvents++;
      }
    }
    return {
      cube: { width: n, height: n, depth: n, cells: all },
      totalEvents: totalEvents,
      exportedAt: "demo-" + now,
      mode: "DEMO",
      pathIndex: [{ layer: 0, path: walk }],
    };
  }

  function eventLine(e) {
    var label = String(e.label || "").replace(/_/g, " ");
    var detail = e.detail != null && e.detail !== "" ? " " + e.detail : "";
    var m = /T(\d{2}:\d{2}:\d{2})/.exec(e.ts || "");
    return (m ? m[1] + "  " : "") + label + detail;
  }

  function ditherTexture(THREE) {
    // 4x4 Bayer pattern -> frosted, dithered wall panes.
    var bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    var px = 32;
    var cv = document.createElement("canvas");
    cv.width = cv.height = px;
    var g = cv.getContext("2d");
    var img = g.createImageData(px, px);
    for (var y = 0; y < px; y++)
      for (var x = 0; x < px; x++) {
        var t = bayer[(y % 4) * 4 + (x % 4)] / 16;
        var edge = x < 2 || y < 2 || x > px - 3 || y > px - 3;
        var i = (y * px + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = edge ? 255 : t < 0.45 ? 200 : 40;
      }
    g.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function mount(el, THREE) {
    var href = el.getAttribute("data-href") || "https://cube.leatr.xyz";
    var target = el.getAttribute("data-target") || "_blank";
    var logLines = Math.max(0, parseInt(el.getAttribute("data-log") || "3", 10) || 0);

    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.cursor = "grab";

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    var hud = document.createElement("div");
    hud.style.cssText =
      "position:absolute;left:10px;bottom:8px;right:10px;font:600 11px/1.45 ui-monospace,Menlo,monospace;" +
      "letter-spacing:.06em;color:#bfe6ff;text-shadow:0 1px 3px #000;pointer-events:none;text-align:left";
    var log = document.createElement("div");
    log.style.cssText = "font-weight:500;opacity:.85";
    var badge = document.createElement("div");
    badge.style.cssText = "display:flex;gap:6px;align-items:center";
    var dot = document.createElement("span");
    dot.style.cssText = "width:7px;height:7px;border-radius:50%;background:#8ea39a;display:inline-block";
    var label = document.createElement("span");
    label.textContent = "SESSION CUBE";
    badge.appendChild(dot);
    badge.appendChild(label);
    function makeLink(url, text, title) {
      var a = document.createElement("a");
      a.href = url;
      a.target = target;
      if (target === "_blank") a.rel = "noopener";
      a.textContent = text + " \u2197";
      a.title = title;
      a.style.cssText =
        "display:table;margin-top:4px;padding:3px 9px;border:1px solid rgba(58,168,255,.7);border-radius:4px;" +
        "background:rgba(7,16,20,.55);color:#e6f6ff;text-decoration:none;font-weight:700;letter-spacing:.12em;" +
        "pointer-events:auto;cursor:pointer";
      return a;
    }
    hud.appendChild(log);
    hud.appendChild(badge);
    hud.appendChild(makeLink(href, "SESSION CUBE", "Open the LEATR Session Cube"));
    var extraHref = el.getAttribute("data-link2-href");
    if (extraHref) {
      var extraText = el.getAttribute("data-link2-label") || "MORE";
      hud.appendChild(makeLink(extraHref, extraText, extraText));
    }
    el.appendChild(hud);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(3, 6, 4);
    scene.add(sun);

    var turntable = new THREE.Group();
    turntable.rotation.x = 0.18;
    scene.add(turntable);
    var content = new THREE.Group();
    turntable.add(content);
    var mini = new THREE.Group();          // the Journey of the Skyboard cube
    turntable.add(mini);
    var miniInfo = { top: new THREE.Vector3(), center: new THREE.Vector3(), m: 1 };

    // Its label: a small tag on a stem pointing down at the blue cube,
    // always facing the viewer (it's HTML, placed from the cube each frame).
    var tag = document.createElement("div");
    tag.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:none;transform:translate(-50%,-100%);text-align:center;" +
      "font:600 9px/1.35 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#fff4d6;text-shadow:0 1px 3px #000;white-space:nowrap";
    var tagBox = document.createElement("div");
    tagBox.style.cssText =
      "padding:4px 8px;border:1px solid rgba(233,204,140,.75);border-radius:4px;background:rgba(8,14,40,.72);" +
      "box-shadow:0 0 10px rgba(233,204,140,.25)";
    var tagTitle = document.createElement("div");
    tagTitle.textContent = "DART MEADOW \u00b7 JOURNEY OF THE SKYBOARD";
    tagTitle.style.cssText = "font-weight:700;color:#e9cc8c;letter-spacing:.12em";
    var tagCount = document.createElement("div");
    tagCount.textContent = "ACTIVE GAMERS ONLINE \u00b7 \u2014";
    var tagNames = document.createElement("div");
    tagNames.style.cssText = "font-weight:500;opacity:.8";
    tagBox.appendChild(tagTitle);
    tagBox.appendChild(tagCount);
    tagBox.appendChild(tagNames);
    var tagStem = document.createElement("div");
    tagStem.style.cssText = "margin:0 auto;width:1px;height:40px;background:linear-gradient(#e9cc8c,rgba(233,204,140,.15))";
    tag.appendChild(tagBox);
    tag.appendChild(tagStem);
    el.appendChild(tag);

    var dither = ditherTexture(THREE);
    function paneMat(color, opacity) {
      return new THREE.MeshBasicMaterial({
        color: color,
        map: dither,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    var wallMats = { corridor: paneMat(COLORS.corridor, 0.5), shell: paneMat(COLORS.shell, 0.26), quiet: paneMat(COLORS.quiet, 0.16) };
    var pathMat = new THREE.MeshStandardMaterial({ color: COLORS.path, emissive: COLORS.path, emissiveIntensity: 0.55, roughness: 0.4 });
    var eventMat = new THREE.MeshStandardMaterial({ color: COLORS.event, emissive: COLORS.path, emissiveIntensity: 1.0 });
    var headMat = new THREE.MeshStandardMaterial({ color: COLORS.head, emissive: COLORS.path, emissiveIntensity: 1.4 });
    var linkMat = new THREE.LineBasicMaterial({ color: COLORS.path, transparent: true, opacity: 0.35 });
    var trailMat = new THREE.LineBasicMaterial({ color: COLORS.event, transparent: true, opacity: 0.95 });
    var travelerMat = new THREE.MeshBasicMaterial({ color: COLORS.head, depthTest: false });
    var haloMat = new THREE.MeshBasicMaterial({
      color: COLORS.path,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    var wallGeo = new THREE.PlaneGeometry(0.92, 0.92);
    var nodeGeo = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    var eventGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
    var headGeo = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    var travelerGeo = new THREE.SphereGeometry(0.3, 16, 12);
    var haloGeo = new THREE.SphereGeometry(0.62, 16, 12);
    var shared = [wallGeo, nodeGeo, eventGeo, headGeo, travelerGeo, haloGeo];
    var head = null;
    var traveler = new THREE.Mesh(travelerGeo, travelerMat);
    var halo = new THREE.Mesh(haloGeo, haloMat);
    traveler.renderOrder = 10;
    halo.renderOrder = 11;
    // The walk: a traveler glides along the path at the Session Cube's play
    // speed and loops, lighting the trail behind it and logging each
    // event node as it passes.
    var walk = { pts: [], events: [], trail: null, step: 0, index: -1, flare: 0 };
    var lastKey = "";
    var lastDims = "";

    function clear() {
      while (content.children.length) {
        var child = content.children.pop();
        if (child.geometry && shared.indexOf(child.geometry) === -1) child.geometry.dispose();
        if (child.dispose) child.dispose();
      }
      head = null;
    }

    // Orbit: drag turns the cube, wheel or pinch zooms. The turntable
    // resumes a moment after the viewer lets go.
    var baseCam = new THREE.Vector3(0, 11, 29);
    var camTarget = new THREE.Vector3(0, 0, 0);
    var zoom = 1;
    var idleAt = 0;
    function placeCamera() {
      camera.position.copy(baseCam).multiplyScalar(zoom).add(camTarget);
      camera.lookAt(camTarget);
    }
    var pointers = {};
    var pinch = 0;
    function pinchDistance() {
      var ids = Object.keys(pointers);
      if (ids.length < 2) return 0;
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    var canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      pinch = pinchDistance();
      idleAt = Infinity;
      el.style.cursor = "grabbing";
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x;
      var dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        var d = pinchDistance();
        if (pinch && d) zoom = Math.max(0.45, Math.min(2.2, zoom * (pinch / d)));
        pinch = d;
        placeCamera();
        return;
      }
      turntable.rotation.y += dx * 0.008;
      turntable.rotation.x = Math.max(-1.3, Math.min(1.3, turntable.rotation.x + dy * 0.008));
    });
    function release(e) {
      delete pointers[e.pointerId];
      pinch = pinchDistance();
      if (!Object.keys(pointers).length) {
        idleAt = performance.now() + 2500;
        el.style.cursor = "grab";
      }
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        zoom = Math.max(0.45, Math.min(2.2, zoom * Math.exp(e.deltaY * 0.001)));
        placeCamera();
        idleAt = performance.now() + 2500;
      },
      { passive: false },
    );

    function frame(model) {
      var dims = model.width + "x" + model.height + "x" + model.depth;
      if (dims === lastDims) return;
      lastDims = dims;
      var span = Math.max(model.width, model.height, model.depth);
      // Fit the red cube and the blue one out at its corner (plus room for
      // the blue cube's label above it) in view as the page loads.
      var m = span * MINI_SCALE;
      var reach = Math.max(span * 0.87, Math.hypot(model.width / 2 + 1.5 * m, model.height / 2 + 1.5 * m, model.depth / 2 + 1.5 * m) + m * 0.87);
      var R = reach * 1.08;
      camTarget.set(span * 0.1, span * 0.16, 0);
      baseCam.set(0, R * 1.27, R * 3.35).multiplyScalar(CUBE_SCALE_BACKOFF);
      placeCamera();
    }

    function build(raw) {
      var model = buildModel(raw);
      var cx = (model.width - 1) / 2;
      var cy = (model.height - 1) / 2;
      var cz = (model.depth - 1) / 2;
      clear();
      frame(model);

      var m = new THREE.Object3D();
      ["quiet", "shell", "corridor"].forEach(function (kind) {
        var list = model.walls[kind];
        if (!list.length) return;
        var mesh = new THREE.InstancedMesh(wallGeo, wallMats[kind], list.length);
        list.forEach(function (f, i) {
          var s = f[3];
          m.position.set(f[0] - cx + s[0] * 0.5, f[1] - cy + s[1] * 0.5, f[2] - cz + s[2] * 0.5);
          m.rotation.set(0, 0, 0);
          if (s[0]) m.rotation.y = Math.PI / 2;
          else if (s[1]) m.rotation.x = Math.PI / 2;
          m.updateMatrix();
          mesh.setMatrixAt(i, m.matrix);
        });
        content.add(mesh);
      });

      var path = model.path;
      if (path.length) {
        var plain = [];
        var marked = [];
        path.forEach(function (n) {
          (n.events && n.events.length ? marked : plain).push(n);
        });
        [
          [plain, nodeGeo, pathMat],
          [marked, eventGeo, eventMat],
        ].forEach(function (set) {
          if (!set[0].length) return;
          var mesh = new THREE.InstancedMesh(set[1], set[2], set[0].length);
          set[0].forEach(function (n, i) {
            m.position.set(n.x - cx, n.y - cy, n.z - cz);
            m.rotation.set(0, 0, 0);
            m.updateMatrix();
            mesh.setMatrixAt(i, m.matrix);
          });
          content.add(mesh);
        });
        var pts = [];
        for (var i = 1; i < path.length; i++) {
          var a = path[i - 1];
          var b = path[i];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) !== 1) continue;
          pts.push(new THREE.Vector3(a.x - cx, a.y - cy, a.z - cz), new THREE.Vector3(b.x - cx, b.y - cy, b.z - cz));
        }
        if (pts.length) content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), linkMat));
        walk.pts = path.map(function (n) {
          return new THREE.Vector3(n.x - cx, n.y - cy, n.z - cz);
        });
        walk.events = path.map(function (n) {
          return n.events || [];
        });
        walk.trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(walk.pts), trailMat);
        walk.trail.geometry.setDrawRange(0, 0);
        content.add(walk.trail);
        if (walk.step >= walk.pts.length - 1) walk.step = 0;
        walk.index = Math.floor(walk.step) - 1;
        content.add(halo);
        content.add(traveler);
        var last = path[path.length - 1];
        head = new THREE.Mesh(headGeo, headMat);
        head.position.set(last.x - cx, last.y - cy, last.z - cz);
        content.add(head);
      }
      buildMini(model, cx, cy, cz);

    }

    var miniMats = { corridor: paneMat(MINI.corridor, 0.45), shell: paneMat(MINI.shell, 0.24), quiet: paneMat(MINI.quiet, 0.12) };
    var miniPathMat = new THREE.MeshBasicMaterial({ color: MINI.path });
    var miniEventMat = new THREE.MeshBasicMaterial({ color: MINI.event });
    var miniLinkMat = new THREE.LineBasicMaterial({ color: MINI.path, transparent: true, opacity: 0.4 });
    var miniTrailMat = new THREE.LineBasicMaterial({ color: MINI.event, transparent: true, opacity: 0.95 });
    var miniTravelerMat = new THREE.MeshBasicMaterial({ color: MINI.head, depthTest: false });
    var miniHaloMat = new THREE.MeshBasicMaterial({ color: MINI.path, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    var miniTraveler = new THREE.Mesh(travelerGeo, miniTravelerMat);
    var miniHalo = new THREE.Mesh(haloGeo, miniHaloMat);
    miniTraveler.renderOrder = 12;
    miniHalo.renderOrder = 13;
    var miniTrail = null;
    var isGame = function (e) { return e && e.category === "jots_game"; };

    // Same maze, same units, at 15%: out from the red cube's front-right-top
    // corner by one blue-cube size on every axis, so it floats clear of it.
    function buildMini(model, cx, cy, cz) {
      while (mini.children.length) {
        var ch = mini.children.pop();
        if (ch.geometry && shared.indexOf(ch.geometry) === -1) ch.geometry.dispose();
        if (ch.dispose) ch.dispose();
      }
      var span = Math.max(model.width, model.height, model.depth);
      var m = span * MINI_SCALE;
      mini.scale.setScalar(MINI_SCALE);
      mini.position.set(model.width / 2 + 1.5 * m, model.height / 2 + 1.5 * m, model.depth / 2 + 1.5 * m);
      miniInfo.m = m;
      miniInfo.top.set(0, model.height / 2 + 0.8, 0);
      var o = new THREE.Object3D();
      ["quiet", "shell", "corridor"].forEach(function (kind) {
        var list = model.walls[kind];
        if (!list.length) return;
        var mesh = new THREE.InstancedMesh(wallGeo, miniMats[kind], list.length);
        list.forEach(function (f, i) {
          var st = f[3];
          o.position.set(f[0] - cx + st[0] * 0.5, f[1] - cy + st[1] * 0.5, f[2] - cz + st[2] * 0.5);
          o.rotation.set(0, 0, 0);
          if (st[0]) o.rotation.y = Math.PI / 2;
          else if (st[1]) o.rotation.x = Math.PI / 2;
          o.updateMatrix();
          mesh.setMatrixAt(i, o.matrix);
        });
        mini.add(mesh);
      });
      var path = model.path;
      if (!path.length) return;
      var plain = [];
      var marked = [];
      path.forEach(function (n) {
        ((n.events || []).some(isGame) ? marked : plain).push(n);
      });
      [[plain, nodeGeo, miniPathMat], [marked, eventGeo, miniEventMat]].forEach(function (set) {
        if (!set[0].length) return;
        var mesh = new THREE.InstancedMesh(set[1], set[2], set[0].length);
        set[0].forEach(function (n, i) {
          o.position.set(n.x - cx, n.y - cy, n.z - cz);
          o.rotation.set(0, 0, 0);
          o.updateMatrix();
          mesh.setMatrixAt(i, o.matrix);
        });
        mini.add(mesh);
      });
      var pts = [];
      for (var i = 1; i < path.length; i++) {
        var a = path[i - 1];
        var b = path[i];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) !== 1) continue;
        pts.push(new THREE.Vector3(a.x - cx, a.y - cy, a.z - cz), new THREE.Vector3(b.x - cx, b.y - cy, b.z - cz));
      }
      if (pts.length) mini.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), miniLinkMat));
      miniTrail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(walk.pts), miniTrailMat);
      miniTrail.geometry.setDrawRange(0, 0);
      mini.add(miniTrail);
      mini.add(miniHalo);
      mini.add(miniTraveler);
    }

    // The label follows the blue cube on screen, stem pointing down at it.
    var tagV = new THREE.Vector3();
    function placeTag() {
      if (!mini.children.length) { tag.style.display = "none"; return; }
      tag.style.display = "";
      tagV.copy(miniInfo.top);
      mini.localToWorld(tagV);
      tagV.project(camera);
      var r = el.getBoundingClientRect();
      var x = (tagV.x * 0.5 + 0.5) * r.width;
      var y = (-tagV.y * 0.5 + 0.5) * r.height;
      var w = tagBox.offsetWidth || 180;
      var h = tagBox.offsetHeight || 40;
      var stem = Math.max(10, Math.min(40, y - h - 4));
      tagStem.style.height = stem + "px";
      x = Math.max(w / 2 + 4, Math.min(r.width - w / 2 - 4, x));
      tag.style.transform = "translate(" + (x - w / 2) + "px," + (y - h - stem) + "px)";
      tag.style.left = "0";
      tag.style.top = "0";
    }

    // Gamers online: the game's heartbeat on the LEATR node bus (every
    // player writes a "jots_" node through the Apps Script bridge, every 15 s
    // in story, every ~2 s in multiplayer). Read here every 20 s while the
    // page is visible.
    var gamers = {};
    var gamersLive = false;
    var gamersBusy = false;
    function refreshGamers() {
      /* demo-only: mini tag stays on example-prompt status */
      tagNames.style.display = "none";
    }
    function pollGamers() { /* demo-only: no node bus */ }
    function watchGamers() {
      tagTitle.textContent = "SESSION CUBE \u00b7 EXAMPLE PROMPT";
      tagCount.textContent = "DEMO MAZE \u00b7 NO LIVE DATA";
      tagNames.textContent = "";
      tagNames.style.display = "none";
      gamersLive = false;
    }
    watchGamers();

    function logEvent(e) {
      if (!logLines) return;
      var line = document.createElement("div");
      line.textContent = eventLine(e);
      log.appendChild(line);
      while (log.childNodes.length > logLines) log.removeChild(log.firstChild);
    }

    function advance(dt) {
      var pts = walk.pts;
      if (pts.length < 2) return;
      var limit = pts.length - 1;
      walk.step += dt * WALK_SPEED;
      if (walk.step >= limit) {
        walk.step = 0;
        walk.index = -1;
        log.innerHTML = "";
      }
      var i = Math.floor(walk.step);
      var f = walk.step - i;
      for (var k = walk.index + 1; k <= i; k++) {
        if (walk.events[k].length) {
          walk.events[k].forEach(logEvent);
          walk.flare = 1;
        }
      }
      walk.index = i;
      traveler.position.lerpVectors(pts[i], pts[Math.min(i + 1, limit)], f);
      halo.position.copy(traveler.position);
      walk.trail.geometry.setDrawRange(0, i + 2);
      miniTraveler.position.copy(traveler.position);
      miniHalo.position.copy(traveler.position);
      if (miniTrail) miniTrail.geometry.setDrawRange(0, i + 2);
      walk.flare = Math.max(0, walk.flare - dt * 2.5);
      travelerMat.color.set(walk.flare > 0.05 ? COLORS.head : COLORS.event);
      haloMat.color.set(walk.flare > 0.05 ? COLORS.head : COLORS.path);
    }

    function setStatus(live, text) {
      dot.style.background = live ? COLORS.path : "#8ea39a";
      dot.style.boxShadow = live ? "0 0 8px " + COLORS.path : "none";
      label.textContent = text;
    }

    var size = Math.max(4, Math.min(9, parseInt(el.getAttribute("data-size") || "7", 10) || 7));
    function applyDemo(labels) {
      var raw = demoRaw(size, labels);
      lastKey = raw.exportedAt;
      build(raw);
      walk.step = 0;
      walk.index = -1;
      log.innerHTML = "";
      var c = raw.cube;
      setStatus(true, "DEMO · " + c.width + "×" + c.height + "×" + c.depth + " · " + (raw.totalEvents || 0) + " EVENTS");
      tagCount.textContent = "DEMO MAZE · " + (raw.totalEvents || 0) + " EVENTS";
    }
    el._sessionCubeRegenerate = function (labels) {
      applyDemo(labels);
    };
    el._sessionCubePulse = function () {
      walk.step = 0;
      walk.index = -1;
      log.innerHTML = "";
      var prev = label.textContent;
      setStatus(true, prev.replace(/^DEMO/, "REFLEX"));
      setTimeout(function () {
        setStatus(true, label.textContent.replace(/^REFLEX/, "DEMO"));
      }, 1200);
    };
    applyDemo(null);

    function resize() {
      var r = el.getBoundingClientRect();
      var width = Math.max(1, r.width);
      var height = Math.max(1, r.height || r.width);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
    else window.addEventListener("resize", resize);

    var visible = true;
    if (window.IntersectionObserver)
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }).observe(el);

    var prev = performance.now();
    function tick(now) {
      var dt = Math.max(0, Math.min(0.1, (now - prev) / 1000));
      prev = now;
      if (visible && !document.hidden) {
        if (now >= idleAt) turntable.rotation.y += SPIN * dt;
        advance(dt);
        halo.scale.setScalar(1 + walk.flare * 0.9 + Math.sin(now / 310) * 0.1);
        miniHalo.scale.copy(halo.scale);
        if (head) {
          var s = 1 + Math.sin(now / 320) * 0.14;
          head.scale.set(s, s, s);
        }
        renderer.render(scene, camera);
        placeTag();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

  }

  function start() {
    var els = document.querySelectorAll("[data-session-cube-demo]");
    if (!els.length) return;
    withThree(function (THREE) {
      for (var i = 0; i < els.length; i++) {
        if (els[i]._liveCubeMounted) continue;
        els[i]._liveCubeMounted = true;
        mount(els[i], THREE);
      }
    });
  }


  // Embeddable maze cube for hosting inside another Three.js scene
  // (e.g. Buoyancy Node core). Same buildModel / demoRaw as the panel demo.
  // Demo-only — never polls live data.
  function buildEmbeddedGroup(THREE, opts) {
    opts = opts || {};
    var n = Math.max(4, Math.min(7, opts.size || 5));
    var worldScale = opts.scale != null ? opts.scale : 0.17;
    var group = new THREE.Group();
    var content = new THREE.Group();
    group.add(content);

    var dither = ditherTexture(THREE);
    function paneMat(color, opacity) {
      return new THREE.MeshBasicMaterial({
        color: color,
        map: dither,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    var wallMats = {
      corridor: paneMat(COLORS.corridor, 0.55),
      shell: paneMat(COLORS.shell, 0.3),
      quiet: paneMat(COLORS.quiet, 0.18),
    };
    var pathMat = new THREE.MeshBasicMaterial({ color: COLORS.path });
    var eventMat = new THREE.MeshBasicMaterial({ color: COLORS.event });
    var headMat = new THREE.MeshBasicMaterial({ color: COLORS.head });
    var linkMat = new THREE.LineBasicMaterial({ color: COLORS.path, transparent: true, opacity: 0.4 });
    var trailMat = new THREE.LineBasicMaterial({ color: COLORS.event, transparent: true, opacity: 0.95 });
    var travelerMat = new THREE.MeshBasicMaterial({ color: COLORS.head, depthTest: false });
    var haloMat = new THREE.MeshBasicMaterial({
      color: COLORS.path,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    var wallGeo = new THREE.PlaneGeometry(0.92, 0.92);
    var nodeGeo = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    var eventGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
    var headGeo = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    var travelerGeo = new THREE.SphereGeometry(0.3, 12, 10);
    var haloGeo = new THREE.SphereGeometry(0.62, 12, 10);
    var traveler = new THREE.Mesh(travelerGeo, travelerMat);
    var halo = new THREE.Mesh(haloGeo, haloMat);
    traveler.renderOrder = 10;
    halo.renderOrder = 11;
    var walk = { pts: [], events: [], step: 0, flare: 0, trail: null, index: -1 };
    var head = null;

    function clear() {
      while (content.children.length) {
        var ch = content.children.pop();
        if (ch.geometry && ch.geometry !== wallGeo && ch.geometry !== nodeGeo &&
            ch.geometry !== eventGeo && ch.geometry !== headGeo &&
            ch.geometry !== travelerGeo && ch.geometry !== haloGeo) {
          ch.geometry.dispose();
        }
      }
      walk.pts = [];
      walk.events = [];
      walk.trail = null;
      walk.index = -1;
      walk.step = 0;
      head = null;
    }

    function rebuild(labels) {
      var raw = demoRaw(n, labels);
      var model = buildModel(raw);
      var cx = (model.width - 1) / 2;
      var cy = (model.height - 1) / 2;
      var cz = (model.depth - 1) / 2;
      clear();
      var span = Math.max(model.width, model.height, model.depth);
      // Fit maze ~1.05 world units across so it reads as the buoyancy core.
      var target = opts.targetSize != null ? opts.targetSize : 1.05;
      content.scale.setScalar(target / span);
      content.position.set(0, 0, 0);

      var m = new THREE.Object3D();
      ["quiet", "shell", "corridor"].forEach(function (kind) {
        var list = model.walls[kind];
        if (!list.length) return;
        var mesh = new THREE.InstancedMesh(wallGeo, wallMats[kind], list.length);
        list.forEach(function (f, i) {
          var s = f[3];
          m.position.set(f[0] - cx + s[0] * 0.5, f[1] - cy + s[1] * 0.5, f[2] - cz + s[2] * 0.5);
          m.rotation.set(0, 0, 0);
          if (s[0]) m.rotation.y = Math.PI / 2;
          else if (s[1]) m.rotation.x = Math.PI / 2;
          m.updateMatrix();
          mesh.setMatrixAt(i, m.matrix);
        });
        content.add(mesh);
      });

      var path = model.path;
      if (path.length) {
        var plain = [];
        var marked = [];
        path.forEach(function (node) {
          (node.events && node.events.length ? marked : plain).push(node);
        });
        [
          [plain, nodeGeo, pathMat],
          [marked, eventGeo, eventMat],
        ].forEach(function (set) {
          if (!set[0].length) return;
          var mesh = new THREE.InstancedMesh(set[1], set[2], set[0].length);
          set[0].forEach(function (node, i) {
            m.position.set(node.x - cx, node.y - cy, node.z - cz);
            m.rotation.set(0, 0, 0);
            m.updateMatrix();
            mesh.setMatrixAt(i, m.matrix);
          });
          content.add(mesh);
        });
        var pts = [];
        for (var i = 1; i < path.length; i++) {
          var a = path[i - 1];
          var b = path[i];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) !== 1) continue;
          pts.push(
            new THREE.Vector3(a.x - cx, a.y - cy, a.z - cz),
            new THREE.Vector3(b.x - cx, b.y - cy, b.z - cz)
          );
        }
        if (pts.length) content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), linkMat));
        walk.pts = path.map(function (node) {
          return new THREE.Vector3(node.x - cx, node.y - cy, node.z - cz);
        });
        walk.events = path.map(function (node) {
          return node.events || [];
        });
        walk.trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(walk.pts), trailMat);
        walk.trail.geometry.setDrawRange(0, 0);
        content.add(walk.trail);
        walk.step = 0;
        walk.index = -1;
        content.add(halo);
        content.add(traveler);
        var last = path[path.length - 1];
        head = new THREE.Mesh(headGeo, headMat);
        head.position.set(last.x - cx, last.y - cy, last.z - cz);
        content.add(head);
        if (walk.pts.length) {
          traveler.position.copy(walk.pts[0]);
          halo.position.copy(walk.pts[0]);
        }
      }
      return raw;
    }

    rebuild(opts.labels || null);

    function tick(dt) {
      if (walk.pts.length < 2) return;
      walk.flare = Math.max(0, walk.flare - dt * 2.2);
      walk.step += WALK_SPEED * dt * 0.35; // a bit slower in the core
      if (walk.step >= walk.pts.length - 1) {
        walk.step = 0;
        walk.index = -1;
        if (walk.trail) walk.trail.geometry.setDrawRange(0, 0);
      }
      var i = Math.floor(walk.step);
      var f = walk.step - i;
      var a = walk.pts[i];
      var b = walk.pts[Math.min(i + 1, walk.pts.length - 1)];
      traveler.position.lerpVectors(a, b, f);
      halo.position.copy(traveler.position);
      if (walk.trail) walk.trail.geometry.setDrawRange(0, i + 2);
      if (i !== walk.index) {
        walk.index = i;
        if ((walk.events[i] || []).length) walk.flare = 1;
      }
      var pulse = 1 + walk.flare * 0.9 + Math.sin(performance.now() / 310) * 0.1;
      halo.scale.setScalar(pulse);
      if (head) {
        var s = 1 + Math.sin(performance.now() / 320) * 0.14;
        head.scale.set(s, s, s);
      }
    }

    return {
      group: group,
      regenerate: function (labels) {
        rebuild(labels || null);
      },
      pulse: function () {
        walk.step = 0;
        walk.index = -1;
        if (walk.trail) walk.trail.geometry.setDrawRange(0, 0);
        if (walk.pts.length) {
          traveler.position.copy(walk.pts[0]);
          halo.position.copy(walk.pts[0]);
        }
      },
      tick: tick,
    };
  }

  window.SessionCubeDemo = {
    buildEmbeddedGroup: buildEmbeddedGroup,
    regenerate: function (el, labels) {
      var targets = el ? [el] : Array.prototype.slice.call(document.querySelectorAll("[data-session-cube-demo]"));
      targets.forEach(function (t) {
        if (t._sessionCubeRegenerate) t._sessionCubeRegenerate(labels);
        else {
          // not mounted yet — set labels attr for first build
          if (labels && labels.length) t.setAttribute("data-labels", labels.join(","));
          start();
        }
      });
    },
    pulse: function (el) {
      var targets = el ? [el] : Array.prototype.slice.call(document.querySelectorAll("[data-session-cube-demo]"));
      targets.forEach(function (t) {
        if (t._sessionCubePulse) t._sessionCubePulse();
        else if (t._sessionCubeRegenerate) t._sessionCubeRegenerate(null);
      });
    },
    remount: start,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
