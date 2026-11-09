// Melting model: alloy table (cited melting points/strength/density/viscosity) and the per-region wall heat balance.
const vm = require('vm'), assert = require('assert');
const ex = require('./extract');
const src = ex.load();
const ctx = { Math, console, Array, Float32Array, Uint8Array, Object };
vm.createContext(ctx);
vm.runInContext(ex.region(src, "melt-model") + "\nthis.M = { WALL_ALLOYS, WALLHEAT, wallAlloyFor, wallGasSide, wallStepPart, wallPurityScale, wallMach, wallYieldDerate };", ctx);
const M = ctx.M;
let n = 0; const t = (name, f) => { f(); n++; };

t('every MATERIALS preset has a melt record whose yield/density match the preset row; Tm < Tliq (or equal for near-pure)', () => {
  const rows = {}; for (const m of src.matchAll(/^  (\w+): +\['[^']*', *(\d+), *(\d+), *(\d+),/gm)) rows[m[1]] = { rho: +m[2], yld: +m[4] };
  for (const id of Object.keys(M.WALL_ALLOYS)) {
    const a = M.WALL_ALLOYS[id], r = rows[id]; assert(r, 'MATERIALS row for ' + id);
    assert.strictEqual(a.rho, r.rho, id + ' density'); assert.strictEqual(a.yieldMPa, r.yld, id + ' yield');
    assert(a.Tliq >= a.Tm && a.Tm > 300, id + ' temps');
  }
});
t('known melting points', () => {
  const A = M.WALL_ALLOYS;
  assert.strictEqual(A.inconel.Tm, 1533); assert.strictEqual(A.inconel.Tliq, 1609);      // 1260-1336 C
  assert.strictEqual(A.al2195.Tm, 823); assert.strictEqual(A.al2195.Tliq, 933);          // 550-660 C
  assert(A.copper.Tm < A.stainless.Tm && A.stainless.Tm < A.titanium.Tm && A.al7075.Tm < A.copper.Tm);
  assert(A.cfrp.kind === 'decomp' && A.glass.kind === 'soften');
});
t('custom alloy: user values override defaults, liquidus never below solidus', () => {
  const c = M.wallAlloyFor('custom', { Tm: 2100, yieldMPa: 700 });
  assert.strictEqual(c.Tm, 2100); assert.strictEqual(c.yieldMPa, 700); assert(c.Tliq >= 2100); assert(c.rho > 0);
  assert.strictEqual(M.wallAlloyFor('nope').Tm, M.WALL_ALLOYS.al2195.Tm);
});
t('Mach from area ratio: subsonic < 1 < supersonic, round trip', () => {
  for (const g of [1.15, 1.22, 1.4]) for (const ar of [1.5, 4, 10]) {
    const ms = M.wallMach(ar, g, true), mb = M.wallMach(ar, g, false);
    assert(ms > 1 && mb < 1);
  }
  assert(Math.abs(M.wallMach(2, 1.4, true) - 2.197) < 0.01, 'air A/A*=2 -> M 2.197');
});
t('gas side: adiabatic wall temp ~ Tc at the throat..chamber and falls down the nozzle; film coefficient peaks at the throat', () => {
  const g = (ar, sup) => M.wallGasSide({ Tc: 3500, gamma: 1.22, pcPa: 8e6, Dt: 0.1, ar, supersonic: sup, film: 0 });
  const th = g(1, false), ex2 = g(6, true), ch = g(4, false);
  assert(th.Taw > 3200 && th.Taw < 3500 && ex2.Taw < th.Taw); assert(th.hg > ex2.hg && th.hg > ch.hg);
  assert(M.wallGasSide({ Tc: 3500, gamma: 1.22, pcPa: 8e6, Dt: 0.1, ar: 1, film: 0.25 }).Taw < th.Taw);
});
t('purity: reference is neutral, cleaner propellant is hotter, dirty is cooler', () => {
  assert.strictEqual(M.wallPurityScale(null), 1); assert(Math.abs(M.wallPurityScale(M.WALLHEAT.PURITY_REF) - 1) < 1e-9);
  assert(M.wallPurityScale(1) > 1.1 && M.wallPurityScale(0.9) < 0.8);
});
// 5 axial regions: throat first, then expansion.
function run(matId, o = {}) {
  const A = M.wallAlloyFor(matId), p = { inconel: [11.4, 435, 0.7], copper: [320, 390, 0.05], stainless: [16, 500, 0.35], al2195: [85, 900, 0.1] }[matId];
  const pcPsi = o.pcPsi || 1200, Tc = 288 + (3500 - 288) * M.wallPurityScale(o.purity), ars = [1, 1.3, 2, 4, 6], n = ars.length;
  const S = { n, T: new Float32Array(n).fill(288), s: new Float32Array(n), melted: new Uint8Array(n), q: new Float32Array(n) };
  const gs = ars.map((ar, i) => M.wallGasSide({ Tc, gamma: 1.22, pcPa: pcPsi * 6894.76, Dt: 0.1, ar, supersonic: i > 0, film: o.film == null ? M.WALLHEAT.FILM_ETA : o.film }));
  const cooled = o.cooled !== false, dP = (pcPsi - 14.7) * 6894.76;
  const E = { alloy: A, k: p[0], cp: p[1], eps: p[2], t: cooled ? M.WALLHEAT.LINER_M : 3e-3, tStruct: 1.5 * dP * 0.2 / (A.yieldMPa * 1e6 * 0.6), Tg: gs.map(g => g.Taw), hg: gs.map(g => g.hg),
    L2: ars.map(() => 0.05), nb: ars.map((_, i) => [i - 1, i + 1].filter(j => j >= 0 && j < n)), paPa: 101325, dPPa: dP, r: 0.2, cooled, Tcool: M.WALLHEAT.T_COOL, hCool: M.WALLHEAT.H_COOL };
  const events = []; M.wallStepPart(S, E, o.secs || 120, i => events.push(i));
  return { S, events };
}
t('a regen-cooled copper liner runs indefinitely even on pure propellant', () => {
  const r = run('copper', { purity: 1, secs: 600 }); assert.strictEqual(r.events.length, 0); assert(Math.max(...r.S.T) < 900, 'wall ' + Math.max(...r.S.T));
});
t('default regen Inconel 718 chamber survives nominal propellant with margin', () => {
  const r = run('inconel'); assert.strictEqual(r.events.length, 0); assert(Math.max(...r.S.T) < 1533 - 100, 'wall ' + Math.max(...r.S.T));
});
t('pure propellant + a thin film at the same pc destroys the throat region only, one event per region', () => {
  const r = run('inconel', { purity: 1, film: 0.15 }); assert.deepStrictEqual(r.events, [0]); assert.strictEqual(r.S.melted[0], 1); assert.strictEqual(r.S.melted[4], 0);
  assert(r.S.T[0] > r.S.T[4]);
});
t('an uncooled thin wall melts everywhere within seconds (any alloy), cooled design does not', () => {
  for (const m of ['inconel', 'stainless', 'al2195']) { const r = run(m, { cooled: false, film: 0, secs: 8 }); assert.strictEqual(r.events.length, 5, m); }
});
t('radiation + convection alone hold an unheated wall at ambient; conduction smooths a hot spot', () => {
  const A = M.wallAlloyFor('inconel'), n = 3, S = { n, T: new Float32Array([288, 1400, 288]), s: new Float32Array(n), melted: new Uint8Array(n), q: new Float32Array(n) };
  const E = { alloy: A, k: 11.4, cp: 435, eps: 0.7, t: 3e-3, tStruct: 3e-3, Tg: [288, 288, 288], hg: [0, 0, 0], L2: [0.01, 0.01, 0.01], nb: [[1], [0, 2], [1]], paPa: 101325, dPPa: 0, r: 0.1, cooled: false, Tcool: 300, hCool: 0 };
  M.wallStepPart(S, E, 600, null); assert(S.T[1] < 900 && S.T[0] > 288 && S.T[2] > 288);
  M.wallStepPart(S, E, 5e4, null); assert(Math.max(...S.T) < 300, 'cools back to ambient: ' + Math.max(...S.T));
});
console.log(n + ' melt-model tests passed');
