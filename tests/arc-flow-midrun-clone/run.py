#!/usr/bin/env python3
"""Headless multi-instance clone test for templates/arc-flow.html  (see README.md).

  python3 -m http.server 8765 &            # from the repo root
  python3 tests/arc-flow-midrun-clone/run.py [prerun|midrun|both] [--clones N] [--url URL] [--out FILE]

Quick Rocket + N clones, cloned BEFORE Simulate (prerun) and DURING a run (midrun). Asserts: instance count (>= N+1) went up,
every instance built + active + advancing frames and its own plume clock, no instance links to a part of another instance,
a mid-run clone never stops / rebakes the running instances, and there are no page errors. Exit code 0 = pass.
"""
import sys, time, json, argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('mode', nargs='?', default='both', choices=['prerun', 'midrun', 'both'])
ap.add_argument('--clones', type=int, default=4)
ap.add_argument('--url', default='http://localhost:8765/templates/arc-flow.html')
ap.add_argument('--chrome', default='/usr/bin/google-chrome')
ap.add_argument('--timeout', type=int, default=900, help='seconds allowed per wait (software GL bakes are slow)')
a = ap.parse_args()

SNAP = """() => { const A = window.arcFlow, S = A.state; return S.instances.map(i => {
  const c = A.ctxView(i), parts = new Set(i.parts); let cross = 0, nlinks = 0;
  for (const [p, v] of i.links) for (const l of (Array.isArray(v) ? v : [v])) { nlinks++; if (!parts.has(l.target) || !parts.has(p)) cross++; }
  return { id: i.id, name: i.name, built: i.built, baking: i.baking, active: i.active, frames: i.frames, parts: i.parts.length, links: nlinks, cross,
           shared: !!i.sharedFrom, tclock: c && c.plume ? c.plume.tclock : -1, hasPS: !!(c && c.particleSystem), running: S.simRunning,
           pos: i.root ? [i.root.position.x, i.root.position.z] : null }; }); }"""

fails, errs = [], []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg, flush=True)
    if not c: fails.append(msg)

def wait(pg, js, what, timeout=None):
    t0 = time.time()
    while time.time() - t0 < (timeout or a.timeout):
        pg.wait_for_timeout(3000)
        if pg.evaluate(js): return True
    check(False, 'timeout waiting for ' + what); return False

