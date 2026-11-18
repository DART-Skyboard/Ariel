"""Render before/after wireframes for the Quad Remesh docs (Cycles CPU).
blender -b --factory-startup --python blender/docs/render_retopo.py"""
import math, os, sys
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from arc_flow import retopo_ops as RO
from arc_flow.core import retopo as R

OUT = os.path.join(HERE, 'renders')


def setup():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'; sc.cycles.samples = 8; sc.cycles.use_denoising = False
    sc.render.resolution_x = 512; sc.render.resolution_y = 512
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.compression = 90
    w = bpy.data.worlds.new("w"); w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1); sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam)
    cam.location = (0, -5.2, 0.6); cam.rotation_euler = (math.radians(86), 0, 0); sc.camera = cam
    cam.data.lens = 70
    return sc


def shade(ob):
    m = bpy.data.materials.new("m"); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.75, 0.75, 0.78, 1)
    ob.data.materials.clear(); ob.data.materials.append(m)
    w = ob.modifiers.new("wire", 'WIREFRAME'); w.thickness = 0.006; w.use_replace = False; w.material_offset = 1
    wm = bpy.data.materials.new("wm"); wm.use_nodes = True
    wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.1, 0.45, 1)
    wm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
    ob.data.materials.append(wm)
    l = ob.modifiers.new("fl", 'WIREFRAME')  # placeholder removed below
    ob.modifiers.remove(l)


def render(ob, name):
    sc = bpy.context.scene
    for o in sc.objects:
        if o.type == 'MESH':
            o.hide_render = o is not ob
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = setup()
bpy.ops.mesh.primitive_monkey_add(size=2.6)
src = bpy.context.active_object
md = src.modifiers.new('s', 'SUBSURF'); md.levels = 1
bpy.ops.object.modifier_apply(modifier=md.name)
bm = bmesh.new(); bm.from_mesh(src.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(src.data); bm.free()
ca = math.radians(30)
out0, rep0 = RO.remesh_object(src, R.RemeshSettings(use_symmetry=True, crease_density=0.0, crease_angle=ca), suffix="_flat")
out1, rep1 = RO.remesh_object(src, R.RemeshSettings(use_symmetry=True, crease_density=10.0, relax_iterations=40, crease_angle=ca), suffix="_quad")
print(rep1["input"], rep1["output"])
for o in (src, out0, out1):
    shade(o)
    for p in o.data.polygons:
        p.use_smooth = False
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.8, 0.2, 0.6)
sc.collection.objects.link(sun)
render(src, "retopo_input_tris.png")
render(out0, "retopo_quad_uniform.png")
render(out1, "retopo_quad_crease_density.png")
