"""Headless Blender test of systems, demos, interactive-physics detection:
blender --factory-startup -b --python blender/tests/test_systems_bpy.py"""
import os, sys, tempfile, time
import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import arc_flow
arc_flow.register()
from arc_flow import runtime, systems
from arc_flow.core import systems as CS

fails = [0]


def ok(c, msg):
    print(("PASS " if c else "FAIL ") + msg, flush=True)
    if not c:
        fails[0] += 1


print("Blender", bpy.app.version_string, flush=True)
sc = bpy.context.scene
af = sc.arc_flow
ST = systems.ST
af.cache_dir = tempfile.mkdtemp() + os.sep
sc.frame_start, sc.frame_end = 1, 90


def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    af.fluids.clear()
    ST.reset()
    runtime.RT.reset_all()
    runtime.RT.scene_name = sc.name


# ---------------- single engine: parts from primitives, one system, roles
reset_scene()
t0 = time.time()
bpy.ops.arcflow.demo()
parts = [o for o in sc.objects if o.arc_flow.role != 'NONE']
ok(len(parts) == 6, "single engine: 6 parts built from primitives")
ok(all(o.type == 'MESH' and len(o.data.vertices) > 20 for o in parts), "parts are real meshes")
det = systems.detect(sc)
ok(len(det['systems']) == 1 and not det['links'], "single engine: one system, no links (%.1fs)" % (time.time() - t0))
s = det['systems'][0]
ok(len(s['containers']) == 2 and len(s['fuel']) == 1 and len(s['oxid']) == 1 and len(s['transports']) == 2 and s['chambers'] and s['nozzles'], "roles: 2 tanks (fuel+ox), 2 lines, chamber, nozzle")
ok(not s['warnings'], "no warnings")
req = CS.requirements(ST.sim, s['id'])
ok(req['ok'] and req['Pc'] > 2e5 and req['thrust'] > 0 and 0.5 < req['MR'] < 5, "requirements: Pc %.1f bar, O/F %.2f, thrust %.0f kN" % (req['Pc'] / 1e5, req['MR'], req['thrust'] / 1e3))

# role detection from geometry alone (roles stripped)
saved = {o.name: o.arc_flow.role for o in parts}
for o in parts:
    o.arc_flow.role = 'NONE'
roles = systems.autoroles(sc, parts)
ok(all(roles[n] == saved[n] or (saved[n] == 'CHAMBER' and roles[n] == 'CHAMBER') for n in saved), "auto roles from geometry: %s" % roles)
for o in parts:
    o.arc_flow.role = saved[o.name]
systems.mark_dirty()

# status transitions through the timeline model (single engine)
systems.detect(sc)
hist = [systems.ensure_sim_to(sc, f)['S1']['status'] for f in (1, 6, 30, 60)]
ok(hist[0] == 'idle' and hist[-1] == 'running' and 'enhanced' not in hist and 'failed' not in hist, "single engine statuses %s" % hist)

# simulate a few real solver frames with the demo (particles + hooks)
sc.frame_start, sc.frame_end = 1, 8
runtime.start(sc, record=False, play=False)
for f in range(1, 7):
    sc.frame_set(f)
runtime.stop(sc)
ok(runtime.RT.cache is not None and len(runtime.RT.cache.frames) >= 5, "single engine: solver frames run with the systems hooks (%d)" % len(runtime.RT.cache.frames))
ok(any(n.startswith('AF_Breach_') for n in bpy.data.objects.keys()), "dormant breach emitters created on Build")

