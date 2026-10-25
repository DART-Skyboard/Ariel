// Shell64 reference library: 64 slots that hold anything from OUTSIDE the generator (images, video frames, cutouts).
// Each slot keeps decoded RGBA pixels plus a small signature (palette, luma, edge density, alpha coverage, hash)
// that the generator reads as conditioning. Nothing here talks to the network, and nothing is sent to LEATR.
(function (global) {
  'use strict';
  var R = global.Raster || (typeof require !== 'undefined' ? require('./raster.js') : null);
  var SLOTS = 64, MAXDIM = 256, MAXFRAMES = 24;

  function fnv(bytes) { var h = 2166136261; for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  // Deterministic k-means over opaque pixels (init at luma quantiles, fixed iterations).
  function palette(data, k) {
    var pts = [], n = data.length / 4, step = Math.max(1, Math.floor(n / 2500));
    for (var i = 0; i < n; i += step) { var p = i * 4; if (data[p + 3] > 127) pts.push([data[p], data[p + 1], data[p + 2]]); }
    if (!pts.length) return [];
    pts.sort(function (a, b) { return R.luma(a[0], a[1], a[2]) - R.luma(b[0], b[1], b[2]); });
    k = Math.min(k, pts.length);
    var C = []; for (var c = 0; c < k; c++) C.push(pts[Math.floor((c + 0.5) * pts.length / k)].slice());
    var cnt;
    for (var it = 0; it < 8; it++) {
      var sum = C.map(function () { return [0, 0, 0]; }); cnt = C.map(function () { return 0; });
      for (var j = 0; j < pts.length; j++) {
        var best = 0, bd = 1e12;
        for (var q = 0; q < k; q++) { var dr = pts[j][0] - C[q][0], dg = pts[j][1] - C[q][1], db = pts[j][2] - C[q][2], d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = q; } }
        sum[best][0] += pts[j][0]; sum[best][1] += pts[j][1]; sum[best][2] += pts[j][2]; cnt[best]++;
      }
      for (var m = 0; m < k; m++) if (cnt[m]) C[m] = [sum[m][0] / cnt[m], sum[m][1] / cnt[m], sum[m][2] / cnt[m]];
    }
    return C.map(function (c, idx) { return { rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])], w: cnt[idx] / pts.length }; })
      .sort(function (a, b) { return R.luma.apply(null, a.rgb) - R.luma.apply(null, b.rgb); });
  }

  function lumaMap(data, w, h) {
    var L = new Float32Array(w * h); for (var i = 0; i < w * h; i++) L[i] = R.luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); return L;
  }
  function edgeDensity(L, w, h) {
    if (w < 3 || h < 3) return 0; var s = 0, c = 0;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var i = y * w + x, gx = L[i + 1] - L[i - 1], gy = L[i + w] - L[i - w]; s += Math.sqrt(gx * gx + gy * gy); c++;
    }
    return c ? s / c : 0;
  }
  function signature(data, w, h) {
    var L = lumaMap(data, w, h), ml = 0; for (var i = 0; i < L.length; i++) ml += L[i];
    return { palette: palette(data, 5), meanLuma: L.length ? ml / L.length : 0, edge: edgeDensity(L, w, h),
      alpha: R.alphaCoverage(data), hash: fnv(data).toString(16) };
  }

  // Fit decoded pixels into MAXDIM on the long side (library keeps references small on purpose).
  function fit(data, w, h) {
    var s = Math.min(1, MAXDIM / Math.max(w, h)); if (s >= 1) return { data: new Uint8ClampedArray(data), w: w, h: h };
    var dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s)); return { data: R.resize(data, w, h, dw, dh), w: dw, h: dh };
  }

  function Library() { this.slots = new Array(SLOTS).fill(null); }
  Library.SLOTS = SLOTS; Library.MAXDIM = MAXDIM; Library.MAXFRAMES = MAXFRAMES;

  Library.prototype.count = function () { return this.slots.filter(Boolean).length; };
  Library.prototype.firstFree = function () { return this.slots.indexOf(null); };
  Library.prototype.get = function (i) { return this.slots[i] || null; };
  Library.prototype.remove = function (i) { if (i < 0 || i >= SLOTS) return false; var had = !!this.slots[i]; this.slots[i] = null; return had; };
  Library.prototype.clear = function () { this.slots.fill(null); };
  Library.prototype.list = function () {
    var out = []; this.slots.forEach(function (s, i) { if (s) out.push({ slot: i, name: s.name, kind: s.kind, w: s.w, h: s.h, frames: s.frames ? s.frames.length : 1, alpha: s.sig.alpha, source: s.source }); });
    return out;
  };

  // Add an image: {name, w, h, data(RGBA), source}. slot optional; throws when the shell is full or the slot is taken.
  Library.prototype.addImage = function (e, slot) {
    if (!e || !e.data || e.data.length !== e.w * e.h * 4) throw new Error('image needs w, h and RGBA data');
    var i = slot == null ? this.firstFree() : slot;
    if (i < 0) throw new Error('Shell64 is full (64 slots)');
    if (i >= SLOTS || i < 0) throw new Error('slot out of range');
    if (this.slots[i]) throw new Error('slot ' + i + ' is occupied');
    var f = fit(e.data, e.w, e.h);
    this.slots[i] = { kind: 'image', name: String(e.name || 'image').slice(0, 60), source: e.source || 'upload', w: f.w, h: f.h, data: f.data, frames: null, sig: signature(f.data, f.w, f.h) };
    return i;
  };
  // Add a video as sampled frames: {name, frames:[{w,h,data}], fps}. Frames are fitted and capped at MAXFRAMES.
  Library.prototype.addVideo = function (e, slot) {
    if (!e || !e.frames || !e.frames.length) throw new Error('video needs at least one frame');
    var i = slot == null ? this.firstFree() : slot;
    if (i < 0) throw new Error('Shell64 is full (64 slots)');
    if (i >= SLOTS) throw new Error('slot out of range');
    if (this.slots[i]) throw new Error('slot ' + i + ' is occupied');
    var src = e.frames.slice(0, MAXFRAMES).map(function (fr) { return fit(fr.data, fr.w, fr.h); });
    var first = src[0], frames = src.map(function (f) {
      if (f.w !== first.w || f.h !== first.h) f = { data: R.resize(f.data, f.w, f.h, first.w, first.h), w: first.w, h: first.h }; return f.data; });
    this.slots[i] = { kind: 'video', name: String(e.name || 'video').slice(0, 60), source: e.source || 'upload', w: first.w, h: first.h, data: frames[0], frames: frames, fps: e.fps || 12, sig: signature(frames[0], first.w, first.h) };
    return i;
  };
  // Pixels of a slot at time t seconds (videos loop; images ignore t).
  Library.prototype.frameAt = function (i, t) {
    var s = this.slots[i]; if (!s) return null;
    if (!s.frames) return { data: s.data, w: s.w, h: s.h };
    var idx = Math.floor((t || 0) * s.fps) % s.frames.length; if (idx < 0) idx += s.frames.length;
    return { data: s.frames[idx], w: s.w, h: s.h };
  };

  // Merge several references into one conditioning bundle: weighted palette (8 colours, dark->light) and mean luma/edge.
  Library.prototype.conditioning = function (refs) {
    var list = (refs || []).map(function (r) { return typeof r === 'number' ? { slot: r, weight: 1 } : r; })
      .filter(function (r) { return this.slots[r.slot]; }, this);
    if (!list.length) return null;
    var tw = 0, cols = [], ml = 0, ed = 0;
    list.forEach(function (r) { tw += r.weight; });
    list.forEach(function (r) {
      var s = this.slots[r.slot], w = r.weight / tw; ml += s.sig.meanLuma * w; ed += s.sig.edge * w;
      s.sig.palette.forEach(function (p) { cols.push({ rgb: p.rgb, w: p.w * w }); });
    }, this);
    cols.sort(function (a, b) { return R.luma.apply(null, a.rgb) - R.luma.apply(null, b.rgb); });
    var K = Math.min(8, cols.length), pal = [];
    for (var k = 0; k < K; k++) { var lo = Math.floor(k * cols.length / K), hi = Math.max(lo + 1, Math.floor((k + 1) * cols.length / K)), r = 0, g = 0, b = 0, ws = 0;
      for (var j = lo; j < hi; j++) { r += cols[j].rgb[0] * cols[j].w; g += cols[j].rgb[1] * cols[j].w; b += cols[j].rgb[2] * cols[j].w; ws += cols[j].w; }
      pal.push(ws ? [Math.round(r / ws), Math.round(g / ws), Math.round(b / ws)] : cols[lo].rgb); }
    return { palette: pal, meanLuma: ml, edge: ed, refs: list };
  };

  // Plain JSON round-trip (RGBA as base64) so a library can be saved and reloaded.
  function b64(u8) { if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.length).toString('base64'); var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { if (typeof Buffer !== 'undefined') { var b = Buffer.from(s, 'base64'); return new Uint8ClampedArray(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); } var bin = atob(s), o = new Uint8ClampedArray(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  Library.prototype.serialize = function () {
    return JSON.stringify({ v: 1, slots: this.slots.map(function (s) { return s && { kind: s.kind, name: s.name, source: s.source, w: s.w, h: s.h, fps: s.fps, frames: (s.frames || [s.data]).map(b64) }; }) });
  };
  Library.deserialize = function (text) {
    var o = JSON.parse(text), lib = new Library(); if (!o || o.v !== 1 || !Array.isArray(o.slots) || o.slots.length !== SLOTS) throw new Error('not a Shell64 library file');
    o.slots.forEach(function (s, i) {
      if (!s) return; var frames = s.frames.map(unb64);
      frames.forEach(function (f) { if (f.length !== s.w * s.h * 4) throw new Error('corrupt slot ' + i); });
      if (s.kind === 'video') lib.addVideo({ name: s.name, source: s.source, fps: s.fps, frames: frames.map(function (d) { return { w: s.w, h: s.h, data: d }; }) }, i);
      else lib.addImage({ name: s.name, source: s.source, w: s.w, h: s.h, data: frames[0] }, i);
    });
    return lib;
  };

  global.Shell64Refs = Library;
  if (typeof module !== 'undefined') module.exports = Library;
})(typeof window !== 'undefined' ? window : globalThis);
