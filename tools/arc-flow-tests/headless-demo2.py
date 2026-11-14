#!/usr/bin/env python3
"""Headless software-WebGL Demo 2 playback test (no GPU): Chromium + SwiftShader.

Scenario A: page boots (Demo 1 tab), then the AJ-10C Quick button is pressed and NOTHING else:
  * no alert()/confirm() is raised (the unattended auto-start must never block on a dialog),
  * the demo builds and enters Simulate on its own (simRunning, button reads Stop) within BAKE_LIMIT_S,
  * the chamber has a nozzle, every tank's mass gate reads flowing (not "closed - no flow"),
  * baked particles are visible (not all hidden) and some have left through the nozzle plane, the exhaust plume is active,
  * points / volumetric / gaussian all render without a page error; fps per mode is printed (MIN_FPS gate, default 0:
    SwiftShader is a CPU rasteriser, so absolute fps here says nothing about a real low-end GPU),
  * the main-thread share of the background LTCBP watch stays small (LTCBP_SHARE_MAX, default 0.10).
Scenario B (SPAWN=1, default on): Clear Scene, then the AJ-10C "+" button on the empty scene also auto-plays.
Needs: pip install playwright; env CHROME=<chromium binary>. Static models are served from this checkout.
Usage: python3 headless-demo2.py   (exit code 1 on failure)
"""
import asyncio, os, re, sys, time, json
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
HTML = os.environ.get('ARC_HTML', REPO + '/templates/arc-flow.html'); MODELS = REPO + '/static/models'
BAKE_LIMIT_S = float(os.environ.get('BAKE_LIMIT_S', 300)); MIN_FPS = float(os.environ.get('MIN_FPS', 0))
LTCBP_SHARE_MAX = float(os.environ.get('LTCBP_SHARE_MAX', 0.10)); SPAWN = os.environ.get('SPAWN', '1') == '1'
# Count the time spent inside the Boolean/LTCBP interval (the watch that used to eat ~1/3 of the main thread on AJ-10C Quick).
INIT = """(()=>{const si=window.setInterval;window.__iv=[];window.setInterval=function(f,ms,...a){const r={src:String(f).slice(0,80),calls:0,tot:0};window.__iv.push(r);
const g=function(){r.calls++;const t=performance.now();try{return f.apply(this,arguments)}finally{r.tot+=performance.now()-t}};return si.call(window,g,ms,...a)}})()"""
FPS = "()=>new Promise(r=>{const t=performance.now();let n=0;(function g(){if(performance.now()-t>4000)r(n/((performance.now()-t)/1000));else{n++;requestAnimationFrame(g)}})()})"
CHECK = """()=>{const s=arcFlow.state, ch=s.parts.find(p=>p.type==='chamber'), noz=ch&&ch.openings.find(o=>o.role==='nozzle');
 const R=arcFlowDebug.readParticles(); let valid=0, below=0; if(R) for(let i=0;i<R.count;i++){const y=R.pos[3*i+1]; if(y>-500&&isFinite(y)){valid++; if(noz&&y<noz.centroid.y) below++;}}
 const cpu=s.particleCPU; let hidden=0; if(cpu) for(const v of cpu.liveArr) hidden+=v>0.5?1:0;
 return {run:s.simRunning, btn:document.getElementById('playBtn').textContent, nozzle:!!noz, count:R?R.count:0, valid, below, hidden,
  mass:(document.getElementById('massStatus')||{}).innerText||'', plume:!!arcFlow.plume.active,
  overlayHidden:document.getElementById('loadingOverlay').classList.contains('hidden')};}"""
async def wait_run(pg, t0):
    while time.time() - t0 < BAKE_LIMIT_S:
        await pg.wait_for_timeout(2000)
        if await pg.evaluate('()=>arcFlow.state.simRunning && arcFlow.state.parts.some(p=>p.name==="nomad_unskew")'): return time.time() - t0
    return None
