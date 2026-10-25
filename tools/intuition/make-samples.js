// Generates the original sample assets in samples/: PNG stills (one with a real alpha cutout) and two short MP4 clips.
//   node tools/intuition/make-samples.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { spawnSync } = require('child_process');
const G = require('../../templates/intuition/src/generate.js'), R = require('../../templates/intuition/src/raster.js');
const out = path.join(__dirname, '..', '..', 'templates', 'intuition', 'samples'); fs.mkdirSync(out, { recursive: true });

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const save = (name, w, h, d) => { fs.writeFileSync(path.join(out, name), png(w, h, d)); console.log('wrote samples/' + name); };

// Stills (opaque scenes)
const stills = [['meadow-dawn.png', { w: 480, h: 270, seed: 11, style: 'meadow' }], ['ridge-ember.png', { w: 480, h: 270, seed: 23, style: 'ridge' }], ['nebula-drift.png', { w: 480, h: 270, seed: 5, style: 'nebula' }]];
stills.forEach(([n, p]) => { const r = G.render(p, null, 0); save(n, r.w, r.h, r.data); });

// Cutout with real alpha: a faceted crystal flower on a transparent background
{ const w = 256, h = 256, d = new Uint8ClampedArray(w * h * 4), cx = w / 2, cy = h * 0.46;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy), petal = 78 + 50 * Math.abs(Math.cos(a * 3)), stem = Math.abs(x - cx) < 5 && y > cy && y < h - 8, i = (y * w + x) * 4;
    if (r < petal) { const t = r / petal, e = Math.min(1, (petal - r) / 1.5); d.set([Math.round(120 + 135 * (1 - t)), Math.round(60 + 80 * Math.abs(Math.sin(a * 3))), Math.round(190 + 60 * t), Math.round(255 * e)], i); }
    else if (stem) d.set([60, 160, 120, 255], i);
  }
  save('crystal-flower-cutout.png', w, h, d); }

// Videos: encode generator frames with ffmpeg (skipped with a message if ffmpeg is missing)
function video(name, params, secs, fps) {
  const w = params.w, h = params.h, n = secs * fps;
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', w + 'x' + h, '-r', String(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', path.join(out, name)],
    { input: Buffer.concat(Array.from({ length: n }, (_, f) => { const r = G.render(params, null, f / fps); return Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length); })), maxBuffer: 1 << 28 });
  if (ff.error || ff.status !== 0) { console.log('skipped ' + name + ' (ffmpeg unavailable: ' + (ff.error ? ff.error.message : String(ff.stderr)) + ')'); return false; }
  console.log('wrote samples/' + name); return true;
}
video('meadow-loop.mp4', { w: 320, h: 180, seed: 11, style: 'meadow', speed: 1, particles: 200 }, 3, 12);
video('nebula-flow.mp4', { w: 320, h: 180, seed: 5, style: 'nebula', speed: 1.2, particles: 120 }, 3, 12);

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ samples: [
  { file: 'meadow-dawn.png', kind: 'image', name: 'Meadow dawn' }, { file: 'ridge-ember.png', kind: 'image', name: 'Ridge ember' }, { file: 'nebula-drift.png', kind: 'image', name: 'Nebula drift' },
  { file: 'crystal-flower-cutout.png', kind: 'image', name: 'Crystal flower (alpha cutout)' },
  { file: 'meadow-loop.mp4', kind: 'video', name: 'Meadow loop (video)' }, { file: 'nebula-flow.mp4', kind: 'video', name: 'Nebula flow (video)' }
].filter(s => fs.existsSync(path.join(out, s.file))) }, null, 2) + '\n');
console.log('wrote samples/manifest.json');
