#!/usr/bin/env python3
"""Clone button + axe test (see README): Quick Rocket loaded -> Clone enabled; a click makes a clone card with an axe immediately (no bake wait);
the same again right after Simulate while the bake is still running; a selected part is cloned via its assembly; the axe removes the card and
the assembly synchronously. Exit 0 = pass.   python3 tests/arc-flow-clone-button/run.py [--url URL]"""
import sys, time, argparse
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--url', default='http://localhost:8765/templates/arc-flow.html'); ap.add_argument('--chrome', default='/usr/bin/google-chrome')
a = ap.parse_args(); fails, errs = [], []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
def until(pg, js, secs):
    t0 = time.time()
    while time.time() - t0 < secs:
        if pg.evaluate(js): return True
        pg.wait_for_timeout(500)
    return False
CARDS = "document.querySelectorAll('#spawnList > div').length"; AXES = "document.querySelectorAll('.spawn-axe').length"
ASM = "window._arcFlowState.root.children.filter(c => c.userData && c.userData.isAssembly).length"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
    pg = b.new_page(viewport={'width': 480, 'height': 320})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text[:200]) if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)
    pg.on('dialog', lambda d: (errs.append('dialog ' + d.message[:100]), d.dismiss()))
    pg.goto(a.url); pg.wait_for_timeout(5000)
    check(until(pg, "window._arcFlowState.parts.length > 0", 240), 'Quick Rocket loaded')
    check(until(pg, "!document.getElementById('btnCloneImport').disabled", 5), 'Clone is enabled once a model is loaded (no file import, no bake)')
    pg.eval_on_selector('#btnCloneImport', 'e => e.click()')
    check(until(pg, f"{AXES} == 1", 20), 'pre-run: Clone made a clone card with an axe')
    check(pg.evaluate(ASM) == 2, 'pre-run: two assemblies in the scene')
    # select a part, then clone: its assembly is cloned
    pg.evaluate("(() => { const S = window._arcFlowState; S.selectedPart = S.parts[0]; })()")
    pg.eval_on_selector('#btnCloneImport', 'e => e.click()')
    check(until(pg, f"{AXES} == 2", 20), 'selected part: Clone made a second clone with its axe')
    # Simulate; the bake runs for minutes in software GL: clone while it is still baking
    pg.eval_on_selector('#playBtn', 'e => e.click()')
    check(until(pg, "window._arcFlowState.simRunning", 600), 'simulation started'); print('sim', pg.evaluate('window._arcFlowState.instances.map(i=>[i.id,i.built,i.baking,i.removed])'))
    check(not pg.evaluate("document.getElementById('btnCloneImport').disabled"), 'Clone stays enabled after Simulate (bake not finished)')
    n0 = pg.evaluate("window._arcFlowState.instances.length")
    pg.eval_on_selector('#btnCloneImport', 'e => e.click()')
    check(until(pg, f"{AXES} == 3", 30), 'during run: Clone made a card with an axe without waiting for a bake')
    check(until(pg, f"window._arcFlowState.instances.length == {n0} + 1", 30), 'during run: the clone registered its own Instance immediately')
    # axe: synchronous hide/detach
    pg.evaluate("document.querySelector('.spawn-axe').click()")
    print('after axe', pg.evaluate(AXES), pg.evaluate(ASM), pg.evaluate('window._arcFlowState.instances.length'))
    check(pg.evaluate(AXES) == 2, 'axe click removed the card synchronously (2 left)')
    check(until(pg, f"{ASM} == 3 && window._arcFlowState.parts.every(p => p.pivot.parent)", 20), 'axe detached the assembly and its parts')
    check(not errs, 'no page errors ' + str(errs[:4]))
    b.close()
print('RESULT', 'FAIL %d failure(s)' % len(fails) if fails else 'PASS 0 failure(s)'); sys.exit(1 if fails else 0)
