/* Frax Studio · JPEG XL worker
   Runs libjxl (WebAssembly, ./frax-jxl.wasm) off the main thread so long encodes never freeze the page.
   Messages in:  {id, op:'encode', job}  ·  {id, op:'decode', bytes, want16, maxFrames}  ·  {id, op:'version'}
   Messages out: {id, ok:true, ...result}  or  {id, ok:false, error}
   libjxl is BSD-3-Clause, © the JPEG XL Project Authors — see LICENSE-libjxl.txt beside this file. */
importScripts('frax-jxl.js');
let M = null;
const ready = FraxJXL({ locateFile: (p) => p }).then((m) => { M = m; });

function cstr(s) { const n = (s.length << 2) + 1, p = M._malloc(n); M.stringToUTF8(s, p, n); return p; }
function put(view) {                                   // copy a typed array into wasm memory
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const p = M._malloc(bytes.length); M.HEAPU8.set(bytes, p); return [p, bytes.length];
}

/* job = {
     width, height, bits, expBits, channels(1|3), alphaBits, alphaExp, premultiplied,
     animated, tpsNum, tpsDen, loops, originalProfile, intensityTarget, orientation,
     color (0..5), intent, container (-1 auto / 0 / 1), level (0/5/10),
     boxes: [{type:'Exif', data:Uint8Array, compress}],
     jpeg: Uint8Array (lossless JPEG transcode; then frames is ignored), jpegMeta: true,
     frames: [{ data: TypedArray, dtype:0 u8|1 u16|2 f32|3 f16, channels (buffer channels),
                duration, crop:{x,y,w,h}|null, blend, source, saveAs, name,
                lossless, distance, alphaDistance, ints:{id:v}, floats:{id:v} }]
   } */
function encode(job) {
  const t0 = performance.now();
  const h = M._jxw_new(); if (!h) throw new Error('could not start the encoder');
  const ptrs = [];
  const fail = (what) => { const e = M.UTF8ToString(M._jxw_error(h)); throw new Error(what + ': ' + e); };
  try {
    if (!job.jpeg) {
      if (!M._jxw_basic(h, job.width, job.height, job.bits, job.expBits | 0, job.channels, job.alphaBits | 0, job.alphaExp | 0,
        job.premultiplied ? 1 : 0, job.animated ? 1 : 0, job.tpsNum || 1000, job.tpsDen || 1, job.loops | 0,
        job.originalProfile ? 1 : 0, job.intensityTarget || 0, job.orientation || 1)) fail('basic info');
      if (!M._jxw_color(h, job.color | 0, job.intent | 0)) fail('colour');
    }
    if (!M._jxw_container(h, job.container == null ? -1 : job.container, job.level | 0)) fail('container');
    if (job.boxes && job.boxes.length) {
      if (!M._jxw_use_boxes(h)) fail('metadata');
      for (const b of job.boxes) {
        const [p, n] = put(b.data); ptrs.push(p); const t = cstr(b.type.padEnd(4).slice(0, 4)); ptrs.push(t);
        if (!M._jxw_add_box(h, t, p, n, b.compress ? 1 : 0)) fail('metadata box ' + b.type);
      }
      M._jxw_close_boxes(h);
    }
    const applySettings = (fs, f) => {
      for (const [id, v] of Object.entries(f.ints || {})) if (v != null && v !== '' && !Number.isNaN(+v)) M._jxw_set_int(fs, +id, +v);
      for (const [id, v] of Object.entries(f.floats || {})) if (v != null && v !== '' && !Number.isNaN(+v)) M._jxw_set_float(fs, +id, +v);
      if (f.lossless) { if (!M._jxw_lossless(fs, 1)) fail('lossless'); }
      else if (f.distance != null) { if (!M._jxw_distance(fs, f.distance)) fail('quality'); }
      if (job.alphaBits && f.alphaDistance != null) M._jxw_alpha_distance(fs, f.alphaDistance);
    };
    if (job.jpeg) {
      const fs = M._jxw_settings(h); const f = job.frames && job.frames[0] || {};
      applySettings(fs, Object.assign({}, f, { lossless: false, distance: null }));
      const [p, n] = put(job.jpeg); ptrs.push(p);
      if (!M._jxw_add_jpeg(h, fs, p, n, job.jpegMeta ? 1 : 0)) fail('JPEG transcode');
    } else {
      job.frames.forEach((f, i) => {
        const fs = M._jxw_settings(h);
        applySettings(fs, f);
        const c = f.crop; const name = f.name ? cstr(f.name) : 0; if (name) ptrs.push(name);
        if (!M._jxw_frame_header(h, fs, f.duration | 0, c ? 1 : 0, c ? c.x : 0, c ? c.y : 0, c ? c.w : 0, c ? c.h : 0,
          f.blend | 0, f.source | 0, f.saveAs == null ? -1 : f.saveAs, name)) fail('frame ' + (i + 1));
        const [p, n] = put(f.data); ptrs.push(p);
        if (!M._jxw_add_frame(h, fs, p, n, f.dtype | 0, f.channels)) fail('frame ' + (i + 1));
        M._free(p); ptrs.splice(ptrs.indexOf(p), 1);                 // free the pixels as soon as libjxl has them
        self.postMessage({ progress: (i + 1) / job.frames.length });
      });
    }
    M._jxw_close_input(h);
    const n = M._jxw_finish(h); if (n < 0) fail('encode');
    const out = M.HEAPU8.slice(M._jxw_out(h), M._jxw_out(h) + n);
    return { bytes: out, ms: performance.now() - t0 };
  } finally {
    for (const p of ptrs) M._free(p);
    M._jxw_free(h);
  }
}

function decode(bytes, want16, maxFrames) {
  const [p, n] = put(bytes);
  const r = M._jxd_decode(p, n, want16 ? 1 : 0, maxFrames | 0);
  M._free(p);
  try {
    const err = M.UTF8ToString(M._jxd_error(r));
    const frames = M._jxd_frames(r), w = M._jxd_w(r), h = M._jxd_h(r);
    if (!frames) throw new Error(err || 'nothing decoded');
    const per = w * h * 4 * (want16 ? 2 : 1), base = M._jxd_pixels(r);
    const out = [];
    for (let i = 0; i < frames; i++) out.push({ data: M.HEAPU8.slice(base + per * i, base + per * (i + 1)).buffer, duration: M._jxd_duration(r, i) });
    return { width: w, height: h, frames: out, hasAlpha: !!M._jxd_alpha(r), bits: M._jxd_bits(r), animated: !!M._jxd_animated(r),
      tpsNum: M._jxd_tps_num(r), tpsDen: M._jxd_tps_den(r), loops: M._jxd_loops(r), warning: err || null };
  } finally { M._jxd_free(r); }
}

self.onmessage = async (ev) => {
  const { id, op } = ev.data;
  try {
    await ready;
    let res;
    if (op === 'encode') res = encode(ev.data.job);
    else if (op === 'decode') res = decode(new Uint8Array(ev.data.bytes), ev.data.want16, ev.data.maxFrames);
    else if (op === 'version') { const v = M._jxw_version(); res = { version: `${Math.floor(v / 1e6)}.${Math.floor(v / 1e3) % 1e3}.${v % 1e3}` }; }
    else throw new Error('unknown op ' + op);
    const transfer = [];
    if (res.bytes) transfer.push(res.bytes.buffer);
    if (res.frames) res.frames.forEach((f) => transfer.push(f.data));
    self.postMessage(Object.assign({ id, ok: true }, res), transfer);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
