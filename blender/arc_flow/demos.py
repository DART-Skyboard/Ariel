"""Demo rigs built from Blender's own mesh primitives (bmesh cylinder / cone / UV sphere / cube, torus segments):
a cheap-looking rocket engine (two tanks, two pipes, chamber, nozzle) and the twin-engine crossfeed demo."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import runtime

PIPE_R, PIPE_T = 0.24, 0.045          # outer radius and wall of the feed lines (bore stays wide enough for the LOTBCBP field)
BORE = PIPE_R - PIPE_T


def _link(scene, o):
    ctx_col = bpy.context.collection or scene.collection
    ctx_col.objects.link(o)
    return o


def _obj(scene, name, bm, loc=(0, 0, 0), rot=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    o = bpy.data.objects.new(name, me)
    _link(scene, o)
    o.location = loc
    if rot is not None:
        o.rotation_euler = rot
    return o


def _shade(o, rgb, metal=0.9, rough=0.35):
    m = bpy.data.materials.new(o.name + "_mat")
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    if b is not None:
        b.inputs['Base Color'].default_value = (*rgb, 1.0)
        b.inputs['Metallic'].default_value = metal
        b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1.0)
    o.data.materials.append(m)
    o['af_look'] = m.name


def sphere(scene, name, r, loc, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=r)
    if tuple(scale) != (1, 1, 1):
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    return _obj(scene, name, bm, loc)


def tube_between(scene, name, p0, p1, r_out, wall, r_out1=None):
    """Open, thick-walled tube (cylinder / cone primitive without caps + Solidify) from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=24, radius1=r_out, radius2=(r_out if r_out1 is None else r_out1),
                          depth=L, calc_uvs=False)
    o = _obj(scene, name + "_src", bm, (p0 + p1) / 2, d.to_track_quat('Z', 'Y').to_euler())
    sol = o.modifiers.new("solid", 'SOLIDIFY')
    sol.thickness = wall
    sol.offset = -1.0
    deps = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(ev)
    me.name = name
    o.modifiers.remove(sol)
    old = o.data
    o.data = me
    bpy.data.meshes.remove(old)
    o.name = name
    return o


def torus(scene, name, major, minor, loc, rot=(0, 0, 0), segs=32, ring=10):
    bm = bmesh.new()
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            rr = major + minor * math.cos(b)
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b))))
        verts.append(row)
    for i in range(segs):
        for j in range(ring):
            a, b = verts[i][j], verts[i][(j + 1) % ring]
            c, d = verts[(i + 1) % segs][(j + 1) % ring], verts[(i + 1) % segs][j]
            bm.faces.new((a, d, c, b))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(scene, name, bm, loc, rot)


def _setup(o, role, **kw):
    p = o.arc_flow
    for k, v in kw.items():
        setattr(p, k, v)
    p.role = role
    o['af_part'] = True
    return o


def ensure_fluids(scene):
    from . import ops
    af = scene.arc_flow
    have = {f.preset for f in af.fluids}
    for key in ('RP1', 'LOX'):
        if key not in have:
            ops._add_fluid(scene, key)
    fu = next(f for f in af.fluids if f.preset == 'RP1').name
    ox = next(f for f in af.fluids if f.preset == 'LOX').name
    return fu, ox


def build_engine(scene, prefix, dx, p_tank, fu, ox, dy=0.0, tag=""):
    """One engine in the demo layout: fuel tank, oxidizer tank, two lines, chamber, nozzle, decorative torus flanges.
    Returns dict of the part objects."""
    n = lambda s: "AF_%s%s" % (prefix, s)
    P = {}
    o = sphere(scene, n("FuelTank"), 1.0, (dx - 3.5, dy, 1.2)); _shade(o, (0.62, 0.64, 0.68), 0.95, 0.3)
    P['FuelTank'] = _setup(o, 'CONTAINER', cavity_mode='SHELL', fluid=fu, pressure=p_tank, fill_percent=75.0, material='ALUMINUM', wall=0.004, particles=900)
    o = sphere(scene, n("OxTank"), 1.0, (dx + 2.2, dy + 4.0, 1.2)); _shade(o, (0.78, 0.8, 0.85), 0.95, 0.25)
    P['OxTank'] = _setup(o, 'CONTAINER', cavity_mode='SHELL', fluid=ox, pressure=p_tank, fill_percent=75.0, material='ALUMINUM', wall=0.004, particles=900)
    o = tube_between(scene, n("FuelLine"), (dx - 2.8, dy, 1.2), (dx + 1.6, dy, 1.2), PIPE_R, PIPE_T); _shade(o, (0.5, 0.52, 0.55), 0.9, 0.4)
    P['FuelLine'] = _setup(o, 'TRANSPORT', cavity_mode='SOLID', material='STAINLESS_STEEL', wall=0.005, resolution=64)
    o = tube_between(scene, n("OxLine"), (dx + 2.2, dy + 0.8, 1.2), (dx + 2.2, dy + 4.2, 1.2), PIPE_R, PIPE_T); _shade(o, (0.5, 0.52, 0.55), 0.9, 0.4)
    P['OxLine'] = _setup(o, 'TRANSPORT', cavity_mode='SOLID', material='STAINLESS_STEEL', wall=0.005, resolution=64)
    o = sphere(scene, n("Chamber"), 1.0, (dx + 2.2, dy, 1.2), scale=(1.0, 1.2, 1.0)); _shade(o, (0.55, 0.38, 0.3), 0.9, 0.35)
    P['Chamber'] = _setup(o, 'CHAMBER', cavity_mode='SHELL', material='INCONEL', wall=0.008)
    o = tube_between(scene, n("Nozzle"), (dx + 2.2, dy, -1.7), (dx + 2.2, dy, 1.3), 0.82, 0.05, r_out1=0.38); _shade(o, (0.72, 0.5, 0.25), 0.95, 0.3)
    P['Nozzle'] = _setup(o, 'CHAMBER', cavity_mode='SOLID', material='INCONEL', wall=0.004, resolution=64)
    P['Nozzle']['af_open_r'] = [0.33, 0.77]       # design throat / exit radii (the voxel estimate of a thin cone is coarse)
    for k, r in (('FuelLine', 0.12), ('OxLine', 0.12)):
        P[k]['af_r_eq'] = r
    P['Chamber']['af_r_eq'] = 1.0
    # decoration only (no role): flanges on the pipes and the chamber waist, nozzle exit lip
    fl = [torus(scene, n("FlangeA"), PIPE_R + 0.04, 0.05, (dx - 2.4, dy, 1.2), (0, math.pi / 2, 0)),
          torus(scene, n("FlangeB"), PIPE_R + 0.04, 0.05, (dx + 1.3, dy, 1.2), (0, math.pi / 2, 0)),
          torus(scene, n("FlangeC"), 0.95, 0.06, (dx + 2.2, dy, 1.2), (0, 0, 0)),
          torus(scene, n("NozzleLip"), 0.84, 0.05, (dx + 2.2, dy, -1.7), (0, 0, 0))]
    for f in fl:
        _shade(f, (0.35, 0.36, 0.4), 0.9, 0.4)
    return P


