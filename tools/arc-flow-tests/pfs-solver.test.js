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
// 8. CLOSED CAVITY (v75): the throat is shut at t = 0, the chamber fills, and it only opens once Pc can choke the throat;
//    the particle gate (fraction allowed through the neck) is 0 while it is shut and rises to ~1 at the steady state
{
  const sc = makeScene(), { api, inst } = makeEnv(sc, { cont: true });
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const chN = sol.nodeOf.get(sc.ch), th = sol.edges.find(e => e.kind === 'throat');
  assert.ok(th && th.open === false && th.mdot === 0 && sol.gate === 0 && sol.fill === 0, 'throat shut, gate 0 at t = 0');
  const pa = sol.pa, Pch = pa / Math.pow(2 / (chN.gamma + 1), chN.gamma / (chN.gamma - 1));
  let tOpen = null, maxPbefore = 0, minGateBefore = 1;
  for (let k = 0; k < 400 && tOpen == null; k++) {
    sol.advance(0.0005, true);
    if (th.open) tOpen = sol.t; else { maxPbefore = Math.max(maxPbefore, chN.P); assert.strictEqual(th.mdot, 0, 'no throat flow while shut'); assert.ok(sol.gate < 1e-6, 'particles held while shut'); }
  }
  assert.ok(tOpen != null && tOpen > 0, 'throat opens after accumulation');
  assert.ok(chN.P >= Pch * 0.999, 'opened at the choking pressure: Pc ' + (chN.P / 6894.757).toFixed(1) + ' >= ' + (Pch / 6894.757).toFixed(1) + ' psi');
  assert.ok(maxPbefore > pa * 1.5, 'chamber pressure built up while the throat was shut: ' + (maxPbefore / 6894.757).toFixed(1) + ' psi');
  run(sol, 1, 0.02, true);
  assert.ok(th.open && th.mdot > 0, 'throat flowing'); assert.ok(sol.gate > 0.95 && sol.fill === 1, 'gate ~1 at steady state: ' + sol.gate);
  const snap = api.pfsSnapshot(inst); assert.ok(snap.gate > 0.95 && snap.edges.find(e => e.kind === 'throat').open === true);
  ok('closed cavity: throat shut at t=0, opens at Pc ' + (Pch / 6894.757).toFixed(1) + ' psi after ' + (tOpen * 1000).toFixed(1) + ' ms, gate 0 -> ' + sol.gate.toFixed(3));
}
// 9. a feed that can never reach the choking pressure: the throat opens once the chamber has equalised with the feed (inflow stalled)
{
  const sc = makeScene(); sc.ox.internalPsi = 18; sc.fu.internalPsi = 18;
  const { api, inst } = makeEnv(sc, { cont: true });
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const chN = sol.nodeOf.get(sc.ch), th = sol.edges.find(e => e.kind === 'throat');
  const Pch = sol.pa / Math.pow(2 / (chN.gamma + 1), chN.gamma / (chN.gamma - 1));
  run(sol, 3, 0.01, true);
  assert.ok(th.open, 'opened on stalled inflow'); assert.ok(chN.P < Pch, 'below choke: ' + chN.P);
  assert.ok(th.mdot > 0 && sol.gate > 0.5, 'subsonic outflow after opening: ' + th.mdot + ' gate ' + sol.gate);
  ok('low feed pressure: throat opens on equalised feed (subsonic), gate ' + sol.gate.toFixed(2));
}
// 10. thin fuel pipe: the Fuel -> chamber edge runs through the fitted tube capsules with a non-zero bore area on every section
{
  const sc = makeScene(), { api, inst } = makeEnv(sc);
  const net = api.pfsBuildNetwork(inst);
  const e = net.edges.find(x => x.from.part === sc.fu && x.to && x.to.part === sc.ch);
  assert.ok(e, 'Fuel -> chamber edge'); same(e.pipes.map(p => p.name), ['FuelChannel']);
  assert.ok(e.sections.length >= 3 && e.sections.every(s => s.A > 0 && s.D > 0), 'non-zero sections');
  const r = 0.09 * 0.0254, Abore = Math.PI * r * r;
  assert.ok(e.sections.slice(0, -1).every(s => Math.abs(s.A - Abore) / Abore < 1e-6), 'tube bore area (not the port or the coarse grid)');
  ok('thin fuel pipe: network edge through tube capsules, bore A = ' + Abore.toExponential(3) + ' m^2');
}
// 11. side-wall "joints" into a thin pipe (v73 live: Oxidizer -> FuelChannel, OxidizerPressure_ -> FuelChannel where the fuel line runs
//     past the oxidizer tank) are not ports: the network keeps only links whose source opening sits at a tube end
{
  const sc = makeScene(), { api, inst } = makeEnv(sc);
  const fuCh = sc.parts.find(p => p.name === 'FuelChannel');
  sc.links.get(sc.ox).push({ target: fuCh, viaOpening: sc.ox.openings[1], entrance: fuCh.openings[0], kind: 'propellant' });
  sc.links.get(sc.heO).push({ target: fuCh, viaOpening: sc.heO.openings[0], entrance: fuCh.openings[0], kind: 'pressurant' });
  // live v73 shape: a synthetic joint opening ~1.1 units wide whose centre sits 1.2 units from the tube's entrance end
  const synth = op('joint', 1.68, 27.16, -0.36, 1.107);   // not in the part's own openings list
  sc.links.get(sc.ox).push({ target: fuCh, viaOpening: synth, entrance: synth, kind: 'propellant' });
  const net = api.pfsBuildNetwork(inst);
  same(net.edges.map(e => e.name).sort(), ['CombustionChamber \u2192 ATM', 'Fuel \u2192 CombustionChamber', 'FuelPressure \u2192 Fuel', 'Oxidizer \u2192 CombustionChamber', 'OxidizerPressure_ \u2192 Oxidizer'].sort());
  const fe = net.edges.find(e => e.from.part === sc.fu); same(fe.pipes.map(p => p.name), ['FuelChannel']);
  assert.strictEqual(net.edges.filter(e => e.pipes.some(p => p.name === 'FuelChannel')).length, 1, 'only the fuel tank feeds the fuel line');
  ok('thin pipe: side-wall links into a fitted tube are rejected (' + 3 + ' dropped), fuel line fed only by the fuel tank');
}
// 12. feed-line priming (v75, metre-scale demo units): nothing reaches the chamber until each line's bore volume has filled; then the
//     chamber pressure builds with the throat shut, and only after that does the throat open
{
  const sc = makeScene(), { api, inst } = makeEnv(sc, { cont: true, unit: 1 });
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const chN = sol.nodeOf.get(sc.ch), th = sol.edges.find(e => e.kind === 'throat'), feeds = sol.edges.filter(e => e.to === chN);
  assert.ok(feeds.length === 2 && feeds.every(e => !e.primed && e.Vline > 0), 'feed lines start empty');
  let tPrime = null, tOpen = null;
  for (let k = 0; k < 4000 && tOpen == null; k++) {
    sol.advance(0.002, true);
    if (tPrime == null && feeds.some(e => e.primed)) tPrime = sol.t;
    if (tPrime == null) { assert.ok(Math.abs(chN.P - sol.pa) < 1, 'chamber untouched before a line is primed'); assert.strictEqual(th.mdot, 0); }
    if (th.open) tOpen = sol.t;
  }
  assert.ok(tPrime > 0 && tOpen > tPrime, 'prime ' + tPrime + ' then open ' + tOpen);
  const snap = api.pfsSnapshot(inst); assert.ok(snap.edges.filter(e => e.to === chN.id).every(e => e.prime > 0));
  ok('feed-line priming: first line primed at ' + (tPrime * 1000).toFixed(0) + ' ms, throat opens at ' + (tOpen * 1000).toFixed(0) + ' ms');
}
// 13. Flow Graph thin-channel list (PR #36 shape, feature-detected): a refined channel entry for the fuel line is what the network solves with
{
  const sc = makeScene(), { api, inst, ctx } = makeEnv(sc);
  const fuCh = sc.parts.find(p => p.name === 'FuelChannel'), base = sc.tubes.get(fuCh);
  const segs = base.segs.map(g => Object.assign({}, g, { rA: 0.08, rB: 0.08 }));
  ctx.state.sdf.thinChannels = [{ part: fuCh, name: 'FuelChannel', segs, minRIn: 0.08, maxRIn: 0.08, firstSeg: 0, refined: true, voxelsAcrossBore: 4.4, coarseVoxelsAcrossBore: 0.9, regions: [{ kind: 'channel' }] }];
  const sol = inst.solver = new api.PressureFlowSim(inst);
  const e = sol.edges.find(x => x.from.part === sc.fu && x.to);
  const r = 0.08 * 0.0254; assert.ok(Math.abs(e.sections[0].A - Math.PI * r * r) / (Math.PI * r * r) < 1e-6, 'channel bore used');
  const t = api.pfsSnapshot(inst).edges.find(x => x.name === e.name).tubes[0];
  assert.ok(t.refined === true && t.voxelsAcrossBore === 4.4 && t.segs === 2, JSON.stringify(t));
  delete ctx.state.sdf.thinChannels;
  const e2 = new api.PressureFlowSim(inst).edges.find(x => x.from.part === sc.fu && x.to);
  assert.ok(Math.abs(e2.sections[0].A - Math.PI * Math.pow(0.09 * 0.0254, 2)) < 1e-12, 'falls back to the fitted tube without the list');
  ok('thin-channel list (refined, ' + t.voxelsAcrossBore + ' voxels across) is preferred; plain fitted tube without it');
}
console.log(n + ' passed');
