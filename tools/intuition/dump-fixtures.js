// node tools/intuition/dump-fixtures.js <dir>  -> raw RGBA frames + meta.json for make-jxl-golden.py
'use strict';
const fs = require('fs'), path = require('path'), F = require('./jxl-fixtures.js'), dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
const meta = {}; for (const [n, f] of Object.entries(F)) { meta[n] = { w: f.w, h: f.h, alpha: f.alpha, groupShift: f.groupShift, animated: f.animated, fps: f.fps, n: f.frames.length }; f.frames.forEach((d, i) => fs.writeFileSync(path.join(dir, `${n}.${i}.rgba`), Buffer.from(d.buffer))); }
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
