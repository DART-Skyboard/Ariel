// Per-instance Boolean joints / system grouping / tagFlowGraph / LTCBP regions for CLONED assemblies, with real three.js
// geometry. Needs three.js (see detect.test.js); skips if absent. `node tools/arc-flow-tests/boolean-instances.test.js`
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ex = require('./extract');
const src = fs.readFileSync(ex.HTML, 'utf8');

async function loadThree() {
  const cands = [process.env.THREE_PATH, '/tmp/t3/node_modules/three/build/three.module.js'].filter(Boolean);
  try { cands.unshift(require.resolve('three/build/three.module.js')); } catch (_) {}
  for (const c of cands) if (fs.existsSync(c)) return await import(require('url').pathToFileURL(c).href);
  return null;
}

(async () => {
  const THREE = await loadThree();
  if (!THREE) { console.log('skip - three.js not found (npm i three@0.160.0 or set THREE_PATH)'); return; }
  const ctx = { THREE, console, Math, Infinity, state: { parts: [], instances: [], systemGrouping: null, currentLinks: null }, refreshAllOpenings() {}, renderChannelFlowReport() {} };
  vm.createContext(ctx);
  const names = ['worldTrianglesForPart', 'partWorldAABB', 'penIndexForPart', 'signedDistanceToMesh', 'buildTriangleSpatialIndex', 'findNearestTriangleIndices',
    'closestPointOnTriangle', 'subdivideLargeTris', 'cavitiesAreConnected', 'refineThinOverlap', 'penFrameAABB', 'penMinOverlap', 'detectPenetrationJoint', 'detectAutoPenetrationJoints',
    'collectJointRegions'];
  let code = ['PEN_SAMPLE_RES', 'PEN_REFINE_CANDIDATES', 'PEN_REFINE_LEVELS', 'PEN_MIN_OVERLAP', 'PEN_MIN_OVERLAP_FRAC', 'PEN_MIN_OVERLAP_FLOOR', 'SDF_VIRTUAL_EDGE_VOXELS',
    'SDF_VIRTUAL_EDGE_CELLS', 'SDF_VIRTUAL_PHONG_ALPHA', 'SDF_VIRTUAL_EXTRA_TRI_CAP', 'SDF_MAX_FINE_REGIONS', 'SDF_JOINT_MIN_RADIUS', 'SDF_FINE_PAD_FACTOR', 'SDF_FINE_RES']
    .map(n => { try { return ex.constLine(src, n); } catch (_) { return ''; } }).join('\n');
  code += '\nlet _worldTriCache = new WeakMap(), _penIndexCache = new WeakMap();\n';
  for (const n of names) code += ex.fn(src, n) + '\n';
  code += ex.region(src, 'flowgraph') + '\n' + ex.region(src, 'booleansys') + '\n' + ex.fn(src, 'partCentroid') + '\n' + ex.fn(src, 'instanceGroupingFromBoolean') + '\n' + ex.fn(src, 'instanceComponents') + '\n';
  const have = new Set(code.match(/^(?:const|let) (\w+)/gm).map(l => l.split(' ')[1]).concat(['_worldTriCache', '_penIndexCache']));
  for (let again = true; again;) {
    again = false;
    for (const m of src.matchAll(/^(?:const|let) (\w+) = [^\n]*;.*$/gm)) {
      if (have.has(m[1]) || !/^[A-Z_]\w*$/.test(m[1]) || !new RegExp('\\b' + m[1] + '\\b').test(code)) continue;
      have.add(m[1]); code = m[0] + '\n' + code; again = true;
    }
  }
  const helpers = new Set();
  for (let pass = 0; pass < 8; pass++) {
    try { vm.runInContext(code + '\nthis.api={instanceComponents,buildFlowGraph,allLinks,booleanSystems,booleanSystemGrouping,booleanSyncInstance,booleanSyncAll,booleanRefreshInstance,instanceJointRegions,booleanCacheStats,booleanCacheReset,detectAutoPenetrationJoints,collectJointRegions};', ctx); break; }
    catch (e) {
      const m = /^(\w+) is not defined/.exec(e.message);
      if (!m || helpers.has(m[1])) throw e;
      helpers.add(m[1]);
      let add = ''; try { add = ex.fn(src, m[1]); } catch (_) { try { add = ex.constLine(src, m[1]); } catch (_) { throw e; } }
      code = add + '\n' + code;
    }
  }
  const api = ctx.api, state = ctx.state;
  const near = (a, b, tol = 1e-3) => assert.ok(a.distanceTo(b) < tol, `expected ${a.toArray()} ~ ${b.toArray()}`);

  // One assembly = a spherical tank with a pipe pushed through its +x wall (a Boolean joint), same LOCAL geometry for every clone.
  const makeClone = (label, pos, rotY = 0, rotZ = 0) => {
    const g = new THREE.Group(); g.name = label; g.userData.isAssembly = true;
    g.position.copy(pos); g.rotation.set(0, rotY, rotZ);
    const tankM = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 24), new THREE.MeshBasicMaterial());
    const pipeM = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 16).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial());
    pipeM.position.set(2.4, 0, 0);
    g.add(tankM, pipeM); g.updateMatrixWorld(true);
    const tank = { name: label + ':tank', type: 'container', contents: 'oxidizer', meshes: [tankM], pivot: tankM, openings: [], userData: {} };
    const pipe = { name: label + ':pipe', type: 'pipe', contents: null, meshes: [pipeM], pivot: pipeM, openings: [], userData: {} };
    const dirty = []; const inst = { id: label, root: g, parts: [tank, pipe], links: new Map(), joints: { sealed: [], rejected: [] }, bounds: new THREE.Box3(), markDirty: (w) => dirty.push(w), dirty };
    return { g, tank, pipe, inst };
  };
  const reset = () => { api.booleanCacheReset(); state.parts = []; state.instances = []; };
  let n = 0; const test = (t, f) => { reset(); f(); n++; console.log('ok - ' + t); };

  test('two clones with different transforms are two independent Boolean systems, each joint in its own world place', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 1.2);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe];
    const sys = api.booleanSystems();
    assert.strictEqual(sys.groups.length, 2);
    assert.deepStrictEqual(Array.from(sys.groups, g => Array.from(g, p => p.name)), [['A:tank', 'A:pipe'], ['B:tank', 'B:pipe']]);
    assert.strictEqual(sys.sealed.length, 2);
    const jA = sys.sealed.find(s => s.partA === A.tank), jB = sys.sealed.find(s => s.partA === B.tank);
    // B's joint is A's joint carried through B's own transform (same local geometry).
    near(jB.centroid, jA.centroid.clone().applyMatrix4(B.g.matrixWorld), 0.01); // pair-local sampling: same joint whatever the clone orientation
    assert.ok(jB.centroid.distanceTo(jA.centroid) > 10);
    assert.deepStrictEqual(Array.from(api.booleanSystemGrouping([A.tank, A.pipe]), g => g.length), [2]); // scoped to one instance
  });

  test('moving/rotating a clone re-projects cached joints without re-running the Boolean; the other clone is untouched', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 1.2);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe];
    const s0 = api.booleanSystems();
    const local = s0.sealed.find(s => s.partA === B.tank).centroid.clone().applyMatrix4(B.g.matrixWorld.clone().invert());
    const a0 = s0.sealed.find(s => s.partA === A.tank).centroid.clone();
    const det0 = api.booleanCacheStats().detections;
    B.g.position.set(-12, 7, 9); B.g.rotation.set(0.3, -1.1, 0.5); B.g.scale.setScalar(1.5); B.g.updateMatrixWorld(true);
    const s1 = api.booleanSystems();
    assert.strictEqual(api.booleanCacheStats().detections, det0, 'pure transform must not re-run the Boolean');
    const jB = s1.sealed.find(s => s.partA === B.tank);
    near(jB.centroid, local.clone().applyMatrix4(B.g.matrixWorld));
    near(s1.sealed.find(s => s.partA === A.tank).centroid, a0);
    assert.ok(Math.abs(jB.radius / s0.sealed.find(s => s.partA === B.tank).radius - 1.5) < 1e-6, 'radius follows the clone scale');
    assert.strictEqual(s1.groups.length, 2);
  });

  test('a part moved relative to its clone re-runs only that clone\'s pair; the clone splits off as two systems', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 0);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe];
    api.booleanSystems();
    const det0 = api.booleanCacheStats().detections;
    B.pipe.meshes[0].position.x = 9; B.g.updateMatrixWorld(true);   // pull B's pipe out of its tank
    const s = api.booleanSystems();
    assert.strictEqual(api.booleanCacheStats().detections - det0, 0, 'AABBs no longer overlap: nothing to Boolean, A stays cached');
    assert.strictEqual(s.groups.length, 1);
    assert.strictEqual(s.groups[0][0].name, 'A:tank');
    assert.deepStrictEqual(Array.from(s.orphans, p => p.name).sort(), ['B:pipe', 'B:tank']);
    B.pipe.meshes[0].position.x = 2.1; B.g.updateMatrixWorld(true); // push it back in, slightly deeper than before
    const s2 = api.booleanSystems();
    assert.strictEqual(api.booleanCacheStats().detections - det0, 1, 'only B pair is re-Boolean\'d');
    assert.strictEqual(s2.groups.length, 2);
  });

  test('per-instance graphs from real Boolean joints are independent; tagFlowGraph + sync run per instance', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 1.2);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe];
    state.instances = [A.inst, B.inst];
    const whole = api.buildFlowGraph();
    for (const [x, c] of [[A, 'A'], [B, 'B']]) {                                     // per-instance link map (what inst.links holds)
      x.inst.links = new Map([...whole].filter(([p]) => x.inst.parts.includes(p)));
      api.booleanRefreshInstance(x.inst);
      const ls = [...x.inst.links.values()].flat();
      assert.strictEqual(ls.length, 1);
      assert.strictEqual(ls[0].target, x.pipe);                                      // container ranks upstream of the pipe
      assert.ok(Array.from(api.allLinks(x.inst.links, x.tank)).every(l => l.target.name.startsWith(c + ':')), 'no cross-link between clones');
      assert.strictEqual(x.inst.flowNodes.size, 2);
      assert.strictEqual(x.inst.flowNodes.get(x.pipe).kind, 'propellant');
      x.inst.joints.sealed = state.autoPenetrationSealed.filter(j => x.inst.parts.includes(j.partA));
      assert.strictEqual(x.inst.joints.sealed.length, 1);
    }
    // one-instance scene (what buildFlowGraph scoped to inst.parts sees): the graph only holds that clone's parts
    state.parts = [B.tank, B.pipe];
    const only = api.buildFlowGraph();
    assert.deepStrictEqual(Array.from(only.keys(), p => p.name), ['B:tank']);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe];
    api.buildFlowGraph();
    assert.deepStrictEqual([A.inst, B.inst].map(i => api.booleanSyncInstance(i).kind), ['init', 'init']);
    assert.deepStrictEqual([A.inst, B.inst].map(i => api.booleanSyncInstance(i).kind), ['none', 'none']);
  });

  test('booleanSyncInstance: a clone move re-transforms ITS joints/links in place and dirties only it; internal change = rebuild', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 1.2);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe]; state.instances = [A.inst, B.inst];
    const whole = api.buildFlowGraph();
    for (const x of [A, B]) {
      x.inst.links = new Map([...whole].filter(([p]) => x.inst.parts.includes(p)));
      x.inst.joints.sealed = state.autoPenetrationSealed.filter(j => x.inst.parts.includes(j.partA));
      api.booleanSyncInstance(x.inst);
    }
    const link = A.inst.links.get(A.tank); const lk = Array.isArray(link) ? link[0] : link;
    const bLink = B.inst.links.get(B.tank); const bl = Array.isArray(bLink) ? bLink[0] : bLink;
    const bBefore = bl.viaOpening.centroid.clone(), aBefore = lk.viaOpening.centroid.clone();
    const prevM = B.g.matrixWorld.clone();
    B.g.position.add(new THREE.Vector3(5, -2, 4)); B.g.rotation.y += 0.4; B.g.updateMatrixWorld(true);
    const out = api.booleanSyncAll();
    assert.deepStrictEqual(Array.from(out, o => o.inst.id + ':' + o.kind), ['B:transform']);
    assert.deepStrictEqual(B.inst.dirty, ['network', 'sdf', 'particles']);
    assert.deepStrictEqual(A.inst.dirty, []);
    near(bl.viaOpening.centroid, bBefore.clone().applyMatrix4(B.g.matrixWorld.clone().multiply(prevM.clone().invert())));
    near(lk.viaOpening.centroid, aBefore);
    // joint list in world == fresh Boolean in world
    const fresh = api.booleanSystems().sealed.find(s => s.partA === B.tank);
    near(B.inst.joints.sealed[0].centroid, fresh.centroid);
    // internal change
    B.pipe.meshes[0].position.x += 0.2; B.g.updateMatrixWorld(true);
    assert.strictEqual(api.booleanSyncInstance(B.inst).kind, 'rebuild');
    assert.ok(B.inst.dirty.includes('links'));
    assert.strictEqual(api.booleanSyncInstance(B.inst).kind, 'none');
  });

  test('instanceJointRegions: LTCBP joint regions are per instance and follow the clone transform from the local cache', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 0);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe]; state.instances = [A.inst, B.inst];
    const whole = api.buildFlowGraph();
    for (const x of [A, B]) { x.inst.links = new Map([...whole].filter(([p]) => x.inst.parts.includes(p))); api.booleanSyncInstance(x.inst); }
    const rA = api.instanceJointRegions(A.inst), rB = api.instanceJointRegions(B.inst);
    assert.strictEqual(rA.length, 1); assert.strictEqual(rB.length, 1);
    const cA = rA[0].box.getCenter(new THREE.Vector3()), cB = rB[0].box.getCenter(new THREE.Vector3());
    assert.ok(cA.distanceTo(cB) > 10);
    assert.ok(rA[0].parts.every(p => A.inst.parts.includes(p)) && rB[0].parts.every(p => B.inst.parts.includes(p)));
    const cBlocal = cB.clone().applyMatrix4(B.g.matrixWorld.clone().invert());
    B.g.position.set(-8, 3, 11); B.g.updateMatrixWorld(true);
    const rB2 = api.instanceJointRegions(B.inst);
    near(rB2[0].box.getCenter(new THREE.Vector3()), cBlocal.applyMatrix4(B.g.matrixWorld));
    assert.ok(Math.abs(rB2[0].box.max.x - rB2[0].box.min.x - (rB[0].box.max.x - rB[0].box.min.x)) < 1e-9);
  });

  test('detectInstances path: instanceComponents with state.systemGrouping = booleanSystemGrouping splits the clones by Boolean', () => {
    const A = makeClone('A', new THREE.Vector3(0, 0, 0)), B = makeClone('B', new THREE.Vector3(20, 5, -3), 0.7, 1.2);
    const loose = { name: 'loose', type: 'pipe', meshes: [new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))], pivot: null, openings: [] };
    loose.meshes[0].position.set(60, 0, 0); loose.meshes[0].updateMatrixWorld(true);
    state.parts = [A.tank, A.pipe, B.tank, B.pipe, loose];
    state.systemGrouping = ctx.booleanSystemGrouping;
    const r = api.instanceComponents(state.parts, new Map());
    assert.deepStrictEqual(Array.from(r.components, c => Array.from(c, p => p.name)), [['A:tank', 'A:pipe'], ['B:tank', 'B:pipe']]);
    assert.deepStrictEqual(Array.from(r.orphans, p => p.name), ['loose']);
    state.systemGrouping = null;
  });

  test('first detection is orientation-independent: identical clones at 0/45/90 deg (about Y and Z) with offsets give the same LOCAL joint centroid and radius', () => {
    const D = Math.PI / 180, size = 4;   // tank diameter = part size
    const specs = [[0, 0, [0, 0, 0]], [45 * D, 0, [13, -4, 7]], [90 * D, 0, [-9, 6, 2]], [0, 45 * D, [30, 1, -8]], [45 * D, 90 * D, [-20, -5, 11]], [90 * D, 45 * D, [3, 18, -6]]];
    const rs = specs.map(([ry, rz, off], i) => {
      const c = makeClone('C' + i, new THREE.Vector3(...off), ry, rz);
      state.parts = [c.tank, c.pipe]; api.booleanCacheReset();           // each is a FRESH, first detection
      const j = api.booleanSystems().sealed[0];
      assert.ok(j, 'clone ' + i + ' has its joint');
      const inv = c.g.matrixWorld.clone().invert();
      return { local: j.centroid.clone().applyMatrix4(inv), radius: j.radius };
    });
    for (let i = 1; i < rs.length; i++) {
      assert.ok(rs[i].local.distanceTo(rs[0].local) < 1e-3 * size, `clone ${i} local centroid ${rs[i].local.toArray()} vs ${rs[0].local.toArray()}`);
      assert.ok(Math.abs(rs[i].radius - rs[0].radius) < 1e-3 * size, 'radius ' + i);
    }
    // sanity: the joint is the wall crossing of the +x pipe (local x ~ 2), not somewhere arbitrary
    assert.ok(Math.abs(rs[0].local.x - 2) < 0.6 && Math.abs(rs[0].local.y) < 0.2 && Math.abs(rs[0].local.z) < 0.2, rs[0].local.toArray().join());
  });

  test('a uniformly scaled, rotated clone gives the same local joint on first detection', () => {
    const a = makeClone('S0', new THREE.Vector3(0, 0, 0)), b = makeClone('S1', new THREE.Vector3(5, 5, 5), 0.8, 0.4); b.g.scale.setScalar(2.5); b.g.updateMatrixWorld(true);
    const loc = (c) => { state.parts = [c.tank, c.pipe]; api.booleanCacheReset(); const j = api.booleanSystems().sealed[0]; return { l: j.centroid.clone().applyMatrix4(c.g.matrixWorld.clone().invert()), r: j.radius / c.g.matrixWorld.getMaxScaleOnAxis() }; };
    const la = loc(a), lb = loc(b);
    assert.ok(la.l.distanceTo(lb.l) < 4e-3, la.l.toArray() + ' vs ' + lb.l.toArray());
    assert.ok(Math.abs(la.r - lb.r) < 4e-3);
  });

  console.log(n + ' boolean-instances tests passed');
})().catch(e => { console.error(e); process.exit(1); });
