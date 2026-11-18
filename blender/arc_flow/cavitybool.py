"""LOTBCBP Boolean projection: build real Boolean results from the cavity-intersection logic.

Per assembly (parts whose cavities intersect, i.e. one continuous through-cavity) this creates a non-destructive
"Fluid Cavity" object: a Geometry Nodes modifier chains Mesh Boolean UNION nodes over live cavity-source objects, so the
union follows the parts when they move.  Cavity sources are children of the parts (an exact copy of a closed shell, or a
capped mesh rebuilt from the collision field for solid bodies / open shells).  The Fluid Cavity is shown as an overlay and,
with Boolean projection on, is added to the solver as an extra legal region whose surface receives the LOTBCBP tessellation
bricks.  "Cut joints" adds Boolean DIFFERENCE modifiers to the parts so the partner's cavity is cut out of each wall.

Nothing here hangs a Material pointer on a modifier input (that hung Blender 5.2): the overlay material is set by a Material
node inside the node group, and Boolean operands are plain object pointers.
"""
import json

import bpy
import numpy as np

from . import runtime, shading
from .core import cavity as CV
from .nodeutil import Builder, add_socket, fresh_group, inp, out

CAV_PREFIX = "AF_Cavity_"
SRC_PREFIX = "AF_CavSrc_"
CUT_PREFIX = "AF Cut "


# ----------------------------------------------------------------------------- queries
def cavity_objects(scene):
    return sorted((o for o in bpy.data.objects if o.get('af_fluid_cavity') and o.name in scene.objects), key=lambda o: o.name)


def status_text(scene):
    rep = runtime.RT.joints
    n = len(cavity_objects(scene))
    if rep is None:
        return "Build to analyse joints"
    return "%s | %d cavit%s" % (CV.summary(rep), n, "y" if n == 1 else "ies")


# ----------------------------------------------------------------------------- mesh helpers
def _set_mesh(me, v, t):
    me.clear_geometry()
    me.from_pydata(np.asarray(v, float).tolist(), [], np.asarray(t, int).tolist())
    me.update()


def _closed_shell(obj, part, deps):
    """(verts, tris) of the part's own mesh when it is a closed manifold shell, else None."""
    if part.field.mode != 'SHELL':
        return None
    v, t = runtime.mesh_without_cuts(obj, deps)
    return (v, t) if CV.is_closed_manifold(v, t) else None


def _source(scene, obj, part, detail, deps):
    """Create / refresh the cavity-source child of `obj`.  Returns (source object, closed_manifold flag)."""
    sh = _closed_shell(obj, part, deps)
    if sh is not None:
        v, t = sh
        manifold = True
        kind = 'EXACT_COPY'
    else:
        v, t = CV.cavity_mesh(part.field, detail)
        manifold = CV.is_closed_manifold(v, t)
        kind = 'FIELD'
    name = SRC_PREFIX + obj.name
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, bpy.data.meshes.new(name))
    _set_mesh(o.data, v, t)
    col = runtime._collection(scene)
    if o.name not in col.objects:
        col.objects.link(o)
    o.parent = obj
    o.matrix_parent_inverse.identity()
    o.matrix_basis.identity()
    o.display_type = 'WIRE'
    o.hide_render = True
    o.hide_select = True
    o['af_cavity_source'] = kind
    try:
        o.hide_set(True)
    except Exception:
        pass
    return o, manifold


def _union_group(k, sources, solver):
    ng = fresh_group("AF_CavityUnion_%d" % k)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', io='OUTPUT')
    b = Builder(ng)
    go = b.node('NodeGroupOutput', x=1800)
    acc = None
    for n, src in enumerate(sources):
        oi = b.node('GeometryNodeObjectInfo', label=src.name, x=-200, y=-260 * n)
        oi.transform_space = 'RELATIVE'
        inp(oi, 'Object').default_value = src
        g = out(oi, 'Geometry')
        if acc is None:
            acc = g
            continue
        bo = b.node('GeometryNodeMeshBoolean', label="Union", x=200 * n + 100, y=-260 * n)
        bo.operation = 'UNION'
        bo.solver = solver
        multi = inp(bo, 'Mesh')                    # UNION takes one multi-input socket
        b.link(acc, multi)
        b.link(g, multi)
        inp(bo, 'Self Intersection').default_value = True    # the operands overlap each other: that is the point
        acc = out(bo, 'Mesh')
    sm = b.node('GeometryNodeSetMaterial', label="Overlay", x=200 * len(sources) + 300, y=0)
    mn = b.node('GeometryNodeInputMaterial', label="Overlay material", x=200 * len(sources) + 100, y=-400)
    mn.name = 'AF_Material'
    mn.material = shading.cavity_material()
    b.link(acc, inp(sm, 'Geometry'))
    b.link(out(mn, 'Material'), inp(sm, 'Material'))
    b.link(out(sm, 'Geometry'), go.inputs[0])
    return ng


