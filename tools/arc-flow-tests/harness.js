// Dependency-closing loader for the arc-flow.html node harnesses: give it regions/functions to start from, it pulls in every top-level
// function / constant they reference (minus `skip`), so a test can call real app code with real three.js and no DOM.
const vm = require('vm'), fs = require('fs');
const ex = require('./extract');
async function loadThree() {
  const cands = [process.env.THREE_PATH, '/tmp/t3/node_modules/three/build/three.module.js'].filter(Boolean);
  try { cands.unshift(require.resolve('three/build/three.module.js')); } catch (_) {}
  for (const c of cands) if (fs.existsSync(c)) return await import(require('url').pathToFileURL(c).href);
  return null;
}
async function build({ regions = [], fns = [], lets = [], skip = [], globals = {}, exportNames = [] }) {
  const THREE = await loadThree(); if (!THREE) return null;
  const src = ex.load(), skipSet = new Set(skip);
  const ctx = Object.assign({ THREE, console, Math, Infinity, Float32Array, Float64Array, Int32Array, Uint8Array, Map, Set, WeakMap, Promise, setTimeout, clearTimeout, performance: { now: () => Date.now() }, state: { parts: [], instances: [] } }, globals);
  vm.createContext(ctx);
  const have = new Set(), chunks = [];
  const add = (name, text) => { if (have.has(name)) return false; have.add(name); chunks.push(text); return true; };
  for (const r of regions) { const t = ex.region(src, r); chunks.push(t); for (const m of t.matchAll(/^(?:async )?function (\w+)\(/gm)) have.add(m[1]); for (const m of t.matchAll(/^(?:const|let|var|class) (\w+)/gm)) have.add(m[1]); }
  for (const n of fns) add(n, ex.fn(src, n));
  for (const n of lets) { try { add(n, ex.constLine(src, n)); } catch (_) {} }
  const topFns = new Set([...src.matchAll(/^(?:async )?function (\w+)\(/gm)].map(m => m[1]));
  const consts = new Map([...src.matchAll(/^(?:const|let) (\w+) = [^\n]*;.*$/gm)].map(m => [m[1], m[0]]));
  for (let again = true; again;) {
    again = false;
    const code = chunks.join('\n');
    for (const tok of new Set(code.match(/\b[A-Za-z_]\w*(?=\()/g) || [])) if (topFns.has(tok) && !have.has(tok) && !skipSet.has(tok)) { add(tok, ex.fn(src, tok)); again = true; }
    for (const [n, line] of consts) if (!have.has(n) && !skipSet.has(n) && /^[A-Z_]\w*$|^_\w+$/.test(n) && new RegExp('\\b' + n + '\\b').test(code)) { add(n, line); again = true; }
  }
  const code = chunks.join('\n') + '\nthis.api = {' + exportNames.join(',') + '};';
  vm.runInContext(code, ctx);
  return { THREE, ctx, api: ctx.api, state: ctx.state, src, code };
}
module.exports = { build, loadThree };