def _clear_rig(scene):
    for o in list(bpy.data.objects):
        if o.name.startswith('AF_') and (o.get('af_part') or o.name.startswith(('AF_Breach', 'AF_Crossfeed', 'AF_Flash')) or o.name.startswith(('AF_A_', 'AF_B_'))):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):          # decoration flanges
        if o.name.startswith('AF_') and 'Flange' in o.name or o.name.endswith('NozzleLip'):
            bpy.data.objects.remove(o, do_unlink=True)


def _finish(scene, msg):
    af = scene.arc_flow
    af.env.ground_auto = False
    af.env.ground_z = -3.5
    af.xray = True
    runtime.mark_dirty()
    from . import systems
    systems.ST.reset()
    systems.mark_dirty()
    return msg


def build_single(scene):
    fu, ox = ensure_fluids(scene)
    _clear_rig(scene)
    build_engine(scene, "", 0.0, 6.0e5, fu, ox)
    return _finish(scene, "Single engine demo added (two tanks, two pipes, chamber, nozzle). Press Build.")


# ----------------------------------------------------------------------------- twin engines + crossfeed
ENGINE_B_DX = 11.0
P_A, P_B = 20.0e5, 6.0e5            # engine A runs a high-pressure feed, engine B a low-pressure one
ORIFICE = {'GOOD': 0.0048, 'BAD': 0.02}      # metering: effective flow radius about 1.8 cm (good) / 3.7 cm (bad)


def _crossfeed_points(variant):
    if variant == 'GOOD':      # A oxidizer tank -> B chamber manifold
        return (2.6, 3.9, 1.7), (ENGINE_B_DX + 1.9, 0.4, 2.0)
    return (2.9, 0.0, 1.2), (7.0, 0.0, 1.2)      # A chamber -> B fuel tank


def build_crossfeed(scene, variant):
    old = bpy.data.objects.get("AF_Crossfeed")
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    p0, p1 = _crossfeed_points(variant)
    o = tube_between(scene, "AF_Crossfeed", p0, p1, 0.30, 0.04)
    _shade(o, (0.95, 0.55, 0.12), 0.8, 0.3)
    _setup(o, 'TRANSPORT', cavity_mode='SOLID', material='STAINLESS_STEEL', wall=0.005, resolution=96, sys_orifice=ORIFICE[variant])
    o['af_r_eq'] = 0.26
    o.hide_viewport = o.hide_render = not scene.arc_flow.sys_crossfeed
    if not scene.arc_flow.sys_crossfeed:
        o.arc_flow.role = 'NONE'
    return o


def build_twin(scene):
    af = scene.arc_flow
    fu, ox = ensure_fluids(scene)
    _clear_rig(scene)
    build_engine(scene, "A_", 0.0, P_A, fu, ox)
    build_engine(scene, "B_", ENGINE_B_DX, P_B, fu, ox)
    build_crossfeed(scene, af.sys_variant)
    af.env.ground_auto = False
    af.env.ground_z = -3.5
    af.xray = True
    runtime.mark_dirty()
    from . import systems
    systems.ST.reset()
    systems.mark_dirty()
    return "Twin engine demo added: engine A (20 bar feed) and engine B (6 bar feed) with a crossfeed pipe (%s variant)." % af.sys_variant


def apply_option(scene, what):
    """Variant / toggle of the twin demo changed."""
    af = scene.arc_flow
    cf = bpy.data.objects.get("AF_Crossfeed")
    if cf is None:
        return
    if what == 'variant':
        build_crossfeed(scene, af.sys_variant)
    else:
        cf.hide_viewport = cf.hide_render = not af.sys_crossfeed
        cf.arc_flow.role = 'TRANSPORT' if af.sys_crossfeed else 'NONE'
    runtime.mark_dirty()
    from . import systems
    systems.mark_dirty()
