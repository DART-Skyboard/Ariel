'use strict';
const assert = require('assert');
const R = require('../../templates/intuition/src/raster.js'), Lib = require('../../templates/intuition/src/shell64.js'), G = require('../../templates/intuition/src/generate.js'), TL = require('../../templates/intuition/src/timeline.js'), B = require('../../templates/intuition/src/leatr-bridge.js');
let pass = 0; const t = (n, f) => { try { const r = f(); if (r && r.then) return r.then(() => { pass++; console.log('ok  ' + n); }); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n  ' + e.message); process.exitCode = 1; } };
const px = (r, g, b, a) => new Uint8ClampedArray([r, g, b, a]);
const solid = (w, h, r, g, b, a) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set([r, g, b, a], i * 4); return d; };

(async () => {
  // ---- raster ----
  t('opaque normal layer replaces backdrop', () => {
    const out = R.composite([R.createLayer(1, 1, { data: px(255, 0, 0, 255) }), R.createLayer(1, 1, { data: px(0, 0, 255, 255) })], 1, 1);
    assert.deepStrictEqual([...out], [0, 0, 255, 255]);
  });
  t('50% alpha over opaque mixes colour, stays opaque', () => {
    const out = R.composite([R.createLayer(1, 1, { data: px(255, 0, 0, 255) }), R.createLayer(1, 1, { data: px(0, 0, 255, 128) })], 1, 1);
    assert.strictEqual(out[3], 255); assert.ok(Math.abs(out[0] - 127) <= 1 && Math.abs(out[2] - 128) <= 1, [...out].join());
  });
  t('transparent pixels stay transparent (alpha channel kept)', () => {
    const out = R.composite([R.createLayer(2, 1, { data: new Uint8ClampedArray([10, 20, 30, 0, 200, 100, 50, 255]) })], 2, 1);
    assert.strictEqual(out[3], 0); assert.deepStrictEqual([...out.slice(4)], [200, 100, 50, 255]);
  });
  t('two half-transparent layers: Porter-Duff alpha 0.75', () => {
    const out = R.composite([R.createLayer(1, 1, { data: px(255, 255, 255, 128) }), R.createLayer(1, 1, { data: px(255, 255, 255, 128) })], 1, 1);
    assert.ok(Math.abs(out[3] - 192) <= 1, 'alpha ' + out[3]);
  });
  t('multiply blend, layer opacity, mask and visibility', () => {
    const m = R.composite([R.createLayer(1, 1, { data: px(200, 100, 50, 255) }), R.createLayer(1, 1, { data: px(128, 128, 128, 255), blend: 'multiply' })], 1, 1);
    assert.ok(Math.abs(m[0] - 100) <= 1 && Math.abs(m[1] - 50) <= 1, [...m].join());
    const o = R.composite([R.createLayer(1, 1, { data: px(0, 0, 0, 255) }), R.createLayer(1, 1, { data: px(255, 255, 255, 255), opacity: 0.5 })], 1, 1);
    assert.ok(Math.abs(o[0] - 128) <= 1);
    const k = R.composite([R.createLayer(1, 1, { data: px(0, 0, 0, 255) }), R.createLayer(1, 1, { data: px(255, 255, 255, 255), mask: new Uint8ClampedArray([0]) })], 1, 1);
    assert.strictEqual(k[0], 0);
    const v = R.composite([R.createLayer(1, 1, { data: px(9, 9, 9, 255), visible: false })], 1, 1); assert.strictEqual(v[3], 0);
  });
  t('layer offset and clipping at canvas edges', () => {
    const L = R.createLayer(2, 2, { data: solid(2, 2, 255, 0, 0, 255), x: 1, y: 1 }), out = R.composite([L], 2, 2);
    assert.strictEqual(out[3], 0); assert.strictEqual(out[(1 * 2 + 1) * 4 + 3], 255);
  });
  t('background colour fills transparent canvas', () => {
    const out = R.composite([], 1, 1, [10, 20, 30, 255]); assert.deepStrictEqual([...out], [10, 20, 30, 255]);
  });
  t('premultiply/unpremultiply round trip within 1 level for opaque, 2 for translucent', () => {
    const d = new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 200]), back = R.unpremultiply(R.premultiply(d));
    for (let i = 0; i < 8; i++) assert.ok(Math.abs(back[i] - d[i]) <= 2, i + ':' + back[i]);
  });
  t('resize keeps colour of cutout edge (no dark fringe)', () => {
    const src = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]), out = R.resize(src, 2, 1, 4, 1);
    for (let i = 0; i < 4; i++) if (out[i * 4 + 3] > 0) assert.ok(out[i * 4] >= 250, 'px ' + i + ' r=' + out[i * 4]);
  });

  // ---- shell64 ----
  t('library holds exactly 64 slots and rejects the 65th', () => {
    const lib = new Lib(); for (let i = 0; i < 64; i++) lib.addImage({ name: 'a' + i, w: 2, h: 2, data: solid(2, 2, i, i, i, 255) });
    assert.strictEqual(lib.count(), 64); assert.throws(() => lib.addImage({ w: 1, h: 1, data: solid(1, 1, 0, 0, 0, 255) }), /full/);
    assert.strictEqual(lib.remove(5), true); assert.strictEqual(lib.addImage({ w: 1, h: 1, data: solid(1, 1, 1, 1, 1, 255) }), 5);
  });
  t('explicit slot rules: occupied and out of range', () => {
    const lib = new Lib(); lib.addImage({ w: 1, h: 1, data: solid(1, 1, 0, 0, 0, 255) }, 3);
    assert.throws(() => lib.addImage({ w: 1, h: 1, data: solid(1, 1, 0, 0, 0, 255) }, 3), /occupied/);
    assert.throws(() => lib.addImage({ w: 1, h: 1, data: solid(1, 1, 0, 0, 0, 255) }, 64), /range/);
    assert.throws(() => lib.addImage({ w: 2, h: 2, data: new Uint8ClampedArray(3) }), /RGBA/);
  });
  t('big references are fitted to 256px, signature is deterministic', () => {
    const lib = new Lib(), d = solid(1024, 512, 10, 200, 30, 255); const i = lib.addImage({ w: 1024, h: 512, data: d }), s = lib.get(i);
    assert.strictEqual(s.w, 256); assert.strictEqual(s.h, 128);
    const lib2 = new Lib(); lib2.addImage({ w: 1024, h: 512, data: d }); assert.strictEqual(lib2.get(0).sig.hash, s.sig.hash);
    assert.deepStrictEqual(s.sig.palette[0].rgb, [10, 200, 30]); assert.strictEqual(s.sig.alpha, 1);
  });
  t('cutout alpha coverage is measured', () => {
    const lib = new Lib(), d = solid(4, 4, 255, 0, 0, 255); for (let i = 0; i < 8; i++) d[i * 4 + 3] = 0; lib.addImage({ w: 4, h: 4, data: d });
    assert.ok(Math.abs(lib.get(0).sig.alpha - 0.5) < 1e-6);
  });
  t('video slot loops frames over time and caps frame count', () => {
    const lib = new Lib(), fr = []; for (let i = 0; i < 40; i++) fr.push({ w: 2, h: 2, data: solid(2, 2, i, 0, 0, 255) });
    lib.addVideo({ name: 'v', frames: fr, fps: 10 }); assert.strictEqual(lib.get(0).frames.length, 24);
    assert.strictEqual(lib.frameAt(0, 0).data[0], 0); assert.strictEqual(lib.frameAt(0, 0.3).data[0], 3); assert.strictEqual(lib.frameAt(0, 2.4).data[0], 0);
  });
  t('conditioning merges palettes dark->light', () => {
    const lib = new Lib(); lib.addImage({ w: 1, h: 1, data: solid(1, 1, 250, 250, 250, 255) }); lib.addImage({ w: 1, h: 1, data: solid(1, 1, 5, 5, 5, 255) });
    const c = lib.conditioning([0, 1]); assert.ok(R.luma(...c.palette[0]) < R.luma(...c.palette[c.palette.length - 1])); assert.strictEqual(lib.conditioning([40]), null);
  });
  t('serialize/deserialize round-trips pixels and kinds', () => {
    const lib = new Lib(); lib.addImage({ name: 'img', w: 3, h: 2, data: solid(3, 2, 1, 2, 3, 200) }, 7);
    lib.addVideo({ name: 'vid', fps: 8, frames: [{ w: 2, h: 2, data: solid(2, 2, 9, 9, 9, 255) }, { w: 2, h: 2, data: solid(2, 2, 8, 8, 8, 255) }] }, 9);
    const back = Lib.deserialize(lib.serialize()); assert.strictEqual(back.get(7).name, 'img'); assert.deepStrictEqual([...back.get(7).data], [...lib.get(7).data]);
    assert.strictEqual(back.get(9).kind, 'video'); assert.strictEqual(back.get(9).frames.length, 2); assert.throws(() => Lib.deserialize('{"v":2}'), /Shell64/);
  });

  // ---- generator ----
  const refLib = () => { const lib = new Lib(), d = new Uint8ClampedArray(32 * 32 * 4); for (let i = 0; i < 1024; i++) d.set([220, 80 + (i % 32) * 4, 40, 255], i * 4); lib.addImage({ name: 'r', w: 32, h: 32, data: d }); return lib; };
  t('generator is deterministic and layered with real alpha', () => {
    const a = G.generate({ w: 96, h: 54, seed: 7 }, null, 0), b = G.generate({ w: 96, h: 54, seed: 7 }, null, 0);
    assert.deepStrictEqual(a.layers.map(l => l.name), ['Sky', 'Terrain', 'Glow', 'Mist']);
    a.layers.forEach((l, i) => assert.deepStrictEqual([...l.data], [...b.layers[i].data]));
    const terrain = a.layers[1].data; let clear = 0, solidc = 0; for (let i = 3; i < terrain.length; i += 4) { if (terrain[i] === 0) clear++; if (terrain[i] === 255) solidc++; }
    assert.ok(clear > 100 && solidc > 100, 'terrain should be partly transparent: ' + clear + '/' + solidc);
  });
  t('seed, time and references change the picture', () => {
    const base = G.render({ w: 64, h: 36, seed: 1 }, null, 0).data, other = G.render({ w: 64, h: 36, seed: 2 }, null, 0).data, later = G.render({ w: 64, h: 36, seed: 1, speed: 1 }, null, 2).data;
    const lib = refLib(), withRef = G.render({ w: 64, h: 36, seed: 1, refs: [0] }, lib, 0).data;
    const diff = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s; };
    assert.ok(diff(base, other) > 1000); assert.ok(diff(base, later) > 1000); assert.ok(diff(base, withRef) > 1000);
  });
  t('reference palette steers the sky colours', () => {
    const lib = new Lib(); lib.addImage({ w: 4, h: 4, data: solid(4, 4, 255, 0, 0, 255) });
    const sky = G.generate({ w: 64, h: 36, seed: 3, refs: [0], style: 'ridge' }, lib, 0).layers[0].data; let r = 0, b = 0; for (let i = 0; i < sky.length; i += 4) { r += sky[i]; b += sky[i + 2]; }
    assert.ok(r > b * 3, 'expected red-dominant sky, r=' + r + ' b=' + b);
  });
  t('cutout reference becomes a Subject layer that keeps its alpha', () => {
    const lib = new Lib(), d = solid(16, 16, 255, 255, 255, 0); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) d.set([255, 255, 255, 255], (y * 16 + x) * 4); lib.addImage({ w: 16, h: 16, data: d });
    const g = G.generate({ w: 96, h: 54, seed: 4, refs: [0] }, lib, 0), sub = g.layers[g.layers.length - 1]; assert.strictEqual(sub.name, 'Subject');
    let clear = 0; for (let i = 3; i < sub.data.length; i += 4) if (sub.data[i] === 0) clear++; assert.ok(clear > 0);
    assert.strictEqual(G.generate({ w: 96, h: 54, seed: 4, refs: [0], subject: false }, lib, 0).layers.some(l => l.name === 'Subject'), false);
  });
  t('transparent render keeps alpha 0 where nothing drew (nebula has opaque sky, so use empty stack)', () => {
    assert.strictEqual(R.composite([], 4, 4)[3], 0); assert.strictEqual(G.render({ w: 64, h: 36 }, null, 0, [0, 0, 0, 255]).data[3], 255);
  });
  t('params are clamped', () => { const p = G.normalize({ w: 99999, h: 1, mix: 9, style: 'bogus', particles: -5 }); assert.deepStrictEqual([p.w, p.h, p.mix, p.style, p.particles], [1920, 64, 1, 'meadow', 0]); });

  // ---- timeline ----
  t('timeline interpolates with easing and holds ends', () => {
    const tl = new TL({ fps: 30, duration: 2 }); tl.setKey('mix', 0, 0); tl.setKey('mix', 2, 1);
    assert.strictEqual(tl.frameCount(), 60); assert.strictEqual(tl.value('mix', 1), 0.5); assert.strictEqual(tl.value('mix', 9), 1); assert.strictEqual(tl.value('speed', 0), undefined);
    tl.setKey('mix', 2, 1, 'in'); assert.strictEqual(tl.value('mix', 1), 0.25 * 1); // ease-in at u=.5 => .25
    assert.strictEqual(tl.paramsAt({ mix: 0.9, seed: 3 }, 0).mix, 0); assert.strictEqual(tl.paramsAt({ seed: 3 }, 0).seed, 3);
    assert.throws(() => tl.setKey('mix', -1, 1)); assert.throws(() => tl.setKey('mix', 1, NaN)); assert.strictEqual(tl.removeKey('mix', 2), true);
  });

  // ---- LEATR bridge ----
  await t('bridge: no relay url => deterministic local plan', async () => {
    const a = await B.plan({ text: 'Strawberry meadow at dawn' }), b = await B.plan({ text: 'Strawberry meadow at dawn' }); assert.strictEqual(a.source, 'local'); assert.deepStrictEqual(a, b);
  });
  await t('bridge: posts only text (+team) to <relay>/team and accepts a valid plan', async () => {
    let seen; const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ text: 'ok', program: 'k1 k2', team: { members: [] } }) }; };
    const p = await B.plan({ url: 'https://relay.example/', text: 'hello', team: { members: [] }, fetchImpl });
    assert.strictEqual(p.source, 'relay'); assert.strictEqual(seen.url, 'https://relay.example/team'); assert.deepStrictEqual(Object.keys(seen.body).sort(), ['team', 'text']);
  });
  await t('bridge: bad reply, http error, network error and plain http all fall back to local', async () => {
    const bad = async () => ({ ok: true, json: async () => ({ nope: 1 }) }), http500 = async () => ({ ok: false, status: 500 }), boom = async () => { throw new Error('offline'); };
    for (const f of [bad, http500, boom]) { const p = await B.plan({ url: 'https://relay.example', text: 'x', fetchImpl: f }); assert.strictEqual(p.source, 'local'); assert.ok(p.error); }
    const p = await B.plan({ url: 'http://evil.example', text: 'x', fetchImpl: async () => { throw new Error('should not be called'); } }); assert.strictEqual(p.source, 'local'); assert.match(p.error, /https/);
    await assert.rejects(() => B.plan({ text: '   ' }), /required/);
  });
  await t('bridge: prompt is capped at 500 chars', async () => {
    let n; await B.plan({ url: 'https://r.example', text: 'a'.repeat(900), fetchImpl: async (u, i) => { n = JSON.parse(i.body).text.length; return { ok: true, json: async () => ({ text: '', program: '' }) }; } }); assert.strictEqual(n, 500);
  });
  t('plan -> params is deterministic and only picks filled slots', () => {
    const lib = refLib(); lib.addImage({ w: 1, h: 1, data: solid(1, 1, 5, 5, 5, 255) }, 20);
    const plan = { text: 't', program: 'k:a k:b' }, a = B.paramsFromPlan(plan, lib, { w: 64, h: 36 }), b = B.paramsFromPlan(plan, lib, { w: 64, h: 36 });
    assert.deepStrictEqual(a, b); a.refs.forEach(r => assert.ok([0, 20].includes(r.slot))); assert.ok(G.STYLES.includes(a.style));
    assert.deepStrictEqual(B.paramsFromPlan(plan, null, {}).refs, []);
  });

  console.log('\n' + pass + ' passed' + (process.exitCode ? ' — with FAILURES' : ''));
})();
