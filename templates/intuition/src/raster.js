// Raster core: RGBA pixel arrays, layers, alpha channels, blend modes and compositing.
// Pixels are stored STRAIGHT (non-premultiplied) in Uint8ClampedArray, 4 bytes per pixel (R,G,B,A).
// Compositing runs in float using the W3C compositing model, so transparency stacks correctly.
(function (global) {
  'use strict';
  var seq = 0;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function createLayer(w, h, o) {
    o = o || {};
    if (o.data && o.data.length !== w * h * 4) throw new Error('layer data must be w*h*4 bytes');
    return {
      id: o.id || 'L' + (++seq), name: o.name || 'Layer', w: w | 0, h: h | 0, x: o.x | 0, y: o.y | 0,
      data: o.data || new Uint8ClampedArray(w * h * 4),
      mask: o.mask || null,                       // optional Uint8ClampedArray(w*h): extra alpha multiplier (0-255)
      opacity: o.opacity == null ? 1 : clamp(o.opacity, 0, 1),
      blend: o.blend || 'normal', visible: o.visible !== false
    };
  }

  // Separable blend functions on 0..1 channel values: B(backdrop, source)
  var BLEND = {
    normal: function (b, s) { return s; },
    multiply: function (b, s) { return b * s; },
    screen: function (b, s) { return b + s - b * s; },
    add: function (b, s) { return Math.min(1, b + s); },
    overlay: function (b, s) { return b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s); },
    darken: function (b, s) { return Math.min(b, s); },
    lighten: function (b, s) { return Math.max(b, s); }
  };

  // Composite layers bottom->top into a w*h canvas. bg = [r,g,b,a] (a in 0..255), default fully transparent.
  function composite(layers, w, h, bg) {
    var n = w * h, cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n), ca = new Float32Array(n);
    if (bg && bg[3] > 0) {
      var ba = bg[3] / 255;
      for (var i = 0; i < n; i++) { cr[i] = bg[0] / 255; cg[i] = bg[1] / 255; cb[i] = bg[2] / 255; ca[i] = ba; }
    }
    for (var li = 0; li < layers.length; li++) {
      var L = layers[li];
      if (!L.visible || L.opacity <= 0) continue;
      var fn = BLEND[L.blend] || BLEND.normal, d = L.data, op = L.opacity, m = L.mask;
      for (var ly = 0; ly < L.h; ly++) {
        var y = ly + L.y; if (y < 0 || y >= h) continue;
        for (var lx = 0; lx < L.w; lx++) {
          var x = lx + L.x; if (x < 0 || x >= w) continue;
          var si = (ly * L.w + lx) * 4, a = d[si + 3];
          if (a === 0) continue;
          var as = (a / 255) * op; if (m) as *= m[ly * L.w + lx] / 255;
          if (as <= 0) continue;
          var p = y * w + x, ab = ca[p];
          var sr = d[si] / 255, sg = d[si + 1] / 255, sb = d[si + 2] / 255;
          var ao = as + ab * (1 - as);
          if (ab === 0) { cr[p] = sr; cg[p] = sg; cb[p] = sb; ca[p] = ao; continue; }
          var k1 = (1 - ab) * as, k2 = as * ab, k3 = (1 - as) * ab;
          cr[p] = (k1 * sr + k2 * fn(cr[p], sr) + k3 * cr[p]) / ao;
          cg[p] = (k1 * sg + k2 * fn(cg[p], sg) + k3 * cg[p]) / ao;
          cb[p] = (k1 * sb + k2 * fn(cb[p], sb) + k3 * cb[p]) / ao;
          ca[p] = ao;
        }
      }
    }
    var out = new Uint8ClampedArray(n * 4);
    for (var j = 0; j < n; j++) {
      out[j * 4] = Math.round(cr[j] * 255); out[j * 4 + 1] = Math.round(cg[j] * 255);
      out[j * 4 + 2] = Math.round(cb[j] * 255); out[j * 4 + 3] = Math.round(ca[j] * 255);
    }
    return out;
  }

  function premultiply(data) {
    var o = new Uint8ClampedArray(data.length);
    for (var i = 0; i < data.length; i += 4) { var a = data[i + 3] / 255; o[i] = Math.round(data[i] * a); o[i + 1] = Math.round(data[i + 1] * a); o[i + 2] = Math.round(data[i + 2] * a); o[i + 3] = data[i + 3]; }
    return o;
  }
  function unpremultiply(data) {
    var o = new Uint8ClampedArray(data.length);
    for (var i = 0; i < data.length; i += 4) { var a = data[i + 3] / 255; if (a > 0) { o[i] = Math.round(data[i] / a); o[i + 1] = Math.round(data[i + 1] / a); o[i + 2] = Math.round(data[i + 2] / a); } o[i + 3] = data[i + 3]; }
    return o;
  }

  // Bilinear resize (straight alpha is resampled premultiplied to avoid dark fringes on cutouts).
  function resize(src, sw, sh, dw, dh) {
    if (sw === dw && sh === dh) return new Uint8ClampedArray(src);
    var pm = premultiply(src), out = new Uint8ClampedArray(dw * dh * 4);
    for (var y = 0; y < dh; y++) {
      var fy = (y + 0.5) * sh / dh - 0.5, y0 = Math.floor(fy), ty = fy - y0, ya = clamp(y0, 0, sh - 1), yb = clamp(y0 + 1, 0, sh - 1);
      for (var x = 0; x < dw; x++) {
        var fx = (x + 0.5) * sw / dw - 0.5, x0 = Math.floor(fx), tx = fx - x0, xa = clamp(x0, 0, sw - 1), xb = clamp(x0 + 1, 0, sw - 1);
        var i00 = (ya * sw + xa) * 4, i10 = (ya * sw + xb) * 4, i01 = (yb * sw + xa) * 4, i11 = (yb * sw + xb) * 4, o = (y * dw + x) * 4;
        for (var c = 0; c < 4; c++) {
          var top = pm[i00 + c] * (1 - tx) + pm[i10 + c] * tx, bot = pm[i01 + c] * (1 - tx) + pm[i11 + c] * tx;
          out[o + c] = top * (1 - ty) + bot * ty;
        }
      }
    }
    return unpremultiply(out);
  }

  // Resize to cover (dw,dh) keeping aspect, centre-cropped. Used to condition on a reference at canvas size.
  function cover(src, sw, sh, dw, dh) {
    var s = Math.max(dw / sw, dh / sh), cw = Math.min(sw, Math.round(dw / s)), ch = Math.min(sh, Math.round(dh / s));
    var x0 = Math.floor((sw - cw) / 2), y0 = Math.floor((sh - ch) / 2), crop = new Uint8ClampedArray(cw * ch * 4);
    for (var y = 0; y < ch; y++) crop.set(src.subarray(((y + y0) * sw + x0) * 4, ((y + y0) * sw + x0 + cw) * 4), y * cw * 4);
    return resize(crop, cw, ch, dw, dh);
  }

  function alphaCoverage(data) {
    var n = data.length / 4, s = 0; for (var i = 3; i < data.length; i += 4) s += data[i]; return n ? s / (255 * n) : 0;
  }
  function luma(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

  // Grey/white checkerboard for showing transparency in a preview.
  function checkerboard(w, h, size) {
    size = size || 8; var o = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var v = ((x / size | 0) + (y / size | 0)) & 1 ? 200 : 150, i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255; }
    return o;
  }

  global.Raster = { createLayer: createLayer, composite: composite, premultiply: premultiply, unpremultiply: unpremultiply,
    resize: resize, cover: cover, alphaCoverage: alphaCoverage, luma: luma, checkerboard: checkerboard, BLEND: BLEND, clamp: clamp };
  if (typeof module !== 'undefined') module.exports = global.Raster;
})(typeof window !== 'undefined' ? window : globalThis);