def _cavity_object(scene, k, group, parts, joints):
    name = "%s%d" % (CAV_PREFIX, k)
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, bpy.data.meshes.new(name))
    col = runtime._collection(scene)
    if o.name not in col.objects:
        col.objects.link(o)
    o.matrix_world.identity()
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    mod = o.modifiers.new("AF Cavity Union", 'NODES')
    mod.node_group = group
    o['af_fluid_cavity'] = 1
    o['af_parts'] = json.dumps(parts)
    o['af_joints'] = json.dumps(joints)
    p = o.arc_flow
    p.cavity_mode = 'SHELL'
    p.resolution = 48
    p.lotbcbp_level = 2
    p.role = 'NONE'
    o.display_type = 'SOLID'
    o.hide_render = True
    o.hide_select = False
    return o


# ----------------------------------------------------------------------------- build / clear
def clear_cavities(scene, keep_sources=False):
    remove_cuts(scene)
    for o in list(bpy.data.objects):
        if o.get('af_fluid_cavity') or (o.name.startswith(SRC_PREFIX) and not keep_sources):
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
    for ng in list(bpy.data.node_groups):
        if ng.name.startswith("AF_CavityUnion_") and ng.users == 0:
            bpy.data.node_groups.remove(ng)
    runtime.mark_dirty()


def build(scene, world=None):
    """Classify the joints of the current world and (re)build one Fluid Cavity per assembly.  Returns the report."""
    af = scene.arc_flow
    world = world or runtime.ensure_world(scene, force=True)
    rep = CV.classify(world)
    runtime.RT.joints = rep
    deps = bpy.context.evaluated_depsgraph_get()
    clear_cavities(scene)
    made = []
    for k, group in enumerate(rep['assemblies'], 1):
        objs = {i: bpy.data.objects[world.parts[i].name] for i in group}
        srcs, manifolds = {}, []
        for i in group:
            so, mf = _source(scene, objs[i], world.parts[i], af.bool_detail, deps)
            srcs[i] = so
            manifolds.append(mf)
        if af.bool_solver == 'AUTO':
            solver = 'MANIFOLD' if all(manifolds) else 'EXACT'
        else:
            solver = af.bool_solver
        ng = _union_group(k, [srcs[i] for i in group], solver)
        pnames = {objs[i].name: srcs[i].name for i in group}
        joints = [[objs[j['a']].name, objs[j['b']].name] for j in rep['joints'] if j['a'] in group and j['b'] in group]
        made.append(_cavity_object(scene, k, ng, pnames, joints))
    sync_visibility(scene)
    apply_cuts(scene)
    runtime.mark_dirty()
    return rep


def build_from_scene(scene):
    return build(scene, runtime.ensure_world(scene, force=True))


def sync_visibility(scene):
    af = scene.arc_flow
    show = bool(af.bool_projection and af.bool_overlay)
    for o in cavity_objects(scene):
        o.hide_viewport = not show
        o.hide_render = True
    for o in bpy.data.objects:
        if o.name.startswith(SRC_PREFIX):
            o.hide_render = True


def remove_cuts(scene):
    for o in bpy.data.objects:
        for m in list(o.modifiers):
            if m.name.startswith(CUT_PREFIX):
                o.modifiers.remove(m)


def apply_cuts(scene):
    """Add / remove the Boolean difference modifiers according to the 'Cut joints' option."""
    af = scene.arc_flow
    remove_cuts(scene)
    if not af.bool_cut_joints:
        return 0
    n = 0
    for cav in cavity_objects(scene):
        srcs = json.loads(cav.get('af_parts', '{}'))
        for a, b in json.loads(cav.get('af_joints', '[]')):
            for part, other in ((a, b), (b, a)):
                po, so = bpy.data.objects.get(part), bpy.data.objects.get(srcs.get(other, ""))
                if po is None or so is None or po.type != 'MESH':
                    continue
                m = po.modifiers.new(CUT_PREFIX + other, 'BOOLEAN')
                m.operation = 'DIFFERENCE'
                m.operand_type = 'OBJECT'
                m.object = so
                m.solver = 'EXACT'
                m.use_hole_tolerant = True
                n += 1
    return n
