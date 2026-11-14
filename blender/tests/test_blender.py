"""Blender background tests (4.2+):  blender -b --factory-startup --python blender/tests/test_blender.py
Convert to Quads (object / whole edit / patch), symmetry, GN prep + node groups, analysis, standalone LOTBCBP
projection, auto-setup, point source assign, render presets, feedback targets, animated valve bake."""
import os, sys, tempfile, traceback
import bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import arc_flow
arc_flow.register()
from arc_flow import runtime, gn
from arc_flow.core import primitives as PR

FAIL = []


def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c:
        FAIL.append(m)


def clear():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    runtime.RT.reset_all()


def mk(name, v, f, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(v, float).tolist(), [], [list(map(int, x)) for x in f])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    return o


def select_only(o):
    for x in bpy.context.scene.objects:
        x.select_set(x is o)
    bpy.context.view_layer.objects.active = o


def counts(me):
    s = [len(p.vertices) for p in me.polygons]
    return dict(tri=s.count(3), quad=s.count(4), ngon=sum(1 for x in s if x > 4), n=len(s))


def tri_sphere(name, loc=(0, 0, 0), seg=32, rings=16):
    v, t = PR.uvsphere(n=seg, m=rings)
    return mk(name, v, t, loc)


def test_quads():
    clear()
    o = tri_sphere("TriSphere")
    select_only(o)
    n0 = len(o.data.polygons)
    bpy.ops.arcflow.convert_to_quads()
    c = counts(o.data)
    ok(c['quad'] >= 0.85 * c['n'] and abs(c['n'] - n0 / 2) < 0.1 * n0, "Object Mode: triangulated sphere -> %d quads / %d faces (from %d tris; pole fans stay tris unless All quads)" % (c['quad'], c['n'], n0))
    # symmetry: face centres mirror onto each other across X
    cen = np.array([p.center[:] for p in o.data.polygons])
    mir = cen * np.array([-1, 1, 1])
    d = np.min(np.linalg.norm(cen[:, None] - mir[None], axis=2), axis=1)
    ok(np.percentile(d, 95) < 1e-4, "symmetric result across X (95th pct mirror error %.2e)" % np.percentile(d, 95))
    # n-gons + mixed + duplicate verts
    hexv = [[np.cos(a), np.sin(a), 0] for a in np.linspace(0, 2 * np.pi, 9)[:-1]]
    v = hexv + [[3, 0, 0], [3, 1, 0], [4, 0.5, 0], [3, 1, 1e-9]]
    f = [list(range(8)), [8, 9, 10], [8, 10, 11]]
    m = mk("Mixed", v, f, loc=(5, 0, 0))
    select_only(m)
    bpy.ops.arcflow.convert_to_quads()
    c = counts(m.data)
    ok(c['ngon'] == 0 and c['quad'] >= 3 and len(m.data.vertices) <= 11, "octagon + tris + duplicate vertex -> quads, duplicate merged (%s, %d verts)" % (c, len(m.data.vertices)))
    m2 = mk("Mixed2", v[:8], [list(range(8))], loc=(8, 0, 0))
    select_only(m2)
    bpy.ops.arcflow.convert_to_quads(all_quads=True)
    c = counts(m2.data)
    ok(c['quad'] == c['n'] and c['n'] > 0, "all-quads option leaves no triangle (%s)" % c)


