'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
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
  t('params are clamped', () => { const p = G.normalize({ w: 99999, h: 1, mix: 9, style: 'bogus', particles: -5 }); assert.deepStrictEqual([p.w, p.h, p.mix, p.style, p.particles], [4096, 64, 1, 'meadow', 0]); });

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
  await t('bridge: Apps Script /exec URL uses the shell64team action as text/plain', async () => {
    let seen; const u = 'https://script.google.com/macros/s/AKfycbTEST_123-x/exec', f = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ ok: true, text: 'plan', program: 'k1', team: { members: [] } }) }; };
    const p = await B.plan({ url: u, text: 'hi', team: null, fetchImpl: f }); assert.strictEqual(p.source, 'relay'); assert.strictEqual(seen.url, u);
    assert.strictEqual(seen.init.headers['Content-Type'], 'text/plain'); assert.deepStrictEqual(JSON.parse(seen.init.body), { action: 'shell64team', text: 'hi', team: null });
    const bad = await B.plan({ url: u, text: 'hi', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, error: 'busy' }) }) }); assert.strictEqual(bad.source, 'local'); assert.match(bad.error, /busy/);
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

  // ---- export: JXL / PNG / MP4 ----
  const crypto = require('crypto'), zlib = require('zlib'), cp = require('child_process');
  const J = require('../../templates/intuition/src/jxl.js'), PNG = require('../../templates/intuition/src/png.js'), MP4 = require('../../templates/intuition/src/mp4.js');
  const FX = require('./jxl-fixtures.js'), GOLD = require('./jxl-golden.json');
  const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
  const jxlOf = (f, extra) => { const e = new J.Encoder(Object.assign({ width: f.w, height: f.h, alpha: f.alpha, animated: f.animated, fps: f.fps, groupShift: f.groupShift }, extra)); f.frames.forEach(d => e.addFrame(d)); return e.finish(); };
  for (const [name, f] of Object.entries(FX)) t('jxl: ' + name + ' is byte-identical to the Frax JXL reference encoder', () => {
    const out = jxlOf(f); assert.strictEqual(out[0], 0xFF); assert.strictEqual(out[1], 0x0A);
    assert.strictEqual(out.length, GOLD[name].bytes); assert.strictEqual(sha(out), GOLD[name].sha256);
  });
  t('jxl: near-lossless step makes a smaller file than lossless on smooth content', () => {
    const f = FX.smooth_rgba_150x140_4groups; assert.ok(jxlOf(f, { step: 6 }).length < jxlOf(f).length);
  });
  t('jxl: bad input is rejected, a still takes one frame', () => {
    assert.throws(() => new J.Encoder({ width: 0, height: 5 })); const e = new J.Encoder({ width: 4, height: 4, alpha: false }); e.addFrame(new Uint8ClampedArray(64)); assert.throws(() => e.addFrame(new Uint8ClampedArray(64)));
    assert.throws(() => new J.Encoder({ width: 4, height: 4 }).addFrame(new Uint8ClampedArray(8)));
  });
  const py = cp.spawnSync('python3', ['-c', 'import imagecodecs'], { encoding: 'utf8' });
  if (py.status === 0) {
    const decode = bytes => { const f = path.join(require('os').tmpdir(), 'intuition-t-' + process.pid + '.jxl'); fs.writeFileSync(f, bytes);
      const r = cp.spawnSync('python3', ['-c', 'import sys,imagecodecs,numpy as np;a=imagecodecs.jpegxl_decode(open(sys.argv[1],"rb").read());sys.stdout.buffer.write(np.array(a.shape,np.int32).tobytes()+a.astype(np.uint8).tobytes())', f], { maxBuffer: 1 << 28 }); fs.unlinkSync(f); assert.strictEqual(r.status, 0);
      return r.stdout; };
    const unpack = (buf, dims) => Buffer.from(buf.subarray(dims * 4));
    t('jxl: libjxl decodes our still pixel-exactly (colour under clear pixels is dropped)', () => {
      const f = FX.smooth_rgba_150x140_4groups, out = decode(jxlOf(f)), px = unpack(out, 3), src = f.frames[0];
      for (let i = 0; i < f.w * f.h; i++) { const clear = src[i * 4 + 3] === 0; for (let c = 0; c < 4; c++) assert.strictEqual(px[i * 4 + c], c < 3 && clear ? 0 : src[i * 4 + c], 'pixel ' + i + ' ch ' + c); }
    });
    t('jxl: libjxl decodes the animation with every frame exact, near-lossless stays within the step with exact alpha', () => {
      const f = FX.anim_rgba_40x30_3frames, ex = unpack(decode(jxlOf(f)), 4), nl = unpack(decode(jxlOf(f, { step: 6 })), 4), n = f.w * f.h * 4;
      for (let k = 0; k < f.frames.length; k++) for (let i = 0; i < f.w * f.h; i++) { const s = f.frames[k], clear = s[i * 4 + 3] === 0;
        for (let c = 0; c < 4; c++) { const want = c < 3 && clear ? 0 : s[i * 4 + c]; assert.strictEqual(ex[k * n + i * 4 + c], want); const d = Math.abs(nl[k * n + i * 4 + c] - want); assert.ok(c === 3 ? d === 0 : d <= 6 + 1, 'err ' + d); } }
    });
  } else console.log('skip jxl decode checks (python3 imagecodecs not installed)');
  await t('png: straight-alpha RGBA round-trips exactly (adaptive filters + zlib + CRCs)', async () => {
    const w = 33, h = 17, d = FX.noise_rgb_64x48.frames[0].slice(0, w * h * 4); for (let i = 0; i < w * h; i++) d[i * 4 + 3] = (i * 7) & 255;
    const buf = Buffer.concat((await PNG.encode(d, w, h)).map(x => Buffer.from(x))); assert.deepStrictEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    let at = 8, idat = [], dims = null;
    while (at < buf.length) { const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len), crc = buf.readUInt32BE(at + 8 + len);
      assert.strictEqual(crc, zlib.crc32 ? zlib.crc32(buf.subarray(at + 4, at + 8 + len)) : crc, 'crc ' + type); if (type === 'IHDR') dims = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9]]; if (type === 'IDAT') idat.push(data); at += 12 + len; }
    assert.deepStrictEqual(dims, [w, h, 8, 6]); const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, out = new Uint8Array(stride * h);
    for (let y = 0; y < h; y++) { const ft = raw[y * (stride + 1)]; for (let x = 0; x < stride; x++) { const v = raw[y * (stride + 1) + 1 + x], a = x >= 4 ? out[y * stride + x - 4] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= 4 && y ? out[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); out[y * stride + x] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][ft]) & 255; } }
    assert.deepStrictEqual([...out], [...d]);
  });
  t('mp4: fast-start layout, sample table and chunk offset point at the real bytes', () => {
    const samples = [0, 1, 2, 3, 4].map(i => ({ data: Uint8Array.from({ length: 10 + i }, (_, k) => i * 16 + k), key: i === 0 || i === 3 }));
    const buf = Buffer.concat(MP4.mux({ width: 64, height: 48, fps: 30, avcC: Uint8Array.from([1, 100, 0, 42, 255, 225, 0, 1, 0x67, 1, 0, 1, 0x68]), samples }).map(x => Buffer.from(x)));
    const find = (b, type, from = 0) => { for (let i = from; i + 8 <= b.length; i++) if (b.toString('latin1', i + 4, i + 8) === type) return i; return -1; };
    assert.strictEqual(buf.toString('latin1', 4, 8), 'ftyp'); const moov = find(buf, 'moov'), mdat = find(buf, 'mdat'); assert.ok(moov > 0 && moov < mdat, 'moov must precede mdat');
    const stsz = find(buf, 'stsz'); assert.strictEqual(buf.readUInt32BE(stsz + 16), 5); assert.deepStrictEqual([0, 1, 2, 3, 4].map(i => buf.readUInt32BE(stsz + 20 + i * 4)), [10, 11, 12, 13, 14]);
    const stss = find(buf, 'stss'); assert.deepStrictEqual([buf.readUInt32BE(stss + 12), buf.readUInt32BE(stss + 16), buf.readUInt32BE(stss + 20)], [2, 1, 4]);
    const stco = find(buf, 'stco'), off = buf.readUInt32BE(stco + 16); assert.strictEqual(off, mdat + 8); assert.deepStrictEqual([...buf.subarray(off, off + 10)], [...samples[0].data]);
    assert.strictEqual(buf.readUInt32BE(mdat), buf.length - mdat); assert.ok(find(buf, 'avcC') > 0);
    assert.throws(() => MP4.mux({ width: 2, height: 2, fps: 30, avcC: Uint8Array.from([1]), samples: [] }));
  });
  t('generator: large frames (coarse-grid path) agree with the same composition at half size', () => {
    const big = G.generate({ w: 1600, h: 900, seed: 7, style: 'meadow', particles: 0 }, null, 0).layers[0].data, small = G.generate({ w: 800, h: 450, seed: 7, style: 'meadow', particles: 0 }, null, 0).layers[0].data;
    let sum = 0; for (let y = 0; y < 450; y++) for (let x = 0; x < 800; x++) for (let c = 0; c < 3; c++) { const i = (y * 800 + x) * 4 + c, j = ((y * 2) * 1600 + x * 2) * 4 + c; sum += Math.abs(small[i] - big[j]); }
    assert.ok(sum / (800 * 450 * 3) < 4, 'mean abs diff ' + sum / (800 * 450 * 3));
  });

  console.log('\n' + pass + ' passed' + (process.exitCode ? ' — with FAILURES' : ''));
})();
