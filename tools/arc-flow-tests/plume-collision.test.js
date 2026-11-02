// Exhaust/smoke collision bodies (ground plane + boxes) and the shear-driven curl force, under plain node:
// `node tools/arc-flow-tests/plume-collision.test.js`
const vm = require('vm');
const assert = require('assert');
const { load, region } = require('./extract');
const src = load();
const N = 400;
const plume = { n: 0, st: new Uint8Array(N), px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
  stats: { maxWall: 20 }, tune: {}, F: null };
const parts = [{ name: 'Launch Platform', type: 'structure' }, { name: 'Tank', type: 'container' }];
const ctx = { Math, plume, state: { parts }, THREE: { BoxGeometry: function () {}, MeshStandardMaterial: function () {}, Mesh: function () { this.position = { set() {} }; this.scale = { set() {} }; } }, scene: { add() {} }, document: { getElementById: () => null }, location: { search: '' }, URLSearchParams,
  partWorldAABB: (p) => ({ min: { x: -5, y: -1, z: -5 }, max: { x: 5, y: 3, z: 5 } }), isFinite, window: {}, Float32Array, console };
vm.createContext(ctx);
vm.runInContext(region(src, 'plumecoll') + '\nthis.__api = { plumeColl, plumeSD, plumeCollRefresh, plumeCurlBuild, plumeCurlForce };', ctx);
const A = ctx.__api;
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);

// 1. ground plane only
A.plumeColl.boxes = [];
near(A.plumeSD(3, 2, 4), 2); near(A.plumeColl.ny, 1); near(A.plumeSD(0, -0.5, 0), -0.5);
// 2. part matching the platform name becomes a box (name filter ignores the tank); box clamped to the ground
A.plumeCollRefresh(null, null);
assert.strictEqual(A.plumeColl.boxes.length, 1); assert.strictEqual(A.plumeColl.boxes[0].y0, 0);
// 3. above the top face: distance = height above the top, normal up
near(A.plumeSD(0, 4, 0), 1); near(A.plumeColl.ny, 1);
// beside the +x face: normal +x, distance 2
near(A.plumeSD(7, 2.5, 0), 2); near(A.plumeColl.nx, 1); near(A.plumeColl.ny, 0);
// inside the box: negative (nearest face is the top, 0.5 below it)
assert.ok(A.plumeSD(0, 2.5, 0) < 0); near(A.plumeSD(0, 2.5, 0), -0.5);
// past the platform edge the ground takes over
near(A.plumeSD(20, 1, 0), 1); near(A.plumeColl.ny, 1);
// corner: diagonal distance
near(A.plumeSD(6, 4, 0), Math.hypot(1, 1));
// 4. platform slab follows the nozzle foot
A.plumeColl.platform.on = true;
A.plumeCollRefresh({ C: { x: 10, z: -4 }, H: 40 }, { De: 2 });
const pb = A.plumeColl.platform.box;
assert.ok(pb && pb.x0 < 10 && pb.x1 > 10 && pb.y0 === 0 && pb.y1 > 1); assert.strictEqual(A.plumeColl.boxes.length, 2);
// 5. curl force from velocity shear: a sheared wall-jet layer (u depends on z) -> nonzero force; uniform flow -> none
plume.n = 300; plume.F = { C: { x: 0, z: 0 } };
for (let i = 0; i < 300; i++) { plume.st[i] = 2; plume.px[i] = (i % 20) - 10; plume.pz[i] = Math.floor(i / 20) - 7; plume.py[i] = 1 + (i % 3) * 0.5; plume.vx[i] = 5 + 3 * plume.pz[i]; plume.vy[i] = 0; plume.vz[i] = 0; }
A.plumeCurlBuild({ C: { x: 0, z: 0 } }, { De: 2 });
assert.ok(A.plumeColl.stats.curlMax > 0.1, 'curlMax ' + A.plumeColl.stats.curlMax);
const f = { x: 0, y: 0, z: 0 }; let any = 0;
for (let i = 0; i < 300; i += 7) { A.plumeCurlForce(plume.px[i], plume.py[i], plume.pz[i], f); any += Math.hypot(f.x, f.y, f.z); }
assert.ok(any > 0, 'confinement force present');
for (let i = 0; i < 300; i++) { plume.vx[i] = 5; }
A.plumeCurlBuild({ C: { x: 0, z: 0 } }, { De: 2 });
assert.ok(A.plumeColl.stats.curlMax < 1e-4, 'uniform flow has no vorticity: ' + A.plumeColl.stats.curlMax);
console.log('6 plume-collision tests passed');
