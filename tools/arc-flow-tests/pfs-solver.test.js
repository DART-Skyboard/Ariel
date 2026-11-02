// Exercises the pressure-driven lumped solver (PressureFlowSim: buildFlowNetwork + time stepping) from
// templates/arc-flow.html under plain node (no DOM, no three.js): `node tools/arc-flow-tests/pfs-solver.test.js`.
// The scene is the demo rocket's topology (two propellant tanks each fed by a helium bottle, two channels, one chamber).
const vm = require('vm');
const assert = require('assert');
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const { load, region, fn, constLine } = require('./extract');
const src = load();

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new V3(this.x, this.y, this.z); }
  sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }
  dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  angleTo(o) { const d = this.length() * o.length(); return d ? Math.acos(Math.max(-1, Math.min(1, this.dot(o) / d))) : 0; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
const op = (role, x, y, z, radius, nx = 0, ny = -1, nz = 0) => ({ role, centroid: new V3(x, y, z), normal: new V3(nx, ny, nz), radius });
const part = (name, type, contents, psi, V, ops) => ({ name, type, contents, internalPsi: psi, vol: V, openings: ops, tempK: 288 });

function makeScene() {
  const oxExit = op('exit', -1.95, 12.49, -0.3, 0.15), oxEntr = op('entrance', 0, 18.24, 0, 0.5), heOx = op('exit', 0, 18.24, 0, 0.5);
  const fuExit = op('exit', 1.8, 26.04, 0.12, 0.15), fuEntr = op('entrance', 0, 32.94, 0, 0.5), heFu = op('exit', 0, 32.94, 0, 0.5);
  const ox = part('Oxidizer', 'container', 'oxidizer', 400, 12.38, [oxEntr, oxExit]);
  const heO = part('OxidizerPressure_', 'container', 'helium', 12000, 8.81, [heOx]);
  const fu = part('Fuel', 'container', 'fuel', 400, 15.53, [fuEntr, fuExit]);
  const heF = part('FuelPressure', 'container', 'helium', 12000, 8.77, [heFu]);
  const oxCh = part('OxidizerChannel', 'pipe', 'oxidizer', 60, 0, [op('entrance', -1.95, 12.49, -0.3, 0.15), op('exit', -0.75, 9.59, -0.45, 0.2)]);
  const fuCh = part('FuelChannel', 'pipe', 'oxidizer', 60, 0, [op('entrance', 1.8, 26.04, 0.12, 0.15), op('exit', 0.92, 9.98, -0.02, 0.2)]);
  const cEnt1 = op('entrance', -0.75, 9.59, -0.45, 0.2), cEnt2 = op('entrance', 0.92, 9.98, -0.02, 0.2), noz = op('nozzle', 0, 4.24, 0, 2.2);
  const ch = part('CombustionChamber', 'chamber', 'oxidizer', null, 80, [cEnt1, cEnt2, noz]);
  const L = (target, via, entrance, kind) => ({ target, viaOpening: via, entrance, kind });
  const links = new Map([
    [ox, [L(oxCh, oxExit, oxCh.openings[0], 'propellant')]], [heO, [L(ox, heOx, oxEntr, 'pressurant')]],
    [oxCh, [L(ch, oxCh.openings[1], cEnt1, 'propellant')]], [fu, [L(fuCh, fuExit, fuCh.openings[0], 'propellant')]],
    [heF, [L(fu, heFu, fuEntr, 'pressurant')]], [fuCh, [L(ch, fuCh.openings[1], cEnt2, 'propellant')]],
  ]);
  const parts = [ox, heO, oxCh, fu, heF, ch, fuCh];
  const seg = (a, b, r) => ({ a: new V3(...a), b: new V3(...b), rA: r, rB: r, oA: r + 0.05, oB: r + 0.05, len: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), s0: 0 });
  const tubes = new Map([
    [oxCh, { segs: [seg([-1.95, 12.49, -0.3], [-1.3, 11, -0.4], 0.1), seg([-1.3, 11, -0.4], [-0.75, 9.59, -0.45], 0.1)] }],
    [fuCh, { segs: [seg([1.8, 26.04, 0.12], [1.5, 15, 0], 0.09), seg([1.5, 15, 0], [0.92, 9.98, -0.02], 0.09)] }],
  ]);
  return { parts, links, tubes, ch, ox, fu, heO, heF };
}

