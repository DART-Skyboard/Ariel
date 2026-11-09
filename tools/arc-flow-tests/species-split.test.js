// Exhaust species split by O/F and temperature (water-gas shift), per-particle species, O2-gated afterburn, smoke optics from species.
const vm = require('vm'), assert = require('assert');
const ex = require('./extract');
const src = ex.load();
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext('const _ss=(a,b,x)=>{const t=Math.min(Math.max((x-a)/(b-a),0),1);return t*t*(3-2*t);};' + ex.region(src, 'flame-model') +
  '\nthis.M = { combProducts, flameSpecies, wgsEquilibrate, FUEL_SPECIES' + (src.includes('function afterburnSpecies') ? ', afterburnSpecies, smokeOptics' : '') + ' };', ctx);
const M = ctx.M; let n = 0; const t = (name, f) => { f(); n++; };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0), near = (a, b, e, m) => assert(Math.abs(a - b) <= e, (m || '') + ' ' + a + ' vs ' + b);
t('mass fractions sum to 1 and carbon/hydrogen are conserved at every O/F and T', () => {
  for (const f of ['rp1', 'ch4', 'lh2', 'hyp']) for (const of of [0.8, 1.5, 2.4, 3.4, 5, 8]) for (const T of [undefined, 1000, 2000, 3500]) {
    const p = M.combProducts(f, of, T), F = M.FUEL_SPECIES[f].fuel;
    near(sum(p.mass), 1, 1e-9, f + of); assert(Object.values(p.mol).every(v => v > -1e-9), f + ' ' + of + ' ' + T);
    near(p.mol.CO + p.mol.CO2 + p.mol.C, F.C, 1e-9, 'C'); near(2 * p.mol.H2O + 2 * p.mol.H2, F.H, 1e-9, 'H');
  }
});
t('O/F sets the split: fuel-rich RP-1 (O/F 1.2) makes soot + CO; stoich-ish (3.4) little; lean (5) has free O2 and no soot', () => {
  const rich = M.combProducts('rp1', 1.2, 3000).mass, mid = M.combProducts('rp1', 3.4, 3000).mass, lean = M.combProducts('rp1', 5, 3000).mass;
  assert(rich.C > 0.05 && rich.CO > 0.3 && rich.C > mid.C * 5 && lean.C === 0 && lean.O2 > 0 && rich.O2 === 0, JSON.stringify({ rich, mid, lean }));
  assert(M.combProducts('lh2', 4, 3000).mass.C === 0 && M.combProducts('lh2', 4, 3000).mass.H2O > 0.5);
});
t('water-gas shift: hot gas keeps CO + H2O, cooler gas shifts to CO2 + H2 (K(T) = exp(4577.8/T - 4.33))', () => {
  const hot = M.combProducts('rp1', 2.4, 3500).mol, mid = M.combProducts('rp1', 2.4, 1200).mol, cold = M.combProducts('rp1', 2.4, 700).mol, base = M.combProducts('rp1', 2.4).mol;
  assert(hot.CO / hot.CO2 > mid.CO / mid.CO2 && mid.CO / mid.CO2 > cold.CO / cold.CO2, 'CO/CO2 falls with T');
  const K = T => Math.exp(4577.8 / T - 4.33);
  for (const [m, T] of [[hot, 3500], [mid, 1200], [cold, 700]]) if (m.CO > 1e-6 && m.H2O > 1e-6) near((m.CO2 * m.H2) / (m.CO * m.H2O), K(T), K(T) * 1e-6 + 1e-9, 'K at ' + T);
  assert(base.CO > 0);
});
t('flameSpecies uses the chamber temperature when given', () => {
  const a = M.flameSpecies('rp1', 2.4, { gas: {}, pRel: 1, T: 3500 }), b = M.flameSpecies('rp1', 2.4, { gas: {}, pRel: 1, T: 900 });
  assert(a.products.CO > b.products.CO && b.products.CO2 > a.products.CO2);
});
console.log(n + ' species-split tests passed');