def fresh(p):
    b = p.chromium.launch(executable_path=a.chrome, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'])
    pg = b.new_page(viewport={'width': 480, 'height': 320})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console.error: ' + m.text[:200]) if (m.type == 'error' and 'Failed to load resource' not in m.text) else None)
    pg.goto(a.url); pg.wait_for_timeout(8000)
    pg.evaluate("document.getElementById('particlesPerContainer').value = 300; window.arcFlow.setRenderMode('points')")
    wait(pg, "window._arcFlowState.parts.length > 0", 'Quick Rocket to load', 120)   # the demo loads by default; click it if not
    return b, pg

def advancing(pg, want, label):
    s1 = pg.evaluate(SNAP); pg.wait_for_timeout(8000); s2 = pg.evaluate(SNAP)
    check(len(s2) >= want, f'{label}: {len(s2)} instances (>= {want})')
    for x, y in zip(s1, s2):
        check(y['built'] and y['active'], f"{label}: {y['name']} built+active")
        check(y['frames'] > x['frames'], f"{label}: {y['name']} frames {x['frames']} -> {y['frames']}")
        check(y['tclock'] > x['tclock'], f"{label}: {y['name']} own plume clock {x['tclock']:.2f} -> {y['tclock']:.2f}")
        check(y['cross'] == 0, f"{label}: {y['name']} no cross-instance links ({y['links']} links)")
        check(y['hasPS'], f"{label}: {y['name']} has its own particle system")
    pos = {tuple(round(v, 1) for v in x['pos']) for x in s2 if x['pos']}
    check(len(pos) == len(s2), f'{label}: every instance has its own world position {sorted(pos)}')
    return s2

with sync_playwright() as p:
    if a.mode in ('prerun', 'both'):
        print('== pre-run clones =='); b, pg = fresh(p)
        for _ in range(a.clones):
            pg.eval_on_selector('#btnAddDemo','e=>e.click()'); pg.wait_for_timeout(1500)
        check(pg.evaluate("window._arcFlowState.root.children.filter(c => c.userData.isAssembly).length") == a.clones + 1, 'assemblies in scene = clones + 1')
        pg.eval_on_selector('#playBtn','e=>e.click()')
        wait(pg, f"window._arcFlowState.simRunning && window._arcFlowState.instances.length >= {a.clones + 1} && window._arcFlowState.instances.every(i => i.built && !i.baking)", 'all instances built')
        s = advancing(pg, a.clones + 1, 'prerun'); print(json.dumps(s)); b.close()
    if a.mode in ('midrun', 'both'):
        print('== mid-run clones =='); b, pg = fresh(p)
        pg.eval_on_selector('#playBtn','e=>e.click()')
        wait(pg, "window._arcFlowState.simRunning && window._arcFlowState.instances.length >= 1 && window._arcFlowState.instances.every(i => i.built && !i.baking)", 'original running')
        s0 = advancing(pg, 1, 'before clone'); n0 = len(s0); base = {x['id']: x for x in s0}
        stopped = []
        for k in range(a.clones):
            pg.eval_on_selector('#btnAddDemo','e=>e.click()')
            t0 = time.time()
            while time.time() - t0 < a.timeout:
                pg.wait_for_timeout(2000)
                snap = pg.evaluate(SNAP)
                stopped += [x['name'] for x in snap if x['id'] in base and (x['baking'] or not x['active'] or not x['built'])]
                if len(snap) == n0 + k + 1 and all(x['built'] and not x['baking'] for x in snap): break
            check(len(snap) == n0 + k + 1, f'clone {k+1} created its own instance ({len(snap)})')
        check(not stopped, 'running instances never stopped / rebaked while clones were added ' + str(sorted(set(stopped))))
        s = advancing(pg, n0 + a.clones, 'midrun')
        check(sum(1 for x in s if x['shared']) >= a.clones, 'clones reuse the original bake by default (shared)')
        print(json.dumps(s))
        # delete two clones with their axe buttons while everything runs
        mem = "() => { const m = window.arcFlow.renderer().info.memory; return { geometries: m.geometries, textures: m.textures }; }"
        m0 = pg.evaluate(mem); keep = [x['id'] for x in s]
        n_axes = pg.evaluate("document.querySelectorAll('.spawn-axe').length")
        check(n_axes == a.clones, f'one axe per clone ({n_axes})')
        for _ in range(2):
            pg.eval_on_selector('.spawn-axe','e=>e.click()'); pg.wait_for_timeout(1500)
        pg.wait_for_timeout(3000)
        m1 = pg.evaluate(mem)
        check(m1['geometries'] < m0['geometries'], f"renderer geometries dropped {m0['geometries']} -> {m1['geometries']}")
        check(m1['textures'] < m0['textures'], f"renderer textures dropped {m0['textures']} -> {m1['textures']}")
        check(pg.evaluate("document.querySelectorAll('.spawn-axe').length") == a.clones - 2, 'two spawn cards removed')
        check(pg.evaluate("window._arcFlowState.root.children.filter(c => c.userData.isAssembly).length") == a.clones - 1, 'two assemblies removed from the scene')
        s = advancing(pg, a.clones - 1, 'after delete')
        check(len(s) == a.clones - 1, f'exactly {a.clones - 1} instances remain ({len(s)})')
        check(all(x['id'] in keep for x in s), 'the survivors are the same instances (nothing rebuilt)')
        orphan = pg.evaluate("() => { const S = window._arcFlowState; const ps = new Set(S.instances.flatMap(i => i.parts)); return S.parts.filter(p => !ps.has(p)).length; }")
        check(orphan == 0, f'no orphan parts in state.parts ({orphan})')
        print(json.dumps(s)); b.close()
check(not errs, 'no page errors ' + str(errs[:5]))
print('RESULT', 'FAIL' if fails else 'PASS', len(fails), 'failure(s)')
sys.exit(1 if fails else 0)
