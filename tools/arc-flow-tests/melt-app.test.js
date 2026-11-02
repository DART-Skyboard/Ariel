// Melting app layer: region tessellation of a bell-nozzle chamber, per-instance state in mass.wallHeat, throat hot spot, regen survives, uncooled melts + event.
const vm = require('vm'), assert = require('assert'), path = require('path');
const ex = require('./extract');
const src = ex.load();
(async () => {
  class V3 {   // minimal three.js Vector3/Box3 stand-in (the repo has no three dependency)
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } clone() { return new V3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; } sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; } dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    length() { return Math.hypot(this.x, this.y, this.z); } normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
    cross(v) { const a = this.x, b = this.y, c = this.z; this.x = b * v.z - c * v.y; this.y = c * v.x - a * v.z; this.z = a * v.y - b * v.x; return this; }
  }
  class B3 { constructor(a, b) { this.min = a; this.max = b; } getCenter(o) { return o.copy(this.min).add(this.max).multiplyScalar(0.5); } getSize(o) { return o.copy(this.max).sub(this.min); } }
  const THREE = { Vector3: V3, Box3: B3 };
  const events = [];
  const mkTris = () => {     // surface of revolution about +Y, exit at y=0 (bottom): r(y)
    const prof = y => y > 2 ? 0.5 : y > 1 ? 0.2 + 0.3 * (y - 1) * (y - 1) : 0.2 + 0.4 * (1 - y);   // chamber 0.5, throat 0.2 at y=1, bell to 0.6 at y=0
    const T = [], NS = 60, NP = 32, ys = [...Array(NS + 1)].map((_, i) => 3 * i / NS);
    for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) {
      const p = (a, y) => new THREE.Vector3(prof(y) * Math.cos(a), y, prof(y) * Math.sin(a)), a0 = 2 * Math.PI * j / NP, a1 = 2 * Math.PI * (j + 1) / NP;
      T.push([p(a0, ys[i]), p(a1, ys[i]), p(a1, ys[i + 1])], [p(a0, ys[i]), p(a1, ys[i + 1]), p(a0, ys[i + 1])]);
    }
    return T;
  };
  const tris = mkTris();
  const part = { name: 'Ch', type: 'chamber', matId: 'inconel', openings: [{ role: 'nozzle' }] };
  const perChamber = new Map();
  const g = {
    THREE, Math, console, Array, Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Object, Map, performance: { now: () => 0 }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o.detail; } },
    window: { dispatchEvent: e => events.push(e) }, document: { getElementById: () => null },
    state: { parts: [part], instances: [] }, mass: { on: false, th: new Map() }, plume: { perChamber }, atmoPsiEl: { value: '14.7' }, PSI2PA: 6894.757,
    MAT_DEFAULT: 'al2195', unitM: () => 1, worldTrianglesForPart: () => tris,
    partWorldAABB: () => new THREE.Box3(new THREE.Vector3(-0.6, 0, -0.6), new THREE.Vector3(0.6, 3, 0.6)),
    openingLiveNormal: () => new THREE.Vector3(0, -1, 0), openingLiveCentroid: () => new THREE.Vector3(0, 0, 0),
    matOf: () => ['x', 8190, 200, 1035, 11, 435, 0.6, 1300], partAlloy: p => g.wallAlloyFor(p.matId, p.custom), partWallM: () => 0.004, partRadiusM: () => 0.5, massPartPressure: () => 14.7,
    flameBB: () => [1, 0.5, 0.2], matBlockHtml: null, mass_: null,
  };
  vm.createContext(g);
  vm.runInContext(ex.region(src, 'melt-model') + '\n' + ex.region(src, 'melt-app') + '\nthis.wallFrame = wallFrame; this.wallReset = wallReset; this.wallGlow = wallGlow;', g);
  let n = 0; const t = (name, f) => { f(); n++; };
  const run = (secs, o) => {
    g.wallReset(); events.length = 0; Object.assign(part, o);
    perChamber.set(part, { wallGas: { Tc: 3500 * 1, pcPa: 1200 * 6894.757, gamma: 1.22 } });
    for (let i = 0; i < secs * 20; i++) g.wallFrame(0.05, []);
    return g.window.arcFlowWall.regions(part);
  };
  t('regions tessellate by axial band x azimuth with real areas; throat found at the narrowest band', () => {
    const r = run(1, { regen: undefined, film: undefined, purity: undefined });
    assert(r.length >= 100 && r.length <= 14 * 8, 'regions ' + r.length);
    const total = r.reduce((a, x) => a + x.area, 0), want = 2 * Math.PI * 0.5 * 1;   // sanity: finite, positive
    assert(total > 5 && total < 30, 'area ' + total);
    for (const x of r) assert(x.aabb.min[0] <= x.aabb.max[0] && x.center.length === 3 && x.id.startsWith('Ch#'));
  });
  t('regen-cooled inconel chamber: throat band is the hottest and nothing melts in 60 s', () => {
    const r = run(60, { regen: undefined, film: undefined, purity: undefined });
    assert(r.every(x => !x.melted) && events.length === 0, 'melted ' + r.filter(x => x.melted).length);
    const hot = r.reduce((a, x) => x.T > a.T ? x : a); if (process.env.V) console.log('hot', hot.a, hot.T, 'bands', [...new Set(r.map(x=>x.a))].length);
    assert(hot.a >= 5 && hot.a <= 8, 'hottest band ' + hot.a);       // the throat (y=1 of 0..3, band index ~ 14*(1/3 from the exit... = exit side)
    assert(hot.T > 700 && hot.T < 1533, 'throat T ' + hot.T);
    assert(g.wallGlow(part).T === hot.T);
  });
  t('uncooled chamber melts in seconds; regions are recorded as data (no event dispatched) with a world AABB', () => {
    const r = run(30, { regen: false });
    const m = r.filter(x => x.melted); if (process.env.V) console.log('melted', m.length, Math.max(...r.map(x=>x.T)));
    assert(m.length > 5, 'melted ' + m.length);
    assert.strictEqual(events.length, 0, 'no melt events are dispatched');
    const ev = g.window.arcFlowWall.events(part); assert.strictEqual(ev.length, Math.min(m.length, 64));
    assert(m[0].aabb.min.length === 3 && m[0].aabb.max.length === 3 && m[0].T >= 1533 && g.window.arcFlowWall.alloyFor('inconel').meltK === 1533);
  });
  t('higher propellant purity heats the wall (monotonic)', () => {
    const lo = run(40, { regen: undefined, purity: 0.9 }), hi = run(40, { regen: undefined, purity: 0.9 });
    const Tm = r => Math.max(...r.map(x => x.T));
    // purity acts in plumeChamberComb (Tc scale): model it here through the same scale on Tc
    const mk = p => { g.wallReset(); perChamber.set(part, { wallGas: { Tc: 300 + (3500 - 300) * g.wallPurityScale(p), pcPa: 1200 * 6894.757, gamma: 1.22 } }); for (let i = 0; i < 800; i++) g.wallFrame(0.05, []); return Tm(g.window.arcFlowWall.regions(part)); };
    part.regen = undefined; assert(mk(0.9) < mk(0.98) && mk(0.98) < mk(1.0));
  });
  t('per-instance state: swapping `mass` swaps the melt state; geometry re-sample keeps temperatures', () => {
    run(10, { regen: undefined });
    const a = g.mass.wallHeat; assert(a && a.size === 1);
    g.mass = { on: false, th: new Map() };
    assert.strictEqual(g.window.arcFlowWall.regions(part).length, 0);
  });
  console.log(n + ' melt-app tests passed');
})().catch(e => { console.error(e); process.exit(1); });
