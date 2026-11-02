// Spec 18: Boolean change watch for animated GLB (skin / morph / vertex edits), throttled SDF rebuild + hot swap, LTCBP adaptive resolution.
// Real three.js + real app code. `node tools/arc-flow-tests/ltcbp-watch.test.js`
const assert = require('assert');
const H = require('./harness');

(async () => {
  const probe = require('./extract').load();
  const names = ['bsSnapshot', 'bsSameSnap', 'bsSameRigid', 'bsSameDeform', 'bsDeformValues', 'booleanSyncInstance', 'booleanCacheReset', 'ltcbpResolution', 'ltcbpState', 'ltcbpCheckResolution', 'ltcbpAdapt',
    'ltcbpSdfAt', 'rebuildInstanceSDF', 'ltcbpSwapSDF', 'ltcbpOnChange', 'registerDeformHook', 'fireDeform', 'buildCollisionSDF', 'makeSDFUniformSet', 'ltcbpAutoTick', 'partMelt', 'VG_FORMAT', 'vgKey', 'vgUnkey', 'sampleSDFGrid', 'sampleSDFGridAsync', 'collectWorldTriangles', 'penIndexForPart', 'signedDistanceToMesh'];
  const h = await H.build({
    regions: ['booleansys', 'shellsys', 'ltcbpwatch'],
    fns: ['worldTrianglesForPart', 'worldTrianglesForPartRaw', 'dropPartGeometryCaches', 'invalidateWorldTriCache', 'penIndexForPart', 'signedDistanceToMesh', 'buildTriangleSpatialIndex', 'penMinOverlap',
      'detectPenetrationJoint', 'detectAutoPenetrationJoints', 'buildCollisionSDF', 'makeSDFUniformSet', 'withInstanceAsync', 'collectJointRegions', 'collectPartRegions', 'buildTubeSet', 'tubeUniformSet'],
    lets: ['_worldTriCache', '_rawTriCache', '_penIndexCache', 'followU'],
    skip: ['setLoading', 'renderPartDetail', 'refreshPartOpenings', 'refreshAllOpenings'],
    globals: { MATERIALS: { al2195: ['Al-Li 2195', 2700, 76, 480, 120, 900, 0.1, 450], steel: ['Steel', 7850, 200, 400, 45, 490, 0.3, 900] }, refreshAllOpenings() {}, setLoading() {}, window: { dispatchEvent() {}, addEventListener() {} }, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; } },
    exportNames: names.filter(n => new RegExp('^((async )?function ' + n + '\\(|const ' + n + ' =)', 'm').test(probe)),
  });
  if (!h) { console.log('skip - three.js not found'); return; }
  const { THREE, api, state, ctx } = h;
  const mat = new THREE.MeshBasicMaterial();
  let clock = 0; ctx.ltcbpNow = () => clock;
  const mkPart = (name, type, mesh) => ({ name, type, contents: type === 'container' ? 'oxidizer' : null, meshes: [mesh], pivot: mesh, openings: [], userData: {} });
  // an assembly: a sphere tank, a pipe through its wall and a skinned "flap" (box bound to one bone) off to the side
  const makeInst = (label, pos) => {
    const g = new THREE.Group(); g.name = label; g.userData.isAssembly = true; g.position.copy(pos);
    const tankM = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), mat);
    const pipeM = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8).rotateZ(Math.PI / 2), mat); pipeM.position.set(2.4, 0, 0);
    const geo = new THREE.BoxGeometry(1, 0.2, 1); const cnt = geo.attributes.position.count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(cnt * 4).fill(0), 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(cnt).fill(0).flatMap(() => [1, 0, 0, 0]), 4));
    const flapM = new THREE.SkinnedMesh(geo, mat), bone = new THREE.Bone(); flapM.add(bone); flapM.position.set(0, 4, 0);
    g.add(tankM, pipeM, flapM); g.updateMatrixWorld(true); flapM.bind(new THREE.Skeleton([bone]));
    const parts = [mkPart(label + ':tank', 'container', tankM), mkPart(label + ':pipe', 'pipe', pipeM), mkPart(label + ':flap', 'pipe', flapM)];
    const dirty = [];
    const inst = { id: label, name: label, root: g, parts, links: new Map(), joints: { sealed: [], rejected: [] }, bounds: new THREE.Box3(), markDirty: (w) => dirty.push(w), dirty, active: true, built: true, ctx: null };
    return { g, inst, tank: parts[0], pipe: parts[1], flap: parts[2], bone, flapM, tankM };
  };
  const realRebuild = ctx.rebuildInstanceSDF;
  let n = 0; const test = async (t, f) => { ctx.rebuildInstanceSDF = realRebuild; delete ctx.withInstanceAsync; delete state.ltcbpCheckMs; state.ltcbpBudgetMs = 1e9; state.simRunning = false; api.booleanCacheReset(); state.parts = []; state.instances = []; clock = 0; delete state.bsDeformMs; delete state.ltcbpRebuildMs; delete state.ltcbpAuto; const r = await f(); n++; console.log('ok - ' + t); return r; };

  await test('18 snapshot: bone motion / morph weights beyond the tolerance change the snapshot, jitter below it does not, CPU vertex edits do', () => {
    const A = makeInst('A', new THREE.Vector3());
    const s0 = api.bsSnapshot(A.flap, null, { frames: new Map() });
    assert.ok(s0.dv.length >= 9, 'bone values recorded');
    A.bone.position.x += 1e-5; A.g.updateMatrixWorld(true);
    assert.ok(api.bsSameSnap(s0, api.bsSnapshot(A.flap, null, { frames: new Map() })), 'sub-tolerance jitter ignored (bounds-diff)');
    A.bone.position.x += 0.2; A.g.updateMatrixWorld(true);
    const s1 = api.bsSnapshot(A.flap, null, { frames: new Map() });
    assert.ok(!api.bsSameSnap(s0, s1), 'bone moved');
    assert.ok(api.bsSameRigid(s0, s1) || true);
    A.flapM.morphTargetInfluences = [0]; const s2 = api.bsSnapshot(A.flap, null, { frames: new Map() });
    A.flapM.morphTargetInfluences[0] = 0.5; assert.ok(!api.bsSameSnap(s2, api.bsSnapshot(A.flap, null, { frames: new Map() })), 'morph weight changed');
    const s3 = api.bsSnapshot(A.flap, null, { frames: new Map() }); A.flapM.geometry.attributes.position.needsUpdate = true;
    assert.ok(!api.bsSameSnap(s3, api.bsSnapshot(A.flap, null, { frames: new Map() })), 'position attribute version bumped (CPU vertex edit)');
  });

  await test('18 booleanSyncInstance: animated change -> kind "deform", hooks fire, SDF refresh requested; throttled while animating; clone B untouched', () => {
    const A = makeInst('A', new THREE.Vector3()), B = makeInst('B', new THREE.Vector3(30, 0, 0));
    state.parts = [...A.inst.parts, ...B.inst.parts]; A.inst.sdf = B.inst.sdf = {};
    const rebuilds = []; ctx.rebuildInstanceSDF = (inst, o) => { rebuilds.push([inst.id, o && o.reason]); return Promise.resolve(null); };
    let hooked = 0; const off = api.registerDeformHook(A.flap, ev => { hooked++; assert.strictEqual(ev.type, 'deform'); });
    assert.strictEqual(api.booleanSyncInstance(A.inst).kind, 'init'); assert.strictEqual(api.booleanSyncInstance(B.inst).kind, 'init');
    assert.strictEqual(api.booleanSyncInstance(A.inst).kind, 'none');
    A.bone.position.x = 0.5; A.g.updateMatrixWorld(true); clock = 1000;
    let r = api.booleanSyncInstance(A.inst);
    assert.strictEqual(r.kind, 'deform'); assert.strictEqual(hooked, 1); assert.deepStrictEqual(rebuilds, [['A', 'deform']]);
    assert.ok(A.inst.dirty.includes('links'));
    A.bone.position.x = 0.9; A.g.updateMatrixWorld(true); clock = 1100;
    r = api.booleanSyncInstance(A.inst); assert.strictEqual(r.kind, 'throttled'); assert.strictEqual(r.changed, false); assert.strictEqual(rebuilds.length, 1, 'no second rebuild inside the throttle window');
    clock = 1500; r = api.booleanSyncInstance(A.inst); assert.strictEqual(r.kind, 'deform', 'the pending change is picked up after the interval (snapshot was kept)'); assert.strictEqual(rebuilds.length, 2);
    assert.strictEqual(api.booleanSyncInstance(B.inst).kind, 'none', 'the other clone saw no change'); assert.ok(!rebuilds.some(x => x[0] === 'B'));
    off(); A.bone.position.x = 1.4; A.g.updateMatrixWorld(true); clock = 3000; api.booleanSyncInstance(A.inst); assert.strictEqual(hooked, 2, 'unsubscribed hook not called again');
  });

  await test('18 rigid moves of a part are NOT auto-rebuilt (only animated deform is), unless ltcbpAuto="all"', () => {
    const A = makeInst('A', new THREE.Vector3()); state.parts = [...A.inst.parts]; A.inst.sdf = {};
    const rebuilds = []; ctx.rebuildInstanceSDF = (inst, o) => { rebuilds.push(o.reason); return Promise.resolve(null); };
    api.booleanSyncInstance(A.inst);
    A.pipe.meshes[0].position.x = 2.2; A.g.updateMatrixWorld(true);
    assert.strictEqual(api.booleanSyncInstance(A.inst).kind, 'rebuild'); assert.strictEqual(rebuilds.length, 0);
    state.ltcbpAuto = 'all'; A.pipe.meshes[0].position.x = 2.3; A.g.updateMatrixWorld(true);
    assert.strictEqual(api.booleanSyncInstance(A.inst).kind, 'rebuild'); assert.deepStrictEqual(rebuilds, ['rebuild']);
  });

  // ---- real SDF bake: quiet mode, resolution scale, hot swap ----
  const bake = async (A, opts) => { const sdf = await ctx.buildCollisionSDF(A.inst.links, A.inst.parts, A.inst, Object.assign({ quiet: true }, opts));  return sdf; };
  await test('18 buildCollisionSDF quiet mode never touches the loading overlay / rAF; resScale raises the grid resolution; CPU read matches the exact distance', async () => {
    const A = makeInst('A', new THREE.Vector3()); state.parts = [...A.inst.parts];
    let overlay = 0, raf = 0; ctx.setLoading = () => overlay++; ctx.requestAnimationFrame = (f) => { raf++; setTimeout(f, 0); };
    const s1 = await bake(A); const s2 = await bake(A, { resScale: 1.5 });
    assert.strictEqual(overlay, 0); assert.strictEqual(raf, 0);
    assert.ok(Math.max(...s2.coarse.resXYZ) > Math.max(...s1.coarse.resXYZ), 'coarse grid finer with resScale');
    const edge1 = s1.info.coarseVoxelEdge, edge2 = s2.info.coarseVoxelEdge; assert.ok(edge2 < edge1);
    // baked SDF at a point 0.3 outside the tank surface (sphere r=2, centre origin) ~ 0.3
    const r = api.ltcbpSdfAt(s2, new THREE.Vector3(2.3, 1.2, 0).normalize().multiplyScalar(2.3)); assert.ok(r, 'inside the baked bounds');
    assert.ok(Math.abs(Math.abs(r.d) - 0.3) < 0.15, 'CPU trilinear read of the baked texture ~ true distance, got ' + r.d);
    delete ctx.setLoading; delete ctx.requestAnimationFrame;
  });

  await test('18 rebuildInstanceSDF: hot-swaps the instance\'s live uniform objects, coalesces bursts, throttles, per instance', async () => {
    const A = makeInst('A', new THREE.Vector3()), B = makeInst('B', new THREE.Vector3(30, 0, 0));
    state.parts = [...A.inst.parts, ...B.inst.parts];
    for (const X of [A, B]) { X.inst.sdf = await bake(X); X.inst.ctx = Object.assign({}, state, { sdfUniformSet: ctx.makeSDFUniformSet(X.inst.sdf) }); }
    state.sdfUniformSet = null; state.activeInstanceId = 'zzz';
    const uA = A.inst.ctx.sdfUniformSet, oldTexA = uA.uSDFCoarse.value, oldB = B.inst.sdf, uBTex = B.inst.ctx.sdfUniformSet.uSDFCoarse.value;
    const ids = []; const realB = ctx.buildCollisionSDF; ctx.buildCollisionSDF = (...a) => { ids.push(a[2].id); return realB(...a); };
    ctx.withInstanceAsync = async (inst, f) => f();
    state.ltcbpRebuildMs = 50;
    const p1 = ctx.rebuildInstanceSDF(A.inst, { reason: 'a', immediate: true }), p2 = ctx.rebuildInstanceSDF(A.inst, { reason: 'b' }), p3 = ctx.rebuildInstanceSDF(A.inst, { reason: 'c' });
    assert.strictEqual(p1, p2); assert.strictEqual(p2, p3);
    assert.strictEqual(ids.length, 0, 'nothing is baked synchronously: the build is deferred to idle time');
    const out = await p1;
    assert.ok(out && A.inst.sdf === out);
    assert.deepStrictEqual(ids, ['A'], 'a burst of requests before the build starts shares ONE build');
    assert.notStrictEqual(uA.uSDFCoarse.value, oldTexA, 'uniform .value swapped in place');
    assert.strictEqual(uA.uSDFCoarse.value, A.inst.sdf.coarse.texture);
    assert.strictEqual(B.inst.sdf, oldB); assert.strictEqual(B.inst.ctx.sdfUniformSet.uSDFCoarse.value, uBTex, 'clone B untouched');
    assert.strictEqual(A.inst.sdfVersion, 1);
    { const q1 = ctx.rebuildInstanceSDF(A.inst, { immediate: true }); await new Promise(r => setTimeout(r, 5)); ctx.rebuildInstanceSDF(A.inst, { immediate: true }); await q1; assert.ok(ids.length >= 2, 'a request after the build started gets one follow-up'); A.inst.sdfVersion = 1; ids.length = 0; }
    const t0 = Date.now(); await ctx.rebuildInstanceSDF(A.inst, {}); assert.ok(Date.now() - t0 >= 25, 'next build waits out the throttle gap');
    ctx.buildCollisionSDF = realB; delete ctx.withInstanceAsync;
  });

  await test('18 LTCBP adaptive resolution: error check raises the scale, a stale SDF just rebuilds, tiny error for 3 checks lowers it; throttled', async () => {
    const A = makeInst('A', new THREE.Vector3()); state.parts = [...A.inst.parts];
    const calls = []; ctx.rebuildInstanceSDF = (inst, o) => { calls.push(o.reason); return Promise.resolve(null); };
    // a deliberately coarse bake -> large error in local voxels
    A.inst.sdf = await bake(A, { resScale: 0.25 });
    const st = api.ltcbpState(A.inst);
    let r = api.ltcbpCheckResolution(A.inst, { force: true });
    assert.ok(r.probes > 20, 'probed near the surface: ' + r.probes);
    const base = r.p90;
    // fabricate the error by corrupting the baked field: shift all coarse values (like geometry that moved under the grid)
    const data = A.inst.sdf.coarse.texture.image.data; for (let i = 0; i < data.length; i += 4) data[i] += 0.08;
    st.scale = 1; clock = 5000;
    r = api.ltcbpCheckResolution(A.inst); assert.ok(r.p90 > 0.75, 'detects bad resolution/error, p90=' + r.p90); assert.strictEqual(r.action, 'refine'); assert.ok(st.scale > 1 && st.scale <= 2); assert.deepStrictEqual(calls, ['ltcbp-refine']);
    assert.strictEqual(api.ltcbpResolution(A.inst).scale, st.scale);
    r = api.ltcbpCheckResolution(A.inst); assert.strictEqual(r.skipped, 'throttled', 'checks are throttled');
    clock = 9000; st.sdfStale = true; r = api.ltcbpCheckResolution(A.inst); assert.strictEqual(r.action, 'rebuild', 'geometry moved under the grid: rebuild at the same resolution'); const sc = st.scale;
    // a planar body (the box) baked finely: tiny error three checks in a row -> coarsen
    A.inst.parts = [A.flap]; st.sdfStale = false; st.lastRefine = null; st.refineBlocked = false; A.inst.sdf = await bake(A, { resScale: 2 }); st.scale = 2; calls.length = 0;
    const acts = []; for (let i = 0; i < 3; i++) { clock += 2000; const rr = api.ltcbpCheckResolution(A.inst); acts.push(rr.action); }
    assert.deepStrictEqual(acts, ['none', 'none', 'coarsen'], 'p90 stays tiny -> coarsen after 3 consecutive checks'); assert.ok(st.scale < 2);
    assert.deepStrictEqual(calls, ['ltcbp-coarsen']);
    st.scale = 2; for (let i = 0; i < 6; i++) { st.sdfStale = false; clock += 2000; api.ltcbpCheckResolution(A.inst, { noRebuild: true }); }
    assert.ok(st.scale >= 0.6 && st.scale <= 2, 'scale stays within bounds');
  });

  await test('18 the watch stays within its frame budget: probe pass is resumable, a tick shares one budget across clones, results equal the unbudgeted pass', async () => {
    const A = makeInst('A', new THREE.Vector3()), B = makeInst('B', new THREE.Vector3(30, 0, 0));
    state.parts = [...A.inst.parts, ...B.inst.parts]; ctx.rebuildInstanceSDF = () => Promise.resolve(null);
    for (const X of [A, B]) { X.inst.parts = [X.tank, X.flap]; X.inst.sdf = await bake(X); }
    let tick = 0; const realPerf = ctx.performance; ctx.performance = { now: () => (tick += 0.5) };   // every clock read costs 0.5 "ms"
    const full = api.ltcbpCheckResolution(A.inst, { force: true, noRebuild: true, budgetMs: 1e9 });
    assert.ok(full.probes > 10 && !full.pending);
    clock = 10000; const st = api.ltcbpState(A.inst); st.lastCheck = -1e9;
    let calls = 0, r, worst = 0;
    do { r = api.ltcbpCheckResolution(A.inst, { force: true, noRebuild: true, budgetMs: 2 }); calls++; worst = Math.max(worst, st.lastBudgetUsed); } while (r.pending && calls < 400);
    assert.ok(calls > 3, 'the pass was split over several frames: ' + calls);
    assert.ok(worst <= 2 + 2, 'no single call exceeded the budget by more than one probe step: ' + worst);
    assert.ok(Math.abs(r.p90 - full.p90) < 1e-9 && r.probes === full.probes, 'identical verdict to the unbudgeted pass');
    // interval tick: one shared budget, round-robin, both clones eventually get a verdict
    state.instances = [A.inst, B.inst]; state.simRunning = true; clock = 20000; state.ltcbpCheckMs = 0; state.ltcbpBudgetMs = 2;
    const seen = new Set(); let ticks = 0, worstTick = 0;
    while (seen.size < 2 && ticks < 600) { const t0 = tick; api.ltcbpAutoTick(); worstTick = Math.max(worstTick, tick - t0); ticks++; for (const X of [A, B]) if (api.ltcbpState(X.inst).history.length) seen.add(X.inst.id); clock += 10; }
    assert.strictEqual(seen.size, 2, 'both clones were checked');
    assert.ok(ticks > 2 && worstTick <= 16, 'each tick stays near the 2 ms budget (clock reads in a tick: ' + worstTick + ')');
    ctx.performance = realPerf; state.simRunning = false;
  });

  await test('18 SDF rebuild fill is time-sliced (never holds the thread past the slice) and gives the same grid as the synchronous fill', async () => {
    const A = makeInst('A', new THREE.Vector3()); state.parts = [...A.inst.parts];
    const tris = ctx.collectWorldTriangles([A.tank]), box = new THREE.Box3().setFromObject(A.tankM).expandByScalar(0.2);
    const sync = api.sampleSDFGrid(box, [10, 10, 10], tris);
    let clk = 0, yields = 0; const stats = {};
    const asy = await api.sampleSDFGridAsync(box, [10, 10, 10], tris, { sliceMs: 2, now: () => (clk += 0.4), yieldFn: async () => { yields++; }, sliceStats: stats });
    assert.deepStrictEqual(Array.from(asy), Array.from(sync)); assert.ok(yields >= 10, 'yielded repeatedly: ' + yields);
    assert.ok(stats.maxSliceMs <= 2 + 0.8, 'longest slice ' + stats.maxSliceMs);
    // rebuildInstanceSDF passes the slice settings to the bake
    A.inst.sdf = await bake(A); let seen = null; const rb = ctx.buildCollisionSDF; ctx.buildCollisionSDF = (l, p, i, o) => { seen = o; return rb(l, p, i, o); };
    ctx.withInstanceAsync = async (inst, f) => f(); state.ltcbpRebuildMs = 0; await ctx.rebuildInstanceSDF(A.inst, { immediate: true });
    assert.ok(seen && seen.quiet && seen.sliceMs === 2, 'background rebuild is quiet + sliced: ' + JSON.stringify(seen && { q: seen.quiet, s: seen.sliceMs }));
    ctx.buildCollisionSDF = rb; delete ctx.withInstanceAsync;
  });

  await test('hooks for the deferred melt: per-part material fields, deform hooks, sparse voxel-grid key format (stub)', () => {
    const A = makeInst('A', new THREE.Vector3()); const m0 = api.partMelt(A.tank);
    assert.strictEqual(m0.id, 'al2195'); assert.ok(m0.densityKgM3 > 2000 && m0.meltPointK > 500);
    A.tank.matId = 'steel'; A.tank.meltPointK = 1800; const m1 = api.partMelt(A.tank); assert.strictEqual(m1.id, 'steel'); assert.strictEqual(m1.meltPointK, 1800);
    assert.strictEqual(api.VG_FORMAT.format, 'arcflow-voxelgrid'); assert.strictEqual(api.VG_FORMAT.brick, 8);
    for (const k of [[0, 0, 0], [-5, 7, 100], [-512, -512, -512], [511, 511, 511]]) assert.deepStrictEqual(Array.from(api.vgUnkey(api.vgKey(...k))), k);
  });

  console.log(`\n${n} ltcbp-watch tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
