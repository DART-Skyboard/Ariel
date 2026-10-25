// Intuition PNG: writes 8-bit RGBA PNG straight from the straight-alpha pixel buffer. The browser canvas keeps
// colour premultiplied, which loses accuracy in soft (low-alpha) pixels; this path keeps every value exact.
// Per-row adaptive filtering + the browser's zlib (CompressionStream). Resolves null if CompressionStream is missing.
(function (global) {
  'use strict';
  var T = null;
  function crc32(parts) {
    if (!T) { T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
    var crc = 0xffffffff;
    parts.forEach(function (p) { for (var i = 0; i < p.length; i++) crc = T[(crc ^ p[i]) & 255] ^ (crc >>> 8); });
    return (crc ^ 0xffffffff) >>> 0;
  }
  function u32(v) { return Uint8Array.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function chunk(type, data) {
    var t = Uint8Array.from([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
    return [u32(data.length), t, data, u32(crc32([t, data]))];
  }
  function filterRows(rgba, w, h) {
    var stride = w * 4, raw = new Uint8Array((stride + 1) * h), zero = new Uint8Array(stride);
    var f = [null, new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
    for (var y = 0; y < h; y++) {
      var row = rgba.subarray(y * stride, (y + 1) * stride), prev = y ? rgba.subarray((y - 1) * stride, y * stride) : zero, s = [0, 0, 0, 0, 0];
      for (var x = 0; x < stride; x++) {
        var v = row[x], a = x >= 4 ? row[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0, p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        var r1 = (v - a) & 255, r2 = (v - b) & 255, r3 = (v - ((a + b) >> 1)) & 255, r4 = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        f[1][x] = r1; f[2][x] = r2; f[3][x] = r3; f[4][x] = r4;
        s[0] += v < 128 ? v : 256 - v; s[1] += r1 < 128 ? r1 : 256 - r1; s[2] += r2 < 128 ? r2 : 256 - r2; s[3] += r3 < 128 ? r3 : 256 - r3; s[4] += r4 < 128 ? r4 : 256 - r4;
      }
      var best = 0; for (var k = 1; k < 5; k++) if (s[k] < s[best]) best = k;
      raw[y * (stride + 1)] = best; raw.set(best ? f[best] : row, y * (stride + 1) + 1);
    }
    return raw;
  }
  // -> Promise<Uint8Array[] | null>  (parts for new Blob(parts, {type:'image/png'}))
  async function encode(rgba, w, h) {
    if (typeof CompressionStream === 'undefined') return null;
    var raw = filterRows(rgba, w, h);
    var z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    var ihdr = new Uint8Array(13); ihdr.set(u32(w), 0); ihdr.set(u32(h), 4); ihdr[8] = 8; ihdr[9] = 6;
    var sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return [sig].concat(chunk('IHDR', ihdr), chunk('sRGB', Uint8Array.from([0])), chunk('IDAT', z), chunk('IEND', new Uint8Array(0)));
  }
  global.IntuitionPng = { encode: encode, _filterRows: filterRows };
  if (typeof module !== 'undefined') module.exports = global.IntuitionPng;
})(typeof window !== 'undefined' ? window : globalThis);
