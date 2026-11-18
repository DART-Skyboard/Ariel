"""Environment asset look: world colour / fog from the atmosphere, and a ground plane with a surface material.

Only appearance.  The physics (pressure, gravity, density, viscosity, expansion) is read straight from the Environment
settings by the solver; this module just makes the render match the chosen atmosphere."""
import bpy
from mathutils import Vector

from .core import atmosphere as ATM
from .nodeutil import Builder, enable_nodes, inp, out

WORLD_NAME = "AF_World"
GROUND_NAME = "AF_Ground"


def _look_for(env, scene):
    """(sky colour, fog density, ground colour or None) for the current environment."""
    key = env.preset if env.preset in ATM.PRESETS else 'EARTH'
    p = ATM.PRESETS[key]
    rho = env.density
    return p['sky'], ATM.fog_density(rho), p['ground']


def apply_world(scene, sky, fog):
    w = scene.world
    if w is None or not w.get('af_world'):
        # never rewrite a world the user built: the look lives in its own AF_World (the previous world stays in the file)
        w = bpy.data.worlds.get(WORLD_NAME) or bpy.data.worlds.new(WORLD_NAME)
        scene.world = w
    nt = enable_nodes(w)
    if nt is None:
        return None
    sky_n = nt.nodes.get('AF_Sky')
    if sky_n is None:
        nt.nodes.clear()
        b = Builder(nt)
        bg = b.node('ShaderNodeBackground', label="Atmosphere sky", y=100)
        bg.name = 'AF_Sky'
        fogn = b.node('ShaderNodeVolumeScatter', label="Atmosphere fog", y=-120)
        fogn.name = 'AF_Fog'
        o = b.node('ShaderNodeOutputWorld', y=0)
        b.link(out(bg, 'Background'), inp(o, 'Surface'))
        b.link(out(fogn, 'Volume'), inp(o, 'Volume'))
        sky_n = bg
    fog_n = nt.nodes['AF_Fog']
    sky_n.inputs['Color'].default_value = (sky[0], sky[1], sky[2], 1.0)
    sky_n.inputs['Strength'].default_value = 1.0
    fog_n.inputs['Color'].default_value = (0.5 * sky[0] + 0.5, 0.5 * sky[1] + 0.5, 0.5 * sky[2] + 0.5, 1.0)
    fog_n.inputs['Density'].default_value = float(fog)
    w['af_world'] = True
    return w


def _ground_material(color):
    m = bpy.data.materials.get("AF_GroundMat")
    if m is None:
        m = bpy.data.materials.new("AF_GroundMat")
    nt = enable_nodes(m)
    bsdf = nt.nodes.get('Principled BSDF') if nt else None
    if bsdf is None and nt is not None:
        nt.nodes.clear()
        b = Builder(nt)
        bsdf = b.node('ShaderNodeBsdfPrincipled', y=0)
        o = b.node('ShaderNodeOutputMaterial', y=0)
        b.link(out(bsdf, 'BSDF'), inp(o, 'Surface'))
    if bsdf is not None:
        bsdf.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs['Roughness'].default_value = 0.9
    m.diffuse_color = (color[0], color[1], color[2], 1.0)
    return m


def ground_height(scene):
    from .runtime import RT
    e = scene.arc_flow.env
    if not e.ground_auto:
        return e.ground_z
    if RT.world is not None:
        try:
            return float(RT.world._ground_default())
        except Exception:
            pass
    zs = []
    for o in scene.objects:
        if o.type == 'MESH' and o.arc_flow.role != 'NONE':
            zs.extend((o.matrix_world @ Vector(c)).z for c in o.bound_box)
    return min(zs) if zs else 0.0


def apply_ground(scene, color):
    col = bpy.data.collections.get("ArcFlow") or scene.collection
    o = bpy.data.objects.get(GROUND_NAME)
    if color is None:
        if o is not None:
            o.hide_viewport = True
            o.hide_render = True
        return None
    if o is None:
        me = bpy.data.meshes.new(GROUND_NAME)
        s = 100.0
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        me.update()
        o = bpy.data.objects.new(GROUND_NAME, me)
        if col.name not in scene.collection.children and col is not scene.collection:
            scene.collection.children.link(col)
        col.objects.link(o)
    o.hide_viewport = False
    o.hide_render = False
    o.location.z = ground_height(scene) - 1e-3
    m = _ground_material(color)
    if o.data.materials:
        o.data.materials[0] = m
    else:
        o.data.materials.append(m)
    o['af_ground'] = True
    return o


def apply_look(scene):
    """Apply the environment asset look according to the Environment toggles.  Returns a short report string."""
    e = scene.arc_flow.env
    sky, fog, ground = _look_for(e, scene)
    parts = []
    if e.look_world:
        apply_world(scene, sky, fog)
        parts.append("sky + fog %.4f/m" % fog)
    if e.look_ground:
        g = apply_ground(scene, ground)
        parts.append("ground plane" if g is not None else "no solid surface")
    return ", ".join(parts) or "nothing selected"