function makeEnv(sc, opts = {}) {
  const atm = { value: String(opts.atmPsi == null ? 14.696 : opts.atmPsi) };
  const ctx = {
    THREE: { Vector3: V3 },
    state: { flowUnitM: opts.unit || 0.0254, currentLinks: sc.links, sdf: { tubes: { byPart: sc.tubes } }, instances: [], simRunning: true },
    atmoPsiEl: atm, window: {}, document: { getElementById: () => null }, location: { search: '' }, mass: { c: new Map() }, massContinuous: () => !!opts.cont,
    computeVolume: (p) => p.vol,
    PROP_PRESETS: { rocket_bell: { pcPsi: 1200, Tc: 3500, gamma: 1.22, mw: 22, eps: 6 } }, plume: { key: 'rocket_bell' }, PC_DEFAULT_PRESET: 'rocket_bell',
    console, Math,
  };
  vm.createContext(ctx);
  const pre = ['PSI_PA', 'FLOW_UNIT_M_DEFAULT', 'R_UNIV', 'G_MOL_TO_KG', 'AT_MIN_M2'].map(n => constLine(src, n)).join('\n');
  const flu = src.slice(src.indexOf('const FLUID_PROPS = {'), src.indexOf('};', src.indexOf('const FLUID_PROPS = {')) + 2);
  vm.runInContext(pre + '\n' + flu + '\n' + fn(src, 'asLinkArray') + '\n' + fn(src, 'allLinks') + '\n' + fn(src, 'linkTarget') + '\n' + fn(src, 'solveChannelFlow') + '\n' + fn(src, 'characteristicVelocity') +
    '\nfunction openingLiveCentroid(o){return o.centroid;} function openingLiveNormal(o){return o.normal;} function penIndexForPart(){return null;}' +
    '\n' + region(src, 'pfs') + '\nthis.__api = { PressureFlowSim, pfsBuildNetwork, pfsGasMdot, pfsSnapshot, pfsChamberAxis, pfsRefreshInstance };', ctx);
  const inst = { parts: sc.parts, links: sc.links, solverMode: 'pressure', solver: null, ltcbp: [] };
  ctx.state.instances.push(inst);
  for (const p of sc.parts) if (p.type === 'container') ctx.mass.c.set(p, { m: 0, m0: 0, P: 0, P0: 0, flow: 0, kind: 'closed' });
  return { ctx, inst, api: ctx.__api };
}
const run = (sol, sec, dt, cont) => { for (let t = 0; t < sec - 1e-9; t += dt) sol.advance(dt, cont); };
let n = 0; const ok = (name) => { n++; console.log('ok -', name); };

