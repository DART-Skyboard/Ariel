#!/usr/bin/env python3
"""Headless software-WebGL stall test (no GPU): Chromium + SwiftShader.

Loads templates/arc-flow.html, waits for the demo, presses Simulate, and asserts
  * the bake + Simulate reaches simRunning within BAKE_LIMIT_S,
  * 60 animation frames after sim start finish within FRAMES_LIMIT_S,
  * no main-thread long task longer than LONGTASK_LIMIT_MS starts AFTER the sim started
    (this is the freeze the v70 live report showed: a 130-190 s diagnoseLinks block),
  * Supply defaults to Continuous Fill and switching to Fixed amount flips massContinuous().
  * (v75) the pressure solver is the default with no query flag; right after Simulate the throat is shut (no flow), the chamber
    then fills and the throat opens (mdot > 0); particles held in the chamber while it is shut lie inside the cavity (GPU positions
    vs the chamber mesh); the demo fuel line's network edge runs through its fitted tube with a non-zero bore area.
Needs: pip install playwright; env CHROME=<chromium binary>, plus (offline boxes) ARC_THREE=<dir with three.module.js, jszip.min.js>,
ARC_JSM=<three/examples/jsm dir>, ARC_MODELS=<static/models dir>.  Without the ARC_* vars the real CDN / raw.githubusercontent URLs are used.
Usage: python3 headless-stall.py   (exit code 1 on failure)
"""
import asyncio, os, re, sys, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
HTML = os.environ.get('ARC_HTML', REPO + '/templates/arc-flow.html')
BAKE_LIMIT_S = float(os.environ.get('BAKE_LIMIT_S', 240)); FRAMES_LIMIT_S = float(os.environ.get('FRAMES_LIMIT_S', 60))
LONGTASK_LIMIT_MS = float(os.environ.get('LONGTASK_LIMIT_MS', 15000))
OBS = """()=>{window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([e.startTime,e.duration])}).observe({entryTypes:['longtask']})}catch(e){}}"""
async def main():
    fails = []
    async with async_playwright() as p:
        kw = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
        b = await p.chromium.launch(args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'], **kw)
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        http = []
        pg.on('response', lambda r: http.append((r.status, r.url)) if r.status >= 400 else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        T, J, M = os.environ.get('ARC_THREE'), os.environ.get('ARC_JSM'), os.environ.get('ARC_MODELS')
        async def route(r):
            u = r.request.url
            if u.startswith('file://'): return await r.continue_()
            if T and 'three.module.js' in u: return await r.fulfill(path=T + '/three.module.js', content_type='text/javascript', headers={'access-control-allow-origin': '*'})
            if T and 'jszip' in u: return await r.fulfill(path=T + '/jszip.min.js', content_type='text/javascript')
            m = re.search(r'static/models/([^?]+)$', u)
            if M and m: return await r.fulfill(path=M + '/' + m.group(1), headers={'access-control-allow-origin': '*'})
            if J and 'examples/jsm/' in u: return await r.fulfill(path=J + '/' + u.split('/jsm/')[1], content_type='text/javascript', headers={'access-control-allow-origin': '*'})
            if T or J or M: return await r.abort()
            return await r.continue_()
        await pg.route('**/*', route)
        await pg.goto('file://' + HTML)
        await pg.wait_for_function('window.arcFlow !== undefined', timeout=60000)
        await pg.evaluate(OBS)
        for _ in range(120):
            await pg.wait_for_timeout(2000)
            if await pg.evaluate('()=>window.arcFlow.state.parts.length>0 && document.getElementById("loadingOverlay").classList.contains("hidden")'): break
        mode = await pg.evaluate('()=>document.getElementById("supplyMode").value')
        if mode != 'continuous': fails.append('Supply default is %r, expected continuous' % mode)
        await pg.select_option('#supplyMode', 'fixed')
        if await pg.evaluate('()=>document.getElementById("continuousFlow").checked'): fails.append('Fixed amount did not clear the continuous flag')
        await pg.select_option('#supplyMode', 'continuous')
        await pg.click('#playBtn'); t0 = time.time(); tsim = None
        while time.time() - t0 < BAKE_LIMIT_S:
            await pg.wait_for_timeout(1000)
            if await pg.evaluate('()=>window.arcFlow.state.simRunning'): tsim = time.time() - t0; break
        if tsim is None: fails.append('simRunning not reached within %ss' % BAKE_LIMIT_S)
        else:
            sim_at = await pg.evaluate('()=>performance.now()')
            SNAP = "()=>{const s=window.arcFlowDebug.solverSnapshot(); if(!s) return null; const th=s.edges.filter(e=>e.kind==='throat'); return {mode:s.mode, t:s.t, open:th.some(e=>e.open), mdot:th.reduce((a,e)=>a+e.mdot,0), gate:s.gate, fuel:s.edges.filter(e=>e.pipes.some(n=>/fuel/i.test(n))).map(e=>[e.name,e.area_m2])}}"
            s0 = await pg.evaluate(SNAP)
            print('first snapshot', s0)
            if not s0 or s0['mode'] != 'pressure': fails.append('pressure solver is not the default: %r' % s0)
            elif s0['t'] < 0.02 and (s0['open'] or s0['mdot'] > 0): fails.append('throat flowing at t=%.4f: %r' % (s0['t'], s0))
            if s0 and not any(a > 0 for _, a in s0['fuel']): fails.append('no fuel-line edge with a bore area: %r' % s0['fuel'])
            holds = []
            for _ in range(12):
                h = await pg.evaluate('()=>window.arcFlowDebug.chamberHold()')
                if h and h['held']: holds.append(h)
                if (await pg.evaluate(SNAP))['open'] and holds: break
                await pg.wait_for_timeout(1500)
            print('chamber hold samples', holds[:3])
            for h in holds:
                if h['inside'] < 0.95 * h['held']: fails.append('held particles outside the chamber cavity: %r' % h)
            t1 = time.time()
            await pg.evaluate("()=>new Promise(r=>{let n=0;(function f(){if(++n>=60)r();else requestAnimationFrame(f)})()})")
            tf = time.time() - t1
            await pg.wait_for_timeout(15000)
            s1 = await pg.evaluate(SNAP); print('later snapshot', s1)
            if not (s1 and s1['open'] and s1['mdot'] > 0): fails.append('throat never opened / no flow after accumulation: %r' % s1)
            lt = await pg.evaluate('()=>window.__lt')
            post = [d for s, d in lt if s + d > sim_at - tsim * 0 and s >= sim_at - 50]
            print('bake+start %.1fs, 60 frames %.1fs, post-start longest task %.0f ms' % (tsim, tf, max(post or [0])))
            if tf > FRAMES_LIMIT_S: fails.append('60 frames took %.1fs (> %ss)' % (tf, FRAMES_LIMIT_S))
            if max(post or [0]) > LONGTASK_LIMIT_MS: fails.append('long main-thread task after sim start: %.0f ms (> %s)' % (max(post), LONGTASK_LIMIT_MS))
        bad = [h for h in http if 'favicon' in h[1]]
        if bad: fails.append('404s: %s' % bad)
        await b.close()
    if fails:
        print('FAIL\n  ' + '\n  '.join(fails)); sys.exit(1)
    print('headless-stall: ok')
asyncio.run(main())
