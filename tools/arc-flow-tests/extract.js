// Helpers for the arc-flow.html test harnesses: pull top-level function/const source out of the single-file app
// (no build step, no DOM) so it can be exercised under plain node.
const fs = require('fs');
const path = require('path');
const HTML = process.env.ARC_FLOW_HTML || path.join(__dirname, '..', '..', 'templates', 'arc-flow.html');

function load() { return fs.readFileSync(HTML, 'utf8'); }

// Source between `// <name:begin>` and `// <name:end>` sentinel comments.
function region(src, name) {
  const a = src.indexOf(`// <${name}:begin>`), b = src.indexOf(`// <${name}:end>`);
  if (a < 0 || b < 0) throw new Error('missing sentinel region ' + name);
  return src.slice(a, b);
}

// Source of a top-level `function name(...) {...}` via brace matching (skips strings, template literals, comments).
function fn(src, name) {
  const m = new RegExp('^(async )?function ' + name + '\\(', 'm').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', src.indexOf(')', m.index));
  const start = m.index;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'") { for (i++; src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced: ' + name);
}
function skipTemplate(src, i) {
  for (i++; src[i] !== '`'; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      let d = 0;
      for (i++; ; i++) {
        const c = src[i];
        if (c === '`') { i = skipTemplate(src, i); continue; }
        if (c === '"' || c === "'") { for (i++; src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
        if (c === '{') d++;
        else if (c === '}' && --d === 0) break;
      }
    }
  }
  return i;
}
// `const NAME = ...;` single-line constant.
function constLine(src, name) {
  const m = new RegExp('^(const|let) ' + name + '\\b.*$', 'm').exec(src);
  if (!m) throw new Error('const not found: ' + name);
  return m[0];
}
module.exports = { load, region, fn, constLine, HTML };
