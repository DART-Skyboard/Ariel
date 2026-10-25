// Reference-conditioned procedural generator. It is NOT a neural network: it synthesizes layered RGBA frames from
// seeded noise, steered by what the Shell64 references contribute (palette, structure/luma map, cutout subject).
// Same params + same library + same time => identical pixels. Output is a layer stack with real alpha channels.
(function (global) {
  'use strict';
  var R = global.Raster || (typeof require !== 'undefined' ? require('./raster.js') : null);
  var STYLES = ['meadow', 'ridge', 'nebula'];
  var DEFAULT_PAL = {
    meadow: [[18, 10, 48], [58, 28, 110], [32, 120, 150], [120, 200, 120], [240, 190, 90], [255, 236, 190]],
    ridge: [[8, 10, 24], [34, 40, 78], [96, 70, 120], [200, 110, 90], [250, 190, 120], [255, 240, 210]],
    nebula: [[4, 4, 16], [30, 16, 80], [100, 30, 140], [0, 190, 230], [240, 120, 200], [255, 250, 240]]
  };

  function rng(seed) {
    var a = seed | 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash3(ix, iy, iz, seed) {
    var h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, z, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
    function h(a, b, c) { return hash3(ix + a, iy + b, iz + c, seed); }
    var x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * fx, x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * fx;
    var x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * fx, x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * fx;
    var y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy; return y0 + (y1 - y0) * fz;
  }
  function fbm(x, y, z, seed, oct) { var s = 0, a = 0.5, f = 1, n = 0; for (var o = 0; o < oct; o++) { s += a * vnoise(x * f, y * f, z * f, seed + o * 17); n += a; a *= 0.5; f *= 2; } return s / n; }

  function ramp(pal, t) {
    t = R.clamp(t, 0, 1) * (pal.length - 1); var i = Math.min(pal.length - 2, Math.floor(t)), f = t - i, a = pal[i], b = pal[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function smooth01(x) { x = R.clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function normalize(p) {
    p = p || {}; var c = R.clamp;
    return { w: c(Math.round(p.w || 640), 64, 1920), h: c(Math.round(p.h || 360), 64, 1080), seed: (p.seed | 0),
      style: STYLES.indexOf(p.style) >= 0 ? p.style : 'meadow', refs: Array.isArray(p.refs) ? p.refs.slice(0, 8) : [],
      mix: p.mix == null ? 0.5 : c(+p.mix, 0, 1), speed: p.speed == null ? 0.15 : c(+p.speed, 0, 2),
      particles: p.particles == null ? 260 : c(Math.round(p.particles), 0, 2000), subject: p.subject !== false };
  }

  function plot(d, w, h, cx, cy, rad, col, amp) {
    var x0 = Math.max(0, Math.floor(cx - rad * 3)), x1 = Math.min(w - 1, Math.ceil(cx + rad * 3)), y0 = Math.max(0, Math.floor(cy - rad * 3)), y1 = Math.min(h - 1, Math.ceil(cy + rad * 3)), s2 = 2 * rad * rad;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var dx = x - cx, dy = y - cy, a = amp * Math.exp(-(dx * dx + dy * dy) / s2); if (a < 0.01) continue;
      var i = (y * w + x) * 4, ba = d[i + 3] / 255, ao = a + ba * (1 - a);
      d[i] = (col[0] * a + d[i] * ba * (1 - a)) / ao; d[i + 1] = (col[1] * a + d[i + 1] * ba * (1 - a)) / ao; d[i + 2] = (col[2] * a + d[i + 2] * ba * (1 - a)) / ao; d[i + 3] = ao * 255;
    }
  }

  // Build the layer stack for time t (seconds). lib may be null (no references => style defaults).
  function generate(params, lib, t) {
    var P = normalize(params), w = P.w, h = P.h, T = (t || 0) * P.speed, seed = P.seed, layers = [];
    var cond = lib && P.refs.length ? lib.conditioning(P.refs) : null;
    var pal = cond && cond.palette.length >= 2 ? cond.palette : DEFAULT_PAL[P.style];
    if (pal.length < 4) { var base = pal; pal = []; for (var k = 0; k < 6; k++) pal.push(ramp(base, k / 5)); }
    // structure map: luma of the strongest reference (video refs advance with t), covered to canvas size
    var S = null;
    if (cond) {
      var top = cond.refs.slice().sort(function (a, b) { return b.weight - a.weight; })[0], fr = lib.frameAt(top.slot, t || 0);
      if (fr) { var cv = R.cover(fr.data, fr.w, fr.h, w, h); S = new Float32Array(w * h); for (var i = 0; i < w * h; i++) S[i] = R.luma(cv[i * 4], cv[i * 4 + 1], cv[i * 4 + 2]); }
    }
    var mix = P.mix, N = w * h;

    // Sky (opaque)
    var sky = R.createLayer(w, h, { name: 'Sky' }), sd = sky.data;
    for (var y = 0; y < h; y++) {
      var v = y / h, base0 = 0.08 + 0.62 * Math.pow(v, 0.85);
      for (var x = 0; x < w; x++) {
        var n = fbm(x / w * 3, y / h * 5, T, seed, 4), s = base0 + 0.28 * (n - 0.5);
        if (S) s += (S[y * w + x] - 0.5) * 0.25 * mix;
        var c = ramp(pal, s), i2 = (y * w + x) * 4; sd[i2] = c[0]; sd[i2 + 1] = c[1]; sd[i2 + 2] = c[2]; sd[i2 + 3] = 255;
      }
    }
    layers.push(sky);

    if (P.style === 'nebula') {
      var neb = R.createLayer(w, h, { name: 'Clouds', blend: 'screen' }), nd = neb.data;
      for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
        var u = x2 / w * 4, vv = y2 / h * 4, wx = fbm(u + 3.1, vv, T * 0.7, seed + 5, 3), wy = fbm(u, vv + 7.7, T * 0.7, seed + 9, 3);
        var nn = fbm(u + wx * 2 + (S ? S[y2 * w + x2] * mix * 2 : 0), vv + wy * 2, T, seed + 1, 5), a = smooth01((nn - 0.42) * 3.2);
        var cc = ramp(pal, 0.35 + 0.65 * nn), j = (y2 * w + x2) * 4; nd[j] = cc[0]; nd[j + 1] = cc[1]; nd[j + 2] = cc[2]; nd[j + 3] = a * 220;
      }
      layers.push(neb);
    } else {
      var ter = R.createLayer(w, h, { name: 'Terrain' }), td = ter.data, hy = h * (P.style === 'ridge' ? 0.42 : 0.55), amp = h * (P.style === 'ridge' ? 0.34 : 0.16);
      for (var x3 = 0; x3 < w; x3++) {
        var surf = hy + (fbm(x3 / w * 3, 0.5, T * 0.2, seed + 40, 5) - 0.5) * 2 * amp;
        for (var y3 = Math.max(0, Math.floor(surf) - 2); y3 < h; y3++) {
          var al = R.clamp(y3 - surf + 0.5, 0, 1); if (al <= 0) continue;
          var depth = (y3 - surf) / (h - surf + 1), grain = fbm(x3 / w * 40, y3 / h * 40, 0, seed + 3, 3);
          var sh = 0.18 + 0.5 * (1 - depth) * 0.6 + 0.25 * grain + (S ? (S[y3 * w + x3] - 0.5) * 0.5 * mix : 0);
          var c3 = ramp(pal, sh), q = (y3 * w + x3) * 4; td[q] = c3[0]; td[q + 1] = c3[1]; td[q + 2] = c3[2]; td[q + 3] = al * 255;
        }
      }
      layers.push(ter);
    }

    // Glow particles (additive, transparent background)
    var glow = R.createLayer(w, h, { name: 'Glow', blend: 'add' }), r0 = rng(seed + 99);
    for (var p = 0; p < P.particles; p++) {
      var px = r0() * w, py0 = r0() * h, spd = 0.02 + r0() * 0.05, rad = 0.8 + r0() * 2.6, cc2 = ramp(pal, 0.55 + 0.45 * r0()), ph = r0() * 6.28;
      var py = ((py0 - T * spd * h * 4) % h + h) % h; px += Math.sin(T * 2 + ph) * 6;
      plot(glow.data, w, h, px, py, rad, cc2, 0.85);
    }
    layers.push(glow);

    // Mist (soft, transparent)
    var mist = R.createLayer(w, h, { name: 'Mist', blend: 'screen', opacity: 0.6 }), md = mist.data, lc = ramp(pal, 0.85);
    for (var y4 = 0; y4 < h; y4++) for (var x4 = 0; x4 < w; x4++) {
      var f = smooth01((y4 / h - 0.45) * 2.2), m2 = fbm(x4 / w * 3, y4 / h * 3, T * 0.5, seed + 70, 3), a4 = f * smooth01((m2 - 0.35) * 2.5) * 0.7, k4 = (y4 * w + x4) * 4;
      md[k4] = lc[0]; md[k4 + 1] = lc[1]; md[k4 + 2] = lc[2]; md[k4 + 3] = a4 * 255;
    }
    layers.push(mist);

    // Subject: first reference that is a cutout (has real transparency) rides on top, keeping its own alpha.
    if (P.subject && cond) {
      for (var r = 0; r < cond.refs.length; r++) {
        var slot = lib.get(cond.refs[r].slot);
        if (slot && slot.sig.alpha < 0.98 && slot.sig.alpha > 0.02) {
          var f2 = lib.frameAt(cond.refs[r].slot, t || 0), th = Math.round(h * 0.62), tw = Math.max(1, Math.round(f2.w * th / f2.h));
          var sub = R.createLayer(tw, th, { name: 'Subject', data: R.resize(f2.data, f2.w, f2.h, tw, th) });
          sub.x = Math.round((w - tw) / 2 + Math.sin(T * 1.5) * w * 0.01); sub.y = Math.round(h * 0.34 + Math.sin(T * 2.1) * h * 0.006);
          layers.push(sub); break;
        }
      }
    }
    return { layers: layers, w: w, h: h, palette: pal.map(function (c) { return c.map(Math.round); }, null), params: P };
  }

  // Convenience: generate + composite to one RGBA frame. bg = [r,g,b,a] or null for transparent.
  function render(params, lib, t, bg) {
    var g = generate(params, lib, t); return { w: g.w, h: g.h, data: R.composite(g.layers, g.w, g.h, bg), layers: g.layers, palette: g.palette };
  }

  global.Generator = { generate: generate, render: render, normalize: normalize, STYLES: STYLES, rng: rng, fbm: fbm, ramp: ramp };
  if (typeof module !== 'undefined') module.exports = global.Generator;
})(typeof window !== 'undefined' ? window : globalThis);
