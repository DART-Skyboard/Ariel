"""Render parity check (Points / Ray-march / Splat x EEVEE / Cycles):
   blender-softwaregl -b --factory-startup --python blender/tests/render_check.py -- OUTDIR
   (env: AF_ENGINES=EEVEE,CYCLES  AF_MODES=POINTS,RAYMARCH,SPLAT  AF_FRAMES=30  AF_XRAY=0  AF_RM=voxel,density)
Each image must show the fluid (pixels that differ from a no-fluid reference render)."""
import os, sys
import bpy
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('AF_ROOT', os.path.join(HERE, '..')))
import arc_flow
arc_flow.register()
from arc_flow import runtime
from arc_flow.ops import _add_fluid
from arc_flow.core import primitives as PR

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/af_render'
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)


def mk(name, vt, loc):
    v, t = vt
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(v, float).tolist(), [], np.asarray(t, int).tolist())
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.location = loc
    return o


tank = mk("Tank", PR.uvsphere(r=1.0), (0, 0, 0))
pipe = mk("Pipe", PR.tube(L=4.0, r0=0.35, r1=0.25), (2.2, 0, 0))
_add_fluid(sc, 'WATER')
tank.arc_flow.role, tank.arc_flow.cavity_mode, tank.arc_flow.pressure, tank.arc_flow.particles = 'CONTAINER', 'SHELL', 5e5, 800
tank.arc_flow.fluid = sc.arc_flow.fluids[0].name
pipe.arc_flow.role, pipe.arc_flow.cavity_mode = 'TRANSPORT', 'SOLID'
sc.arc_flow.net_res = 32
sc.arc_flow.cache_dir = out + "/cache/"
runtime.RT.scene_name = sc.name
runtime.ensure_world(sc, force=True)
for f in range(1, int(os.environ.get('AF_FRAMES', '30')) + 1):
    sc.frame_set(f)
    runtime.sim_frame(sc, f)
runtime.apply_state(sc, runtime.RT.world)
cam_d = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_d); sc.collection.objects.link(cam)
cam.location = (3.0, -11.0, 2.5); cam.rotation_euler = (1.38, 0, 0.12)
sc.camera = cam
ld = bpy.data.lights.new("Sun", 'SUN'); ld.energy = 3.0
lo = bpy.data.objects.new("Sun", ld); sc.collection.objects.link(lo); lo.rotation_euler = (0.6, 0.2, 0.4)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 160, 90, 100
sc.cycles.samples = 8
sc.cycles.device = 'CPU'
try:
    sc.eevee.taa_render_samples = 4
except Exception:
    pass
fl = sc.arc_flow.fluids[0]
if os.environ.get('AF_XRAY') == '0':
    sc.arc_flow.xray = False
if os.environ.get('AF_RM'):
    fl.rm_voxel, fl.rm_density = map(float, os.environ['AF_RM'].split(','))
eevee = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'


def render(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:]).reshape(-1, 4)[:, :3]
    bpy.data.images.remove(img)
    return px


fails = []
ENGINES = [e for e in (eevee, 'CYCLES') if os.environ.get('AF_ENGINES', 'EEVEE,CYCLES').find('EEVEE' if 'EEVEE' in e else 'CYCLES') >= 0]
MODES = os.environ.get('AF_MODES', 'POINTS,RAYMARCH,SPLAT').split(',')
for engine in ENGINES:
    sc.render.engine = engine
    for mode in MODES:
        fl.render_mode = mode
        runtime.bind_objects(sc)
        runtime.apply_state(sc, runtime.RT.world)
        img = render(os.path.join(out, "%s_%s.png" % (engine, mode)))
        for o in (fl.points_obj, fl.volume_obj, fl.splat_obj):
            o.hide_render = True
        ref = render(os.path.join(out, "%s_%s_ref.png" % (engine, mode)))
        diff = float((np.abs(img - ref).max(1) > 0.02).mean())
        ok = diff > 0.002
        print(("PASS " if ok else "FAIL ") + "%s %s: fluid visible in %.2f%% of pixels" % (engine, mode, 100 * diff))
        if not ok:
            fails.append((engine, mode))
print("RENDER FAILURES:", len(fails))
sys.exit(1 if fails else 0)
