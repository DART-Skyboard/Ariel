// Deterministic test images shared by run-tests.js and the reference-hash generator (tools/intuition/make-jxl-golden.py).
'use strict';
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
function noise(w, h, alpha, seed) { const r = lcg(seed), d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { d[i * 4] = r() * 256; d[i * 4 + 1] = r() * 256; d[i * 4 + 2] = r() * 256; d[i * 4 + 3] = alpha ? r() * 256 : 255; } return d; }
function smooth(w, h, seed) { // gradients + a clear region + a half-transparent band: long zero-residual runs (LZ77 path)
  const r = lcg(seed), d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = (x * 255 / w + r() * 3) | 0; d[i + 1] = (y * 255 / h + r() * 3) | 0; d[i + 2] = ((x + y) * 127 / (w + h)) | 0; d[i + 3] = x < w / 6 ? 0 : (y < h / 4 ? 140 : 255); }
  return d;
}
// name -> { w, h, alpha, groupShift, frames: [rgba...], animated, fps }
module.exports = {
  noise_rgb_64x48: { w: 64, h: 48, alpha: false, groupShift: 2, animated: false, frames: [noise(64, 48, false, 1)] },
  smooth_rgba_150x140_4groups: { w: 150, h: 140, alpha: true, groupShift: 0, animated: false, frames: [smooth(150, 140, 2)] },
  anim_rgba_40x30_3frames: { w: 40, h: 30, alpha: true, groupShift: 0, animated: true, fps: 24, frames: [smooth(40, 30, 3), noise(40, 30, true, 4), smooth(40, 30, 5)] }
};