def test_patch():
    clear()
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=12, y_subdivisions=12, size=4)
    o = bpy.context.object
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(o.data); bm.free()
    def key(p):
        return tuple(sorted(tuple(round(c, 6) for c in o.data.vertices[i].co) for i in p.vertices))
    inside = lambda p: p.center.x < 0 and p.center.y < 0
    outside0 = sorted(key(p) for p in o.data.polygons if not inside(p))
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bm = bmesh.from_edit_mesh(o.data)
    for e in bm.verts: e.select = False
    for e in bm.edges: e.select = False
    for f in bm.faces: f.select = False
    for f in bm.faces:
        c = f.calc_center_median()
        if c.x < 0 and c.y < 0:
            f.select_set(True)
    bm.select_flush_mode()
    bmesh.update_edit_mesh(o.data)
    bpy.ops.arcflow.convert_to_quads()
    bpy.ops.object.mode_set(mode='OBJECT')
    outside1 = sorted(key(p) for p in o.data.polygons if not inside(p))
    ins = [p for p in o.data.polygons if inside(p)]
    ok(outside0 == outside1, "Edit Mode patch: faces outside the selection unchanged (%d faces)" % len(outside1))
    ok(sum(1 for p in ins if len(p.vertices) == 4) >= 0.9 * len(ins) and len(ins) > 0, "Edit Mode patch: selected region became quads (%d/%d)" % (sum(1 for p in ins if len(p.vertices) == 4), len(ins)))
    bm = bmesh.new(); bm.from_mesh(o.data)
    nonman = [e for e in bm.edges if len(e.link_faces) > 2]
    ok(not nonman and len(bm.verts) == len(o.data.vertices), "patch border stitched (no non-manifold edges)")
    bm.free()
    # all faces selected in edit mode = whole mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.arcflow.convert_to_quads()
    bpy.ops.object.mode_set(mode='OBJECT')
    c = counts(o.data)
    ok(c['quad'] >= 0.95 * c['n'], "Edit Mode all selected -> whole mesh quads (%s)" % c)