# ---------------- twin engines
for variant, want_b in (('GOOD', 'enhanced'), ('BAD', 'failed')):
    reset_scene()
    af.sys_variant = variant
    bpy.ops.arcflow.demo_twin()
    sc.frame_start, sc.frame_end = 1, 70
    t0 = time.time()
    systems.scan_context(sc)
    det = systems.detect(sc)
    ok(len(det['systems']) == 2 and [l['pipe'] for l in det['links']] == ['AF_Crossfeed'] and len(det['groups']) == 1,
       "%s: two systems detected and linked by AF_Crossfeed into one group (%.1fs)" % (variant, time.time() - t0))
    ok([s['name'] for s in det['systems']] == ["Engine A", "Engine B"] and all(len(s['parts']) == 6 for s in det['systems']), "%s: 6 parts per system, pipe in neither" % variant)
    st = [systems.ensure_sim_to(sc, f) for f in (1, 12, 30, 70)]
    seq = [x['S2']['status'] for x in st]
    ok(seq[0] == 'idle' and seq[-1] == want_b, "%s: engine B status %s" % (variant, seq))
    ok(st[-1]['S1']['status'] == 'running', "%s: engine A keeps running" % variant)
    if variant == 'BAD':
        ok('backflow' in st[-1]['S2']['reason'] or 'wall stress' in st[-1]['S2']['reason'], "BAD: reason: %s" % st[-1]['S2']['reason'][:90])
    # toggle off: crossfeed removed -> two independent systems, both just run
    af.sys_crossfeed = False
    det = systems.detect(sc)
    ok(len(det['systems']) == 2 and not det['links'] and len(det['groups']) == 2, "%s: crossfeed toggled off -> independent systems" % variant)
    ok(systems.ensure_sim_to(sc, 70)['S2']['status'] == 'running', "%s: toggled off -> engine B simply runs" % variant)
    af.sys_crossfeed = True
    # variant switch rebuilds the pipe
    other = 'BAD' if variant == 'GOOD' else 'GOOD'
    af.sys_variant = other
    det = systems.detect(sc)
    ok(len(det['links']) == 1, "%s -> %s: pipe rebuilt, still one link" % (variant, other))
    af.sys_variant = variant
    # real solver frames with rupture visuals
    systems.detect(sc)
    runtime.RT.scene_name = sc.name
    sc.frame_start, sc.frame_end = 1, 40
    t0 = time.time()
    runtime.start(sc, record=False, play=False)
    for f in range(1, 38):
        sc.frame_set(f)
    runtime.stop(sc)
    ok(len(runtime.RT.cache.frames) >= 30, "%s: solver ran %d frames (%.0fs)" % (variant, len(runtime.RT.cache.frames), time.time() - t0))
    if variant == 'BAD':
        ev = [e for f, e in ST.events]
        ok(any(e['part'] == 'AF_B_FuelTank' for e in ev), "BAD: rupture event at AF_B_FuelTank")
        d = ST.breach.get('AF_B_FuelTank')
        ok(d is not None and not d['disc'].hide_render and bpy.data.objects['AF_B_FuelTank'].get('af_failed') == 1.0, "BAD: wall marked failed, breach disc visible")
        w = runtime.RT.world
        k = [i for i, q in enumerate(w.parts) if q.name == 'AF_Breach_AF_B_FuelTank']
        sl = [s for s in w.sources if s['kind'] == 'E' and s['part'] in k]
        n_alive = int((w.state[sl[0]['lo']:sl[0]['hi']] > 0).sum()) if sl else 0
        ok(n_alive > 5, "BAD: fluid jets out of the breach (%d breach particles)" % n_alive)
        ok(ST.flash is not None and ST.flash.data.energy > 0, "BAD: flash light fired")
    else:
        ok(not ST.events, "GOOD: no rupture")
        ign = runtime.RT.world.p.ignition
        ok(ign == 1.0, "GOOD: enhanced -> full ignition drive")

# ---------------- interactive physics context
reset_scene()
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.0, depth=0.4, location=(0, 0, 0))
gear = bpy.context.object
gear.name = "Gear"
gear.rotation_euler = (0, 0, 0)
gear.keyframe_insert('rotation_euler', frame=1)
gear.rotation_euler = (0, 0, 6.28)
gear.keyframe_insert('rotation_euler', frame=60)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.6, location=(0, 0, 1.4))
asset = bpy.context.object
asset.name = "Tank"
asset.arc_flow.role = 'CONTAINER'
items = systems.scan_context(sc)
ok(any(i['reason'] == 'moving collision body' and 'Gear' in i['objects'] for i in items), "animated gear: reason 'moving collision body'")
ok(systems.ST.asset_status.get('Tank') == "auto-initialised: moving collision body", "asset status: %s" % systems.ST.asset_status.get('Tank'))
ok(gear.arc_flow.role == 'COLLIDER', "moving body auto-initialised as a collider")
# a far away animated object does not trigger
far = gear.copy(); far.data = gear.data.copy(); far.location = (40, 0, 0); sc.collection.objects.link(far)
far.animation_data_clear(); far.rotation_euler = (0, 0, 0); far.keyframe_insert('rotation_euler', frame=1); far.rotation_euler = (0, 0, 3); far.keyframe_insert('rotation_euler', frame=30)
far.arc_flow.role = 'NONE'
items = systems.scan_context(sc)
ok(not any('Gear.001' in i['objects'] or far.name in i['objects'] for i in items), "distant animated object is not related to the asset")

reset_scene()
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.6, location=(0, 0, 0))
t = bpy.context.object
t.arc_flow.role = 'CONTAINER'
ok(not systems.scan_context(sc), "plain scene: nothing detected")
af.env.preset = 'EARTH'
items = systems.scan_context(sc)
ok(len(items) == 1 and items[0]['reason'] == 'environment physics' and systems.ST.asset_status.get(t.name) == "auto-initialised: environment physics",
   "environment card only: reason 'environment physics'")
op = bpy.ops.arcflow.systems_detect()
ok('FINISHED' in op, "Re-detect operator runs")

print("FAILURES:", fails[0], flush=True)
sys.exit(1 if fails[0] else 0)
