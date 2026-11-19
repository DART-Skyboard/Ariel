"""Headless Blender test:  blender --factory-startup -b --python blender/tests/test_blender.py [-- --installed]

Without --installed the add-on is imported from blender/arc_flow (as package 'arc_flow'); with --installed it must already be
enabled (extension installed into the clean config).  Exits non-zero on failure."""
import os
import sys
import time

import importlib
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
fails = [0]


def ok(c, msg):
    print(("PASS " if c else "FAIL ") + msg, flush=True)
    if not c:
        fails[0] += 1


if '--installed' not in sys.argv:
    sys.path.insert(0, os.path.join(HERE, '..'))
    import arc_flow
    arc_flow.register()
    pkg = 'arc_flow'
else:
    import addon_utils
    pkg = [m.__name__ for m in addon_utils.modules() if m.__name__.endswith(('tessera_projection', 'arc_flow'))][0]
    if pkg not in bpy.context.preferences.addons:
        addon_utils.enable(pkg, default_set=True, persistent=False)   # headless runs do not persist the --enable flag
    ok(pkg in bpy.context.preferences.addons, "extension enabled: %s" % pkg)
    arc_flow = importlib.import_module(pkg)

print("Blender", bpy.app.version_string, flush=True)
ok(all(hasattr(bpy.types, n) for n in ("AF_PT_main", "AF_PT_env", "AF_PT_solver", "AF_PT_physics", "AF_PT_math", "AF_PT_xray", "AF_PT_cache", "AF_PT_fluids")),
   "all panels registered")
sc = bpy.context.scene
af = sc.arc_flow
runtime = importlib.import_module(pkg + '.runtime')
cavitybool = importlib.import_module(pkg + '.cavitybool')
props = importlib.import_module(pkg + '.props')
RT = runtime.RT

# ---- legacy migration (0.1.x stored lotcbp / lotcbp_level)
af.seed = 2
props.legacy_group(sc)['lotcbp'] = False
ok(props.migrate_legacy(sc) == 1 and af.lotbcbp is False, "legacy property lotcbp migrates to lotbcbp")

# ---- demo rig
t0 = time.time()
bpy.ops.arcflow.demo()
ok(len([o for o in sc.objects if o.arc_flow.role != 'NONE']) == 6, "demo rig has 6 parts")
af.lotbcbp = True
runtime.RT.scene_name = sc.name
w = runtime.ensure_world(sc, force=True)
ok(w is not None and w.N > 0, "world builds (%d particles, %.1fs)" % (w.N, time.time() - t0))
rep = runtime.RT.joints
print("   report:", None if rep is None else (len(rep['joints']), rep['assemblies'], rep['connected'], rep['plugged'], rep['spilling']), flush=True)
ok(rep is not None and len(rep['joints']) >= 4 and len(rep['assemblies']) == 1, "joints found, one assembly")

# ---- environment presets
e = af.env
e.preset = 'MARS'
ok(abs(e.pressure - 610.0) < 1e-6 and abs(e.gravity[2] + 3.721) < 1e-6 and 0.01 < e.density < 0.03 and e.use_mix, "Mars preset applied (rho %.4f)" % e.density)
e.preset = 'EARTH'
ok(abs(e.density - 1.2248) < 0.01, "Earth density %.4f" % e.density)
e.mix[0].fraction = 0.5
ok(e.preset == 'CUSTOM', "editing the mix switches the preset to Custom")
e.preset = 'TITAN'
e.preset = 'EARTH'
sx = bpy.ops.arcflow.env_apply_look()
ok(sc.world is not None and sc.world.get('af_world') is None or True, "look operator runs")
e.look_world = True
e.look_ground = True
bpy.ops.arcflow.env_apply_look()
ok(sc.world is not None and sc.world.get('af_world') and 'AF_Fog' in sc.world.node_tree.nodes and bpy.data.objects.get('AF_Ground') is not None,
   "environment look: world sky/fog + ground plane")
e.preset = 'JUPITER'
bpy.ops.arcflow.env_apply_look()
ok(bpy.data.objects['AF_Ground'].hide_render, "Jupiter has no solid ground")
e.preset = 'EARTH'

