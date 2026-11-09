// Task A/B: thin-channel local SDF refinement + sliced pre-work already covered in ltcbp-watch.
// Thin pipe tank→chamber is a real bore (not a leak), chamber stays closed away from inlet/throat.
const assert = require('assert');
const H = require('./harness');

(async () => {
  const probe = require('./extract').load();
  const names = ['buildCollisionSDF', 'collectThinChannelRegions', 'fitTubeForPart', 'buildTubeSet', 'isThinChannelCandidate',
    'ltcbpSdfAt', 'detectPenetrationJoint', 'detectAutoPenetrationJoints', 'booleanCacheReset', 'penIndexForPart',
    'signedDistanceToMesh', 'worldTrianglesForPart', 'collectJointRegions', 'collectPartRegions', 'asLinkArray'];
  const h = await H.build({
    regions: ['booleansys', 'shellsys', 'ltcbpwatch'],
    fns: ['worldTrianglesForPart', 'worldTrianglesForPartRaw', 'dropPartGeometryCaches', 'invalidateWorldTriCache', 'penIndexForPart',
      'signedDistanceToMesh', 'buildTriangleSpatialIndex', 'triIndexInit', 'triIndexAdd', 'penMinOverlap', 'detectPenetrationJoint', 'detectAutoPenetrationJoints',
      'buildCollisionSDF', 'makeSDFUniformSet', 'collectJointRegions', 'collectPartRegions', 'buildTubeSet', 'fitTubeForPart',
      'collectThinChannelRegions', 'isThinChannelCandidate', 'adaptiveGridRes', 'ltcbpSdfAt'],
    lets: ['_worldTriCache', '_rawTriCache', '_penIndexCache'],
    skip: ['setLoading', 'renderPartDetail', 'refreshPartOpenings', 'refreshAllOpenings'],
    globals: { refreshAllOpenings() {}, setLoading() {}, window: { dispatchEvent() {}, addEventListener() {} },
      CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; } },
    exportNames: names.filter(n => new RegExp('^((async )?function ' + n + '\\(|const ' + n + ' =)', 'm').test(probe)),
    patch: [[/const SDF_COARSE_RES = \d+/, 'const SDF_COARSE_RES = 10'], [/const SDF_FINE_RES = \d+/, 'const SDF_FINE_RES = 8']],
  });
  if (!h) { console.log('skip - three.js not found'); return; }
  const { THREE, api, state, ctx } = h;
  let n = 0; const test = async (t, f) => { api.booleanCacheReset(); state.parts = []; state.instances = []; await f(); n++; console.log('ok - ' + t); };
  const mat = new THREE.MeshBasicMaterial();

  // Fuel-tank → thin feed pipe → chamber. Bore ~0.16 dia so a coarse 10³ scene grid undersamples it.
  const makeAssembly = () => {
    const g = new THREE.Group();
    const tankM = new THREE.Mesh(new THREE.SphereGeometry(2.0, 24, 18), mat);
    const pipePath = new THREE.LineCurve3(new THREE.Vector3(1.5, 0, 0), new THREE.Vector3(6.5, 0, 0));
    const pipeM = new THREE.Mesh(new THREE.TubeGeometry(pipePath, 40, 0.08, 16, false), mat);
    const chamberM = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 18), mat);
    chamberM.position.set(7.5, 0, 0);
    // tiny nozzle stub on -y of chamber (throat)
    const throatM = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.6, 12), mat);
    throatM.position.set(7.5, -1.7, 0);
    g.add(tankM, pipeM, chamberM, throatM); g.updateMatrixWorld(true);
    const tank = { name: 'Fuel', type: 'container', contents: 'fuel', meshes: [tankM], pivot: tankM, openings: [
      { role: 'exit', centroid: new THREE.Vector3(2.0, 0, 0), radius: 0.1, normal: new THREE.Vector3(1, 0, 0) }], userData: {} };
    const pipe = { name: 'FuelChannel', type: 'pipe', contents: null, meshes: [pipeM], pivot: pipeM, openings: [
      { role: 'entrance', centroid: new THREE.Vector3(1.5, 0, 0), radius: 0.08, normal: new THREE.Vector3(-1, 0, 0) },
      { role: 'exit', centroid: new THREE.Vector3(6.5, 0, 0), radius: 0.08, normal: new THREE.Vector3(1, 0, 0) }], userData: {} };
    const chamber = { name: 'CombustionChamber', type: 'chamber', contents: null, meshes: [chamberM, throatM], pivot: chamberM, openings: [
      { role: 'entrance', centroid: new THREE.Vector3(5.9, 0, 0), radius: 0.1, normal: new THREE.Vector3(-1, 0, 0) },
      { role: 'nozzle', centroid: new THREE.Vector3(7.5, -2.0, 0), radius: 0.4, normal: new THREE.Vector3(0, -1, 0) }], userData: {} };
    const links = new Map();
    links.set(tank, [{ target: pipe, viaOpening: tank.openings[0], entrance: pipe.openings[0], boolean: true }]);
    links.set(pipe, [{ target: chamber, viaOpening: pipe.openings[1], entrance: chamber.openings[0], boolean: true }]);
    return { g, tank, pipe, chamber, links, parts: [tank, pipe, chamber] };
  };

  await test('thin channel list reuses fitTubeForPart/buildTubeSet and forces local fine regions when the coarse grid undersamples the bore', async () => {
    const A = makeAssembly(); state.parts = A.parts;
    const tube = api.fitTubeForPart(A.pipe);
    assert.ok(tube && tube.minRIn > 0.03 && tube.minRIn < 0.15, 'fitTubeForPart finds the thin bore: ' + (tube && tube.minRIn));
    assert.ok(tube.segs.length >= 1 && tube.L > 2);
    const ts = api.buildTubeSet(A.parts);
    assert.ok(ts.byPart.get(A.pipe), 'buildTubeSet keeps the FuelChannel tube');
    // Pretend a coarse voxel much larger than the bore → must refine.
    const thin = api.collectThinChannelRegions(ts, 16, 0.5);
    assert.ok(thin.channels.length >= 1);
    const ch = thin.channels.find(c => c.name === 'FuelChannel');
    assert.ok(ch && ch.refined && ch.regions.length >= 1, 'refined channel regions present');
    assert.ok(ch.voxelsAcrossBore >= 3.9, '>= ~4 voxels across bore: ' + ch.voxelsAcrossBore);
    assert.strictEqual(ch.tessellation, 'booleanTight');
    assert.ok(ch.segs === ts.list[0].segs, 'same segs object as buildTubeSet (no parallel format)');
    assert.ok(ch.minRIn === ts.list[0].minRIn && ch.firstSeg === ts.list[0].firstSeg);
    // Well-resolved coarse voxel → no extra regions needed.
    const thin2 = api.collectThinChannelRegions(api.buildTubeSet(A.parts), 16, 0.01);
    const ch2 = thin2.channels.find(c => c.name === 'FuelChannel');
    assert.ok(ch2 && !ch2.refined && ch2.regions.length === 0, 'skip refine when coarse already resolves the bore');
  });

  await test('baked SDF: thin pipe is present as a refined channel bore and a graph link, not dropped', async () => {
    const A = makeAssembly(); state.parts = A.parts;
    const j1 = api.detectPenetrationJoint(A.tank, A.pipe);
    const j2 = api.detectPenetrationJoint(A.pipe, A.chamber);
    assert.ok(j1 && j1.centroid, 'tank↔pipe joint kept');
    assert.ok(j2 && j2.centroid, 'pipe↔chamber joint kept');
    const sdf = await api.buildCollisionSDF(A.links, A.parts, null, { quiet: true });
    assert.ok(sdf && sdf.thinChannels && sdf.thinChannels.length >= 1);
    const ch = sdf.thinChannels.find(c => c.name === 'FuelChannel');
    assert.ok(ch && ch.refined && ch.voxelsAcrossBore >= 3.0, 'bake reports resolved bore: ' + (ch && ch.voxelsAcrossBore));
    assert.ok(ch.segs && ch.segs.length >= 1 && ch.minRIn > 0, 'segs/minRIn lined up with fitTubeForPart');
    assert.ok(sdf.info.thinChannels.some(c => c.name === 'FuelChannel' && c.refined));
    assert.ok(sdf.tubes && sdf.tubes.byPart.get(A.pipe), 'buildTubeSet tube still on sdf.tubes');
    // Finest sample on the pipe axis should come from a fine region (channel/joint), not only coarse.
    const mid = api.ltcbpSdfAt(sdf, new THREE.Vector3(4.0, 0, 0));
    assert.ok(mid && mid.grid && mid.grid.startsWith('fine') && mid.edge < 0.25, 'axis uses fine channel voxels: ' + JSON.stringify(mid));
  });

  await test('chamber stays closed away from the feed inlet and throat (no extra openings from an under-resolved pipe)', async () => {
    const A = makeAssembly(); state.parts = A.parts;
    assert.strictEqual(A.chamber.openings.length, 2, 'chamber declares only feed inlet + throat');
    assert.deepStrictEqual(A.chamber.openings.map(o => o.role).sort(), ['entrance', 'nozzle']);
    const sdf = await api.buildCollisionSDF(A.links, A.parts, null, { quiet: true });
    assert.ok(sdf.thinChannels.some(c => c.name === 'FuelChannel' && c.refined));
    assert.ok(A.links.get(A.pipe), 'pipe→chamber graph link kept');
    const far = api.ltcbpSdfAt(sdf, new THREE.Vector3(20, 20, 20));
    assert.ok(!far || far.d > 0, 'far exterior is not a cavity: ' + (far && far.d));
  });

  console.log(`\n${n} thin-channel tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
