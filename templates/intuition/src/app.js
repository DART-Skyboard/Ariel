// Intuition UI: wires the raster core, Shell64 reference library, generator, timeline and LEATR bridge to the page.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var lib = new Shell64Refs(), tl = new Timeline({ fps: 30, duration: 5 });
  var P = { w: 640, h: 360, seed: 11, style: 'meadow', mix: 0.5, speed: 0.15, particles: 260 };
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
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }

  // ---------- timeline ----------
  function keysUI() { var k = Object.keys(tl.tracks); $('keyList').textContent = k.length ? k.map(function (p) { return p + ': ' + tl.tracks[p].map(function (x) { return x.t.toFixed(2) + 's=' + x.v + (x.ease !== 'linear' ? '(' + x.ease + ')' : ''); }).join('  '); }).join('\n') : 'No keyframes.'; }
  function syncTl() { tl.duration = Math.min(60, Math.max(0.5, +$('inDur').value || 5)); tl.fps = +$('selFps').value; $('tScrub').max = tl.duration; if (tNow > tl.duration) tNow = 0; }

  // ---------- export ----------
  function exportPng() {
    if (busy) return; var bg = bgColor(), g = renderAt(tNow, false); draw(g, bg, false);
    view.toBlob(function (b) { if (!b) { say('PNG export failed', 'err'); return; } download(b, 'intuition-' + P.seed + '-' + tNow.toFixed(2) + 's.png'); say('PNG saved' + (bg ? '' : ' with transparency') + '.', 'ok'); draw(g, bg, $('chkChecker').checked); }, 'image/png');
  }
  async function exportVideo() {
    if (busy) return; if (typeof MediaRecorder === 'undefined') { say('This browser cannot record video.', 'err'); return; }
    syncTl(); var frames = tl.frameCount(); if (frames > 900) { say('Too many frames (' + frames + '). Keep it under 900 (e.g. 30 s at 30 fps).', 'warn'); return; }
    var bg = bgColor() || [0, 0, 0, 255], mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
    if (!mime) { say('No supported video format in this browser.', 'err'); return; }
    var prog = $('prog'); prog.style.display = ''; prog.max = frames * 2; prog.value = 0; setBusy(true); playing = false; $('btnPlay').textContent = '▶ Play'; canceled = false;
    try {
      var blobs = [], cv = document.createElement('canvas');
      for (var f = 0; f < frames; f++) {                                    // pass 1: render every frame to a compact JPEG (keeps memory small)
        var g = renderAt(tl.timeOf(f), false); cv.width = g.w; cv.height = g.h; cv.getContext('2d').putImageData(new ImageData(Raster.composite(g.layers, g.w, g.h, bg), g.w, g.h), 0, 0);
        blobs.push(await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', 0.95); })); prog.value = f + 1; say('Rendering frame ' + (f + 1) + '/' + frames); await new Promise(function (r) { setTimeout(r, 0); });
      }
      var out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; var ox = out.getContext('2d'), stream = out.captureStream(tl.fps), chunks = [];
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }); rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      var done = new Promise(function (r) { rec.onstop = r; }); rec.start();
      var t0 = performance.now();                                            // pass 2: play frames back at exact fps while recording
      for (var i = 0; i < frames; i++) { var bm = await createImageBitmap(blobs[i]); ox.drawImage(bm, 0, 0); bm.close(); prog.value = frames + i + 1; say('Encoding ' + (i + 1) + '/' + frames);
        var wait = t0 + (i + 1) * 1000 / tl.fps - performance.now(); if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); }); }
      rec.stop(); await done; stream.getTracks().forEach(function (t) { t.stop(); });
      download(new Blob(chunks, { type: mime.split(';')[0] }), 'intuition-' + P.seed + (mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm')); say('Video saved (' + frames + ' frames, ' + tl.fps + ' fps).', 'ok');
    } catch (e) { say('Video export failed: ' + e.message, 'err'); }
    prog.style.display = 'none'; setBusy(false); show(tNow, false);
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
  function syncUI() { $('inSeed').value = P.seed; $('selStyle').value = P.style; $('rMix').value = P.mix; $('vMix').textContent = (+P.mix).toFixed(2); $('inW').value = P.w; $('inH').value = P.h; }
  function bind() {
    $('tabs').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; Array.from($('tabs').children).forEach(function (x) { x.classList.toggle('on', x === b); }); document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + b.dataset.p); }); };
    $('btnGen').onclick = generateStill;
    $('btnRand').onclick = function () { P.seed = Math.floor(Math.random() * 1e6); syncUI(); generateStill(); };
    $('btnPlay').onclick = function () { playing = !playing; $('btnPlay').textContent = playing ? '❚❚ Pause' : '▶ Play'; if (playing) tick(); else generateStill(); };
    $('tScrub').oninput = function () { tNow = +$('tScrub').value; $('tVal').textContent = tNow.toFixed(2) + 's'; if (!playing && !busy) show(tNow, true); };
    $('tScrub').onchange = function () { if (!playing) generateStill(); };
    $('inW').onchange = function () { P.w = Math.min(1920, Math.max(64, +$('inW').value | 0)); syncUI(); }; $('inH').onchange = function () { P.h = Math.min(1080, Math.max(64, +$('inH').value | 0)); syncUI(); };
    $('selStyle').onchange = function () { P.style = $('selStyle').value; }; $('inSeed').onchange = function () { P.seed = +$('inSeed').value | 0; };
    $('rMix').oninput = function () { P.mix = +$('rMix').value; $('vMix').textContent = P.mix.toFixed(2); }; $('rSpeed').oninput = function () { P.speed = +$('rSpeed').value; $('vSpeed').textContent = P.speed.toFixed(2); };
    $('rPart').oninput = function () { P.particles = +$('rPart').value; $('vPart').textContent = P.particles; };
    $('chkChecker').onchange = function () { if (lastGen && !playing) draw(lastGen, bgColor(), $('chkChecker').checked); }; $('selBg').onchange = function () { if (lastGen && !playing) draw(lastGen, bgColor(), $('chkChecker').checked); };
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
    $('btnPng').onclick = exportPng; $('btnVid').onclick = exportVideo;
  }
  bind(); syncTl(); syncUI(); gridUI(); show(0, false); say('Ready. Load the samples in Shell64, pick references, then Generate.');
  window.FraxStudio = { lib: function () { return lib; }, params: P, show: show };
})();
