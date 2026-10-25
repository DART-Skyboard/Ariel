// Intuition UI: wires the raster core, Shell64 reference library, generator, timeline and LEATR bridge to the page.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var lib = new Shell64Refs(), tl = new Timeline({ fps: 30, duration: 5 });
  var P = { w: 768, h: 432, seed: 11, style: 'meadow', mix: 0.5, speed: 0.15, particles: 260 };
  var selected = [];            // slot ids in the order the user selected them (first = strongest)
  var ov = {};                  // layer overrides by layer name: {visible, opacity, blend}
  var playing = false, tNow = 0, lastGen = null, busy = false, canceled = false;
  var view = $('view'), vctx = view.getContext('2d');
  var team = null, SAMPLES = window.FRAX_SAMPLES || 'samples/';
  try { team = JSON.parse(localStorage.getItem('intuition.team') || 'null'); $('inRelay').value = localStorage.getItem('intuition.relay') || ''; } catch (e) {}

  function say(msg, cls) { var s = $('status'); s.textContent = msg; s.className = 'note ' + (cls || ''); }
  function refsNow() { return selected.map(function (s, i) { return { slot: s, weight: i === 0 ? 1 : 0.5 }; }); }
  function baseParams() { return Object.assign({}, P, { refs: refsNow() }); }
  function paramsAt(t) { return tl.paramsAt(baseParams(), t); }
  function chips() { $('chipShell').textContent = lib.count() + '/64'; }

  // ---------- rendering ----------
  function applyOv(layers) { layers.forEach(function (l) { var o = ov[l.name]; if (o) { if (o.visible != null) l.visible = o.visible; if (o.opacity != null) l.opacity = o.opacity; if (o.blend) l.blend = o.blend; } }); return layers; }
  function bgColor() { var v = $('selBg').value; if (v === 'transparent') return null; return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 255]; }
  function draw(g, bg, showChecker) {
    var data = Raster.composite(g.layers, g.w, g.h, bg);
    if (view.width !== g.w || view.height !== g.h) { view.width = g.w; view.height = g.h; }
    if (showChecker && !bg) { var cb = Raster.checkerboard(g.w, g.h, Math.max(6, g.w / 64 | 0)); data = Raster.composite([Raster.createLayer(g.w, g.h, { data: cb }), Raster.createLayer(g.w, g.h, { data: data })], g.w, g.h); }
    vctx.putImageData(new ImageData(data, g.w, g.h), 0, 0);
  }
  function renderAt(t, draft) {
    var p = paramsAt(t); if (draft) { p.w = Math.max(64, p.w >> 1); p.h = Math.max(64, p.h >> 1); }
    var g = Generator.generate(p, lib, t); applyOv(g.layers); lastGen = g; return g;
  }
  function show(t, draft) {
    var g = renderAt(t, draft); draw(g, bgColor(), $('chkChecker').checked); layersUI(g);
  }
  function generateStill() { if (busy) return; setBusy(true); say('Rendering…'); setTimeout(function () { try { var t0 = performance.now(); show(tNow, false); say('Done in ' + Math.round(performance.now() - t0) + ' ms · ' + view.width + '×' + view.height); } catch (e) { say('Render failed: ' + e.message, 'err'); } setBusy(false); }, 20); }
  function setBusy(b) { busy = b; $('chipBusy').style.display = b ? '' : 'none'; }

  function tick() {
    if (!playing) return; var t0 = performance.now();
    try { show(tNow, $('chkDraft').checked); } catch (e) { say('Render failed: ' + e.message, 'err'); playing = false; $('btnPlay').textContent = '▶ Play'; return; }
    var dt = Math.max(1 / 30, (performance.now() - t0) / 1000);
    tNow += dt; if (tNow > tl.duration) tNow = 0; $('tScrub').value = tNow; $('tVal').textContent = tNow.toFixed(2) + 's';
    requestAnimationFrame(tick);
  }

  // ---------- layers panel ----------
  function layersUI(g) {
    var box = $('layerList'); if (box.dataset.sig === g.layers.map(function (l) { return l.name; }).join()) return; box.dataset.sig = g.layers.map(function (l) { return l.name; }).join(); box.textContent = '';
    g.layers.slice().reverse().forEach(function (l) {
      var d = document.createElement('div'); d.className = 'layer';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = l.visible; cb.setAttribute('aria-label', 'Show ' + l.name);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = l.name;
      var sub = document.createElement('div'); sub.className = 'sub';
      var rg = document.createElement('input'); rg.type = 'range'; rg.min = 0; rg.max = 1; rg.step = 0.05; rg.value = l.opacity; rg.setAttribute('aria-label', l.name + ' opacity');
      var sel = document.createElement('select'); Object.keys(Raster.BLEND).forEach(function (b) { var o = document.createElement('option'); o.textContent = b; if (b === l.blend) o.selected = true; sel.appendChild(o); });
      var set = function (k, v) { ov[l.name] = Object.assign(ov[l.name] || {}, (function () { var x = {}; x[k] = v; return x; })()); if (!playing && lastGen) { applyOv(lastGen.layers); draw(lastGen, bgColor(), $('chkChecker').checked); } };
      cb.onchange = function () { set('visible', cb.checked); }; rg.oninput = function () { set('opacity', +rg.value); }; sel.onchange = function () { set('blend', sel.value); };
      sub.appendChild(rg); sub.appendChild(sel); d.appendChild(cb); d.appendChild(nm); d.appendChild(document.createElement('span')); d.appendChild(sub); box.appendChild(d);
    });
  }

  // ---------- Shell64 ----------
  function slotThumb(i) {
    var s = lib.get(i), c = document.createElement('canvas'); c.width = c.height = 48; var x = c.getContext('2d');
    var ck = Raster.checkerboard(48, 48, 6); x.putImageData(new ImageData(ck, 48, 48), 0, 0);
    if (s) { var t = document.createElement('canvas'); t.width = s.w; t.height = s.h; t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.data), s.w, s.h), 0, 0);
      var k = Math.min(48 / s.w, 48 / s.h); x.drawImage(t, (48 - s.w * k) / 2, (48 - s.h * k) / 2, s.w * k, s.h * k); } else { x.clearRect(0, 0, 48, 48); x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(0, 0, 48, 48); }
    return c;
  }
  function gridUI() {
    var g = $('grid'); g.textContent = '';
    for (var i = 0; i < Shell64Refs.SLOTS; i++) (function (i) {
      var b = document.createElement('button'); b.className = 'slot' + (selected.indexOf(i) >= 0 ? ' sel' : '') + (lib.get(i) && lib.get(i).kind === 'video' ? ' vid' : '');
      b.setAttribute('aria-label', 'Slot ' + i + (lib.get(i) ? ': ' + lib.get(i).name : ' (empty)')); b.appendChild(slotThumb(i));
      var n = document.createElement('span'); n.className = 'n'; n.textContent = i; b.appendChild(n);
      b.onclick = function () { if (!lib.get(i)) { say('Slot ' + i + ' is empty. Add a file first.', 'warn'); return; } var k = selected.indexOf(i); if (k >= 0) selected.splice(k, 1); else selected.push(i); gridUI(); info(); };
      g.appendChild(b);
    })(i);
    chips(); info();
  }
  function info() {
    var s = selected.map(function (i) { return '#' + i + ' ' + lib.get(i).name; }).join(' · ');
    $('selInfo').textContent = selected.length ? 'References: ' + s + ' (first = strongest)' : 'Tap slots to use them as references. First selected = strongest.';
  }
  function decodeImage(src, name, source) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { try {
        var k = Math.min(1, 512 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
        res({ name: name, w: w, h: h, data: x.getImageData(0, 0, w, h).data, source: source }); } catch (e) { rej(new Error('image is blocked from being read (CORS)')); } };
      im.onerror = function () { rej(new Error('could not decode ' + name)); }; im.src = src;
    });
  }
  function decodeVideo(src, name, source) {
    return new Promise(function (res, rej) {
      var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      v.onerror = function () { rej(new Error('could not decode video ' + name)); };
      v.onloadedmetadata = async function () { try {
        var dur = Math.min(isFinite(v.duration) ? v.duration : 3, 4), n = Math.min(Shell64Refs.MAXFRAMES, Math.max(2, Math.round(dur * 6))), k = Math.min(1, 256 / Math.max(v.videoWidth, v.videoHeight));
        var w = Math.max(1, Math.round(v.videoWidth * k)), h = Math.max(1, Math.round(v.videoHeight * k)), c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'), frames = [];
        for (var i = 0; i < n; i++) { await new Promise(function (r) { v.onseeked = r; v.currentTime = Math.min(dur * i / n, Math.max(0, v.duration - 0.05)); }); x.drawImage(v, 0, 0, w, h); frames.push({ w: w, h: h, data: x.getImageData(0, 0, w, h).data }); }
        res({ name: name, frames: frames, fps: n / dur, source: source }); } catch (e) { rej(new Error('video frames blocked or unreadable')); } };
      v.src = src;
    });
  }
  async function addFiles(files) {
    var ok = 0;
    for (var f of Array.from(files)) {
      try {
        if (lib.firstFree() < 0) { say('Shell64 is full (64 slots). Remove something first.', 'warn'); break; }
        var url = URL.createObjectURL(f);
        if (/^video\//.test(f.type)) lib.addVideo(await decodeVideo(url, f.name, 'upload')); else lib.addImage(await decodeImage(url, f.name, 'upload'));
        URL.revokeObjectURL(url); ok++;
      } catch (e) { say(f.name + ': ' + e.message, 'err'); }
    }
    gridUI(); if (ok) say('Added ' + ok + ' reference' + (ok > 1 ? 's' : '') + '.', 'ok');
  }
  async function addUrl(u) {
    try { var isVid = /\.(mp4|webm|mov)(\?|$)/i.test(u), nm = u.split('/').pop().split('?')[0] || 'url';
      if (lib.firstFree() < 0) throw new Error('Shell64 is full (64 slots)');
      if (isVid) lib.addVideo(await decodeVideo(u, nm, 'url')); else lib.addImage(await decodeImage(u, nm, 'url')); gridUI(); say('Added ' + nm, 'ok');
    } catch (e) { say('URL failed: ' + e.message + ' (the host must allow cross-origin reads)', 'err'); }
  }
  async function loadSamples() {
    try { var m = await (await fetch(SAMPLES + 'manifest.json')).json(), ok = 0;
      for (var s of m.samples) { if (lib.firstFree() < 0) break; if (lib.list().some(function (x) { return x.name === s.name; })) continue;
        try { if (s.kind === 'video') lib.addVideo(await decodeVideo(SAMPLES + s.file, s.name, 'sample')); else lib.addImage(await decodeImage(SAMPLES + s.file, s.name, 'sample')); ok++; } catch (e) { say(s.name + ': ' + e.message, 'warn'); } }
      gridUI(); say(ok ? 'Loaded ' + ok + ' samples.' : 'Samples already loaded.', 'ok');
    } catch (e) { say('Could not load samples: ' + e.message, 'err'); }
  }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000); }

  // ---------- timeline ----------
  function keysUI() { var k = Object.keys(tl.tracks); $('keyList').textContent = k.length ? k.map(function (p) { return p + ': ' + tl.tracks[p].map(function (x) { return x.t.toFixed(2) + 's=' + x.v + (x.ease !== 'linear' ? '(' + x.ease + ')' : ''); }).join('  '); }).join('\n') : 'No keyframes.'; }
  function syncTl() { tl.duration = Math.min(60, Math.max(0.5, +$('inDur').value || 5)); tl.fps = +$('selFps').value; $('tScrub').max = tl.duration; if (tNow > tl.duration) tNow = 0; }

  // ---------- export ----------
  var RATIOS = { '1:1': [1, 1], '4:5': [4, 5], '3:4': [3, 4], '4:3': [4, 3], '16:9': [16, 9], '9:16': [9, 16], '16:10': [16, 10], '10:16': [10, 16] };
  var TIERS = { '1080': 1080, '2k': 1440, '4k': 2160 };            // short edge in pixels: 16:9 gives 1920x1080, 2560x1440, 3840x2160
  var MAX_FRAMES = 900, MAX_JXL_BYTES = 1.6e9;
  function even(x) { return Math.max(2, Math.round(x / 2) * 2); }
  function shape() { return RATIOS[$('selRatio').value] || RATIOS['16:9']; }
  function exportSize() { var r = shape(), sh = TIERS[$('selRes').value] || 1080; return r[0] >= r[1] ? { w: even(sh * r[0] / r[1]), h: sh } : { w: sh, h: even(sh * r[1] / r[0]) }; }
  function previewSize() { var r = shape(), L = 768; return r[0] >= r[1] ? { w: L, h: even(L * r[1] / r[0]) } : { w: even(L * r[0] / r[1]), h: L }; }
  function refreshOut() {
    var sz = exportSize(), tr = !bgColor();
    $('outSize').textContent = sz.w + ' × ' + sz.h + ' px · ' + (sz.w * sz.h / 1e6).toFixed(1) + ' MP';
    $('btnPng').textContent = 'Download PNG' + (tr ? ' (transparent)' : ''); $('btnJxl').textContent = 'Download JXL' + (tr ? ' (transparent)' : '');
    $('btnJxlAnim').textContent = 'Download JXL' + (tr ? ' (transparent)' : ''); $('btnMp4').textContent = 'Download MP4' + (tr ? ' (black background)' : '');
  }
  function applyShape() { var pv = previewSize(); P.w = pv.w; P.h = pv.h; refreshOut(); if (!playing && !busy) generateStill(); }
  function frameRGBA(t, sz, bg) {                                       // one finished RGBA frame at export size
    var p = paramsAt(t); p.w = sz.w; p.h = sz.h; var g = Generator.generate(p, lib, t); applyOv(g.layers); return Raster.composite(g.layers, g.w, g.h, bg);
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function fileBase(sz) { return 'intuition-' + P.seed + '-' + sz.w + 'x' + sz.h; }
  function outBusy(b, anim) {
    setBusy(b); ['btnPng', 'btnJxl', 'btnJxlAnim', 'btnMp4'].forEach(function (id) { $(id).disabled = b; }); $('btnCancel').style.display = b && anim ? '' : 'none';
    if (!b) $('prog').style.display = 'none';
  }
  async function exportStill(kind) {
    if (busy) return; var sz = exportSize(), bg = bgColor(); playing = false; $('btnPlay').textContent = '▶ Play';
    outBusy(true, false); say('Rendering ' + sz.w + '×' + sz.h + '…'); await sleep(20);
    try {
      var px = frameRGBA(tNow, sz, bg), base = fileBase(sz) + '-' + tNow.toFixed(2) + 's';
      if (kind === 'png') {
        var blob = null;
        if (!bg) { var parts = await IntuitionPng.encode(px, sz.w, sz.h); if (parts) blob = new Blob(parts, { type: 'image/png' }); }   // transparent: exact straight-alpha PNG
        if (!blob) {
          var cv = document.createElement('canvas'); cv.width = sz.w; cv.height = sz.h; cv.getContext('2d').putImageData(new ImageData(px, sz.w, sz.h), 0, 0);
          blob = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
        }
        if (!blob) throw new Error('the browser could not encode a PNG this large');
        download(blob, base + '.png'); say('PNG saved (' + sz.w + '×' + sz.h + (bg ? '' : ', transparent') + ').', 'ok');
      } else {
        say('Encoding JPEG XL…'); await sleep(20);
        var bytes = IntuitionJxl.encodeStill(px, sz.w, sz.h, { alpha: !bg });
        download(new Blob([bytes], { type: 'image/jxl' }), base + '.jxl'); say('JXL saved (' + sz.w + '×' + sz.h + ', ' + (bytes.length / 1048576).toFixed(1) + ' MB' + (bg ? '' : ', transparent') + ').', 'ok');
      }
    } catch (e) { say('Export failed: ' + e.message, 'err'); }
    outBusy(false); show(tNow, false);
  }
  function progressStart(n) { var pr = $('prog'); pr.style.display = ''; pr.max = n; pr.value = 0; return performance.now(); }
  function eta(t0, done, n) { var el = (performance.now() - t0) / 1000, left = done ? el / done * (n - done) : 0; return left > 90 ? ' · about ' + Math.ceil(left / 60) + ' min left' : left > 1 ? ' · about ' + Math.ceil(left) + ' s left' : ''; }

  async function exportAnimJxl() {
    syncTl(); var frames = tl.frameCount(), sz = exportSize(), bg = bgColor(); if (frames > MAX_FRAMES) { say('Too many frames (' + frames + '). Keep it under ' + MAX_FRAMES + '.', 'warn'); return; }
    canceled = false; playing = false; $('btnPlay').textContent = '▶ Play'; outBusy(true, true); var t0 = progressStart(frames);
    try {
      var enc = new IntuitionJxl.Encoder({ width: sz.w, height: sz.h, alpha: !bg, animated: true, fps: tl.fps, step: 6 });
      for (var f = 0; f < frames; f++) {
        if (canceled) throw new Error('canceled');
        enc.addFrame(frameRGBA(tl.timeOf(f), sz, bg)); $('prog').value = f + 1; say('JXL frame ' + (f + 1) + '/' + frames + eta(t0, f + 1, frames));
        var sofar = enc.bytesSoFar(); if (f > 0 && sofar / f * frames > MAX_JXL_BYTES) throw new Error('this clip would be about ' + Math.round(sofar / f * frames / 1048576) + ' MB as JXL. Use a lower resolution, a shorter clip, or MP4');
        await sleep(0);
      }
      var parts = enc.finishPartsList(), size = 0; parts.forEach(function (x) { size += x.length; });
      download(new Blob(parts, { type: 'image/jxl' }), fileBase(sz) + '-anim.jxl');
      say('Animated JXL saved (' + frames + ' frames, ' + tl.fps + ' fps, ' + sz.w + '×' + sz.h + ', ' + (size / 1048576).toFixed(1) + ' MB' + (bg ? '' : ', transparent') + ').', 'ok');
    } catch (e) { say(e.message === 'canceled' ? 'Export canceled.' : 'Export failed: ' + e.message, e.message === 'canceled' ? 'warn' : 'err'); }
    outBusy(false); show(tNow, false);
  }

  // H.264 through WebCodecs, muxed to MP4 here. Where WebCodecs H.264 is missing the older recorder path runs instead.
  async function pickAvc(w, h, fps, bitrate) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
    var big = w * h > 2300000, list = big ? ['avc1.640034', 'avc1.640033', 'avc1.4D0034', 'avc1.4D0033', 'avc1.42E034', 'avc1.42E033'] : ['avc1.64002A', 'avc1.4D002A', 'avc1.42E02A', 'avc1.640034', 'avc1.4D0034'];
    for (var i = 0; i < list.length; i++) {
      var cfg = { codec: list[i], width: w, height: h, bitrate: bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' };
      try { var r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) {}
    }
    return null;
  }
  async function exportMp4() {
    syncTl(); var frames = tl.frameCount(), sz = exportSize(), bg = bgColor() || [0, 0, 0, 255]; if (frames > MAX_FRAMES) { say('Too many frames (' + frames + '). Keep it under ' + MAX_FRAMES + '.', 'warn'); return; }
    var bitrate = Math.round(Math.min(120e6, Math.max(4e6, sz.w * sz.h * tl.fps * 0.14))), cfg = await pickAvc(sz.w, sz.h, tl.fps, bitrate);
    if (!cfg) { say('This browser has no H.264 encoder for ' + sz.w + '×' + sz.h + ' — using the built-in recorder instead.', 'warn'); return exportVideoRecorder(sz, bg); }
    canceled = false; playing = false; $('btnPlay').textContent = '▶ Play'; outBusy(true, true); var t0 = progressStart(frames), enc = null;
    try {
      var samples = [], avcC = null, err = null, lastTs = -1, cv = document.createElement('canvas'); cv.width = sz.w; cv.height = sz.h; var cx = cv.getContext('2d');
      enc = new VideoEncoder({
        output: function (chunk, meta) {
          if (chunk.timestamp <= lastTs) err = new Error('encoder reordered frames'); lastTs = chunk.timestamp;
          var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); samples.push({ data: d, key: chunk.type === 'key' });
          if (meta && meta.decoderConfig && meta.decoderConfig.description) avcC = new Uint8Array(meta.decoderConfig.description.buffer ? meta.decoderConfig.description.buffer.slice(meta.decoderConfig.description.byteOffset, meta.decoderConfig.description.byteOffset + meta.decoderConfig.description.byteLength) : meta.decoderConfig.description);
        },
        error: function (e) { err = e; }
      });
      enc.configure(cfg); var dur = Math.round(1e6 / tl.fps), gop = Math.max(1, Math.round(tl.fps * 2));
      for (var f = 0; f < frames; f++) {
        if (canceled) throw new Error('canceled'); if (err) throw err;
        cx.putImageData(new ImageData(frameRGBA(tl.timeOf(f), sz, bg), sz.w, sz.h), 0, 0);
        var vf = new VideoFrame(cv, { timestamp: Math.round(f * 1e6 / tl.fps), duration: dur }); enc.encode(vf, { keyFrame: f % gop === 0 }); vf.close();
        $('prog').value = f + 1; say('MP4 frame ' + (f + 1) + '/' + frames + eta(t0, f + 1, frames));
        while (enc.encodeQueueSize > 3) await sleep(4);
        await sleep(0);
      }
      await enc.flush(); if (err) throw err; enc.close(); enc = null;
      if (!avcC) throw new Error('the encoder gave no H.264 configuration'); if (samples.length !== frames) throw new Error('encoder returned ' + samples.length + ' of ' + frames + ' frames');
      var parts = Mp4.mux({ width: sz.w, height: sz.h, fps: tl.fps, avcC: avcC, samples: samples }), size = 0; parts.forEach(function (x) { size += x.length; });
      download(new Blob(parts, { type: 'video/mp4' }), fileBase(sz) + '.mp4');
      say('MP4 saved (' + frames + ' frames, ' + tl.fps + ' fps, ' + sz.w + '×' + sz.h + ', ' + (size / 1048576).toFixed(1) + ' MB).', 'ok');
    } catch (e) { try { if (enc) enc.close(); } catch (x) {} say(e.message === 'canceled' ? 'Export canceled.' : 'MP4 export failed: ' + e.message, e.message === 'canceled' ? 'warn' : 'err'); }
    outBusy(false); show(tNow, false);
  }
  // Fallback for browsers without a WebCodecs H.264 encoder: render every frame to JPEG, then play them back into a MediaRecorder.
  async function exportVideoRecorder(sz, bg) {
    if (typeof MediaRecorder === 'undefined') { say('This browser cannot record video.', 'err'); return; }
    var frames = tl.frameCount(), mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
    if (!mime) { say('No supported video format in this browser.', 'err'); return; }
    canceled = false; playing = false; $('btnPlay').textContent = '▶ Play'; outBusy(true, true); var prog = $('prog'); prog.style.display = ''; prog.max = frames * 2; prog.value = 0;
    try {
      var blobs = [], cv = document.createElement('canvas'); cv.width = sz.w; cv.height = sz.h;
      for (var f = 0; f < frames; f++) {
        if (canceled) throw new Error('canceled');
        cv.getContext('2d').putImageData(new ImageData(frameRGBA(tl.timeOf(f), sz, bg), sz.w, sz.h), 0, 0);
        blobs.push(await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', 0.95); })); prog.value = f + 1; say('Rendering frame ' + (f + 1) + '/' + frames); await sleep(0);
      }
      var stream = cv.captureStream(tl.fps), chunks = [];
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(Math.min(60e6, Math.max(6e6, sz.w * sz.h * tl.fps * 0.14))) }); rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      var done = new Promise(function (r) { rec.onstop = r; }); rec.start(); var t0 = performance.now();
      for (var i = 0; i < frames; i++) {
        if (canceled) { rec.stop(); throw new Error('canceled'); }
        var bm = await createImageBitmap(blobs[i]); cv.getContext('2d').drawImage(bm, 0, 0); bm.close(); prog.value = frames + i + 1; say('Encoding ' + (i + 1) + '/' + frames);
        var wait = t0 + (i + 1) * 1000 / tl.fps - performance.now(); if (wait > 0) await sleep(wait);
      }
      rec.stop(); await done; stream.getTracks().forEach(function (t) { t.stop(); });
      download(new Blob(chunks, { type: mime.split(';')[0] }), fileBase(sz) + (mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm')); say('Video saved (' + frames + ' frames, ' + tl.fps + ' fps' + (mime.indexOf('mp4') >= 0 ? '' : ', WebM') + ').', 'ok');
    } catch (e) { say(e.message === 'canceled' ? 'Export canceled.' : 'Video export failed: ' + e.message, e.message === 'canceled' ? 'warn' : 'err'); }
    outBusy(false); show(tNow, false);
  }

  // ---------- LEATR ----------
  async function planWithLeatr() {
    var text = $('inPrompt').value.trim(); if (!text) { say('Write a prompt first.', 'warn'); return; }
    var url = $('inRelay').value.trim(); try { localStorage.setItem('intuition.relay', url); } catch (e) {}
    setBusy(true); say('Planning…');
    var p = await LeatrBridge.plan({ url: url, text: text, team: team });
    if (p.source === 'relay' && p.team) { team = p.team; try { localStorage.setItem('intuition.team', JSON.stringify(team)); } catch (e) {} }
    $('chipLeatr').textContent = p.source; $('planOut').textContent = (p.source === 'relay' ? '' : '[local plan' + (p.error ? ' — relay failed: ' + p.error : '') + ']\n') + p.text + '\n\nprogram:\n' + p.program;
    var np = LeatrBridge.paramsFromPlan(p, lib, P); P.seed = np.seed; P.style = np.style; P.mix = np.mix; selected = np.refs.map(function (r) { return r.slot; });
    syncUI(); gridUI(); setBusy(false); say(p.source === 'relay' ? 'LEATR plan applied.' : 'Local plan applied' + (url ? ' (relay unavailable)' : '') + '.', p.source === 'relay' ? 'ok' : 'warn'); generateStill();
  }

  // ---------- wiring ----------
  function syncUI() { $('inSeed').value = P.seed; $('selStyle').value = P.style; $('rMix').value = P.mix; $('vMix').textContent = (+P.mix).toFixed(2); }
  function bind() {
    $('tabs').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; Array.from($('tabs').children).forEach(function (x) { x.classList.toggle('on', x === b); }); document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + b.dataset.p); }); };
    $('btnGen').onclick = generateStill;
    $('btnRand').onclick = function () { P.seed = Math.floor(Math.random() * 1e6); syncUI(); generateStill(); };
    $('btnPlay').onclick = function () { playing = !playing; $('btnPlay').textContent = playing ? '❚❚ Pause' : '▶ Play'; if (playing) tick(); else generateStill(); };
    $('tScrub').oninput = function () { tNow = +$('tScrub').value; $('tVal').textContent = tNow.toFixed(2) + 's'; if (!playing && !busy) show(tNow, true); };
    $('tScrub').onchange = function () { if (!playing) generateStill(); };
    $('selStyle').onchange = function () { P.style = $('selStyle').value; }; $('inSeed').onchange = function () { P.seed = +$('inSeed').value | 0; };
    $('rMix').oninput = function () { P.mix = +$('rMix').value; $('vMix').textContent = P.mix.toFixed(2); }; $('rSpeed').oninput = function () { P.speed = +$('rSpeed').value; $('vSpeed').textContent = P.speed.toFixed(2); };
    $('rPart').oninput = function () { P.particles = +$('rPart').value; $('vPart').textContent = P.particles; };
    $('chkChecker').onchange = function () { if (lastGen && !playing) draw(lastGen, bgColor(), $('chkChecker').checked); }; $('selBg').onchange = function () { refreshOut(); if (lastGen && !playing) draw(lastGen, bgColor(), $('chkChecker').checked); };
    $('btnAdd').onclick = function () { $('fileIn').click(); }; $('fileIn').onchange = function () { addFiles($('fileIn').files); $('fileIn').value = ''; };
    $('btnSamples').onclick = loadSamples; $('btnUrl').onclick = function () { var u = $('inUrl').value.trim(); if (u) addUrl(u); };
    $('btnRemove').onclick = function () { selected.forEach(function (i) { lib.remove(i); }); selected = []; gridUI(); say('Removed.', 'ok'); };
    var drop = $('drop'); ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); }); drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    $('btnSaveLib').onclick = function () { download(new Blob([lib.serialize()], { type: 'application/json' }), 'intuition-shell64-library.json'); };
    $('btnLoadLib').onclick = function () { $('libIn').click(); };
    $('libIn').onchange = async function () { try { lib = Shell64Refs.deserialize(await $('libIn').files[0].text()); selected = []; gridUI(); say('Library loaded (' + lib.count() + ' slots).', 'ok'); } catch (e) { say('Library file rejected: ' + e.message, 'err'); } $('libIn').value = ''; };
    $('inDur').onchange = syncTl; $('selFps').onchange = syncTl;
    $('btnKey').onclick = function () { try { tl.setKey($('selKey').value, +tNow.toFixed(3), +$('inKeyV').value, $('selEase').value); keysUI(); say('Key set at ' + tNow.toFixed(2) + 's.', 'ok'); } catch (e) { say(e.message, 'err'); } };
    $('btnClearKeys').onclick = function () { tl.tracks = {}; keysUI(); };
    $('btnPlan').onclick = planWithLeatr; $('btnTeamReset').onclick = function () { team = null; try { localStorage.removeItem('intuition.team'); } catch (e) {} say('Team reset.', 'ok'); };
    $('btnPng').onclick = function () { exportStill('png'); }; $('btnJxl').onclick = function () { exportStill('jxl'); };
    $('btnJxlAnim').onclick = exportAnimJxl; $('btnMp4').onclick = exportMp4; $('btnCancel').onclick = function () { canceled = true; };
    $('selRatio').onchange = applyShape; $('selRes').onchange = refreshOut;
  }
  bind(); syncTl(); syncUI(); gridUI(); refreshOut(); show(0, false); say('Ready. Load the samples in Shell64, pick references, then Generate.');
  window.FraxStudio = { lib: function () { return lib; }, params: P, show: show };
})();