async def scenario(pg, fails, label, dialogs, errors):
    st = await pg.evaluate(CHECK)
    print(label, json.dumps({k: v for k, v in st.items() if k != 'mass'}), '|', st['mass'].replace('\n', ' ; '))
    if not st['nozzle']: fails.append(label + ': chamber has no nozzle')
    if 'closed' in st['mass'] or 'flowing' not in st['mass']: fails.append(label + ': tanks not flowing: ' + st['mass'])
    if st['count'] == 0 or st['valid'] < 0.5 * st['count']: fails.append(label + ': baked fluid hidden (%d/%d visible)' % (st['valid'], st['count']))
    if st['below'] == 0: fails.append(label + ': no fluid leaves through the nozzle')
    if not st['plume']: fails.append(label + ': exhaust plume not active')
    if dialogs: fails.append(label + ': blocking dialogs raised: %s' % dialogs)
    if errors: fails.append(label + ': page errors: %s' % errors[:3])
async def main():
    fails = []
    async with async_playwright() as p:
        kw = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
        b = await p.chromium.launch(args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'], **kw)
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        dialogs, errors = [], []
        pg.on('dialog', lambda d: (dialogs.append(d.type + ': ' + d.message[:200]), asyncio.ensure_future(d.accept())))
        pg.on('pageerror', lambda e: errors.append(str(e)[:300]))
        async def route(r):
            u = r.request.url; m = re.search(r'static/models/([^?]+)$', u)
            if m and not u.startswith('file://'): return await r.fulfill(path=MODELS + '/' + m.group(1), headers={'access-control-allow-origin': '*'})
            return await r.continue_()
        await pg.route('**/*', route)
        await pg.add_init_script(INIT)
        await pg.goto('file://' + HTML)
        await pg.wait_for_function('window.arcFlow !== undefined', timeout=90000)
        await pg.wait_for_function('arcFlow.state.parts.length>0 && document.getElementById("loadingOverlay").classList.contains("hidden")', timeout=180000, polling=1000)
        # A: the AJ-10C Quick button alone (setTimeout: never let the test's own click wait on the page)
        await pg.evaluate("()=>{setTimeout(()=>document.getElementById('btnLoadDemo2').click(),0)}")
        t = await wait_run(pg, time.time())
        if t is None: fails.append('A: Demo 2 did not enter Simulate on its own within %ss' % BAKE_LIMIT_S)
        else:
            print('A: auto build+play reached simRunning in %.1fs' % t)
            await pg.wait_for_timeout(6000)
            iv0 = await pg.evaluate('()=>window.__iv.map(r=>r.tot)'); w0 = time.time()
            fps = {}
            for m in ['points', 'volumetric', 'gaussian']:
                await pg.evaluate('m=>arcFlow.setRenderMode(m)', m); await pg.wait_for_timeout(800)
                fps[m] = round(await pg.evaluate(FPS), 2)
                if fps[m] < MIN_FPS: fails.append('A: %s %.1f fps < %s' % (m, fps[m], MIN_FPS))
            iv1 = await pg.evaluate('()=>window.__iv.map(r=>r.tot)'); wall = (time.time() - w0) * 1000
            share = max([(b_ - a_) / wall for a_, b_ in zip(iv0, iv1)] or [0])
            print('A: fps', fps, '| worst interval main-thread share %.1f%%' % (100 * share))
            if share > LTCBP_SHARE_MAX: fails.append('A: background interval took %.0f%% of the main thread' % (100 * share))
            await pg.evaluate("()=>arcFlow.setRenderMode('volumetric')")
            await scenario(pg, fails, 'A', dialogs, errors)
        if SPAWN:
            dialogs.clear(); errors.clear()
            await pg.evaluate("()=>{document.getElementById('playBtn').click(); arcFlow.clearScene();}")
            await pg.wait_for_timeout(500)
            await pg.evaluate("()=>{setTimeout(()=>document.getElementById('btnAddDemo2').click(),0)}")
            t = await wait_run(pg, time.time())
            if t is None: fails.append('B: "+" on an empty scene did not auto-play within %ss' % BAKE_LIMIT_S)
            else:
                print('B: + spawn auto build+play reached simRunning in %.1fs' % t)
                await pg.wait_for_timeout(5000)
                await scenario(pg, fails, 'B', dialogs, errors)
        await b.close()
    if fails:
        print('FAIL\n  ' + '\n  '.join(fails)); sys.exit(1)
    print('headless-demo2: ok')
asyncio.run(main())
