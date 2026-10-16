/* ═══════════════════════════════════════════════════════════════════════════
   FRAX STUDIO · JPEG XL (.jxl)
   Radical Deepscale LLC / DART Meadow

   Full JPEG XL export + import for Frax, powered by libjxl compiled to WebAssembly (jxl/frax-jxl.wasm,
   running in jxl/frax-jxl-worker.js). Every encoder control libjxl exposes is here:
     · lossy (VarDCT) / lossless / modular lossy / bit-exact lossless JPEG transcoding
     · quality ↔ Butteraugli distance, effort 1–10, decode-speed tiers
     · bit depth 8 · 10 · 12 · 16-bit integer and 16 / 32-bit float (16-bit PNG sources keep their real precision)
     · transparency: alpha depth, separate alpha quality, premultiplied, keep colour under clear pixels
     · animation: frames, per-frame timing, loops; import animated GIF / WebP / APNG / JXL
     · tiles & progressive: group (tile) size, centre-first group order, progressive DC / AC / responsive
     · focus areas: draw regions of interest — they are encoded as sharper layers over the base image and the
       file streams those tiles first
     · detail filters, photon noise, resampling, patches, dots, modular predictors, palettes, colour transforms
     · colour spaces (sRGB, linear, Display P3, Rec.2100 PQ / HLG, Rec.2020), HDR intensity, orientation
     · container, codestream level, Brotli-compressed metadata boxes, XMP author/copyright, JPEG Exif/XMP keep
   Preview shows the decoded result next to the original with a compare slider, size, bits per pixel and time.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^/]*$/, '') : 'jxl/';

  /* ── worker ─────────────────────────────────────────────────────────── */
  let W = null, seq = 0; const pending = new Map(); let onProgress = null;
  function worker() {
    if (W) return W;
    W = new Worker(BASE + 'frax-jxl-worker.js');
    W.onmessage = (e) => {
      const d = e.data;
      if (d.progress != null && d.id == null) { if (onProgress) onProgress(d.progress); return; }
      const p = pending.get(d.id); if (!p) return; pending.delete(d.id);
      d.ok ? p.res(d) : p.rej(new Error(d.error));
    };
    W.onerror = (e) => { for (const p of pending.values()) p.rej(new Error('JPEG XL engine failed to load' + (e.message ? ': ' + e.message : ''))); pending.clear(); W = null; };
    return W;
  }
  function call(msg, transfer) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); worker().postMessage(Object.assign({ id }, msg), transfer || []); }); }

  /* ── libjxl frame-setting ids (jxl/encode.h) ───────────────────────── */
  const ID = { EFFORT: 0, DECODING_SPEED: 1, RESAMPLING: 2, EC_RESAMPLING: 3, PHOTON_NOISE: 5, NOISE: 6, DOTS: 7, PATCHES: 8, EPF: 9,
    GABORISH: 10, MODULAR: 11, KEEP_INVISIBLE: 12, GROUP_ORDER: 13, CENTER_X: 14, CENTER_Y: 15, RESPONSIVE: 16, PROGRESSIVE_AC: 17,
    QPROGRESSIVE_AC: 18, PROGRESSIVE_DC: 19, CH_COLORS_GLOBAL: 20, CH_COLORS_GROUP: 21, PALETTE_COLORS: 22, LOSSY_PALETTE: 23,
    COLOR_TRANSFORM: 24, MODULAR_COLOR_SPACE: 25, MODULAR_GROUP_SIZE: 26, MODULAR_PREDICTOR: 27, MA_TREE_PCT: 28, NB_PREV_CH: 29,
    JPEG_RECON_CFL: 30, BROTLI_EFFORT: 32, JPEG_COMPRESS_BOXES: 33, BUFFERING: 34, JPEG_KEEP_EXIF: 35, JPEG_KEEP_XMP: 36,
    JPEG_KEEP_JUMBF: 37, FULL_IMAGE_HEURISTICS: 38, DISABLE_PERCEPTUAL: 39 };
  const FLOAT_IDS = new Set([ID.PHOTON_NOISE, ID.CH_COLORS_GLOBAL, ID.CH_COLORS_GROUP, ID.MA_TREE_PCT]);

  // libjxl's own mapping (JxlEncoderDistanceFromQuality)
  const qToD = (q) => q >= 100 ? 0 : q >= 30 ? 0.1 + (100 - q) * 0.09 : 53 / 3000 * q * q - 23 / 20 * q + 25;
  const dToQ = (d) => { let lo = 0, hi = 100; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; qToD(m) > d ? lo = m : hi = m; } return Math.round(hi * 10) / 10; };

  /* ── defaults ──────────────────────────────────────────────────────── */
  const DEF = {
    mode: 'lossy', quality: 90, distance: +qToD(90).toFixed(3), effort: 7, decodingSpeed: 0,
    bitDepth: '8', color: 0, grey: 'auto', intent: 0, intensity: 0, orientation: 1,
    alpha: 'auto', alphaBits: 'same', alphaLossless: true, alphaQuality: 95, premultiplied: false, keepInvisible: -1,
    groupSize: -1, groupOrder: -1, centerX: -1, centerY: -1, progressiveDC: -1, progressiveAC: -1, qprogressiveAC: -1, responsive: -1, buffering: -1,
    epf: -1, gaborish: -1, photonNoise: 0, noise: -1, dots: -1, patches: -1, resampling: -1, ecResampling: -1, forceModular: -1,
    predictor: -1, maTree: -1, paletteColors: -1, lossyPalette: -1, colorsGlobal: -1, colorsGroup: -1, nbPrev: -1, modularColorSpace: -1, colorTransform: -1,
    fullHeuristics: -1, disablePerceptual: -1,
    container: -1, level: 0, brotliEffort: -1, compressBoxes: -1, keepExif: 1, keepXmp: 1, keepJumbf: 1, jpegCfl: -1,
    loops: 0, defaultDuration: 100, xmpAuthor: '', xmpCopyright: '', xmpTitle: '',
    roiOn: true, roiQuality: 97, roiOrder: true,
  };
  const PRESETS = {
    web:        { mode: 'lossy', quality: 82, effort: 7, progressiveDC: 1, progressiveAC: 1, decodingSpeed: 0, bitDepth: '8' },
    photo:      { mode: 'lossy', quality: 90, effort: 7, bitDepth: '8' },
    visual:     { mode: 'lossy', quality: 95, effort: 8, bitDepth: '8' },
    archive:    { mode: 'lossless', effort: 9, bitDepth: '16' },
    pixel:      { mode: 'lossless', effort: 9, bitDepth: '8', paletteColors: 1024, predictor: -1 },
    fast:       { mode: 'lossy', quality: 85, effort: 3, decodingSpeed: 2 },
    hdr:        { mode: 'lossy', quality: 92, effort: 7, bitDepth: 'f16', color: 3, intensity: 1000 },
    smallest:   { mode: 'lossy', quality: 70, effort: 9, photonNoise: 0 },
  };
  let S = Object.assign({}, DEF);
  try { const saved = JSON.parse(localStorage.getItem('frax_jxl_settings') || 'null'); if (saved) S = Object.assign({}, DEF, saved); } catch (e) {}
  const save = () => { try { localStorage.setItem('frax_jxl_settings', JSON.stringify(S)); } catch (e) {} };

  /* ── source & state ────────────────────────────────────────────────── */
  const st = { src: null, frames: [], rois: [], result: null, decoded: null, busy: false, drawing: null, cmp: 0.5, zoom: 'fit', animT: null, version: '' };
  // src = { img: ImageData (8-bit RGBA), w, h, name, bytes: Uint8Array|null, isJPEG, rgba16: Uint16Array|null, hasAlpha, isGrey }

  function analyse(img) {
    const d = img.data; let alpha = false, grey = true;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 255) alpha = true;
      if (grey && (d[i] !== d[i + 1] || d[i + 1] !== d[i + 2])) grey = false;
      if (alpha && !grey) break;
    }
    return { hasAlpha: alpha, isGrey: grey };
  }
  function pngBitDepth(bytes) {
    if (!bytes || bytes.length < 26) return 0;
    const sig = [137, 80, 78, 71, 13, 10, 26, 10]; for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return 0;
    return bytes[24];
  }
  async function decode16PNG(bytes) {
    const m = await import('https://cdn.jsdelivr.net/npm/fast-png@6.4.0/+esm');
    const p = m.decode(bytes); if (p.depth !== 16) return null;
    const n = p.width * p.height, out = new Uint16Array(n * 4), c = p.channels, s = p.data;
    for (let i = 0; i < n; i++) {
      if (c === 1) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = s[i]; out[i * 4 + 3] = 65535; }
      else if (c === 2) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = s[i * 2]; out[i * 4 + 3] = s[i * 2 + 1]; }
      else if (c === 3) { out[i * 4] = s[i * 3]; out[i * 4 + 1] = s[i * 3 + 1]; out[i * 4 + 2] = s[i * 3 + 2]; out[i * 4 + 3] = 65535; }
      else { out.set(s.subarray(i * 4, i * 4 + 4), i * 4); }
    }
    return out;
  }
  function setSource(img, meta) {
    meta = meta || {};
    const a = analyse(img);
    st.src = { img, w: img.width, h: img.height, name: meta.name || 'image', bytes: meta.bytes || null, isJPEG: !!meta.isJPEG,
      rgba16: meta.rgba16 || null, hasAlpha: a.hasAlpha, isGrey: a.isGrey };
    st.frames = [{ img, duration: S.defaultDuration, name: '' }];
    st.rois = []; st.result = null; st.decoded = null;
  }

  /* ── pixel packing for the chosen depth ────────────────────────────── */
  function pack(img, rgba16, crop, grey, keepAlpha, bitDepth) {
    const W0 = img.width, cx = crop ? crop.x : 0, cy = crop ? crop.y : 0, w = crop ? crop.w : img.width, h = crop ? crop.h : img.height;
    const ch = (grey ? 1 : 3) + (keepAlpha ? 1 : 0), n = w * h;
    const isF = bitDepth === 'f16' || bitDepth === 'f32', is16 = !isF && bitDepth !== '8';
    const out = isF ? new Float32Array(n * ch) : is16 ? new Uint16Array(n * ch) : new Uint8Array(n * ch);
    const s8 = img.data, src = rgba16 || s8, scale = rgba16 ? 1 : 257;    // work in 16-bit units
    const k = isF ? 1 / 65535 : 1;
    for (let y = 0; y < h; y++) {
      let si = ((cy + y) * W0 + cx) * 4, di = y * w * ch;
      for (let x = 0; x < w; x++, si += 4, di += ch) {
        const r = src[si] * scale, g = src[si + 1] * scale, b = src[si + 2] * scale, al = src[si + 3] * scale;
        if (grey) {
          const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          out[di] = isF ? v * k : is16 ? Math.round(v) : Math.round(v / 257);
          if (keepAlpha) out[di + 1] = isF ? al * k : is16 ? al : al / 257;
        } else if (isF) { out[di] = r * k; out[di + 1] = g * k; out[di + 2] = b * k; if (keepAlpha) out[di + 3] = al * k; }
        else if (is16) { out[di] = r; out[di + 1] = g; out[di + 2] = b; if (keepAlpha) out[di + 3] = al; }
        else if (rgba16) { out[di] = (r + 128) / 257; out[di + 1] = (g + 128) / 257; out[di + 2] = (b + 128) / 257; if (keepAlpha) out[di + 3] = (al + 128) / 257; }
        else { out[di] = s8[si]; out[di + 1] = s8[si + 1]; out[di + 2] = s8[si + 2]; if (keepAlpha) out[di + 3] = s8[si + 3]; }
      }
    }
    return { data: out, dtype: isF ? 2 : is16 ? 1 : 0, channels: ch };
  }

  function frameSettings(distance, lossless) {
    const ints = {}, floats = {};
    const I = (id, v) => { if (v != null && v !== '' && +v !== -1) (FLOAT_IDS.has(id) ? floats : ints)[id] = +v; };
    I(ID.EFFORT, S.effort); I(ID.DECODING_SPEED, S.decodingSpeed || null);
    I(ID.MODULAR_GROUP_SIZE, S.groupSize); I(ID.GROUP_ORDER, S.groupOrder); I(ID.CENTER_X, S.centerX); I(ID.CENTER_Y, S.centerY);
    I(ID.PROGRESSIVE_DC, S.progressiveDC); I(ID.PROGRESSIVE_AC, S.progressiveAC); I(ID.QPROGRESSIVE_AC, S.qprogressiveAC);
    I(ID.RESPONSIVE, S.responsive); I(ID.BUFFERING, S.buffering);
    I(ID.EPF, S.epf); I(ID.GABORISH, S.gaborish); I(ID.NOISE, S.noise); I(ID.DOTS, S.dots); I(ID.PATCHES, S.patches);
    I(ID.RESAMPLING, S.resampling); I(ID.EC_RESAMPLING, S.ecResampling); I(ID.MODULAR, S.mode === 'modular' ? 1 : S.forceModular);
    I(ID.KEEP_INVISIBLE, S.keepInvisible);
    I(ID.MODULAR_PREDICTOR, S.predictor); I(ID.PALETTE_COLORS, S.paletteColors); I(ID.LOSSY_PALETTE, S.lossyPalette);
    I(ID.NB_PREV_CH, S.nbPrev); I(ID.MODULAR_COLOR_SPACE, S.modularColorSpace); I(ID.COLOR_TRANSFORM, S.colorTransform);
    I(ID.FULL_IMAGE_HEURISTICS, S.fullHeuristics); I(ID.DISABLE_PERCEPTUAL, S.disablePerceptual);
    I(ID.BROTLI_EFFORT, S.brotliEffort); I(ID.JPEG_COMPRESS_BOXES, S.compressBoxes);
    I(ID.JPEG_KEEP_EXIF, S.keepExif); I(ID.JPEG_KEEP_XMP, S.keepXmp); I(ID.JPEG_KEEP_JUMBF, S.keepJumbf); I(ID.JPEG_RECON_CFL, S.jpegCfl);
    if (+S.photonNoise > 0) floats[ID.PHOTON_NOISE] = +S.photonNoise;
    if (+S.maTree >= 0) floats[ID.MA_TREE_PCT] = +S.maTree;
    if (+S.colorsGlobal >= 0) floats[ID.CH_COLORS_GLOBAL] = +S.colorsGlobal;
    if (+S.colorsGroup >= 0) floats[ID.CH_COLORS_GROUP] = +S.colorsGroup;
    const alphaDistance = S.alphaLossless ? 0 : qToD(+S.alphaQuality);
    return { ints, floats, lossless: !!lossless, distance: lossless ? null : distance, alphaDistance };
  }

  function xmpPacket() {
    if (!S.xmpAuthor && !S.xmpCopyright && !S.xmpTitle) return null;
    const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const x = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="Frax Studio · Radical Deepscale">`
      + (S.xmpTitle ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(S.xmpTitle)}</rdf:li></rdf:Alt></dc:title>` : '')
      + (S.xmpAuthor ? `<dc:creator><rdf:Seq><rdf:li>${esc(S.xmpAuthor)}</rdf:li></rdf:Seq></dc:creator>` : '')
      + (S.xmpCopyright ? `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${esc(S.xmpCopyright)}</rdf:li></rdf:Alt></dc:rights>` : '')
      + `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    return new TextEncoder().encode(x);
  }

  function buildJob() {
    const src = st.src; if (!src) throw new Error('No image loaded — load one in the Converter first');
    const frames = st.frames.length ? st.frames : [{ img: src.img, duration: S.defaultDuration }];
    const animated = frames.length > 1;
    const lossless = S.mode === 'lossless';
    const grey = S.grey === 'grey' || (S.grey === 'auto' && src.isGrey && frames.every((f) => f === frames[0] || analyse(f.img).isGrey));
    const keepAlpha = S.alpha === 'keep' || (S.alpha === 'auto' && (src.hasAlpha || frames.some((f) => analyse(f.img).hasAlpha)));
    const bd = S.bitDepth, isF = bd === 'f16' || bd === 'f32';
    const bits = bd === 'f16' ? 16 : bd === 'f32' ? 32 : +bd, expBits = bd === 'f16' ? 5 : bd === 'f32' ? 8 : 0;
    let alphaBits = 0, alphaExp = 0;
    if (keepAlpha) {
      if (S.alphaBits === 'same') { alphaBits = bits; alphaExp = expBits; }
      else { alphaBits = +S.alphaBits; alphaExp = 0; if (isF && alphaBits === 16) { alphaExp = 5; } }
    }
    const boxes = []; const xmp = xmpPacket(); if (xmp) boxes.push({ type: 'xml ', data: xmp, compress: +S.compressBoxes === 1 });
    const job = { width: src.w, height: src.h, bits, expBits, channels: grey ? 1 : 3, alphaBits, alphaExp, premultiplied: !!S.premultiplied,
      animated, tpsNum: 1000, tpsDen: 1, loops: +S.loops | 0, originalProfile: lossless || S.colorTransform === 1 ? 1 : 0,
      intensityTarget: +S.intensity || 0, orientation: +S.orientation || 1, color: +S.color, intent: +S.intent,
      container: boxes.length ? 1 : +S.container, level: +S.level, boxes, frames: [] };

    if (S.mode === 'jpeg') {
      if (!src.isJPEG || !src.bytes) throw new Error('Lossless JPEG transcoding needs the original .jpg file loaded in the Converter');
      job.jpeg = src.bytes; job.jpegMeta = true; job.frames = [frameSettings(null, false)];
      return job;
    }
    const base = frameSettings(+S.distance, lossless);
    const useRoi = !lossless && !animated && S.roiOn && st.rois.length;
    if (useRoi && S.roiOrder && +S.groupOrder === -1) {        // stream the first focus area first
      const r = st.rois[0]; base.ints[ID.GROUP_ORDER] = 1; base.ints[ID.CENTER_X] = Math.round(r.x + r.w / 2); base.ints[ID.CENTER_Y] = Math.round(r.y + r.h / 2);
    }
    frames.forEach((f, i) => {
      const p = pack(f.img, i === 0 ? src.rgba16 : null, null, grey, keepAlpha, bd);
      job.frames.push(Object.assign({}, base, p, { duration: animated ? Math.max(0, Math.round(+f.duration || S.defaultDuration)) : 0, blend: 0, name: f.name || '' }));
    });
    if (useRoi) {
      // Focus areas: each is a sharper layer laid over the base image at its exact position (JPEG XL crop + replace blend),
      // so the bits go where you marked them while the rest of the picture is coded at the base quality.
      const rd = qToD(+S.roiQuality);
      st.rois.forEach((r, k) => {
        const crop = { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), w: 0, h: 0 };
        crop.w = Math.min(src.w - crop.x, Math.round(r.w)); crop.h = Math.min(src.h - crop.y, Math.round(r.h));
        if (crop.w < 8 || crop.h < 8) return;
        const p = pack(src.img, src.rgba16, crop, grey, keepAlpha, bd);
        const fs = frameSettings(Math.min(rd, +S.distance), false);
        job.frames.push(Object.assign({}, fs, p, { duration: 0, crop, blend: 0, name: 'focus ' + (k + 1) }));
      });
    }
    return job;
  }

  /* ── encode / decode ───────────────────────────────────────────────── */
  async function encode() {
    if (st.busy) return; st.busy = true; ui.status('Encoding…', 'var(--gold)'); ui.progress(0.02); ui.buttons();
    try {
      const job = buildJob();
      const transfer = job.frames.map((f) => f.data && f.data.buffer).filter(Boolean);
      if (job.jpeg) { job.jpeg = job.jpeg.slice(); transfer.push(job.jpeg.buffer); }
      onProgress = (p) => ui.progress(0.05 + p * 0.6);
      const r = await call({ op: 'encode', job }, transfer);
      // packed pixel buffers were transferred to the worker; drop them (rebuilt on next encode)
      st.result = { bytes: r.bytes, ms: r.ms, animated: job.animated, frames: job.frames.length };
      ui.progress(0.75); ui.status('Decoding preview…', 'var(--gold)');
      const d = await call({ op: 'decode', bytes: r.bytes.slice(0).buffer, want16: false, maxFrames: 600 });
      st.decoded = d; ui.progress(1);
      const px = st.src.w * st.src.h * (job.animated ? st.frames.length : 1), bpp = (r.bytes.length * 8) / px;
      const rawPNG = st.src.bytes && /png$/i.test(st.src.name) ? st.src.bytes.length : null;
      ui.status(`✓ ${fmtBytes(r.bytes.length)} · ${bpp.toFixed(3)} bpp · ${Math.round(r.ms)} ms${rawPNG ? ' · ' + (100 * r.bytes.length / rawPNG).toFixed(1) + '% of the PNG' : ''}${S.mode === 'jpeg' ? ' · original JPEG ' + fmtBytes(st.src.bytes.length) : ''}`, 'var(--green)');
      ui.draw(); ui.buttons(); setTimeout(() => ui.progress(null), 600);
    } catch (e) { ui.status('Error: ' + e.message, '#ff6b6b'); ui.progress(null); }
    finally { st.busy = false; onProgress = null; ui.buttons(); }
  }
  function fmtBytes(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }
  function downloadResult() {
    if (!st.result) return;
    const name = (st.src.name || 'image').replace(/\.[^.]+$/, '') + '.jxl';
    const blob = new Blob([st.result.bytes], { type: 'image/jxl' });
    if (typeof window.download === 'function') window.download(blob, name);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 300); }
  }

  // .jxl → Frax canvas (first frame), and the frames into the animation list
  async function importJXL(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const d = await call({ op: 'decode', bytes: bytes.buffer, want16: false, maxFrames: 600 }, [bytes.buffer]);
    const toImg = (f) => new ImageData(new Uint8ClampedArray(f.data), d.width, d.height);
    const first = toImg(d.frames[0]);
    return { img: first, frames: d.frames.map((f) => ({ img: toImg(f), duration: d.tpsNum ? Math.round(f.duration * 1000 * (d.tpsDen || 1) / d.tpsNum) : 100 })), info: d };
  }

  // animated GIF / WebP / APNG / AVIS via WebCodecs ImageDecoder when the browser has it
  async function framesFromAnimatedFile(file) {
    if (/\.jxl$/i.test(file.name)) { const r = await importJXL(file); return r.frames; }
    if (!('ImageDecoder' in window)) return null;
    const type = file.type || ({ gif: 'image/gif', webp: 'image/webp', png: 'image/png', apng: 'image/apng', avif: 'image/avif' }[file.name.split('.').pop().toLowerCase()]);
    if (!type || !(await ImageDecoder.isTypeSupported(type))) return null;
    const dec = new ImageDecoder({ data: file.stream(), type }); await dec.tracks.ready; await dec.completed;
    const n = dec.tracks.selectedTrack ? dec.tracks.selectedTrack.frameCount : 1; if (n <= 1) return null;
    const out = [];
    for (let i = 0; i < Math.min(n, 600); i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const c = document.createElement('canvas'); c.width = image.displayWidth; c.height = image.displayHeight;
      c.getContext('2d').drawImage(image, 0, 0); out.push({ img: c.getContext('2d').getImageData(0, 0, c.width, c.height), duration: Math.round((image.duration || 100000) / 1000) });
      image.close();
    }
    dec.close(); return out;
  }
  function fitTo(img, w, h) {         // frames must match the canvas size: letterbox into it
    if (img.width === w && img.height === h) return img;
    const s = document.createElement('canvas'); s.width = img.width; s.height = img.height; s.getContext('2d').putImageData(img, 0, 0);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const k = Math.min(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
    g.drawImage(s, (w - dw) / 2, (h - dh) / 2, dw, dh); return g.getImageData(0, 0, w, h);
  }
  async function fileToImageData(file) {
    const bmp = await createImageBitmap(file); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close(); return c.getContext('2d').getImageData(0, 0, c.width, c.height);
  }

  /* ── UI ────────────────────────────────────────────────────────────── */
  const css = `