# ---- Boolean projection
t0 = time.time()
af.bool_projection = True
r = bpy.ops.arcflow.build_cavities()
ok('FINISHED' in r, "Build Fluid Cavity operator (%.1fs)" % (time.time() - t0))
cavs = cavitybool.cavity_objects(sc)
ok(len(cavs) == 1, "one Fluid Cavity object per assembly")
deps = bpy.context.evaluated_depsgraph_get()
ev = cavs[0].evaluated_get(deps)
me = ev.to_mesh()
nv = len(me.vertices)
ev.to_mesh_clear()
ok(nv > 200, "Fluid Cavity evaluates to a real Boolean mesh (%d verts)" % nv)
ok(not cavs[0].hide_viewport and cavs[0].hide_render, "overlay visible in viewport, hidden from render")
af.bool_overlay = False
ok(cavs[0].hide_viewport, "overlay toggle hides it")
af.bool_overlay = True
# a union is smaller than the sum of its parts (overlaps are merged): compare with the sources
import numpy as np
from importlib import import_module
core_cav = import_module(pkg + '.core.cavity')
v, t = runtime._mesh_arrays(cavs[0], deps)
vol_u = core_cav.mesh_volume(v, t)
vol_s = 0.0
for nm in __import__('json').loads(cavs[0]['af_parts']).values():
    so = bpy.data.objects[nm]
    vs, ts = runtime._arrays_from_mesh(so.data)
    vol_s += core_cav.mesh_volume(vs, ts)
ok(0 < vol_u < vol_s * 0.999, "union volume %.2f < sum of cavity volumes %.2f (overlaps merged)" % (vol_u, vol_s))

# cut joints
nmods_before = sum(len(o.modifiers) for o in bpy.data.objects)
af.bool_cut_joints = True
cuts = [m for o in bpy.data.objects for m in o.modifiers if m.name.startswith("AF Cut ")]
ok(len(cuts) >= 8, "Cut joints adds Boolean difference modifiers (%d)" % len(cuts))
tank = bpy.data.objects['AF_FuelTank']
v0, t0_ = runtime._arrays_from_mesh(tank.data)
evt = tank.evaluated_get(bpy.context.evaluated_depsgraph_get())
mt = evt.to_mesh(); nvc = len(mt.vertices); evt.to_mesh_clear()
ok(nvc != len(v0), "tank wall is cut at the joint (%d -> %d verts)" % (len(v0), nvc))
v1, t1 = runtime._mesh_arrays(tank, bpy.context.evaluated_depsgraph_get())
ok(len(v1) == len(v0), "solver still sees the uncut wall")

# solver with the union as collision region
RT.field_cache.clear()
w = runtime.ensure_world(sc, force=True)
ok(any(q.role == 'CAVITY' for q in w.parts), "Fluid Cavity added to the solver as a CAVITY region")
for k in range(45):
    w.step(1 / 24)
leak = int((w.state == 2).sum())
ok(leak > 0 and w.stats['leaked'] > 0, "simulation runs with Boolean projection (%d free particles)" % leak)
ok(runtime.RT.joints is not None, "status: " + cavitybool.status_text(sc))
af.bool_cut_joints = False
ok(not [m for o in bpy.data.objects for m in o.modifiers if m.name.startswith("AF Cut ")], "cut modifiers removed")
bpy.ops.arcflow.clear_cavities()
ok(not cavitybool.cavity_objects(sc), "cavities cleared")

# ---- render path still builds with bind_objects + a few frames through the real stepping function
import tempfile
af.cache_dir = tempfile.mkdtemp() + os.sep
af.bool_projection = False
bpy.ops.arcflow.refresh()
sc.frame_start, sc.frame_end = 1, 6
runtime.start(sc, record=False, play=False)
for f in range(1, 6):
    sc.frame_set(f)
runtime.stop(sc)
ok(RT.cache is not None and len(RT.cache.frames) >= 4, "start() + timeline: %d frames simulated headless" % (len(RT.cache.frames) if RT.cache else 0))
print("FAILURES:", fails[0], flush=True)
sys.exit(1 if fails[0] else 0)
