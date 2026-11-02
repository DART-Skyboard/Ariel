// Exercises buildFlowGraph / tagFlowGraph / renderJointReport from templates/arc-flow.html under plain node
// (no DOM, no three.js): run with `node tools/arc-flow-tests/flow-graph.test.js`.
const vm = require('vm');
const assert = require('assert');
const { load, region, fn } = require('./extract');
const src = load();

// Minimal Vector3 stand-in: just what the graph code touches.
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new V3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = Math.sqrt(this.lengthSq()) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}

function makeEnv() {
  const el = { innerHTML: '' };
  const ctx = {
    THREE: { Vector3: V3 },
    state: { parts: [], currentLinks: null },
    document: { getElementById: (id) => (id === 'jointReport' ? el : null) },
    refreshAllOpenings() {},
    renderChannelFlowReport() {},
    partCentroid: (p) => p.pos.clone(),
    _sealed: [],                       // what the (mesh-based) auto detector "found" for this test
    detectAutoPenetrationJoints() { return { sealedPairs: ctx._sealed, rejectedPairs: [] }; },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(region(src, 'flowgraph') + '\n' + region(src, 'jointreport') + '\n' + fn(src, 'upstreamContents') + '\n' + fn(src, 'chamberMixture') +
    '\nthis.__api = { buildFlowGraph, firstLink, allLinks, asLinkArray, linkTarget, renderJointReport, upstreamContents, chamberMixture };', ctx);
  return { ctx, el, api: ctx.__api };
}
// vm contexts have their own Array.prototype: compare structurally via JSON
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const part = (name, type, contents, x, y, z) => ({ name, type, contents, pos: new V3(x, y, z), openings: [], userData: {} });
const opening = (id, role, x, y, z) => ({ id, role, centroid: new V3(x, y, z), radius: 0.1, normal: new V3(0, -1, 0) });
const names = (arr) => Array.from(arr, l => l.target.name).sort();

let n = 0;
function test(title, fn) { fn(); n++; console.log('ok - ' + title); }

test('manual pass: a part with several exit openings keeps every link (from -> many)', () => {
  const { ctx, api } = makeEnv();
  const tank = part('tank', 'container', 'fuel', 0, 10, 0);
  const p1 = part('pipeA', 'pipe', 'fuel', -5, 5, 0), p2 = part('pipeB', 'pipe', 'fuel', 5, 5, 0);
  tank.openings = [opening('e1', 'exit', -5, 8, 0), opening('e2', 'exit', 5, 8, 0)];
  p1.openings = [opening('i', 'entrance', -5, 8, 0)];
  p2.openings = [opening('i', 'entrance', 5, 8, 0)];
  ctx.state.parts = [tank, p1, p2];
  const links = api.buildFlowGraph();
  same(names(api.allLinks(links, tank)), ['pipeA', 'pipeB']);
});

test('auto pass: a node with two synthesized joints keeps BOTH (old links.has(from) skip dropped the 2nd)', () => {
  const { ctx, api } = makeEnv();
  const tank = part('tank', 'container', 'oxidizer', 0, 10, 0);
  const p1 = part('pipeA', 'pipe', null, -3, 5, 0), p2 = part('pipeB', 'pipe', null, 3, 5, 0);
  ctx.state.parts = [tank, p1, p2];
  ctx._sealed = [
    { partA: tank, partB: p1, centroid: new V3(-3, 8, 0), radius: 0.2 },
    { partA: p2, partB: tank, centroid: new V3(3, 8, 0), radius: 0.2 },   // reversed pair order: rank decides direction
  ];
  const links = api.buildFlowGraph();
  const out = api.allLinks(links, tank);
  same(names(out), ['pipeA', 'pipeB']);
  assert.ok(out.every(l => l.auto && l.boolean));
  // synthesized openings face along the flow axis, not a hardcoded +Y
  const toA = out.find(l => l.target === p1);
  assert.ok(toA.viaOpening.normal.x < 0 && toA.viaOpening.normal.y < 0, 'normal points tank -> pipeA');
  assert.strictEqual(ctx.state.autoPenetrationSkipped.length, 0);
});

test('duplicate pair is skipped, not appended twice', () => {
  const { ctx, api } = makeEnv();
  const tank = part('tank', 'container', 'fuel', 0, 10, 0), p1 = part('pipeA', 'pipe', null, 0, 5, 0);
  ctx.state.parts = [tank, p1];
  ctx._sealed = [{ partA: tank, partB: p1, centroid: new V3(0, 8, 0), radius: 0.2 }, { partA: p1, partB: tank, centroid: new V3(0, 8, 0), radius: 0.2 }];
  const links = api.buildFlowGraph();
  assert.strictEqual(api.allLinks(links, tank).length, 1);
  assert.strictEqual(ctx.state.autoPenetrationSkipped.length, 1);
});

function feedTrain() {
  const env = makeEnv();
  const he = part('He', 'container', 'helium', 0, 20, 0);
  const lox = part('LOX', 'container', 'oxidizer', -4, 12, 0), rp1 = part('RP1', 'container', 'fuel', 4, 12, 0);
  const pOx = part('oxLine', 'pipe', null, -4, 6, 0), pF = part('fuelLine', 'pipe', null, 4, 6, 0);
  const ch = part('chamber', 'chamber', null, 0, 0, 0);
  env.ctx.state.parts = [lox, rp1, he, pOx, pF, ch];
  // pair order deliberately puts the propellant tank first: flowRank must still orient helium -> tank
  env.ctx._sealed = [
    { partA: lox, partB: he, centroid: new V3(-2, 16, 0), radius: 0.2 },
    { partA: rp1, partB: he, centroid: new V3(2, 16, 0), radius: 0.2 },
    { partA: lox, partB: pOx, centroid: new V3(-4, 9, 0), radius: 0.2 },
    { partA: rp1, partB: pF, centroid: new V3(4, 9, 0), radius: 0.2 },
    { partA: pOx, partB: ch, centroid: new V3(-2, 3, 0), radius: 0.2 },
    { partA: pF, partB: ch, centroid: new V3(2, 3, 0), radius: 0.2 },
  ];
  return Object.assign(env, { he, lox, rp1, pOx, pF, ch });
}

test('edges and nodes are tagged pressurant vs propellant', () => {
  const { ctx, api, he, lox, rp1, pOx, ch } = feedTrain();
  const links = api.buildFlowGraph();
  const kinds = (p) => api.allLinks(links, p).map(l => l.target.name + ':' + l.kind).sort();
  same(kinds(he), ['LOX:pressurant', 'RP1:pressurant']);   // helium branches to both tanks
  same(kinds(lox), ['oxLine:propellant']);
  same(kinds(pOx), ['chamber:propellant']);
  assert.strictEqual(links.nodes.get(he).kind, 'pressurant');
  assert.strictEqual(links.nodes.get(lox).kind, 'propellant');
  same(links.nodes.get(lox).pressurizedBy.map(p => p.name), ['He']);
  same(links.nodes.get(rp1).pressurizedBy.map(p => p.name), ['He']);
  assert.strictEqual(links.nodes.get(ch).kind, 'propellant');
  assert.strictEqual(ctx.state.flowNodes, links.nodes);
});

test('a line fed only by helium stays pressurant; a line fed by both is mixed', () => {
  const { ctx, api, he } = feedTrain();
  const vent = part('vent', 'pipe', null, 8, 20, 0);
  ctx.state.parts.push(vent);
  ctx._sealed.push({ partA: he, partB: vent, centroid: new V3(4, 20, 0), radius: 0.1 });
  let links = api.buildFlowGraph();
  assert.strictEqual(api.allLinks(links, he).find(l => l.target === vent).kind, 'pressurant');
  // now also feed the vent from a propellant tank
  const lox = ctx.state.parts.find(p => p.name === 'LOX');
  ctx._sealed.push({ partA: lox, partB: vent, centroid: new V3(0, 14, 0), radius: 0.1 });
  links = api.buildFlowGraph();
  assert.strictEqual(links.nodes.get(vent).kind, 'mixed');
});

test('firstLink prefers the propellant edge (particle paths walk to the nozzle)', () => {
  const { ctx, api, lox, he } = feedTrain();
  // give LOX a second, pressurant-tagged outgoing edge listed FIRST
  const links = api.buildFlowGraph();
  const arr = links.get(lox);
  arr.unshift({ target: he, kind: 'pressurant', viaOpening: arr[0].viaOpening, entrance: arr[0].entrance });
  assert.strictEqual(api.firstLink(links, lox).kind, 'propellant');
  assert.strictEqual(api.firstLink(links, he).kind, 'pressurant');
  assert.strictEqual(api.firstLink(new Map(), he), undefined);
});

test('legacy single-object link values still resolve', () => {
  const { api } = makeEnv();
  const a = { name: 'a' }, l = { target: { name: 'b' }, kind: 'propellant' };
  const m = new Map([[a, l]]);
  assert.strictEqual(api.firstLink(m, a), l);
  same(api.allLinks(m, a), [l]);
});

test('renderJointReport separates pressurant from propellant', () => {
  const { ctx, el, api } = feedTrain();
  ctx.state.currentLinks = api.buildFlowGraph();
  api.renderJointReport();
  const html = el.innerHTML;
  assert.ok(html.includes('Pressurant path'), 'pressurant header');
  assert.ok(html.includes('Propellant path'), 'propellant header');
  assert.ok(html.indexOf('Pressurant path') < html.indexOf('Propellant path'));
  assert.ok(/\[pressurant\]<\/b> He → LOX/.test(html));
  assert.ok(/\[propellant\]<\/b> oxLine → chamber/.test(html));
  assert.ok(!html.includes('both already have an outgoing link'));
});

test('chamberMixture resolves the parts behind links (was always 0: it compared link records to parts)', () => {
  const { ctx, api, pOx, pF, ch } = feedTrain();
  ctx.state.currentLinks = api.buildFlowGraph();
  ctx.state.channelFlows = new Map([[pOx, { mdot: 2 }], [pF, { mdot: 1 }]]);
  assert.strictEqual(api.upstreamContents(pOx, 0), 'oxidizer');
  assert.strictEqual(api.upstreamContents(pF, 0), 'fuel');
  const m = api.chamberMixture(ch);
  assert.strictEqual(m.mOx, 2); assert.strictEqual(m.mFuel, 1); assert.strictEqual(m.mdot, 3); assert.strictEqual(m.of, 2);
});

test('chamberMixture ignores channels that do not feed the chamber, and zero-flow channels', () => {
  const { ctx, api, pOx, pF, ch } = feedTrain();
  const other = part('otherLine', 'pipe', null, 9, 9, 0);
  ctx.state.parts.push(other);
  ctx.state.currentLinks = api.buildFlowGraph();
  ctx.state.channelFlows = new Map([[pOx, { mdot: 2 }], [pF, { mdot: 0 }], [other, { mdot: 5 }]]);
  const m = api.chamberMixture(ch);
  assert.strictEqual(m.mOx, 2); assert.strictEqual(m.mFuel, 0); assert.strictEqual(m.of, 0);
});

test('upstreamContents prefers the propellant source over a helium (pressurant) edge into the same part', () => {
  const { ctx, api, he, lox } = feedTrain();
  const line = part('shared', 'pipe', null, 0, 8, 0);
  ctx.state.parts.push(line);
  // helium listed first so a first-match walk would return 'helium'
  ctx._sealed.unshift({ partA: he, partB: line, centroid: new V3(0, 14, 0), radius: 0.1 });
  ctx._sealed.push({ partA: lox, partB: line, centroid: new V3(-2, 10, 0), radius: 0.1 });
  ctx.state.currentLinks = api.buildFlowGraph();
  assert.strictEqual(api.upstreamContents(line, 0), 'oxidizer');
  // helium-only line: falls back to its pressurant source rather than ''
  const vent = part('vent', 'pipe', null, 8, 20, 0);
  ctx.state.parts.push(vent);
  ctx._sealed.push({ partA: he, partB: vent, centroid: new V3(4, 20, 0), radius: 0.1 });
  ctx.state.currentLinks = api.buildFlowGraph();
  assert.strictEqual(api.upstreamContents(vent, 0), 'helium');
});

test('chamberMixture handles legacy single-object link values', () => {
  const { ctx, api, pOx, ch } = feedTrain();
  const lox = ctx.state.parts.find(p => p.name === 'LOX');
  const links = new Map([[lox, { target: pOx, kind: 'propellant' }], [pOx, { target: ch, kind: 'propellant' }]]);
  ctx.state.currentLinks = links;
  ctx.state.channelFlows = new Map([[pOx, { mdot: 4 }]]);
  assert.strictEqual(api.chamberMixture(ch).mOx, 4);
});

test('renderJointReport: the "touching, no fluid path" section only renders when rejectedPairs is non-empty', () => {
  const { ctx, el, api, lox, he } = feedTrain();
  ctx.state.currentLinks = api.buildFlowGraph();
  ctx.state.autoPenetrationRejected = [];
  api.renderJointReport();
  assert.ok(!/Touching, no fluid path/.test(el.innerHTML) && !el.innerHTML.includes('✕'));
  ctx.state.autoPenetrationRejected = [{ partA: lox, partB: he }];
  api.renderJointReport();
  assert.ok(/Touching, no fluid path/.test(el.innerHTML) && el.innerHTML.includes('✕ LOX ↔ He'));
});

test('Boolean/joint detection stays volumetric and render-mode independent (it only decides which parts form which system)', () => {
  const { fn } = require('./extract');
  const code = [region(src, 'flowgraph'), fn(src, 'detectPenetrationJoint'), fn(src, 'detectAutoPenetrationJoints'), fn(src, 'refineThinOverlap')].join('\n')
    .replace(/\/\/.*$/gm, '');  // ignore comments
  for (const bad of ['renderMode', 'setRenderMode', 'gaussian', 'gsMesh', 'particleSystem', 'raymarch'])
    assert.ok(!code.includes(bad), 'joint detection must not depend on ' + bad);
  assert.ok(code.includes('signedDistanceToMesh'), 'cavity test is signed-distance (volumetric)');
});

console.log(`\n${n} tests passed`);
