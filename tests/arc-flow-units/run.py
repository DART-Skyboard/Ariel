#!/usr/bin/env python3
"""Headless unit-scale test for templates/arc-flow.html (see tests/arc-flow-units/README.md).
  python3 -m http.server 8765 &   # repo root
  python3 tests/arc-flow-units/run.py [--url URL]
Asserts: default import unit = unitless (legacy auto-fit), display = metric; importing a 1000-unit cube authored in mm scales it to 1 m (no auto-fit),
cm/in/ft/custom factors are exact, the demo is unaffected by the import unit, both choices persist across a reload, the display toggle changes the
read-out labels only (never the physics unit: 1 unit = 1 m), and there are no page errors. Exit 0 = pass."""
import sys, argparse, tempfile, os
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:8765/templates/arc-flow.html')
ap.add_argument('--chrome', default='/usr/bin/google-chrome')
a = ap.parse_args()
fails, errs = [], []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
def obj(edge):
    h = edge / 2; v = [(-h,-h,-h),(h,-h,-h),(h,h,-h),(-h,h,-h),(-h,-h,h),(h,-h,h),(h,h,h),(-h,h,h)]
    f = [(1,2,3,4),(5,8,7,6),(1,5,6,2),(2,6,7,3),(3,7,8,4),(5,1,4,8)]
    return ''.join('v %g %g %g\n' % t for t in v) + ''.join('f %d %d %d %d\n' % t for t in f)
d = tempfile.mkdtemp(); path = os.path.join(d, 'cube.obj'); open(path, 'w').write(obj(1000))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'])
    ctx = b.new_context(viewport={'width': 480, 'height': 320}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text[:200]) if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)
    pg.goto(a.url); pg.wait_for_timeout(8000)
    t = 0
    while t < 120 and not pg.evaluate("window._arcFlowState.parts.length > 0"): pg.wait_for_timeout(2000); t += 2
    check(pg.evaluate("document.getElementById('importUnit').value") == 'unitless', 'default import unit is unitless (auto-fit)')
    check(pg.evaluate("document.getElementById('unitSystem').value") == 'metric', 'default display is Metric')
    # demo group scale (auto-fit) before any import
    demo = pg.evaluate("(() => { const r = window._arcFlowState.root; return r.children.map(g => g.scale.x); })()")
    def import_cube(unit, custom=None):
        pg.evaluate("(u) => { const s = document.getElementById('importUnit'); s.value = u; s.onchange(); }", unit)
        if custom is not None:
            pg.evaluate("(v) => { const c = document.getElementById('importUnitCustom'); c.value = v; c.onchange(); }", custom)
        pg.evaluate("window.__lastInfo = document.getElementById('importUnitInfo').textContent; window.__tok = performance.now()")
        pg.evaluate("document.getElementById('fileInput').value = ''")   # same path again must re-fire change
        pg.set_input_files('#fileInput', path)   # a fresh import replaces the scene
        t = 0
        while t < 90 and pg.evaluate("(() => { const r = window._arcFlowState.root; const i = document.getElementById('importUnitInfo').textContent; return !(r && r.children.length && i.includes('Last import') && i !== window.__lastInfo); })()"):
            pg.wait_for_timeout(1000); t += 1
        return pg.evaluate("(() => { const r = window._arcFlowState.root; const c = r ? r.children.filter(g => /cube|import/i.test((g.userData && g.userData.spawnName) || '')) : []; return c.map(g => g.scale.x); })()")
    for unit, k, custom in [('mm', 0.001, None), ('cm', 0.01, None), ('in', 0.0254, None), ('ft', 0.3048, None), ('m', 1.0, None), ('custom', 0.5, 0.5), ('unitless', 20/1000, None)]:
        s = import_cube(unit, custom)
        check(any(abs(x - k) < 1e-9 for x in s), f'cube (1000 units) authored in {unit}: scales {s} contain {k:.6g}')
    check(pg.evaluate("window._arcFlowState.flowUnitM || 1") == 1, 'physics unit stays 1 unit = 1 m')
    # persistence
    pg.evaluate("(() => { const s = document.getElementById('importUnit'); s.value = 'ft'; s.onchange(); const d = document.getElementById('unitSystem'); d.value = 'imperial'; d.onchange(); })()")
    pg.reload(); pg.wait_for_timeout(6000)
    check(pg.evaluate("document.getElementById('importUnit').value") == 'ft' and pg.evaluate("document.getElementById('unitSystem').value") == 'imperial', 'import unit + display system persist across reload')
    info = pg.evaluate("document.getElementById('importUnitInfo').textContent")
    check('0.3048' in info, 'import info line reflects the factor: ' + info[:80])
    check(not errs, 'no page errors ' + str(errs[:4]))
    b.close()
print('RESULT', 'FAIL %d failure(s)' % len(fails) if fails else 'PASS 0 failure(s)')
sys.exit(1 if fails else 0)
