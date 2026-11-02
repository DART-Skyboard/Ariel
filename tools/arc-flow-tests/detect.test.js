// Geometry check for joint detection (detectPenetrationJoint / detectAutoPenetrationJoints) on synthetic meshes.
// Needs three.js: `npm i three@0.160.0` somewhere resolvable, or THREE_PATH=/path/to/three.module.js. Skips if absent.
// Set ARC_FLOW_HTML=<file> to run the same cases against another revision (e.g. `git show main:templates/arc-flow.html`).
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ex = require('./extract');
const file = process.env.ARC_FLOW_HTML || ex.HTML;
const src = fs.readFileSync(file, 'utf8');

async function loadThree() {
  const cands = [process.env.THREE_PATH, '/tmp/t3/node_modules/three/build/three.module.js'].filter(Boolean);
  try { cands.unshift(require.resolve('three/build/three.module.js')); } catch (_) {}
  for (const c of cands) if (fs.existsSync(c)) return await import(require('url').pathToFileURL(c).href);
  return null;
}

(async () => {
  const THREE = await loadThree();
  if (!THREE) { console.log('skip - three.js not found (npm i three@0.160.0 or set THREE_PATH)'); return; }
  const ctx = { THREE, console, Math, Infinity, state: { parts: [] } };
  vm.createContext(ctx);
  const names = ['worldTrianglesForPart', 'partWorldAABB', 'penIndexForPart', 'signedDistanceToMesh', 'buildTriangleSpatialIndex',
    'findNearestTriangleIndices', 'closestPointOnTriangle', 'subdivideLargeTris', 'cavitiesAreConnected', 'refineThinOverlap',
    'detectPenetrationJoint', 'detectAutoPenetrationJoints'];
  let code = ['PEN_SAMPLE_RES', 'PEN_REFINE_CANDIDATES', 'PEN_REFINE_LEVELS', 'PEN_MIN_OVERLAP', 'SDF_VIRTUAL_EDGE_VOXELS',
    'SDF_VIRTUAL_EDGE_CELLS', 'SDF_VIRTUAL_PHONG_ALPHA', 'SDF_VIRTUAL_EXTRA_TRI_CAP'].map(n => { try { return ex.constLine(src, n); } catch (_) { return ''; } }).join('\n');
  code += '\nlet _worldTriCache = new WeakMap(), _penIndexCache = new WeakMap();\n';
  for (const n of names) { try { code += ex.fn(src, n) + '\n'; } catch (_) { /* older revisions lack refineThinOverlap */ } }
  // Pull in any other top-level helper the extracted code references (closure over module scope in the app).
  // Single-line top-level constants the extracted code references (resolved lazily at call time in the app).
  const have = new Set(code.match(/^(?:const|let) (\w+)/gm).map(l => l.split(' ')[1]).concat(['_worldTriCache', '_penIndexCache']));
  for (let again = true; again;) {
    again = false;
    for (const m of src.matchAll(/^(?:const|let) (\w+) = [^\n]*;.*$/gm)) {
      if (have.has(m[1]) || !new RegExp('\\b' + m[1] + '\\b').test(code)) continue;
      have.add(m[1]); code = m[0] + '\n' + code; again = true;
    }
  }
  const helpers = new Set();
  for (let pass = 0; pass < 4; pass++) {
    try { vm.runInContext(code + '\nthis.api={detectPenetrationJoint,detectAutoPenetrationJoints};', ctx); break; }
    catch (e) {
      const m = /^(\w+) is not defined/.exec(e.message);
      if (!m || helpers.has(m[1])) throw e;
      helpers.add(m[1]);
      let add = ''; try { add = ex.fn(src, m[1]); } catch (_) { try { add = ex.constLine(src, m[1]); } catch (_) { throw e; } }
      code = add + '\n' + code;
    }
  }
  const api = ctx.api;
  const mk = (name, type, geo, x, y, z) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.position.set(x, y, z);
    mesh.updateMatrixWorld(true);
    return { name, type, meshes: [mesh] };
  };
  const detect = (a, b) => api.detectAutoPenetrationJoints([a, b]).sealedPairs.length;
  let n = 0; const test = (t, f) => { f(); n++; console.log('ok - ' + t); };

  test('pipe pushed through a tank wall is a joint', () => {
    const tank = mk('tank', 'container', new THREE.SphereGeometry(2, 32, 24), 0, 0, 0);
    const pipe = mk('pipe', 'pipe', new THREE.CylinderGeometry(0.15, 0.15, 3, 16).rotateZ(Math.PI / 2), 2.4, 0, 0); // tip ~0.9 inside
    assert.strictEqual(detect(tank, pipe), 1);
  });
  test('thin pipe tip only just inside the wall is still found (refinement, not an AABB guess)', () => {
    const tank = mk('tank', 'container', new THREE.SphereGeometry(2, 32, 24), 0, 0, 0);
    const pipe = mk('pipe', 'pipe', new THREE.CylinderGeometry(0.1, 0.1, 2, 16).rotateZ(Math.PI / 2), 2.75, 0, 0); // tip at x=1.75 (0.25 deep, 0.2 wide: just over PEN_MIN_OVERLAP)
    assert.strictEqual(detect(tank, pipe), 1);
  });
  test('pipe in the corner of the tank AABB but outside the real cavity is NOT a joint (false helium hit)', () => {
    const tank = mk('He', 'container', new THREE.SphereGeometry(2, 32, 24), 0, 0, 0);
    const pipe = mk('feed', 'pipe', new THREE.CylinderGeometry(0.1, 0.1, 3, 16).rotateX(Math.PI / 2), 1.6, 1.6, 0); // 2.26 from the axis > r=2
    assert.ok(tank.meshes && api.detectAutoPenetrationJoints([tank, pipe]));
    assert.strictEqual(detect(tank, pipe), 0);
  });
  test('disjoint parts and mesh-less parts do not throw or link', () => {
    const tank = mk('t', 'container', new THREE.SphereGeometry(2, 16, 12), 0, 0, 0);
    const far = mk('p', 'pipe', new THREE.CylinderGeometry(0.1, 0.1, 1, 8), 20, 0, 0);
    const empty = { name: 'e', type: 'pipe', meshes: [] };
    const pts = { name: 'pts', type: 'pipe', meshes: [new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)]))] };
    assert.strictEqual(api.detectAutoPenetrationJoints([tank, far, empty, pts]).sealedPairs.length, 0);
  });
  console.log(`\n${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
