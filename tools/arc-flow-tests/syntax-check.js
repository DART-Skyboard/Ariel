// Extracts every inline <script> from templates/arc-flow.html and runs `node --check` on each.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { load } = require('./extract');
const html = load();
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m, n = 0, bad = 0;
while ((m = re.exec(html))) {
  if (/\bsrc=/.test(m[1])) continue;
  const type = (/type="([^"]+)"/.exec(m[1]) || [])[1];
  if (type === 'importmap') continue;
  const ext = type === 'module' ? '.mjs' : '.js';
  const f = path.join(os.tmpdir(), `arc-flow-inline-${n++}${ext}`);
  fs.writeFileSync(f, m[2]);
  const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status) { bad++; console.error(`script #${n} (${type || 'classic'}) FAILED:\n${r.stderr}`); }
  else console.log(`script #${n} (${type || 'classic'}, ${m[2].length} chars): syntax OK`);
}
if (!n) { console.error('no inline scripts found'); process.exit(1); }
process.exit(bad ? 1 : 0);
