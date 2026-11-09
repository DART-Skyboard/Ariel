// Shared flame model: JS mirror vs the GLSL that is injected into the Points / Gaussian / Volumetric shaders, and the
// physical ordering the colours must obey (temperature, not distance; soot orange vs H2 blue; afterburn adds light).
const vm = require('vm'), assert = require('assert');
const ex = require('./extract');
const src = ex.load();
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(ex.region(src, "flame-model") + "\nthis.M = { FLAME, FLAME_GLSL, flameEmission, flameBB, flameTK, flameTn, flameSmoke, flameSpecies, combProducts, FUEL_SPECIES };", ctx);
const M = ctx.M;
let n = 0; const t = (name, f) => { f(); n++; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

t('GLSL carries the same constants as the JS FLAME table', () => {
  const g = M.FLAME_GLSL, F = M.FLAME;
  const num = (name) => { const m = new RegExp(name + ' = ([0-9.e+-]+)').exec(g); assert(m, name); return parseFloat(m[1]); };
  for (const [k, v] of [['FL_TLO', F.TLO], ['FL_THI', F.THI], ['FL_TREF', F.TREF], ['FL_WHITE_LO', F.WHITE_LO], ['FL_WHITE_HI', F.WHITE_HI],
    ['FL_GAS_EPS', F.GAS_EPS], ['FL_SOOT_GAIN', F.SOOT_GAIN], ['FL_SOOT_TMAX', F.SOOT_TMAX], ['FL_SOOT_BURN', F.SOOT_BURN], ['FL_CHEM_GAIN', F.CHEM_GAIN],
    ['FL_CHEM_TLO', F.CHEM_TLO], ['FL_CHEM_THI', F.CHEM_THI], ['FL_CHEM_DIM', F.CHEM_DIM], ['FL_AB_LUM', F.AB_LUM]]) assert.strictEqual(num(k), v, k);
  // every blackbody key (T, r, g, b) appears in flameBB()
  for (const k of F.BB) assert(g.includes('vec3(' + k.slice(1).map(x => /[.e]/.test(String(x)) ? x : x + '.0').join(', ') + ')'), 'BB key ' + k[0]);
  for (const k of F.BB.slice(1)) assert(g.includes('T < ' + (k[0] + '.0')), 'BB T ' + k[0]);
});
t('emission rises monotonically with temperature and is white-hot at the top', () => {
  let prev = -1;
  for (let tn = 0; tn <= 1.0001; tn += 0.05) { const l = lum(M.flameEmission(tn, 0.5, 0.1, 0)); assert(l >= prev - 1e-9, 'monotonic at ' + tn); prev = l; }
  const top = M.flameEmission(1, 0, 0, 0), mx = Math.max(...top), mn = Math.min(...top);
  assert(mn / mx > 0.85, 'core ~white, got ' + top.map(x => x.toFixed(2)));
  const mid = M.flameEmission(0.5, 0.8, 0, 0); assert(mid[0] > mid[2] * 1.8, 'mid temperature is orange/yellow, not white');
  assert(lum(M.flameEmission(0, 0.8, 0.1, 0)) < 0.01, 'cold gas does not glow');
});
t('kerosene is sooty orange, hydrogen pale blue', () => {
  const rp = M.flameSpecies('rp1', 2.4), h2 = M.flameSpecies('lh2', 6);
  const a = M.flameEmission(0.55, rp.soot, rp.chem, 0), b = M.flameEmission(0.55, h2.soot, h2.chem, 0);
  assert(a[0] > a[2] * 1.5, 'RP-1 red>blue'); assert(b[2] > b[0], 'H2 blue>red');
  assert(rp.soot > 0.4 && h2.soot === 0);
});
t('fuel-rich soots more, oxidiser-rich burns clean; unburnt fuel only when fuel-rich', () => {
  assert(M.flameSpecies('rp1', 1.8).soot > M.flameSpecies('rp1', 4.5).soot);
  assert(M.flameSpecies('rp1', 2.4).yf > 0.05 && M.flameSpecies('rp1', 4.5).yf === 0);
});
t('afterburn adds light and burns soot out', () => {
  const a = M.flameEmission(0.5, 0.7, 0.1, 0), b = M.flameEmission(0.5, 0.7, 0.1, 1);
  assert(lum(b) > lum(a));
});
t('smoke goes from steam-grey to sooty black', () => { assert(lum(M.flameSmoke(1)) < lum(M.flameSmoke(0))); });

// air mixing for the afterburn (physics): needs fuel AND ambient O2; starts at the exit, then builds
const ab = {};
vm.createContext(ab);
vm.runInContext('const _ss=(a,b,x)=>{const t=Math.min(Math.max((x-a)/(b-a),0),1);return t*t*(3-2*t);};' + ex.region(src, 'flame-model') + '\n' + ex.fn(src, 'plumeAirMix') + '\nthis.f=plumeAirMix;', ab);
t('air mix: none in vacuum / Mars, none without unburnt fuel, zero at the exit plane', () => {
  const rich = { o2Rel: 1, yf: 0.09 };
  assert.strictEqual(ab.f(5, 0.9, { o2Rel: 0, yf: 0.09 }), 0);
  assert.strictEqual(ab.f(5, 0.9, { o2Rel: 0.001, yf: 0.09 }), 0);
  assert.strictEqual(ab.f(5, 0.9, { o2Rel: 1, yf: 0 }), 0);
  assert.strictEqual(ab.f(0, 0.9, rich), 0);
});
t('air mix: builds downstream, shear layer before the core, scales with ambient O2', () => {
  const rich = { o2Rel: 1, yf: 0.09 };
  assert(ab.f(2, 0.9, rich) > ab.f(0.2, 0.9, rich));
  assert(ab.f(2, 0.9, rich) > ab.f(2, 0.0, rich));
  assert(ab.f(3, 0.9, { o2Rel: 0.5, yf: 0.09 }) < ab.f(3, 0.9, rich));
});

// ── combustion: ignition, mixture -> temperature, flame-out, chained reaction ──
const cm = {};
vm.createContext(cm);
vm.runInContext('const _ss=(a,b,x)=>{const t=Math.min(Math.max((x-a)/(b-a),0),1);return t*t*(3-2*t);};' + ex.region(src, 'flame-model') + '\nthis.C=chamberCombustion;this.A=combAdvance;this.T=combChamberT;this.K=combPcScale;this.R=reactRate;this.COMB=COMB;', cm);
const base = { fuel: 'rp1', of: 2.4, known: true, pcPsi: 300, TpartK: 288, igniter: true, TpeakK: 3500 };
t('combustion: lights with both propellants, pressure and an igniter, near the design flame temperature', () => {
  const c = cm.C(base);
  assert(c.ignitable && c.sustain && c.flammable);
  assert(c.Tad > 3000 && c.Tad <= 3500, 'Tad ' + c.Tad);
});
t('combustion: no igniter -> no light (cold flow), unless hypergolic or the chamber is above autoignition', () => {
  assert(!cm.C({ ...base, igniter: false }).ignitable);
  assert(cm.C({ ...base, igniter: false }).reason.includes('ignition'));
  assert(cm.C({ ...base, igniter: false, fuel: 'hyp', of: 1.9 }).ignitable);
  assert(cm.C({ ...base, igniter: false, TpartK: 650 }).ignitable);
});
t('combustion: one propellant, too lean, too rich, or no pressure -> does not burn', () => {
  assert(!cm.C({ ...base, of: 0 }).flammable);
  assert(!cm.C({ ...base, of: 20 }).flammable);
  assert(!cm.C({ ...base, of: 0.5 }).flammable);
  assert(!cm.C({ ...base, pcPsi: 1 }).flammable);
});
t('combustion: temperature peaks near the nominal O/F and falls on both sides', () => {
  const T = of => cm.T(cm.C({ ...base, of }), 1);
  assert(T(2.4) > T(1.4) && T(2.4) > T(5));
  assert(T(2.4) > 3000 && T(1.4) > 1500);
});
t('combustion: burn builds after ignition, and a lit chamber survives losing the igniter but flames out when the mixture fails', () => {
  const st = { burn: 0, lit: false };
  cm.A(st, cm.C(base), 0.1); assert(st.lit && st.burn > 0 && st.burn < 0.5);
  for (let i = 0; i < 20; i++) cm.A(st, cm.C(base), 0.1); assert(st.burn > 0.95);
  for (let i = 0; i < 5; i++) cm.A(st, cm.C({ ...base, igniter: false }), 0.1); assert(st.lit && st.burn > 0.95);
  for (let i = 0; i < 30; i++) cm.A(st, cm.C({ ...base, of: 0 }), 0.1); assert(!st.lit && st.burn < 0.05);
  const cold = { burn: 0, lit: false }; for (let i = 0; i < 30; i++) cm.A(cold, cm.C({ ...base, igniter: false }), 0.1); assert(cold.burn === 0);
});
t('combustion: unlit chamber is at feed temperature and c* scales with sqrt(T)', () => {
  assert.strictEqual(cm.T(cm.C(base), 0), cm.COMB.T_FEED);
  assert(Math.abs(cm.K(3500, 3500) - 1) < 1e-9 && cm.K(875, 3500) < 0.55);
});
t('chained reaction: hot gas with air burns, cold gas does not, but cold fuel-rich gas next to a flame is lit', () => {
  assert.strictEqual(cm.R(1, 1, 400, 0, 0), 0);                    // cold, no neighbours: no reaction
  assert(cm.R(1, 1, 2500, 0, 0) > 1);                              // hot: burns
  assert.strictEqual(cm.R(1, 0, 2500, 0, 0), 0);                   // no oxygen (vacuum / unmixed): nothing
  assert.strictEqual(cm.R(0, 1, 2500, 0, 0), 0);                   // no fuel left
  assert(cm.R(1, 1, 400, 2, 2400) > 0.5 * cm.R(1, 1, 2500, 0, 0)); // cold parcel beside a burning one ignites
  assert(cm.R(1, 1, 400, 2, 600) < 0.01);                          // ...but not beside gas too cool to ignite it
});

// flame front through a fuel-rich cloud: a row of cold unburnt-fuel parcels on the ground with ONE burning seed; the reaction must travel
// along the row (chain reaction) and heat it, and must not start at all without oxygen.
const rc = {};
vm.createContext(rc);
vm.runInContext('const _ss=(a,b,x)=>{const t=Math.min(Math.max((x-a)/(b-a),0),1);return t*t*(3-2*t);};' + ex.region(src, 'flame-model') +
  '\nconst _rh={cnt:new Float32Array(16384),bq:new Float32Array(16384),bt:new Float32Array(16384)};\nlet plume;' + ex.fn(src, 'plumeAirMix') + ex.fn(src, 'plumeReact') +
  '\nthis.run=function(o2,steps){const N=40;plume={n:N,st:new Uint8Array(N).fill(2),px:new Float32Array(N),py:new Float32Array(N).fill(0.3),pz:new Float32Array(N),tk:new Float32Array(N).fill(400),tn:new Float32Array(N),fu:new Float32Array(N).fill(1),ab:new Float32Array(N),bq:new Float32Array(N),tg:new Float32Array(N).fill(5),ax:new Float32Array(N),sr:new Float32Array(N)};for(let i=0;i<N;i++)plume.px[i]=i*0.6;plume.tk[0]=2600;plume.bq[0]=3;const D={De:1,env:{o2Rel:o2,yf:0.1}};for(let k=0;k<steps;k++)plumeReact(0.04,D);return plume;};', rc);
t('chain reaction: the flame front runs along cold fuel-rich gas from a burning seed, heating it; none without oxygen', () => {
  const p = rc.run(1, 150);                                          // 6 s
  let burned = 0; for (let i = 1; i < 40; i++) if (p.ab[i] > 0.03) burned = i;
  assert(burned >= 15, 'front reached parcel ' + burned);
  assert(p.tk[5] > 1200, 'heated to ' + p.tk[5]);
  const q = rc.run(0, 150);
  for (let i = 1; i < 40; i++) assert.strictEqual(q.ab[i], 0);
});

// reaction products are computed from the propellant chemistry and the atmosphere, not looked up
t('products: stoichiometric O/F falls out of the formulas; atoms and mass are conserved', () => {
  const near = (a, b, e) => Math.abs(a - b) < e;
  assert(near(M.FUEL_SPECIES.rp1.ofStoich, 3.41, 0.02) && near(M.FUEL_SPECIES.ch4.ofStoich, 3.99, 0.02) && near(M.FUEL_SPECIES.lh2.ofStoich, 7.94, 0.02) && near(M.FUEL_SPECIES.hyp.ofStoich, 2.5, 0.02));
  for (const [f, o] of [['rp1', 2.4], ['rp1', 4.5], ['ch4', 3.5], ['lh2', 6], ['hyp', 1.9]]) {
    const p = M.combProducts(f, o), sum = Object.values(p.mass).reduce((a, b) => a + b, 0);
    assert(near(sum, 1, 1e-9), f + ' mass fractions sum to 1');
    const F = M.FUEL_SPECIES[f].fuel, mol = p.mol;                                     // carbon and hydrogen balance per mole of fuel
    assert(near(mol.CO + mol.CO2 + mol.C, F.C, 1e-9) && near(2 * mol.H2O + 2 * mol.H2, F.H, 1e-9), f + ' C/H balance');
  }
});
t('products: fuel-rich kerosene makes CO, H2O, CO2 and soot; lean burns to CO2 + H2O + leftover O2; H2/LOX is only steam (+H2 when rich)', () => {
  const r = M.combProducts('rp1', 2.4).mass, l = M.combProducts('rp1', 4.5).mass, h = M.combProducts('lh2', 6).mass;
  assert(r.CO > 0.2 && r.H2O > 0.3 && r.CO2 > 0.1 && r.C > 0.02 && r.O2 === 0);
  assert(l.CO < 1e-9 && l.C < 1e-6 && l.O2 > 0.1);
  assert(h.H2O > 0.95 && h.CO2 === 0 && h.C === 0 && h.H2 > 0.02);
});
t('species follow the products: soot only from carbon fuels and only fuel-rich; steam needs an atmosphere; NOx needs air; vacuum has none', () => {
  const air = { gas: { N2: 0.781, O2: 0.209 }, pRel: 1 }, mars = { gas: { CO2: 0.953, N2: 0.027, O2: 0.0013 }, pRel: 0.006 }, vac = { gas: {}, pRel: 0 };
  assert(M.flameSpecies('rp1', 2.4, air).soot > 0.5 && M.flameSpecies('lh2', 6, air).soot === 0 && M.flameSpecies('rp1', 4.5, air).soot < 0.1);
  assert(M.flameSpecies('lh2', 6, air).steam > 0.8 && M.flameSpecies('lh2', 6, vac).steam === 0);
  assert(M.flameSpecies('rp1', 2.4, air).nox > 0.9 && M.flameSpecies('rp1', 2.4, mars).nox < 0.05 && M.flameSpecies('rp1', 2.4, vac).nox === 0);
  assert(M.flameSpecies('rp1', 2.4, air).smkMax > M.flameSpecies('rp1', 4.5, air).smkMax, 'sooty exhaust makes denser smoke');
  assert(M.flameSpecies('lh2', 6, vac).smkMax < M.flameSpecies('lh2', 6, air).smkMax);
});
console.log(n + ' tests passed');
