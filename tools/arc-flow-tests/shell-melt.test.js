// Spec 15-19 / 22 / 25: shell topology + auto shell, mesh-intersection joints, change watch / adaptive resolution, melt + voxel handoff.
// Real three.js, real app code (dependency-closed out of templates/arc-flow.html). `node tools/arc-flow-tests/shell-melt.test.js`
const assert = require('assert');
const H = require('./harness');

(async () => {
  const names = ['analyzePartShell', 'worldTrianglesForPart', 'worldTrianglesForPartRaw', 'penIndexForPart', 'signedDistanceToMesh', 'meshesIntersect', 'partSolidTris',
    'buildTriangleSpatialIndex', 'detectAutoPenetrationJoints', 'dropPartGeometryCaches', 'invalidateWorldTriCache', 'booleanCacheReset', 'booleanSystems', 'bsSnapshot', 'bsSameSnap',
    'partMelt', 'setPartMelting', 'registerDeformHook', 'meltApply', 'meltCarveTris', 'partVoxelGrid', 'vgMass', 'vgCount', 'vgKey', 'vgUnkey', 'vgToWorldPoints', 'vgBrickIndex',
    'ltcbpResolution', 'ltcbpCheckResolution', 'ltcbpAdapt', 'ltcbpSdfAt', 'bsDeformValues', 'booleanWatchTick', 'rebuildInstanceSDF', 'penMinOverlap', 'detectPenetrationJoint'];
  const exportNames = []; // filled below from whatever exists
  const probe = require('./extract').load();
  for (const n of names) if (new RegExp('^(async )?function ' + n + '\\(', 'm').test(probe) || new RegExp('^(const|let) ' + n + '\\b', 'm').test(probe)) exportNames.push(n);
  const h = await H.build({
    regions: ['booleansys', 'shellsys'].concat(/<meltsys:begin>/.test(probe) ? ['meltsys'] : [], /<ltcbpwatch:begin>/.test(probe) ? ['ltcbpwatch'] : []),
    fns: ['worldTrianglesForPart', 'worldTrianglesForPartRaw', 'dropPartGeometryCaches', 'invalidateWorldTriCache', 'penIndexForPart', 'signedDistanceToMesh', 'buildTriangleSpatialIndex', 'triIndexInit', 'triIndexAdd', 'penMinOverlap', 'detectPenetrationJoint', 'detectAutoPenetrationJoints', 'partWorldAABB'],
    lets: ['_worldTriCache', '_rawTriCache', '_penIndexCache'],
    skip: ['setLoading', 'renderPartDetail', 'refreshPartOpenings', 'refreshAllOpenings'],
    globals: { refreshAllOpenings() {}, renderChannelFlowReport() {}, window: { dispatchEvent() {}, addEventListener() {} }, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; } },
    exportNames,
  });
  if (!h) { console.log('skip - three.js not found'); return; }
  const { THREE, api, state, ctx } = h;
  let n = 0; const test = (t, f) => { api.booleanCacheReset(); state.parts = []; state.instances = []; state.autoShell = true; const r = f(); n++; console.log('ok - ' + t); return r; };
  const mat = new THREE.MeshBasicMaterial();
  const mkPart = (name, type, geos, pos) => {
    const g = new THREE.Group(); (pos ? g.position.copy(pos) : 0);
    const meshes = geos.map(geo => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; }); g.updateMatrixWorld(true);
    return { name, type, contents: type === 'container' ? 'oxidizer' : null, meshes, pivot: g, openings: [], userData: {}, group: g };
  };
  const merge = (...geos) => { // non-indexed merge of position data (enough for these tests)
    const pos = []; for (const g of geos) { const ng = g.index ? g.toNonIndexed() : g; pos.push(...ng.attributes.position.array); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return out;
  };
  const sd = (part, p) => api.signedDistanceToMesh(new THREE.Vector3(...p), api.penIndexForPart(part));
  const hemi = (r) => new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);   // lower hemisphere, normals outward
  const rev = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } return g; };
  const dropCap = (geo, yMin) => { const g = geo.toNonIndexed(), p = g.attributes.position.array, keep = []; for (let i = 0; i < p.length; i += 9) { if ((p[i + 1] + p[i + 4] + p[i + 7]) / 3 < yMin) keep.push(...p.slice(i, i + 9)); } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); return o; };
  const bowl = () => mkPart('bowl', 'container', [merge(hemi(2), rev(hemi(1.85)), new THREE.RingGeometry(1.85, 2, 32).rotateX(-Math.PI / 2))]);

  // ── 15: closed single surface vs surface with a hole ──
  test('15: a closed single-surface mesh keeps its mesh as the collision surface (cavity = space beneath it)', () => {
    const p = mkPart('tank', 'container', [new THREE.SphereGeometry(2, 32, 24)]);
    const a = api.analyzePartShell(p);
    assert.strictEqual(a.kind, 'closed'); assert.strictEqual(a.cavityTris, null);
    assert.strictEqual(api.worldTrianglesForPart(p), api.worldTrianglesForPartRaw(p));
    assert.ok(sd(p, [0, 0, 0]) < -1.9 && sd(p, [0, 0, 2.5]) > 0.4);
  });
  test('15: a single surface with a hole gets an auto shell of the minimum thickness; the cavity is the space beneath it', () => {
    const p = mkPart('tank', 'container', [dropCap(new THREE.SphereGeometry(2, 32, 24), 1.7)]);
    const a = api.analyzePartShell(p);
    assert.strictEqual(a.kind, 'hole'); assert.strictEqual(a.boundaryEdges > 0, true);
    assert.ok(Math.abs(a.thickness - 0.015 * 3.73) < 0.002, 'thickness = 1.5% of the thinnest extent: ' + a.thickness);
    assert.strictEqual(a.cavityTris.length, a.solidTris.length);
    assert.ok(a.rimTris.length > 0 && a.wallTris.length === a.solidTris.length * 2 + a.rimTris.length);
    const R = 2 - a.thickness;
    assert.ok(sd(p, [0, 0, 0]) < -(R - 0.03), 'cavity centre reads inside by ~R: ' + sd(p, [0, 0, 0]));
    assert.ok(sd(p, [0, -(2 - a.thickness / 2), 0]) > 0, 'a point inside the generated wall is solid');
    assert.ok(sd(p, [0, -2.2, 0]) > 0.15, 'outside is outside');
    assert.ok(Math.abs(sd(p, [0, -1.5, 0]) + (R - 1.5)) < 0.04, 'cavity SDF ~ the offset sphere');
    state.autoShell = false; api.invalidateWorldTriCache();
    assert.strictEqual(api.worldTrianglesForPart(p), api.worldTrianglesForPartRaw(p), 'state.autoShell=false keeps the plain mesh');
  });
  test('15: the shell thickness has a floor and can be overridden', () => {
    const p = mkPart('tiny', 'container', [dropCap(new THREE.SphereGeometry(0.05, 16, 12), 0.03)]);
    assert.strictEqual(api.analyzePartShell(p).thickness, 0.002);
    state.autoShellThickness = 0.01; api.invalidateWorldTriCache();
    assert.strictEqual(api.analyzePartShell(p).thickness, 0.01); delete state.autoShellThickness;
  });

  // ── 16: shelled mesh (walnut half) ──
  test('16: a shelled mesh (inner + outer surface joined all round) is a wall with thickness; the cavity is inside the inner layer', () => {
    const p = bowl(), a = api.analyzePartShell(p);
    assert.strictEqual(a.kind, 'shelled'); assert.ok(Math.abs(a.thickness - 0.15) < 0.03, 'wall ~0.15: ' + a.thickness);
    assert.ok(sd(p, [0, -1, 0]) < -0.8, 'the pocket is the cavity: ' + sd(p, [0, -1, 0]));
    assert.ok(sd(p, [0, -1.925, 0]) > 0, 'inside the wall volume is not cavity');
    assert.ok(sd(p, [0, -2.3, 0]) > 0.2, 'outside the bowl is not cavity');
    const solid = api.buildTriangleSpatialIndex(api.partSolidTris(p));
    const ssd = (q) => api.signedDistanceToMesh(new THREE.Vector3(...q), solid);
    assert.ok(ssd([0, -1.925, 0]) < 0 && ssd([0, -1, 0]) < 0 && ssd([0, -2.3, 0]) > 0, 'as a SOLID the envelope includes wall + pocket');
  });
  test('16: a thick solid ball / a closed hollow single surface is not mistaken for a shelled wall', () => {
    const ball = mkPart('ball', 'container', [new THREE.SphereGeometry(1.5, 24, 16)]);
    assert.strictEqual(api.analyzePartShell(ball).kind, 'closed');
    const two = mkPart('two', 'container', [merge(new THREE.SphereGeometry(1, 16, 12), new THREE.SphereGeometry(1, 16, 12).translate(5, 0, 0))]);
    assert.strictEqual(api.analyzePartShell(two).kind, 'multi');
  });

  // ── 17: intersections are sealed joints ──
  test('17: where two meshes intersect the crossing is a sealed joint (centroid on the crossing ring); a graze / sliver is not', () => {
    const A = mkPart('A', 'container', [new THREE.SphereGeometry(1, 32, 24)]), B = mkPart('B', 'container', [new THREE.SphereGeometry(1, 32, 24)], new THREE.Vector3(1.2, 0, 0));
    const x = api.meshesIntersect(A, B);
    assert.ok(x && Math.abs(x.centroid.x - 0.6) < 0.02 && Math.abs(x.radius - 0.8) < 0.1, JSON.stringify(x && [x.centroid.toArray(), x.radius]));
    const C = mkPart('C', 'container', [new THREE.SphereGeometry(1, 32, 24)], new THREE.Vector3(2, 0, 0));
    assert.strictEqual(api.meshesIntersect(A, C), null, 'tangent contact');
    const D = mkPart('D', 'container', [new THREE.SphereGeometry(1, 32, 24)], new THREE.Vector3(1.995, 0, 0));
    assert.strictEqual(api.meshesIntersect(A, D), null, 'sliver overlap');
  });
  test('17: detectAutoPenetrationJoints seals a crossing the cavity Boolean missed, as source "intersection"', () => {
    const A = mkPart('A', 'container', [new THREE.SphereGeometry(1, 32, 24)]), B = mkPart('B', 'container', [new THREE.SphereGeometry(1, 32, 24)], new THREE.Vector3(1.2, 0, 0));
    state.parts = [A, B];
    const real = ctx.detectPenetrationJoint; ctx.detectPenetrationJoint = () => null;
    try {
      const r = api.detectAutoPenetrationJoints([A, B]);
      assert.strictEqual(r.sealedPairs.length, 1); assert.strictEqual(r.sealedPairs[0].source, 'intersection');
      assert.ok(Math.abs(r.sealedPairs[0].centroid.x - 0.6) < 0.02);
    } finally { ctx.detectPenetrationJoint = real; }
  });

  console.log(`\n${n} shell-melt tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
