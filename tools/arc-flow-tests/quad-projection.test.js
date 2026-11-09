// QUAD RULE: triangulated meshes are quadrangulated before collision-body projection / SDF subdiv.
const assert = require('assert');
const H = require('./harness');
(async () => {
  const probe = require('./extract').load();
  const names = ['quadrangulateFlatTris', 'quadsToFlatTris', 'projectQuadsForSdf', 'subdivideLargeQuads',
    'worldTrianglesForPart', 'worldTrianglesForPartRaw', 'sampleSDFGrid', 'buildTriangleSpatialIndex', 'triIndexInit', 'triIndexAdd'];
  const h = await H.build({
    regions: ['shellsys'],
    fns: ['worldTrianglesForPart', 'worldTrianglesForPartRaw', 'dropPartGeometryCaches', 'quadrangulateFlatTris', 'quadsToFlatTris',
      'projectQuadsForSdf', 'subdivideLargeQuads', 'subdivideLargeTris', 'sampleSDFGrid', 'sdfGridPrep', 'buildTriangleSpatialIndex',
      'triIndexInit', 'triIndexAdd', 'signedDistanceToMesh', 'penIndexForPart'],
    lets: ['_worldTriCache', '_rawTriCache', '_penIndexCache'],
    skip: ['setLoading', 'renderPartDetail', 'refreshPartOpenings', 'refreshAllOpenings'],
    globals: { refreshAllOpenings() {}, setLoading() {}, window: { dispatchEvent() {}, addEventListener() {} },
      CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; } },
    exportNames: names.filter(n => new RegExp('^((async )?function ' + n + '\\(|const ' + n + ' =)', 'm').test(probe)),
  });
  if (!h) { console.log('skip - three.js not found'); return; }
  const { THREE, api, ctx } = h;
  let n = 0; const test = (t, f) => { f(); n++; console.log('ok - ' + t); };
  const mat = new THREE.MeshBasicMaterial();

  test('a triangulated box (12 tris / 6 faces) quadrangulates back to 6 quads; projection emits tris from those quads', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat); m.updateMatrixWorld(true);
    const part = { name: 'box', type: 'container', meshes: [m], pivot: m, openings: [], userData: {} };
    const tris = api.worldTrianglesForPartRaw(part);
    assert.strictEqual(tris.length / 3, 12, 'BoxGeometry is 12 triangles');
    const quads = api.quadrangulateFlatTris(tris);
    assert.strictEqual(quads.length / 4, 6, 'paired into 6 face quads, got ' + (quads.length / 4));
    const back = api.quadsToFlatTris(quads);
    assert.strictEqual(back.length / 3, 12, 'each quad emits 2 tris');
    const proj = api.projectQuadsForSdf(tris, 10, null, { left: 100000 }, 0, null); // large maxEdge = no subdiv
    assert.ok(proj.quadCount >= 6, 'projection tracked quads: ' + proj.quadCount);
    assert.strictEqual(proj.inputTris, 12);
    assert.ok(proj.tris.length / 3 >= 12);
  });

  test('a triangulated pipe (TubeGeometry) is quadrangulated and SDF prep reports quad stats (not triangle-only subdiv)', () => {
    const path = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0));
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, 8, 0.2, 8, false), mat); m.updateMatrixWorld(true);
    const part = { name: 'pipe', type: 'pipe', meshes: [m], pivot: m, openings: [], userData: {} };
    const tris = api.worldTrianglesForPartRaw(part);
    assert.ok(tris.length / 3 > 16, 'tube has many tris');
    const quads = api.quadrangulateFlatTris(tris);
    const qn = quads.length / 4, tn = tris.length / 3;
    assert.ok(qn < tn, 'fewer quads than tris: q=' + qn + ' t=' + tn);
    assert.ok(qn >= tn / 2 - 2, 'most tris paired into quads: q=' + qn);
    const stats = { virtualAdded: 0, voxels: 0, quads: 0 };
    const box = new THREE.Box3().setFromObject(m).expandByScalar(0.3);
    ctx.sdfGridPrep(box, [6, 6, 6], tris, { stats, phongAlpha: 0 });
    assert.ok(stats.quads > 0, 'sdfGridPrep used quad projection, quads=' + stats.quads);
  });

  console.log('\n' + n + ' quad-projection tests passed');
})().catch(e => { console.error(e); process.exit(1); });
