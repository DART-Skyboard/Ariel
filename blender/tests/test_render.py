"""Headless Cycles-CPU render smoke test of the three render paths:
blender --factory-startup -b --python blender/tests/test_render.py"""
import os, sys, tempfile
import bpy
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import arc_flow
from arc_flow import runtime
arc_flow.register()
sc = bpy.context.scene
af = sc.arc_flow
bpy.ops.arcflow.demo()
af.cache_dir = tempfile.mkdtemp() + os.sep
sc.frame_start, sc.frame_end = 1, 8
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.location = (0, -16, 6); cam.rotation_euler = (1.2, 0, 0)
sc.camera = cam
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'; sc.cycles.samples = 4
sc.render.resolution_x = sc.render.resolution_y = 96
sc.render.resolution_percentage = 100
runtime.start(sc, record=False, play=False)
for f in range(1, 8):
    sc.frame_set(f)
runtime.stop(sc)
fails = 0
for mode in ('POINTS', 'RAYMARCH', 'SPLAT'):
    for fl in af.fluids:
        fl.render_mode = mode
    runtime.mark_dirty(); runtime.ensure_world(sc, force=True)
    sc.frame_set(7)
    sc.render.filepath = os.path.join(tempfile.mkdtemp(), "r.png")
    bpy.ops.render.render(write_still=True)
    ok = os.path.exists(sc.render.filepath) and os.path.getsize(sc.render.filepath) > 500
    print(("PASS " if ok else "FAIL ") + "Cycles CPU render, %s" % mode, flush=True)
    fails += not ok
print("FAILURES:", fails)
sys.exit(1 if fails else 0)
