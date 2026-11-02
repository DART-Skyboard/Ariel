// Smoke far-field: plumeGroundWeight() must fade smoothly (no hard kill) out to SMOKE.FADE_M in every direction, and survivors must keep the density.
const vm = require('vm'), assert = require('assert');
const ex = require('./extract');
const src = ex.load();
const block = (start) => { const a = src.indexOf(start); const b = src.indexOf('\n};', a) + 3; return src.slice(a, b); };
const ctx = { Math, plume: null, metresToWU: (m) => m };
vm.createContext(ctx);
vm.runInContext('const _ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };\n' +
  block('const SMOKE = {') + '\n' + ex.fn(src, 'plumeGroundWeight') + '\nthis.W = plumeGroundWeight; this.SMOKE = SMOKE;', ctx);
const { W, SMOKE } = ctx;
let n = 0; const t = (name, f) => { f(); n++; };
const mk = (o) => { const a = (v) => [v]; ctx.plume = { tg: a(o.tg), life: a(o.life || 2), sv: a(o.sv ? 1 : 0), gw: a(o.gw || 1), gwS: a(o.gwS || 0), lifeS: a(o.lifeS || 40),
  px: a(o.x || 0), py: a(o.y || 0), pz: a(o.z || 0), cx: a(0), cz: a(0) }; return W(0); };

t('wall-jet particles fade out over their own short life', () => {
  assert(mk({ tg: 0 }) > 0.99); assert(mk({ tg: 1.5 }) < mk({ tg: 1 })); assert.strictEqual(mk({ tg: 2 }), 0);
});
t('survivors outlive the wall-jet life and carry the weight of their siblings', () => {
  assert(mk({ sv: true, tg: 10, gwS: 3 }) > mk({ tg: 1 }));
  assert.strictEqual(mk({ sv: true, tg: 10, gwS: 0 }), 0);   // no carried weight, wall jet over -> gone
});
t('smoke dissipates gradually with distance, in every direction, reaching zero at SMOKE.FADE_M', () => {
  const R = SMOKE.FADE_M;
  for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    let prev = Infinity;
    for (let d = 0; d <= R; d += R / 40) {
      const w = mk({ sv: true, tg: 5, gwS: 2, x: dir[0] * d, y: dir[1] * d, z: dir[2] * d });
      assert(w <= prev + 1e-9, 'monotonic ' + dir + ' ' + d); prev = w;
    }
    assert(mk({ sv: true, tg: 5, gwS: 2, x: dir[0] * R * 0.5, y: dir[1] * R * 0.5, z: dir[2] * R * 0.5 }) > 0.5, 'still dense at half range');
    assert.strictEqual(mk({ sv: true, tg: 5, gwS: 2, x: dir[0] * R, y: dir[1] * R, z: dir[2] * R }), 0);
    const mid = mk({ sv: true, tg: 5, gwS: 2, x: dir[0] * R * 0.78, y: dir[1] * R * 0.78, z: dir[2] * R * 0.78 });
    assert(mid > 0.05 && mid < 1.9, 'gradual, not a step: ' + mid);
  }
});
t('no tile / floor-edge cutoff: a survivor 150 m away (beyond the old 99 m tile edge) is still visible', () => {
  assert(mk({ sv: true, tg: 5, gwS: 2, x: 150 }) > 0.3);
});
t('survivors fade with age before their life ends (no pop)', () => {
  assert(mk({ sv: true, tg: 2 + 38, lifeS: 40, gwS: 2 }) < mk({ sv: true, tg: 2 + 10, lifeS: 40, gwS: 2 }));
  assert.strictEqual(mk({ sv: true, tg: 2 + 40, lifeS: 40, gwS: 2 }), 0);
});
console.log(n + ' tests passed');