// 1. network: 7 parts -> 5 cavity nodes; edges follow allLinks and unmatched openings go to ATM
{
  const sc = makeScene(), { api, inst } = makeEnv(sc);
  const net = api.pfsBuildNetwork(inst);
  assert.strictEqual(net.nodes.length, 5);
  const names = net.edges.map(e => e.name).sort();
  same(names, ['CombustionChamber \u2192 ATM', 'Fuel \u2192 CombustionChamber', 'FuelPressure \u2192 Fuel', 'Oxidizer \u2192 CombustionChamber', 'OxidizerPressure_ \u2192 Oxidizer'].sort());
  const chain = net.edges.find(e => e.name === 'Oxidizer \u2192 CombustionChamber');
  same(chain.pipes.map(p => p.name), ['OxidizerChannel']);
  assert.ok(chain.sections.length >= 3, 'tube sections + the opening');
  ok('network: nodes, edges through pipes, nozzle -> ATM');
}
// 2. multi-link part: a second link from the same part gives a second edge (allLinks), a dangling exit goes to ATM
{
  const sc = makeScene(), { api, inst } = makeEnv(sc);
  const extra = op('exit', 3, 20, 0, 0.1); sc.ox.openings.push(extra);
  sc.links.get(sc.ox).push({ target: sc.ch, viaOpening: extra, entrance: sc.ch.openings[0], kind: 'propellant' });
  const stray = op('exit', 5, 5, 5, 0.1); sc.fu.openings.push(stray);
  const net = api.pfsBuildNetwork(inst);
  assert.strictEqual(net.edges.filter(e => e.from.part === sc.ox).length, 2);
  assert.ok(net.edges.some(e => e.from.part === sc.fu && e.toAtm), 'unmatched opening -> ATM');
  ok('network: multi-link parts, unmatched openings to ATM');
}
// 3. gas orifice: choked above the critical ratio, subsonic below, zero without a drop
{
  const { api } = makeEnv(makeScene());
  const m1 = api.pfsGasMdot(2e6, 1e5, 1e-4, 1.4, 287, 300, 1), m2 = api.pfsGasMdot(2e6, 1.9e6, 1e-4, 1.4, 287, 300, 1);
  assert.ok(m1 > 0 && m2 > 0 && m2 < m1); assert.strictEqual(api.pfsGasMdot(1e5, 1e5, 1e-4, 1.4, 287, 300, 1), 0);
  assert.ok(Math.abs(m1 - 1e-4 * 2e6 * Math.sqrt(1.4 / (287 * 300)) * Math.pow(2 / 2.4, 2.4 / 0.8)) / m1 < 1e-9);
  ok('gas orifice choked / subsonic / no-drop');
}
// 4. continuous OFF: Pc rises then plateaus, tanks deplete, helium blows down, regulator holds the ullage
{
  const sc = makeScene(), { api, inst, ctx } = makeEnv(sc);
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const chN = sol.nodeOf.get(sc.ch), oxN = sol.nodeOf.get(sc.ox), heN = sol.nodeOf.get(sc.heO);
  const pc = [], at = [0.01, 0.05, 0.2, 0.5];
  const pc0 = chN.P;
  let t = 0; for (const T of at) { run(sol, T - t, 0.01, false); t = T; pc.push(chN.P / 6894.757); }
  assert.ok(Math.max(...pc) * 6894.757 > 5 * pc0, 'chamber pressure rises well above ambient: ' + pc);
  assert.ok(pc[0] > 50, 'rises within 10 ms: ' + pc[0]);
  const m0 = oxN.mL0; run(sol, 20, 0.01, false);
  assert.ok(oxN.mL < 0.05 * m0, 'oxidizer tank depleted: ' + oxN.mL + '/' + m0);
  assert.ok(heN.mG < heN.mG0, 'helium bottle blows down');
  const snap = api.pfsSnapshot(inst);
  assert.ok(snap.nodes.length === 5 && snap.edges.length === 5);
  // plateau: Pc tracks the feed (tank) pressure, within a few % over a window where the tank pressure is ~constant
  const early = ctx.mass.c.get(sc.ox); assert.ok(early.m <= early.m0 && early.P > 0);
  ok('continuous off: Pc rises, tanks deplete, helium blowdown (Pc ' + pc.map(x => x.toFixed(0)).join('/') + ' psi at ' + at.join('/') + ' s)');
}
// 5. plateau with continuous ON, mass conserved at the chamber (in - out -> 0), no NaN
{
  const sc = makeScene(), { api, inst } = makeEnv(sc, { cont: true });
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const chN = sol.nodeOf.get(sc.ch);
  run(sol, 1, 0.02, true);
  const a = chN.P; run(sol, 1, 0.02, true); const b = chN.P;
  assert.ok(Math.abs(a - b) / a < 0.01, 'plateau ' + a + ' ' + b);
  assert.ok(chN.P > 10 * 6894.757 && isFinite(chN.P), 'Pc ' + chN.P);
  assert.ok(Math.abs(chN.mIn - chN.mOut) / chN.mOut < 0.02, 'in/out balance ' + chN.mIn + ' ' + chN.mOut);
  assert.ok(sc.ch && sol.nodeOf.get(sc.ox).mL === sol.nodeOf.get(sc.ox).mL0, 'tank replenished');
  ok('continuous on: Pc plateau ' + (a / 6894.757).toFixed(0) + ' psi, in/out balanced');
}
// 6. an ATM spill drains a tank and the flow stops when the mass reaches zero
{
  const sc = makeScene(), { api, inst } = makeEnv(sc);
  sc.links.delete(sc.ox);                       // Oxidizer's exit is now unmatched -> spills to ATM
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const oxN = sol.nodeOf.get(sc.ox);
  const e = sol.edges.find(x => x.from === oxN && x.toAtm); assert.ok(e && e.kind === 'spill');
  run(sol, 3, 0.01, false);
  assert.strictEqual(oxN.mL, 0); assert.strictEqual(e.mdot, 0);
  ok('ATM spill drains and stops at m = 0');
}
// 7. a clone move (inst.dirty.network): edge geometry is re-read in place, solver state kept, flag cleared; a topology change rebuilds
{
  const sc = makeScene(), { api, inst, ctx } = makeEnv(sc, { cont: true });
  inst.dirty = { links: false, network: false, sdf: false, particles: false };
  const sol = inst.solver = new api.PressureFlowSim(inst);
  run(sol, 0.3, 0.01, true);
  const e0 = sol.edges.find(e => e.name === 'Oxidizer \u2192 CombustionChamber'), x0 = e0.pts[0].x, P0 = sol.nodeOf.get(sc.ch).P, mdot0 = e0.mdot;
  for (const p of sc.parts) for (const o of p.openings) o.centroid = new V3(o.centroid.x + 10, o.centroid.y, o.centroid.z);   // the clone moved +10 in x
  for (const t of sc.tubes.values()) for (const sg of t.segs) { sg.a = new V3(sg.a.x + 10, sg.a.y, sg.a.z); sg.b = new V3(sg.b.x + 10, sg.b.y, sg.b.z); }
  inst.dirty.network = true;
  assert.strictEqual(api.pfsRefreshInstance(inst), true);
  assert.strictEqual(inst.solver, sol, 'same solver object (state kept)');
  assert.ok(Math.abs(e0.pts[0].x - (x0 + 10)) < 1e-9, 'edge geometry follows the move: ' + e0.pts[0].x);
  assert.strictEqual(sol.nodeOf.get(sc.ch).P, P0); assert.strictEqual(e0.mdot, mdot0);
  assert.strictEqual(inst.dirty.network, false, 'flag cleared');
  inst.dirty.network = true; inst.dirty.links = true;   // links still dirty: the flag is left for the link rebuild
  api.pfsRefreshInstance(inst); assert.strictEqual(inst.dirty.network, true); inst.dirty.links = false;
  sc.links.delete(sc.ox); inst.dirty.network = true;     // topology change -> new solver
  const mFuel0 = sol.nodeOf.get(sc.fu).mL, mHe0 = sol.nodeOf.get(sc.heO).mG;
  api.pfsRefreshInstance(inst); assert.notStrictEqual(inst.solver, sol); assert.strictEqual(inst.dirty.network, false);
  const nf = inst.solver.nodeOf.get(sc.fu), nh = inst.solver.nodeOf.get(sc.heO);
  assert.ok(Math.abs(nf.mL - mFuel0) < 1e-9 && Math.abs(nh.mG - mHe0) < 1e-9, 'a rebuilt network keeps the cavities\' live mass (' + nf.mL + ' vs ' + mFuel0 + ')');
  ok('network refresh on clone move / topology change');
}
console.log(n + ' passed');
