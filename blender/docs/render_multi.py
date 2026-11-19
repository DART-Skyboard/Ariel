"""Progress renders of the single / twin engine demos (Cycles CPU, 960x540, Points render path of the extension's own fluid objects).
blender --factory-startup -b --python blender/docs/render_multi.py -- <case>   case: single | twin | enhanced | failure"""
import math, os, sys, tempfile
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import arc_flow
arc_flow.register()
from arc_flow import runtime, systems
from arc_flow.core import systems as CS

case = sys.argv[sys.argv.index('--') + 1]
OUT = os.path.join(HERE, 'renders')
sc = bpy.context.scene
af = sc.arc_flow
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
af.cache_dir = tempfile.mkdtemp() + os.sep
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.compression = 90
sc.view_settings.view_transform = 'Standard'


def stage(center, dist, elev, azim, lens=40):
    w = bpy.data.worlds.new("studio"); w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.012, 0.014, 0.022, 1); bg.inputs[1].default_value = 1.0
    sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam)
    c = Vector(center)
    d = Vector((math.cos(elev) * math.sin(azim), -math.cos(elev) * math.cos(azim), math.sin(elev))) * dist
    cam.location = c + d
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    sc.camera = cam
    for nm, loc, en, col, sz in (("key", (c.x - 6, c.y - 9, c.z + 9), 2600, (1.0, 0.93, 0.85), 4.0), ("rim", (c.x + 9, c.y + 7, c.z + 5), 1800, (0.55, 0.7, 1.0), 4.0),
                                 ("fill", (c.x + 2, c.y - 12, c.z + 1), 600, (0.8, 0.85, 1.0), 6.0)):
        ld = bpy.data.lights.new(nm, 'AREA'); ld.energy = en; ld.color = col; ld.size = sz
        lo = bpy.data.objects.new(nm, ld); sc.collection.objects.link(lo); lo.location = loc
        lo.rotation_euler = (c - lo.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=80, location=(c.x, c.y, -3.55))
    fl = bpy.context.object; fl.name = "Studio_Floor"
    m = bpy.data.materials.new("floor"); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.03, 0.035, 0.045, 1); b.inputs['Roughness'].default_value = 0.35; b.inputs['Metallic'].default_value = 0.2
    fl.data.materials.append(m)


def glow(o, rgb, s=4.0):
    m = bpy.data.materials[o['af_look']]
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k in ('Emission Color', 'Emission'):
        if k in b.inputs:
            b.inputs[k].default_value = (*rgb, 1.0); break
    if 'Emission Strength' in b.inputs:
        b.inputs['Emission Strength'].default_value = s


def sim_to(last):
    sc.frame_start, sc.frame_end = 1, max(last + 2, 40)
    runtime.RT.scene_name = sc.name
    runtime.start(sc, record=False, play=False)
    for f in range(1, last + 1):
        sc.frame_set(f)
    runtime.stop(sc)


def finish(name, frame):
    af.xray = False
    runtime.apply_xray(sc)
    for fl in af.fluids:
        fl.render_mode = 'POINTS'
        fl.pt_scale = 0.5
    runtime.mark_dirty(); runtime.ensure_world(sc, force=False)
    sc.frame_set(frame)
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("wrote", sc.render.filepath, flush=True)


if case == 'single':
    bpy.ops.arcflow.demo()
    stage((-0.2, 1.6, 0.8), 15.0, 0.38, 0.35)
    sim_to(36)
    finish("multi_single_engine.png", 36)
elif case == 'twin':
    af.sys_variant = 'GOOD'
    bpy.ops.arcflow.demo_twin()
    stage((6.2, 1.5, 0.6), 26.0, 0.42, 0.25, lens=38)
    cf = bpy.data.objects['AF_Crossfeed']
    glow(cf, (1.0, 0.45, 0.05), 6.0)
    systems.on_build(sc)
    sc.frame_set(1)
    finish("multi_twin_layout.png", 1)
elif case == 'enhanced':
    af.sys_variant = 'GOOD'
    bpy.ops.arcflow.demo_twin()
    stage((6.2, 1.5, 0.6), 26.0, 0.42, 0.25, lens=38)
    glow(bpy.data.objects['AF_Crossfeed'], (1.0, 0.45, 0.05), 4.0)
    sim_to(44)
    finish("multi_twin_enhanced.png", 44)
elif case == 'failure':
    af.sys_variant = 'BAD'
    bpy.ops.arcflow.demo_twin()
    stage((6.2, 1.5, 0.6), 26.0, 0.42, 0.25, lens=38)
    glow(bpy.data.objects['AF_Crossfeed'], (1.0, 0.45, 0.05), 4.0)
    sim_to(31)
    finish("multi_twin_failure.png", 31)