#jxs{position:fixed;inset:0;z-index:9000;background:rgba(4,7,13,.94);backdrop-filter:blur(6px);display:none;flex-direction:column;font-family:var(--mono);color:var(--text);padding:var(--safe-t,0) 0 var(--safe-b,0)}
#jxs.show{display:flex}
#jxs .jx-top{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border2);flex-wrap:wrap}
#jxs .jx-title{font-family:var(--head-font);font-weight:800;letter-spacing:2px;color:var(--gold);font-size:14px}
#jxs .jx-ver{font-size:9px;color:var(--text3);letter-spacing:1px}
#jxs .jx-sp{flex:1}
#jxs .jx-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 360px;min-height:0}
@media (max-width:820px){#jxs .jx-body{grid-template-columns:1fr;grid-template-rows:minmax(220px,42vh) 1fr}}
#jxs .jx-view{position:relative;min-height:0;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--border)}
#jxs .jx-stage{flex:1;position:relative;overflow:auto;display:flex;background:repeating-conic-gradient(#0d1424 0 25%,#111a2e 0 50%) 0 0/18px 18px;touch-action:none}
#jxs canvas.jx-cv{display:block;margin:auto;image-rendering:auto}
#jxs .jx-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 10px;border-top:1px solid var(--border);font-size:9px;color:var(--text2)}
#jxs .jx-tools input[type=range]{width:120px}
#jxs .jx-panel{overflow-y:auto;min-height:0;padding:10px 12px 90px}
#jxs details{border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;background:rgba(19,28,48,.45)}
#jxs summary{cursor:pointer;padding:9px 10px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);font-family:var(--head-font);font-weight:700;list-style:none}
#jxs summary::-webkit-details-marker{display:none}
#jxs summary::after{content:'▾';float:right;color:var(--text3)}
#jxs details:not([open]) summary::after{content:'▸'}
#jxs .jx-sec{padding:2px 10px 10px}
#jxs .jx-row{display:flex;gap:8px;margin-bottom:8px;align-items:flex-end;flex-wrap:wrap}
#jxs .jx-f{flex:1;min-width:120px}
#jxs .jx-l{font-size:8px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;display:flex;justify-content:space-between;gap:6px}
#jxs .jx-l b{color:var(--text);letter-spacing:.5px;font-weight:600}
#jxs select,#jxs input[type=number],#jxs input[type=text]{width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:10px;padding:6px 8px;border-radius:var(--radius-sm)}
#jxs input[type=range]{width:100%;accent-color:var(--gold)}
#jxs .jx-chk{display:flex;align-items:center;gap:6px;font-size:9px;color:var(--text2);letter-spacing:.5px;margin:4px 0;cursor:pointer}
#jxs .jx-chk input{accent-color:var(--gold)}
#jxs .jx-hint{font-size:9px;color:var(--text3);line-height:1.6;margin:2px 0 8px}
#jxs .jx-pre{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
#jxs .jx-pre .btn{font-size:9px;padding:4px 8px}
#jxs .jx-foot{position:sticky;bottom:0;background:linear-gradient(transparent,rgba(6,10,18,.98) 22%);padding:16px 0 4px;display:flex;flex-direction:column;gap:6px}
#jxs .jx-status{font-size:9px;letter-spacing:.5px;min-height:14px;color:var(--text2)}
#jxs .jx-bar{height:3px;background:var(--bg3);border-radius:2px;overflow:hidden}
#jxs .jx-bar>div{height:100%;width:0;background:linear-gradient(90deg,var(--gold),var(--cyan));transition:width .3s}
#jxs .btn-gold{background:rgba(255,201,60,.12);border-color:rgba(255,201,60,.35);color:var(--gold)}
#jxs .btn-gold:hover{background:rgba(255,201,60,.22);border-color:var(--gold)}
#jxs .btn[disabled]{opacity:.35;cursor:not-allowed}
#jxs .jx-frames{display:flex;flex-direction:column;gap:5px;margin-bottom:8px}
#jxs .jx-fr{display:grid;grid-template-columns:44px 1fr 70px auto;gap:6px;align-items:center;font-size:9px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:4px}
#jxs .jx-fr canvas{width:44px;height:32px;object-fit:contain;background:#000;border-radius:3px}
#jxs .jx-fr .ops{display:flex;gap:2px}
#jxs .jx-fr .ops button{background:none;border:1px solid var(--border);color:var(--text2);border-radius:4px;font-size:10px;padding:2px 5px;cursor:pointer}
#jxs .jx-roi{display:flex;gap:6px;align-items:center;font-size:9px;color:var(--text2);margin-bottom:4px}
#jxs .jx-tag{font-size:8px;color:var(--text3);border:1px solid var(--border);border-radius:4px;padding:1px 5px;margin-left:4px}
#jxs .jx-badge{position:absolute;top:8px;font-size:9px;letter-spacing:1px;padding:3px 7px;border-radius:5px;background:rgba(6,10,18,.8);border:1px solid var(--border2);pointer-events:none}
`;
  const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${l}</option>`).join('');
  const AUTO = [[-1, 'Auto (encoder decides)']];
  const ONOFF = [[-1, 'Auto'], [1, 'On'], [0, 'Off']];

  function sel(key, label, pairs, hint) { return `<div class="jx-f"><div class="jx-l">${label}</div><select data-k="${key}">${opt(pairs, S[key])}</select>${hint ? `<div class="jx-hint">${hint}</div>` : ''}</div>`; }
  function num(key, label, min, max, step, hint) { const v = typeof S[key] === 'number' ? +S[key].toFixed(3) : S[key]; return `<div class="jx-f"><div class="jx-l">${label}</div><input type="number" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${v}">${hint ? `<div class="jx-hint">${hint}</div>` : ''}</div>`; }
  function rng(key, label, min, max, step, fmt) { return `<div class="jx-f" style="min-width:100%"><div class="jx-l">${label}<b data-v="${key}">${fmt ? fmt(S[key]) : S[key]}</b></div><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}"></div>`; }
  function chk(key, label) { return `<label class="jx-chk"><input type="checkbox" data-k="${key}"${S[key] ? ' checked' : ''}> ${label}</label>`; }
  function txt(key, label, ph) { return `<div class="jx-f" style="min-width:100%"><div class="jx-l">${label}</div><input type="text" data-k="${key}" value="${String(S[key] || '').replace(/"/g, '&quot;')}" placeholder="${ph || ''}"></div>`; }

  const EFFORT = [[1, '1 · Lightning'], [2, '2 · Thunder'], [3, '3 · Falcon'], [4, '4 · Cheetah'], [5, '5 · Hare'], [6, '6 · Wombat'], [7, '7 · Squirrel (default)'], [8, '8 · Kitten'], [9, '9 · Tortoise'], [10, '10 · Glacier (very slow)']];
  const PREDICTORS = [[-1, 'Auto'], [0, '0 · Zero'], [1, '1 · Left'], [2, '2 · Top'], [3, '3 · Avg(left, top)'], [4, '4 · Select'], [5, '5 · Gradient'], [6, '6 · Weighted'], [7, '7 · Top-right'], [8, '8 · Top-left'], [9, '9 · Left-left'], [10, '10 · Avg(left, top-left)'], [11, '11 · Avg(top-left, top)'], [12, '12 · Avg(top, top-right)'], [13, '13 · Avg(6 neighbours)'], [14, '14 · Mix 5 / 6'], [15, '15 · Try all']];

  function panelHTML() {
    const isJ = st.src && st.src.isJPEG;
    return `
<div class="jx-pre">${Object.keys(PRESETS).map((k) => `<button class="btn btn-ghost" data-preset="${k}">${({ web: 'Web', photo: 'Photo', visual: 'Visually lossless', archive: 'Archive 16-bit', pixel: 'Pixel art', fast: 'Fast decode', hdr: 'HDR', smallest: 'Smallest' })[k]}</button>`).join('')}<button class="btn btn-ghost" data-preset="reset">Reset</button></div>

<details open><summary>Compression</summary><div class="jx-sec">
 <div class="jx-row">${sel('mode', 'Mode', [['lossy', 'Lossy · VarDCT (photos)'], ['modular', 'Lossy · Modular (art, UI)'], ['lossless', 'Lossless · exact pixels'], ['jpeg', 'Lossless JPEG transcode' + (isJ ? '' : ' (load a .jpg)')]], 'JPEG transcode re-packs an existing JPEG about 20% smaller and can rebuild the original file bit-for-bit.')}</div>
 <div class="jx-row" data-show="lossy">${rng('quality', 'Quality', 0, 100, 0.5, (v) => v + ' · distance ' + qToD(+v).toFixed(2))}</div>
 <div class="jx-row" data-show="lossy">${num('distance', 'Butteraugli distance', 0, 25, 0.05, '0 = mathematically lossless · 1 = visually lossless · 2–3 = web · up to 25')}</div>
 <div class="jx-row">${sel('effort', 'Effort (speed ↔ size)', EFFORT)}${sel('decodingSpeed', 'Decode speed', [[0, '0 · Best density'], [1, '1'], [2, '2'], [3, '3'], [4, '4 · Fastest decode']])}</div>
</div></details>

<details open><summary>Bit depth & colour</summary><div class="jx-sec">
 <div class="jx-row">${sel('bitDepth', 'Bit depth', [['8', '8-bit integer'], ['10', '10-bit integer'], ['12', '12-bit integer'], ['16', '16-bit integer'], ['f16', '16-bit float (half)'], ['f32', '32-bit float']], st.src && st.src.rgba16 ? '✓ 16-bit PNG source: full precision is used.' : 'Above 8 bits keeps headroom for grading; real extra precision comes from a 16-bit PNG source.')}</div>
 <div class="jx-row">${sel('color', 'Colour space', [[0, 'sRGB'], [1, 'Linear sRGB'], [2, 'Display P3'], [5, 'Rec.2020 (SDR)'], [3, 'Rec.2100 PQ (HDR)'], [4, 'Rec.2100 HLG (HDR)']])}${sel('grey', 'Channels', [['auto', 'Auto (detect greyscale)'], ['color', 'Colour'], ['grey', 'Greyscale']])}</div>
 <div class="jx-row">${sel('intent', 'Rendering intent', [[0, 'Perceptual'], [1, 'Relative'], [2, 'Saturation'], [3, 'Absolute']])}${num('intensity', 'HDR peak (nits)', 0, 10000, 1, '0 = default (255 SDR, 10000 PQ)')}</div>
 <div class="jx-row">${sel('orientation', 'Orientation', [[1, 'Normal'], [2, 'Flip H'], [3, 'Rotate 180'], [4, 'Flip V'], [5, 'Transpose'], [6, 'Rotate 90 CW'], [7, 'Transverse'], [8, 'Rotate 90 CCW']])}${sel('colorTransform', 'Internal colour transform', [[-1, 'Auto (XYB lossy)'], [0, 'XYB'], [1, 'None'], [2, 'YCbCr']])}</div>
</div></details>

<details><summary>Transparency</summary><div class="jx-sec">
 <div class="jx-row">${sel('alpha', 'Alpha channel', [['auto', 'Auto (keep if used)' + (st.src ? (st.src.hasAlpha ? ' · image has alpha' : ' · image is opaque') : '')], ['keep', 'Always keep'], ['drop', 'Remove alpha']])}${sel('alphaBits', 'Alpha depth', [['same', 'Same as colour'], [1, '1-bit (cut-out)'], [8, '8-bit'], [16, '16-bit']])}</div>
 ${chk('alphaLossless', 'Lossless alpha (recommended)')}
 <div class="jx-row" data-show="alphaq">${rng('alphaQuality', 'Alpha quality', 50, 100, 0.5, (v) => v + ' · distance ' + qToD(+v).toFixed(2))}</div>
 ${chk('premultiplied', 'Premultiplied alpha')}
 <div class="jx-row">${sel('keepInvisible', 'Colour under fully transparent pixels', [[-1, 'Auto'], [1, 'Keep (needed for editing)'], [0, 'Discard (smaller)']])}</div>
</div></details>

<details><summary>Animation <span class="jx-tag" data-count="frames">${st.frames.length} frame${st.frames.length === 1 ? '' : 's'}</span></summary><div class="jx-sec">
 <div class="jx-hint">Two or more frames make an animated JPEG XL. Add images or animated GIF / WebP / APNG / JXL files; every frame is fitted to the first frame's size.</div>
 <div class="jx-frames" id="jx-frames"></div>
 <div class="jx-row"><button class="btn btn-ghost" data-act="addFrames" style="flex:1">＋ Add frames</button><button class="btn btn-ghost" data-act="addCanvas" style="flex:1">＋ Current canvas</button><button class="btn btn-ghost" data-act="clearFrames">Clear</button></div>
 <div class="jx-row">${num('defaultDuration', 'New frame duration (ms)', 1, 60000, 1)}${num('loops', 'Loops (0 = forever)', 0, 65535, 1)}</div>
 <div class="jx-row"><div class="jx-f"><div class="jx-l">Set all frames to</div><select data-act="fps">${opt([['', '— frame rate —'], [1000 / 12, '12 fps'], [1000 / 15, '15 fps'], [1000 / 24, '24 fps'], [1000 / 30, '30 fps'], [1000 / 60, '60 fps']], '')}</select></div></div>
</div></details>

<details><summary>Focus areas (region of interest)</summary><div class="jx-sec">
 <div class="jx-hint">Drag on the preview to mark areas that matter (faces, logos, text). They are encoded as sharper layers over the base image, and the file streams those tiles first so they appear first while loading. Lossy, still images.</div>
 ${chk('roiOn', 'Use focus areas')}
 <div class="jx-row">${rng('roiQuality', 'Focus quality', 50, 100, 0.5, (v) => v + ' · distance ' + qToD(+v).toFixed(2))}</div>
 ${chk('roiOrder', 'Load the first focus area first (centre-first tile order)')}
 <div id="jx-rois"></div>
 <div class="jx-row"><button class="btn btn-ghost" data-act="drawRoi" style="flex:1">✎ Draw area</button><button class="btn btn-ghost" data-act="clearRois">Clear areas</button></div>
</div></details>

<details><summary>Tiles & progressive loading</summary><div class="jx-sec">
 <div class="jx-row">${sel('groupSize', 'Tile (group) size · modular', [[-1, 'Auto'], [0, '128 × 128'], [1, '256 × 256'], [2, '512 × 512'], [3, '1024 × 1024']])}${sel('groupOrder', 'Tile order', [[-1, 'Auto'], [0, 'Scanline (top to bottom)'], [1, 'Centre-first (spiral)']])}</div>
 <div class="jx-row">${num('centerX', 'Centre X (px, -1 = middle)', -1, 65535, 1)}${num('centerY', 'Centre Y (px, -1 = middle)', -1, 65535, 1)}</div>
 <div class="jx-row">${sel('progressiveDC', 'Progressive DC (preview passes)', [[-1, 'Auto'], [0, 'Off'], [1, '1 pass'], [2, '2 passes']])}${sel('progressiveAC', 'Progressive AC', ONOFF)}</div>
 <div class="jx-row">${sel('qprogressiveAC', 'Quantised progressive AC', ONOFF)}${sel('responsive', 'Responsive (modular progressive)', ONOFF)}</div>
 <div class="jx-row">${sel('buffering', 'Memory / buffering', [[-1, 'Auto'], [0, '0 · Whole image (best)'], [1, '1'], [2, '2'], [3, '3 · Streaming (least memory)']])}</div>
</div></details>

<details><summary>Detail & filters</summary><div class="jx-sec">
 <div class="jx-row">${sel('epf', 'Edge-preserving filter', [[-1, 'Auto'], [0, 'Off'], [1, '1'], [2, '2'], [3, '3 · Strongest']])}${sel('gaborish', 'Gaborish (deblocking)', ONOFF)}</div>
 <div class="jx-row">${num('photonNoise', 'Photon noise ISO (film grain)', 0, 102400, 50, '0 = none · 400–3200 hides banding in skies and gradients')}</div>
 <div class="jx-row">${sel('noise', 'Adaptive noise', ONOFF)}${sel('dots', 'Dots (stars, specks)', ONOFF)}${sel('patches', 'Patches (repeated text, icons)', ONOFF)}</div>
 <div class="jx-row">${sel('resampling', 'Downsample before coding', [[-1, 'Auto'], [1, '1× (none)'], [2, '2×'], [4, '4×'], [8, '8×']])}${sel('ecResampling', 'Alpha / extra resampling', [[-1, 'Auto'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']])}</div>
 <div class="jx-row">${sel('disablePerceptual', 'Perceptual optimisation', [[-1, 'On (default)'], [1, 'Off (exact maths)']])}${sel('fullHeuristics', 'Whole-image heuristics', ONOFF)}</div>
</div></details>

<details><summary>Modular & palette (expert)</summary><div class="jx-sec">
 <div class="jx-row">${sel('forceModular', 'Coding mode', [[-1, 'Auto'], [0, 'Force VarDCT'], [1, 'Force Modular']])}${sel('predictor', 'Predictor', PREDICTORS)}</div>
 <div class="jx-row">${num('maTree', 'MA-tree learning %', -1, 100, 1, '-1 auto')}${num('nbPrev', 'Previous channels used', -1, 11, 1)}</div>
 <div class="jx-row">${num('paletteColors', 'Palette colours (max)', -1, 70913, 1, '-1 auto · 0 off')}${sel('lossyPalette', 'Lossy palette (delta)', ONOFF)}</div>
 <div class="jx-row">${num('colorsGlobal', 'Channel palette % global', -1, 100, 1)}${num('colorsGroup', 'Channel palette % per tile', -1, 100, 1)}</div>
 <div class="jx-row">${num('modularColorSpace', 'Reversible colour transform (RCT)', -1, 41, 1, '-1 auto · 0 none · 1–41 specific RCT')}</div>
</div></details>

<details><summary>Container & metadata</summary><div class="jx-sec">
 <div class="jx-row">${sel('container', 'File structure', [[-1, 'Auto'], [0, 'Bare codestream (smallest)'], [1, 'ISOBMFF container']])}${sel('level', 'Codestream level', [[0, 'Auto'], [5, 'Level 5 (wide support)'], [10, 'Level 10 (huge / exotic)']])}</div>
 <div class="jx-row">${sel('compressBoxes', 'Compress metadata (Brotli)', ONOFF)}${sel('brotliEffort', 'Brotli effort', [[-1, 'Auto'], ...Array.from({ length: 12 }, (_, i) => [i, String(i)])])}</div>
 ${txt('xmpTitle', 'Title (XMP)', 'optional')}${txt('xmpAuthor', 'Author (XMP)', 'optional')}${txt('xmpCopyright', 'Copyright (XMP)', '© 2026 …')}
 <div class="jx-hint">JPEG transcode only:</div>
 ${chk('keepExif', 'Keep Exif')}${chk('keepXmp', 'Keep XMP')}${chk('keepJumbf', 'Keep JUMBF / C2PA')}
 <div class="jx-row">${sel('jpegCfl', 'Chroma-from-luma for JPEG', ONOFF)}</div>
</div></details>

<div class="jx-foot">
 <div class="jx-bar" id="jx-bar" style="display:none"><div></div></div>
 <div class="jx-status" id="jx-status"></div>
 <div class="jx-row" style="margin:0"><button class="btn btn-gold" data-act="encode" style="flex:2">⬡ Encode JPEG XL</button><button class="btn btn-gold" data-act="download" style="flex:1" disabled>⬇ .jxl</button></div>
</div>`;
  }

  let root = null, cv = null, ctx = null, panel = null;
  const ui = {
    status(m, c) { const s = root && root.querySelector('#jx-status'); if (s) { s.textContent = m; s.style.color = c || 'var(--text2)'; } },
    progress(p) { const b = root && root.querySelector('#jx-bar'); if (!b) return; if (p == null) { b.style.display = 'none'; return; } b.style.display = ''; b.firstChild.style.width = Math.round(p * 100) + '%'; },
    buttons() {
      if (!root) return;
      const e = root.querySelector('[data-act=encode]'), d = root.querySelector('[data-act=download]');
      if (e) e.disabled = st.busy || !st.src; if (d) d.disabled = st.busy || !st.result;
      const lossy = S.mode === 'lossy' || S.mode === 'modular';
      root.querySelectorAll('[data-show=lossy]').forEach((n) => n.style.display = lossy ? '' : 'none');
      root.querySelectorAll('[data-show=alphaq]').forEach((n) => n.style.display = S.alphaLossless ? 'none' : '');
      const t = root.querySelector('[data-count=frames]'); if (t) t.textContent = st.frames.length + ' frame' + (st.frames.length === 1 ? '' : 's');
    },
    draw() { draw(); },
  };

  function build() {
    if (root) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    root = el(`<div id="jxs" role="dialog" aria-label="JPEG XL Studio">
 <div class="jx-top"><span class="jx-title">JPEG XL STUDIO</span><span class="jx-ver" id="jx-ver">libjxl · WebAssembly</span><span class="jx-sp"></span>
  <button class="btn btn-ghost" data-act="open" title="Load an image or .jxl">Open…</button><button class="btn btn-ghost" data-act="toFrax" title="Send the encoded result to the Frax canvas" disabled>→ Canvas</button><button class="btn btn-ghost" data-act="close">✕ Close</button></div>
 <div class="jx-body">
  <div class="jx-view"><div class="jx-stage" id="jx-stage"><canvas class="jx-cv" id="jx-cv"></canvas><span class="jx-badge" style="left:8px">ORIGINAL</span><span class="jx-badge" style="right:8px">JPEG XL</span></div>
   <div class="jx-tools"><span>Compare</span><input type="range" id="jx-cmp" min="0" max="1" step="0.001" value="0.5"><select id="jx-zoom" style="width:auto;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-size:9px;padding:3px 6px;border-radius:5px"><option value="fit">Fit</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select><span id="jx-info" style="margin-left:auto"></span></div></div>
  <div class="jx-panel" id="jx-panel"></div>
 </div></div>`);
    document.body.appendChild(root);
    cv = root.querySelector('#jx-cv'); ctx = cv.getContext('2d'); panel = root.querySelector('#jx-panel');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput); root.addEventListener('change', onInput);
    root.querySelector('#jx-cmp').addEventListener('input', (e) => { st.cmp = +e.target.value; draw(); });
    root.querySelector('#jx-zoom').addEventListener('change', (e) => { st.zoom = e.target.value; draw(); });
    const stage = root.querySelector('#jx-stage');
    stage.addEventListener('pointerdown', roiDown); stage.addEventListener('pointermove', roiMove); window.addEventListener('pointerup', roiUp);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('show')) close(); });
    call({ op: 'version' }).then((r) => { st.version = r.version; const v = root.querySelector('#jx-ver'); if (v) v.textContent = 'libjxl ' + r.version + ' · WebAssembly'; }).catch((e) => ui.status('Could not load the JPEG XL engine: ' + e.message, '#ff6b6b'));
  }
  function render() { panel.innerHTML = panelHTML(); renderFrames(); renderRois(); ui.buttons(); }

  function onInput(e) {
    const t = e.target, k = t.dataset && t.dataset.k;
    if (t.dataset && t.dataset.act === 'fps' && t.value) { st.frames.forEach((f) => f.duration = Math.round(+t.value)); S.defaultDuration = Math.round(+t.value); t.value = ''; renderFrames(); save(); return; }
    if (t.dataset && t.dataset.fd != null) { const f = st.frames[+t.dataset.fd]; if (f) f.duration = Math.max(1, +t.value | 0); return; }
    if (!k) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number' || t.type === 'range') v = +v;
    S[k] = v;
    if (k === 'quality') { S.distance = +qToD(+v).toFixed(3); const d = root.querySelector('[data-k=distance]'); if (d) d.value = S.distance; }
    if (k === 'distance') { S.quality = dToQ(+v); const q = root.querySelector('[data-k=quality]'); if (q) q.value = S.quality; const b = root.querySelector('[data-v=quality]'); if (b) b.textContent = S.quality + ' · distance ' + (+v).toFixed(2); }
    const b = root.querySelector(`[data-v="${k}"]`); if (b && t.type === 'range') b.textContent = ['quality', 'alphaQuality', 'roiQuality'].includes(k) ? v + ' · distance ' + qToD(+v).toFixed(2) : v;
    if (k === 'mode' && v === 'jpeg' && !(st.src && st.src.isJPEG)) ui.status('Load the original .jpg in the Converter (or Open…) to transcode it losslessly.', 'var(--gold)');
    save(); ui.buttons();
  }

  async function onClick(e) {
    const b = e.target.closest('[data-act],[data-preset],[data-fop],[data-roi]'); if (!b) return;
    if (b.dataset.preset) {
      S = b.dataset.preset === 'reset' ? Object.assign({}, DEF) : Object.assign({}, S, PRESETS[b.dataset.preset]);
      if (S.quality != null && b.dataset.preset !== 'reset') S.distance = +qToD(S.quality).toFixed(3);
      save(); render(); ui.status('Preset: ' + b.textContent, 'var(--gold)'); return;
    }
    if (b.dataset.fop) { frameOp(b.dataset.fop, +b.dataset.i); return; }
    if (b.dataset.roi != null) { st.rois.splice(+b.dataset.roi, 1); renderRois(); draw(); return; }
    const a = b.dataset.act;
    if (a === 'close') close();
    else if (a === 'encode') encode();
    else if (a === 'download') downloadResult();
    else if (a === 'open') pickFiles(false);
    else if (a === 'addFrames') pickFiles(true);
    else if (a === 'addCanvas') { const img = currentCanvas(); if (img && st.src) { st.frames.push({ img: fitTo(img, st.src.w, st.src.h), duration: S.defaultDuration }); renderFrames(); ui.buttons(); } }
    else if (a === 'clearFrames') { if (st.src) st.frames = [{ img: st.src.img, duration: S.defaultDuration }]; renderFrames(); ui.buttons(); }
    else if (a === 'drawRoi') { st.drawArm = true; ui.status('Drag on the preview to mark a focus area', 'var(--gold)'); }
    else if (a === 'clearRois') { st.rois = []; renderRois(); draw(); }
    else if (a === 'toFrax') toFrax();
  }

  function currentCanvas() { try { return typeof currentImageData !== 'undefined' ? currentImageData : null; } catch (e) { return null; } }

  function renderFrames() {
    const box = root && root.querySelector('#jx-frames'); if (!box) return;
    box.innerHTML = '';
    st.frames.forEach((f, i) => {
      const r = el(`<div class="jx-fr"><canvas width="88" height="64"></canvas><span>Frame ${i + 1}${f.name ? ' · ' + f.name : ''}</span><input type="number" min="1" step="1" data-fd="${i}" value="${f.duration}" title="Duration (ms)"><span class="ops"><button data-fop="up" data-i="${i}" title="Move up">↑</button><button data-fop="down" data-i="${i}" title="Move down">↓</button><button data-fop="dup" data-i="${i}" title="Duplicate">⧉</button><button data-fop="del" data-i="${i}" title="Remove">✕</button></span></div>`);
      const c = r.querySelector('canvas'), g = c.getContext('2d');
      const s = document.createElement('canvas'); s.width = f.img.width; s.height = f.img.height; s.getContext('2d').putImageData(f.img, 0, 0);
      const k = Math.min(88 / s.width, 64 / s.height); g.drawImage(s, (88 - s.width * k) / 2, (64 - s.height * k) / 2, s.width * k, s.height * k);
      box.appendChild(r);
    });
  }
  function frameOp(op, i) {
    const F = st.frames;
    if (op === 'up' && i > 0) [F[i - 1], F[i]] = [F[i], F[i - 1]];
    else if (op === 'down' && i < F.length - 1) [F[i + 1], F[i]] = [F[i], F[i + 1]];
    else if (op === 'dup') F.splice(i + 1, 0, Object.assign({}, F[i]));
    else if (op === 'del' && F.length > 1) F.splice(i, 1);
    renderFrames(); ui.buttons();
  }
  function renderRois() {
    const box = root && root.querySelector('#jx-rois'); if (!box) return;
    box.innerHTML = st.rois.map((r, i) => `<div class="jx-roi">◼ Area ${i + 1}: ${Math.round(r.x)},${Math.round(r.y)} · ${Math.round(r.w)}×${Math.round(r.h)} px <button class="btn btn-ghost" style="font-size:9px;padding:2px 6px;margin-left:auto" data-roi="${i}">Remove</button></div>`).join('') || '<div class="jx-hint">No areas yet.</div>';
  }

  /* preview: original on the left of the slider, decoded JPEG XL on the right */
  let decCanvas = null, srcCanvas = null, animIdx = 0;
  function draw() {
    if (!root || !st.src) return;
    const w = st.src.w, h = st.src.h, stage = root.querySelector('#jx-stage');
    cv.width = w; cv.height = h;
    if (st.zoom === 'fit') { const k = Math.min((stage.clientWidth - 16) / w, (stage.clientHeight - 16) / h, 8); cv.style.width = Math.max(1, w * k) + 'px'; cv.style.height = Math.max(1, h * k) + 'px'; }
    else { cv.style.width = w * +st.zoom + 'px'; cv.style.height = h * +st.zoom + 'px'; cv.style.imageRendering = +st.zoom > 1 ? 'pixelated' : 'auto'; }
    if (st.zoom === 'fit') cv.style.imageRendering = (cv.clientWidth > w * 1.5) ? 'pixelated' : 'auto';
    const frame = st.frames[Math.min(animIdx, st.frames.length - 1)] || { img: st.src.img };
    if (!srcCanvas) srcCanvas = document.createElement('canvas');
    srcCanvas.width = w; srcCanvas.height = h; srcCanvas.getContext('2d').putImageData(frame.img, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.drawImage(srcCanvas, 0, 0);
    if (st.decoded && st.decoded.frames.length) {
      const df = st.decoded.frames[Math.min(animIdx, st.decoded.frames.length - 1)];
      if (!decCanvas) decCanvas = document.createElement('canvas');
      decCanvas.width = st.decoded.width; decCanvas.height = st.decoded.height;
      decCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(df.data.slice(0)), st.decoded.width, st.decoded.height), 0, 0);
      const sx = Math.round(w * st.cmp);
      ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, w - sx, h); ctx.clip(); ctx.clearRect(sx, 0, w - sx, h); ctx.drawImage(decCanvas, 0, 0, w, h); ctx.restore();
      ctx.fillStyle = '#ffc93c'; ctx.fillRect(sx - Math.max(1, w / 600), 0, Math.max(2, w / 300), h);
    }
    ctx.lineWidth = Math.max(2, w / 400); ctx.setLineDash([Math.max(6, w / 120), Math.max(4, w / 200)]);
    st.rois.forEach((r, i) => { ctx.strokeStyle = '#00ff88'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.fillStyle = 'rgba(0,255,136,.12)'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = '#00ff88'; ctx.font = `${Math.max(12, w / 60)}px monospace`; ctx.fillText('focus ' + (i + 1), r.x + 4, r.y + Math.max(14, w / 55)); });
    if (st.drawing) { ctx.strokeStyle = '#ffc93c'; const d = st.drawing; ctx.strokeRect(d.x, d.y, d.w, d.h); }
    ctx.setLineDash([]);
    const info = root.querySelector('#jx-info');
    if (info) info.textContent = `${w}×${h}${st.src.rgba16 ? ' · 16-bit source' : ''}${st.src.hasAlpha ? ' · alpha' : ''}${st.frames.length > 1 ? ' · ' + st.frames.length + ' frames' : ''}`;
    const tf = root.querySelector('[data-act=toFrax]'); if (tf) tf.disabled = !st.decoded;
    // play animations in the preview
    clearTimeout(st.animT);
    const n = Math.max(st.frames.length, st.decoded ? st.decoded.frames.length : 0);
    if (n > 1 && root.classList.contains('show')) st.animT = setTimeout(() => { animIdx = (animIdx + 1) % n; draw(); }, Math.max(16, (st.frames[animIdx] || {}).duration || 100));
  }
  function stagePoint(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
  function roiDown(e) { if (!st.drawArm || !st.src) return; e.preventDefault(); const p = stagePoint(e); st.drawing = { x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 }; }
  function roiMove(e) { if (!st.drawing) return; const p = stagePoint(e), d = st.drawing; d.x = Math.max(0, Math.min(d.x0, p.x)); d.y = Math.max(0, Math.min(d.y0, p.y)); d.w = Math.min(cv.width, Math.max(d.x0, p.x)) - d.x; d.h = Math.min(cv.height, Math.max(d.y0, p.y)) - d.y; draw(); }
  function roiUp() { if (!st.drawing) return; const d = st.drawing; st.drawing = null; st.drawArm = false; if (d.w > 8 && d.h > 8) { st.rois.push({ x: d.x, y: d.y, w: d.w, h: d.h }); ui.status('Focus area added — Encode to apply it', 'var(--green)'); } renderRois(); draw(); }

  function pickFiles(asFrames) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = !!asFrames;
    inp.accept = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.apng,.jxl,image/*';
    inp.onchange = async () => {
      const files = [...inp.files]; if (!files.length) return;
      try {
        if (!asFrames) { await loadFile(files[0]); return; }
        if (!st.src) { await loadFile(files.shift()); }
        for (const f of files) {
          const anim = await framesFromAnimatedFile(f).catch(() => null);
          if (anim && anim.length) anim.forEach((a) => st.frames.push({ img: fitTo(a.img, st.src.w, st.src.h), duration: a.duration || S.defaultDuration, name: f.name }));
          else st.frames.push({ img: fitTo(await fileToImageData(f), st.src.w, st.src.h), duration: S.defaultDuration, name: f.name });
        }
        renderFrames(); ui.buttons(); draw(); ui.status(st.frames.length + ' frames ready', 'var(--green)');
      } catch (e) { ui.status('Could not read that file: ' + e.message, '#ff6b6b'); }
    };
    inp.click();
  }

  async function loadFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.jxl$/i.test(file.name)) {
      const r = await importJXL(new File([bytes], file.name));
      setSource(r.img, { name: file.name, bytes });
      if (r.frames.length > 1) st.frames = r.frames;
    } else {
      const img = await fileToImageData(new Blob([bytes], { type: file.type }));
      let rgba16 = null;
      if (pngBitDepth(bytes) === 16) { try { rgba16 = await decode16PNG(bytes); } catch (e) { console.warn('[jxl] 16-bit PNG decode', e); } }
      setSource(img, { name: file.name, bytes, isJPEG: /\.jpe?g$/i.test(file.name) || (bytes[0] === 0xFF && bytes[1] === 0xD8), rgba16 });
      const anim = /\.(gif|webp|png|apng|avif)$/i.test(file.name) ? await framesFromAnimatedFile(file).catch(() => null) : null;
      if (anim && anim.length > 1) st.frames = anim.map((a) => ({ img: fitTo(a.img, img.width, img.height), duration: a.duration }));
    }
    if (st.src.isJPEG && S.mode !== 'jpeg') ui.status('JPEG source: choose “Lossless JPEG transcode” to shrink it with zero quality loss.', 'var(--gold)');
    render(); draw();
  }

  function toFrax() {
    if (!st.decoded) return;
    const d = st.decoded, img = new ImageData(new Uint8ClampedArray(d.frames[0].data.slice(0)), d.width, d.height);
    try {
      currentImageData = img; if (typeof currentFraxMeta !== 'undefined') currentFraxMeta = null;      // eslint-disable-line no-global-assign
      if (typeof showImagePreview === 'function') showImagePreview(img, { name: (st.src.name || 'image').replace(/\.[^.]+$/, '') + '.jxl', size: st.result ? st.result.bytes.length : 0, format: 'JPEG XL', width: d.width, height: d.height, channels: d.hasAlpha ? 'R, G, B, A' : 'R, G, B', compression: S.mode, bitDepth: d.bits + '-bit' });
      if (typeof uscSyncCanvas === 'function') uscSyncCanvas();
      ui.status('Sent to the Frax canvas', 'var(--green)');
    } catch (e) { ui.status('Could not update the canvas: ' + e.message, '#ff6b6b'); }
  }

  function metaFor(c) {
    const m = window._fraxSrcMeta; if (!m || !c) return { name: 'image.png' };
    if (m.w !== c.width || m.h !== c.height) return { name: m.name || 'image.png' };      // canvas changed since the file was loaded
    return Object.assign({}, m, { rgba16: m.rgba16 && m.rgba16.length === c.width * c.height * 4 ? m.rgba16 : null });
  }
  function open(img, meta) {
    build();
    if (img) { setSource(img, meta); }
    else { const c = currentCanvas(); if (c && (!st.src || c !== st.src.img)) setSource(c, metaFor(c)); }
    root.classList.add('show'); render(); requestAnimationFrame(draw);
    if (!st.src) ui.status('Open an image, or load one in the Converter first.', 'var(--gold)');
  }
  function close() { if (root) root.classList.remove('show'); clearTimeout(st.animT); }

  // sidebar card + Converter hooks
  function mountSidebar() {
    const conv = [...document.querySelectorAll('.card')].find((c) => /Converter/i.test(c.textContent.slice(0, 120)));
    const card = el(`<div class="card open" data-accent="gold" id="jxl-card"><div class="card-head" onclick="toggleCard(this)"><span class="title"><span class="dot"></span>JPEG XL (.jxl)</span><span class="chevron">▾</span></div>
<div class="card-body"><div class="card-inner"><div class="info-text" style="margin-bottom:10px">Next-generation image format: smaller than JPEG/WebP/AVIF at the same quality, lossless up to 32-bit float, transparency, animation, HDR, focus areas and bit-exact JPEG re-packing. Everything runs on your device.</div>
<button class="btn btn-full" style="background:rgba(255,201,60,.12);border-color:rgba(255,201,60,.35);color:var(--gold);margin-bottom:6px" onclick="FraxJXLStudio.open()">⬡ Open JPEG XL Studio</button>
<div class="btn-row"><button class="btn btn-ghost btn-full" style="flex:1" onclick="FraxJXLStudio.quickExport()">Quick .jxl</button><button class="btn btn-ghost btn-full" style="flex:1" onclick="FraxJXLStudio.importDialog()">Import .jxl</button></div>
<div class="status-line" id="jxl-card-status"></div></div></div></div>`);
    if (conv && conv.parentNode) conv.parentNode.insertBefore(card, conv.nextSibling); else (document.getElementById('sidebar') || document.body).appendChild(card);
    // a JXL button beside PNG / JPEG / WebP in the Converter and the 3D export grids
    document.querySelectorAll('.btn-grid').forEach((g) => {
      if (g.querySelector('[data-jxl]')) return;
      const isVP = !!g.querySelector('[onclick*="exportViewAs"]'); if (!isVP && !g.querySelector('[onclick*="exportImageAs"]')) return;
      const b = el(`<button class="btn btn-ghost btn-full" data-jxl="1" style="color:var(--gold);border-color:rgba(255,201,60,.3)">JXL</button>`);
      b.onclick = () => { if (isVP) { try { const id = captureViewport(renderSize); open(id, { name: 'render_' + renderSize + '.png' }); } catch (e) { open(); } } else open(); };
      g.appendChild(b);
    });
  }
  async function quickExport() {
    const c = currentCanvas(); const s = document.getElementById('jxl-card-status');
    if (!c) { if (s) s.textContent = '› Load an image in the Converter first'; return; }
    open(c, metaFor(c)); await encode(); if (st.result) downloadResult();
  }
  function importDialog() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.jxl,image/jxl';
    inp.onchange = () => { if (inp.files[0]) importToFrax(inp.files[0]); }; inp.click();
  }
  async function importToFrax(file) {
    const s = document.getElementById('jxl-card-status'); if (s) s.textContent = '› Decoding ' + file.name + '…';
    try {
      const r = await importJXL(file);
      currentImageData = r.img; if (typeof currentFraxMeta !== 'undefined') currentFraxMeta = null;    // eslint-disable-line no-global-assign
      if (typeof showImagePreview === 'function') showImagePreview(r.img, { name: file.name, size: file.size, format: 'JPEG XL' + (r.frames.length > 1 ? ' · ' + r.frames.length + ' frames' : ''), width: r.img.width, height: r.img.height, channels: r.info.hasAlpha ? 'R, G, B, A' : 'R, G, B', compression: 'JPEG XL', bitDepth: r.info.bits + '-bit' });
      if (typeof uscSyncCanvas === 'function') uscSyncCanvas();
      window._fraxSrcMeta = { name: file.name };
      if (s) s.textContent = `› Imported ${file.name}: ${r.img.width}×${r.img.height}${r.frames.length > 1 ? ', ' + r.frames.length + ' frames' : ''}`;
      if (typeof setStatus === 'function') setStatus('img-status', `Decoded JPEG XL: ${r.img.width}×${r.img.height}`);
      st._importedFrames = r.frames;
    } catch (e) { if (s) s.textContent = '› Could not read that .jxl: ' + e.message; if (typeof setStatus === 'function') setStatus('img-status', 'Error: ' + e.message); }
  }

  window.FraxJXLStudio = { open, close, encode, quickExport, importDialog, importToFrax, rememberSource: (file, bytes, w, h) => {
    window._fraxSrcMeta = { name: file.name, bytes, w, h, isJPEG: /\.jpe?g$/i.test(file.name) || (bytes[0] === 0xFF && bytes[1] === 0xD8) };
    if (pngBitDepth(bytes) === 16) decode16PNG(bytes).then((d) => { if (window._fraxSrcMeta && window._fraxSrcMeta.bytes === bytes) window._fraxSrcMeta.rgba16 = d; }).catch(() => {});
  } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebar); else mountSidebar();
})();
