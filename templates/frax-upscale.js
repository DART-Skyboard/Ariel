/* Frax Studio · on-device AI upscaler
   ESRGAN super-resolution (UpscalerJS 1.0 + TensorFlow.js, MIT / Apache-2.0) running on the device's GPU.
   No account, no API key, no quota, and the picture never leaves the device. Models load once from jsdelivr
   and are cached by the browser. The cloud path (image-upscaling.net via the Apps Script proxy) stays as an option. */
(function () {
  'use strict';
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const LIBS = [
    CDN + '@tensorflow/tfjs@4.11.0/dist/tf.min.js',
    CDN + '@upscalerjs/default-model@1.0.0/dist/umd/index.min.js',
    CDN + 'upscaler@1.0.0/dist/browser/umd/upscaler.min.js',
  ];
  const MODEL = { slim: ['esrgan-slim', 'Slim'], medium: ['esrgan-medium', 'Medium'], thick: ['esrgan-thick', 'Thick'] };
  // Safari/iOS canvases stop at ~16.7 million pixels; keep every result under that so it can be shown and saved anywhere.
  const MAX_OUT = 16000000;

  const loaded = new Map();
  function script(src) {
    if (loaded.has(src)) return loaded.get(src);
    const p = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src.split('/npm/')[1])); document.head.appendChild(s); });
    loaded.set(src, p); return p;
  }
  async function engine(size, scale) {
    for (const l of LIBS) await script(l);
    const [pkg, cap] = MODEL[size] || MODEL.medium;
    await script(`${CDN}@upscalerjs/${pkg}@1.0.0/dist/umd/models/${pkg}/src/x${scale}/index.min.js`);
    const def = window['ESRGAN' + cap + scale + 'x'];
    if (!def) throw new Error('model ' + pkg + ' x' + scale + ' did not load');
    try { if (window.tf && tf.getBackend() !== 'webgl') await tf.setBackend('webgl'); } catch (e) {}
    const key = size + scale;
    engine.cache = engine.cache || {};
    if (!engine.cache[key]) engine.cache[key] = new window.Upscaler({ model: def });
    return engine.cache[key];
  }

  function imageDataToCanvas(id) { const c = document.createElement('canvas'); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0); return c; }
  function shrinkToFit(id, scale) {
    const outPx = id.width * id.height * scale * scale;
    if (outPx <= MAX_OUT) return { canvas: imageDataToCanvas(id), shrunk: false };
    const k = Math.sqrt(MAX_OUT / outPx), w = Math.max(1, Math.floor(id.width * k)), h = Math.max(1, Math.floor(id.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(imageDataToCanvas(id), 0, 0, w, h);
    return { canvas: c, shrunk: true };
  }

  // run ESRGAN in tiles (patches) so phones never run out of GPU memory; reports progress 0..1
  async function upscaleLocal(imageData, scale, size, onProgress) {
    const up = await engine(size, scale);
    const { canvas, shrunk } = shrinkToFit(imageData, scale);
    const patch = size === 'thick' ? 48 : 64;
    const dataUrl = await up.upscale(canvas, { output: 'base64', patchSize: patch, padding: 6, progress: (p) => onProgress && onProgress(p), awaitNextFrame: true });
    const blob = await (await fetch(dataUrl)).blob();
    return { blob, width: canvas.width * scale, height: canvas.height * scale, shrunk };
  }
  window.FraxUpscale = { upscaleLocal, MAX_OUT };
})();