def test_adaptive():
    clear()
    # dense patch (a tight feature) next to a coarse region: density ratio must survive
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=8, y_subdivisions=8, size=4)
    o = bpy.context.object
    bm = bmesh.new(); bm.from_mesh(o.data)
    dense = [f for f in bm.faces if f.calc_center_median().x > 1.0 and f.calc_center_median().y > 1.0]
    bmesh.ops.subdivide_edges(bm, edges=list({e for f in dense for e in f.edges}), cuts=3, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(o.data); bm.free()
    def area_stats():
        a_d = [p.area for p in o.data.polygons if p.center.x > 1.1 and p.center.y > 1.1]
        a_c = [p.area for p in o.data.polygons if p.center.x < -0.5 and p.center.y < -0.5]
        return np.median(a_c) / np.median(a_d)
    r0 = area_stats()
    select_only(o)
    bpy.ops.arcflow.convert_to_quads()
    r1 = area_stats()
    ok(r1 > 0.5 * r0 and r1 > 4, "adaptive: dense feature stays dense (coarse/dense face-area ratio %.1f -> %.1f)" % (r0, r1))


def test_gn_and_tools():
    clear()
    o = tri_sphere("GNSphere")
    select_only(o)
    ok(not gn.has_af_setup(o), "fresh mesh has no AF GN setup")
    bpy.ops.arcflow.prep_gn()
    ok(gn.has_af_setup(o), "Prep Geometry Nodes setup adds the AF LOTBCBP Prep node to a new GN modifier")
    mod = [m for m in o.modifiers if m.type == 'NODES'][0]
    deps = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(deps)
    ok(len(ev.data.polygons) > 0 and 'af_is_quad' in ev.data.attributes, "GN Prep chain evaluates (af_is_quad attribute written)")
    # existing user tree: node is dropped in, user tree kept
    o2 = tri_sphere("UserGN", loc=(3, 0, 0))
    m2 = o2.modifiers.new("User", 'NODES')
    t2 = bpy.data.node_groups.new("UserTree", 'GeometryNodeTree')
    t2.interface.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    t2.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = t2.nodes.new('NodeGroupInput'); go = t2.nodes.new('NodeGroupOutput')
    t2.links.new(gi.outputs[0], go.inputs[0])
    m2.node_group = t2
    select_only(o2)
    bpy.ops.arcflow.prep_gn()
    ok(m2.node_group is t2 and gn.find_af_node(t2) is not None and len(o2.modifiers) == 1, "Prep drops the node into the existing user GN tree")
    for g in gn.LOTBCBP_GROUPS:
        ok(gn.ensure_lotbcbp_group(g) is not None and len(bpy.data.node_groups[g].nodes) > 2, "node group %s built" % g)
    ok(hasattr(bpy.types, 'AF_MT_gn_add') and hasattr(bpy.types, 'AF_MT_gn_tools') and hasattr(bpy.types, 'AF_PT_node_tools'), "GN editor Add menu, header menu and N-panel registered")
    # analysis + standalone projection (no fluids, no Build)
    clear()
    s = tri_sphere("Solo", seg=12, rings=6)
    select_only(s)
    bpy.ops.arcflow.analyze()
    ok('af_analysis' in s, "Analyze Geometry stores a report")
    bpy.ops.arcflow.lotbcbp_project(resolution=16)
    p = bpy.data.objects.get("Solo_LOTBCBP")
    c = counts(p.data) if p else {}
    ok(p is not None and c['quad'] == c['n'] and c['n'] > len(s.data.polygons), "standalone LOTBCBP projection -> all-quad object (%s)" % c)
    ok(len(bpy.context.scene.arc_flow.fluids) == 0 and runtime.RT.world is None, "standalone tools ran with no fluids and no Build")


def test_auto_setup_and_render_ui():
    clear()
    tank = tri_sphere("Tank")
    tv, tt = PR.tube(L=4.0, r0=0.35, r1=0.25)
    pipe = mk("Pipe", tv, tt, loc=(2.2, 0, 0))
    for x in bpy.context.scene.objects:
        x.select_set(x in (tank, pipe))
    bpy.context.view_layer.objects.active = tank
    bpy.ops.arcflow.auto_setup()
    ok(tank.arc_flow.role == 'CONTAINER' and pipe.arc_flow.role == 'TRANSPORT', "auto-setup roles from cavities / name (%s, %s)" % (tank.arc_flow.role, pipe.arc_flow.role))
    w = runtime.RT.world
    st = sorted(o['state'] for o in w.openings) if w else []
    ok('CONNECTED' in st, "auto-setup detects the pipe/tank joint from the mesh intersection (%s)" % st)
    af = bpy.context.scene.arc_flow
    fl = af.fluids[0]
    bpy.ops.mesh.primitive_monkey_add(location=(0, 6, 0))
    src = bpy.context.object
    bpy.ops.arcflow.assign_point_source(index=0, target='POINTS')
    ok(fl.pt_object == src, "Assign Selected Mesh sets the point source")
    fl.pt_object = None
    fl.pt_subdivisions = 4
    runtime.bind_objects(bpy.context.scene)
    mr = fl.points_obj.modifiers.get("AF Render")
    ident = [i.identifier for i in mr.node_group.interface.items_tree if getattr(i, 'item_type', '') == 'SOCKET' and i.name == 'Subdivisions'][0]
    val = mr[ident] if ident in mr.keys() else None
    ok(val == 4, "pt_subdivisions is passed to the AF_Points modifier (%s)" % val)
    fl.rm_density = 3.0
    bpy.ops.arcflow.render_preset(index=0, preset='RAYMARCH')
    ok(fl.render_mode == 'RAYMARCH' and abs(fl.rm_density - 40.0) < 1e-6, "render preset switches mode and restores card defaults")
    bpy.ops.arcflow.render_preset(index=0, preset='POINTS')
    # feedback targets
    bpy.ops.curve.primitive_bezier_curve_add(location=(0, -5, 0))
    cu = bpy.context.object
    bpy.ops.arcflow.assign_feedback(target='OBJECT')
    ok(af.feedback_obj == cu and 'af_fb' in cu, "feedback -> curve object")
    gm = tri_sphere("FbGN", loc=(0, -8, 0), seg=8, rings=4)
    select_only(gm)
    gm.modifiers.new("Wave", 'WAVE')
    bpy.ops.arcflow.assign_feedback(target='MODIFIER')
    ok(gm.animation_data is not None and any('Wave' in d.data_path for d in gm.animation_data.drivers), "feedback -> modifier driver")
    bpy.ops.object.particle_system_add()
    bpy.ops.arcflow.assign_feedback(target='PARTICLES')
    ps = gm.particle_systems[0].settings
    ok(ps.animation_data is not None and len(ps.animation_data.drivers) == 1, "feedback -> particle system driver")
    bpy.ops.arcflow.assign_feedback(target='PHYSICS')
    ok(gm.field is not None and gm.field.type != 'NONE', "feedback -> force field")
    bpy.ops.arcflow.assign_feedback(target='GN')
    ok(gn.has_af_setup(gm) and any('AF LOTBCBP' in d.data_path or '["Socket' in d.data_path for d in gm.animation_data.drivers), "feedback -> Geometry Nodes input")


def test_animated_bake():
    clear()
    sc = bpy.context.scene
    tank = tri_sphere("Tank", seg=24, rings=12)
    tv, tt = PR.tube(L=4.0, r0=0.35, r1=0.25)
    pipe = mk("Pipe", tv, tt, loc=(2.2, 0, 0))
    vc, tc = PR.box(0.12, 0.9, 0.9, center=(4.28, 0, 0))
    valve = mk("Valve", vc, tc)
    from arc_flow.ops import _add_fluid
    _add_fluid(sc, 'WATER')
    for o, kw in ((tank, dict(role='CONTAINER', cavity_mode='SHELL', pressure=5e5, particles=600, resolution=32)),
                  (pipe, dict(role='TRANSPORT', cavity_mode='SOLID', resolution=48)), (valve, dict(role='COLLIDER', cavity_mode='SOLID', resolution=24))):
        for k, v in kw.items():
            setattr(o.arc_flow, k, v)
    tank.arc_flow.fluid = sc.arc_flow.fluids[0].name
    sc.arc_flow.net_res = 36
    # valve opens by SHAPE KEY (mesh deformation) between frames 8 and 10
    valve.shape_key_add(name="Basis")
    k = valve.shape_key_add(name="Open")
    for d in k.data:
        d.co.z += 1.4
    k.value = 0.0; k.keyframe_insert('value', frame=8)
    k.value = 1.0; k.keyframe_insert('value', frame=10)
    sc.frame_start, sc.frame_end = 1, 40
    sc.frame_set(1)
    tmp = tempfile.mkdtemp()
    sc.arc_flow.cache_dir = tmp + "/"
    runtime.RT.scene_name = sc.name
    calls = []
    orig = runtime.sim_frame
    runtime.bake(sc)
    w = runtime.RT.world
    st = sorted(o['state'] for o in w.openings)
    ok(st == ['CONNECTED', 'OPEN'], "bake walked frame_set: valve shape key opened the pipe mouth during bake (%s)" % st)
    snap5 = runtime.RT.cache.get(6); snap40 = runtime.RT.cache.get(40)
    f5 = int((snap5['state'] == 2).sum()); f40 = int((snap40['state'] == 2).sum())
    ok(f5 == 0 and f40 > 20, "closed during frames 1-7 (no leak: %d), flowing after the valve opened (%d free at frame 40)" % (f5, f40))
    ok(sc.frame_current == 1 and not runtime.RT.baking, "bake restores the frame and clears the baking guard")


for t in (test_quads, test_patch, test_adaptive, test_gn_and_tools, test_auto_setup_and_render_ui, test_animated_bake):
    try:
        t()
    except Exception:
        traceback.print_exc()
        FAIL.append(t.__name__ + " crashed")
print("BLENDER FAILURES:", len(FAIL))
for f in FAIL:
    print("  -", f)
arc_flow.unregister()
sys.exit(1 if FAIL else 0)
