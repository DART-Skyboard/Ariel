"""Quad Remesh (LOTBCBP) bpy tests.  Run:  blender -b --factory-startup --python blender/tests/test_retopo_bpy.py"""
import math, os, sys, time
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from arc_flow import retopo_ops as RO
from arc_flow.core import retopo as R

FAIL = 0


def ok(c, msg):
    global FAIL
    print(("PASS " if c else "FAIL ") + msg)
    if not c:
        FAIL += 1


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make(kind):
    reset()
    if kind == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=2)
        ob = bpy.context.active_object
        md = ob.modifiers.new('s', 'SUBSURF'); md.subdivision_type = 'SIMPLE'; md.levels = 3
    elif kind == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0)
        ob = bpy.context.active_object
    else:
        bpy.ops.mesh.primitive_monkey_add(size=2)
        ob = bpy.context.active_object
        md = ob.modifiers.new('s', 'SUBSURF'); md.levels = 2
    bpy.ops.object.modifier_apply(modifier=ob.modifiers[0].name) if ob.modifiers else None
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    return ob


def arrays(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    V, F = R.bm_arrays(bm)
    bm.free()
    return V, F


def hausdorff(ob_a, ob_b):
    """symmetric vertex-to-surface max distance (fraction of bbox diag)."""
    def bvh(o):
        bm = bmesh.new(); bm.from_mesh(o.data)
        t = BVHTree.FromBMesh(bm); return t, bm
    ta, ba = bvh(ob_a); tb, bb = bvh(ob_b)
    d = 0.0
    for v in ob_a.data.vertices:
        d = max(d, (tb.find_nearest(v.co)[0] - v.co).length)
    for v in ob_b.data.vertices:
        d = max(d, (ta.find_nearest(v.co)[0] - v.co).length)
    V, _ = arrays(ob_a)
    ba.free(); bb.free()
    return d / R._bbox_diag(V)


def run(ob, **kw):
    st = R.RemeshSettings(**kw)
    t = time.time()
    new, rep = RO.remesh_object(ob, st)
    return new, rep, time.time() - t


def test_odd_detect():
    reset()
    me = bpy.data.meshes.new("odd")
    vs = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (2, 0, 0), (2, 1, 0), (3, .5, 0), (3, 2, 0), (1.5, 2.5, 0)]
    fs = [(0, 1, 2, 3), (1, 4, 5, 2), (4, 6, 5), (3, 2, 5, 7, 8)]
    me.from_pydata(vs, [], fs)
    ob = bpy.data.objects.new("odd", me); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    RO.register()
    try:
        an = RO.analyse_object(ob, bpy.context.scene.arc_flow_retopo)
        ok(an.counts["tris"] == 1 and an.counts["odd_ngons"] == 1 and an.counts["quads"] == 2, "odd n-gon detection counts %s" % an.counts)
        sel = [p.select for p in ob.data.polygons]
        ok(sel == [False, False, True, True], "tri + pentagon selected %s" % sel)
        ok(ob.data.attributes["af_odd_face"].data[3].value and ob.data.attributes.get("af_crease") is not None and
           ob.vertex_groups.get("AF_Crease") is not None, "attributes + vertex group written")
        r = bpy.ops.arcflow.quad_analyse()
        ok('FINISHED' in r and "tri" in bpy.context.scene.arc_flow_retopo.report_text, "analyse operator")
    finally:
        RO.unregister()


def check_quad(rep, name, thr=0.98):
    o = rep["output"]
    ok(o["quad_ratio"] >= thr, "%s quad ratio %.3f (tris %d, odd ngons %d, faces %d)" % (name, o["quad_ratio"], o["tris"], o["odd_ngons"], o["faces"]))


def test_cube():
    ob = make('cube')
    n0 = len(ob.data.polygons)
    new, rep, t = run(ob, use_symmetry=False, crease_density=0.0)
    check_quad(rep, "cube(tri %d)" % n0)
    h = hausdorff(ob, new)
    ok(h < 0.005, "cube shape deviation %.5f" % h)
    # sharp edges survive: all verts of the cube lie on faces and corners kept
    V, _ = arrays(new)
    ok(np.abs(V).max() <= 1.0 + 1e-4 and np.isclose(np.abs(V).max(), 1.0, atol=1e-4), "cube corners preserved")
    print("   cube", t, "s", rep["method"], rep["after_join"])


def test_sphere_sym():
    ob = make('sphere')
    new, rep, t = run(ob, use_symmetry=True, axis='X', crease_density=0.0)
    check_quad(rep, "sphere sym")
    V, _ = arrays(new)
    mx, mn, fr = R.mirror_error(V, 0, 1e-4)
    d = R._bbox_diag(V)
    ok(mx / d < 1e-4, "sphere mirror error max %.2e (frac of diag)" % (mx / d))
    h = hausdorff(ob, new)
    ok(h < 0.02, "sphere Hausdorff %.5f" % h)
    # non-manifold check
    bm = bmesh.new(); bm.from_mesh(new.data)
    nm = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    ok(nm == 0, "sphere result is closed manifold (bad edges %d)" % nm)
    bm.free()
    print("   sphere", t, "s", rep["after_join"])
    for ax in 'YZ':
        new, rep, t = run(ob, use_symmetry=True, axis=ax, crease_density=0.0)
        V, _ = arrays(new)
        mx, _, _ = R.mirror_error(V, 'XYZ'.index(ax), 1e-4)
        ok(mx / R._bbox_diag(V) < 1e-4, "sphere mirror %s error %.2e" % (ax, mx / R._bbox_diag(V)))


def density(ob_src, new, crease_angle):
    Vs, Fs = arrays(ob_src)
    an = R.analyse(Vs, Fs, crease_angle, math.radians(50), 2)
    Vo, Fo = arrays(new)
    return R.face_density_probe(Vo, Fo, Vs, Fs, an.density_v), an


def test_suzanne():
    ob = make('monkey')
    ca = math.radians(30)
    new0, rep0, _ = run(ob, use_symmetry=True, axis='X', crease_density=0.0, crease_angle=ca)
    new1, rep1, t = run(ob, use_symmetry=True, axis='X', crease_density=10.0, crease_angle=ca, relax_iterations=40)
    check_quad(rep0, "suzanne base")
    check_quad(rep1, "suzanne crease")
    (b0, f0, r0), an = density(ob, new0, ca)
    (b1, f1, r1), _ = density(ob, new1, ca)
    print("   suzanne faces in/out", len(ob.data.polygons), len(new1.data.polygons), "time %.1fs" % t,
          "band/flat density ratio: no-crease %.2f, crease %.2f" % (r0, r1))
    ok(r1 > 1.25 * r0, "suzanne crease bands denser than flat (ratio %.2f vs %.2f baseline)" % (r1, r0))
    V, _ = arrays(new1)
    mx, _, _ = R.mirror_error(V, 0, 1e-4)
    ok(mx / R._bbox_diag(V) < 1e-4, "suzanne mirror error %.2e" % (mx / R._bbox_diag(V)))
    h = hausdorff(ob, new1)
    ok(h < 0.02, "suzanne Hausdorff %.5f" % h)
    ok(rep1["quality"]["max_deviation"] < 0.01, "suzanne reported max deviation %.5f" % rep1["quality"]["max_deviation"])
    bm = bmesh.new(); bm.from_mesh(new1.data)
    flipped = sum(1 for p in bm.faces if p.calc_area() < 1e-10)
    ok(flipped == 0, "no degenerate faces")
    bm.free()
    return ob, new1


def test_auto_projection():
    """Default (automatic) settings: symmetry axis + crease angle detected, deviation measured against the projection."""
    ob = make('monkey')
    new, rep, t = run(ob)                       # everything automatic
    q = rep["quality"]
    print("   auto:", rep["auto"], {k: (round(v, 5) if isinstance(v, float) else v) for k, v in q.items()}, "%.1fs" % t)
    sy = rep["symmetry"]
    ok(sy["enforced"] and sy["class"] in ("symmetric", "near-symmetric") and abs(sy["normal"][0]) > 0.999, "auto detects Suzanne X mirror plane (%s, conf %.2f)" % (sy["class"], sy["confidence"]))
    ok("crease_angle_deg" in rep["auto"], "auto crease angle %s" % rep["auto"].get("crease_angle_deg"))
    ok(rep["output"]["quad_ratio"] >= 0.98, "auto quad ratio %.3f" % rep["output"]["quad_ratio"])
    ok(q["max_deviation"] <= q["deviation_tol"], "auto deviation %.5f <= tol %.4f" % (q["max_deviation"], q["deviation_tol"]))
    ok(q["symmetry_error"] < 1e-4, "auto symmetry error %.2e" % q["symmetry_error"])
    ok(q["bad_quads"] <= 0.02 * rep["output"]["faces"], "bad quads %d" % q["bad_quads"])
    # mechanical-style part: torus with a hard-edged boss (non-organic), automatic
    reset()
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.3, major_segments=24, minor_segments=12)
    tor = bpy.context.active_object
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=0.8, location=(1.0, 0, 0), vertices=16)
    cyl = bpy.context.active_object
    bpy.ops.object.select_all(action='DESELECT'); tor.select_set(True); cyl.select_set(True)
    bpy.context.view_layer.objects.active = tor
    bpy.ops.object.join()
    bm = bmesh.new(); bm.from_mesh(tor.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(tor.data); bm.free()
    new, rep, t = run(tor)
    q = rep["quality"]
    ok(rep["output"]["quad_ratio"] >= 0.98, "mechanical part quad ratio %.3f" % rep["output"]["quad_ratio"])
    ok(q["max_deviation"] <= 0.01, "mechanical part deviation %.5f (tol %.4f, within=%s)" % (q["max_deviation"], q["deviation_tol"], q["within_tolerance"]))


def monkey_quads(sub=1):
    reset()
    bpy.ops.mesh.primitive_monkey_add(size=2)
    ob = bpy.context.active_object
    md = ob.modifiers.new('s', 'SUBSURF'); md.levels = sub
    bpy.ops.object.modifier_apply(modifier=md.name)
    return ob


def test_resolution():
    ob = monkey_quads(1)
    q0 = len(ob.data.polygons)
    print("   input quads", q0)
    for res in (0.25, 0.5, 1.0, 2.0):
        new, rep, t = run(ob, resolution=res)
        n = len(new.data.polygons)
        want = q0 * res
        ok(abs(n - want) / want <= 0.35, "resolution %.2f: %d faces (target %d, method %s, %.1fs)" % (res, n, want, rep["method"], t))
        ok(rep["predicted_faces"] in (None, int(round(want))), "predicted face count reported %s" % rep["predicted_faces"])
        ok(rep["output"]["quad_ratio"] >= 0.98 or rep["method"] == 'QUADRIFLOW', "res %.2f quad ratio %.3f" % (res, rep["output"]["quad_ratio"]))
    ok(RO.predicted_faces(ob, 0.5) == int(round(q0 * 0.5)), "UI prediction matches quad-equivalents x resolution")
    p = bpy.props.__dict__
    RO.register()
    try:
        s = bpy.context.scene.arc_flow_retopo
        s.resolution = 100.0 if False else 12.0
        try:
            s.resolution = 50.0
        except Exception:
            pass
        ok(s.resolution <= 12.0, "resolution capped at 12 (%.1f)" % s.resolution)
        s.resolution = 0.0
        ok(s.resolution >= 0.0099, "resolution minimum %.2f" % s.resolution)
    finally:
        RO.unregister()


def hausdorff_mesh(me_a, ob_b):
    bm = bmesh.new(); bm.from_mesh(ob_b.data); tb = BVHTree.FromBMesh(bm)
    d = max((tb.find_nearest(v.co)[0] - v.co).length for v in me_a.vertices)
    bm.free()
    return d


def test_modifier_stacks():
    results = {}
    stacks = {
        "mirror_top": [('MIRROR', {}), ('SUBSURF', {'levels': 1}), ('SOLIDIFY', {'thickness': 0.05})],
        "subsurf_mid": [('SOLIDIFY', {'thickness': 0.05}), ('SUBSURF', {'levels': 1}), ('MIRROR', {})],
        "solidify_bottom": [('SUBSURF', {'levels': 1}), ('MIRROR', {}), ('SOLIDIFY', {'thickness': 0.05})],
        "mixed": [('MIRROR', {}), ('SOLIDIFY', {'thickness': 0.04}), ('SUBSURF', {'levels': 1}), ('BEVEL', {'width': 0.01, 'segments': 1})],
    }
    for name, stack in stacks.items():
        reset()
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0)
        ob = bpy.context.active_object
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x < -1e-6], context='VERTS')
        bm.to_mesh(ob.data); bm.free()
        # materials, vertex group, shape key
        ob.data.materials.append(bpy.data.materials.new("m1"))
        vg = ob.vertex_groups.new(name="grp"); vg.add(list(range(len(ob.data.vertices))), 0.5, 'REPLACE')
        ob.shape_key_add(name="Basis"); k = ob.shape_key_add(name="Key1"); k.value = 0.3
        for v in k.data:
            v.co.z *= 1.1
        for typ, kw in stack:
            md = ob.modifiers.new(typ, typ)
            for a, b in kw.items():
                setattr(md, a, b)
        if stack[0][0] == 'MIRROR':
            ob.modifiers[0].use_axis[0] = True
        else:
            [setattr(m, 'use_axis', (True, False, False)) for m in ob.modifiers if m.type == 'MIRROR']
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        ref = bpy.data.meshes.new_from_object(ev)
        nmods = len(ob.modifiers)
        new, rep, t = run(ob, use_symmetry=False, crease_density=0.0)
        ok(len(ob.modifiers) == nmods, "%s: original stack untouched (%d modifiers)" % (name, nmods))
        ok(len(new.modifiers) == 0 and new is not ob, "%s: result has no modifiers" % name)
        ok(rep["output"]["quad_ratio"] >= 0.95, "%s quad ratio %.3f" % (name, rep["output"]["quad_ratio"]))
        diag = R._bbox_diag(np.array([v.co[:] for v in ref.vertices]))
        h = hausdorff_mesh(new.data, bpy.data.objects.new("r", ref))
        ok(h / diag < 0.01, "%s: result follows the evaluated mesh (dev %.5f of diag)" % (name, h / diag))
        ok(len(new.material_slots) == 1 and new.vertex_groups.get("grp") is not None, "%s: material + vertex group kept" % name)
        results[name] = (len(new.data.polygons), h / diag)
        # base mode ignores the stack
        newb, repb, _ = run_src(ob, 'BASE')
        ok(len(newb.data.polygons) != len(new.data.polygons) or name == "x", "%s: base mode differs from evaluated" % name)
    print("   stacks:", results)
    fc = [v[0] for v in results.values()]


def run_src(ob, mode):
    st = R.RemeshSettings(use_symmetry=False, crease_density=0.0)
    new, rep = RO.remesh_object(ob, st, apply_modifiers=(mode == 'EVALUATED'))
    return new, rep, 0


def test_recalc_normals_op():
    reset()
    import random
    random.seed(3)
    for kind in ('cube', 'sphere'):
        if kind == 'cube':
            bpy.ops.mesh.primitive_cube_add(size=2)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
        ob = bpy.context.active_object
        me = ob.data
        uv_before = [tuple(l.uv) for l in me.uv_layers.active.data]
        bm = bmesh.new(); bm.from_mesh(me)
        flipped = [f for f in bm.faces if random.random() < 0.5]
        bmesh.ops.reverse_faces(bm, faces=flipped)
        bm.to_mesh(me); bm.free()
        RO.register()
        try:
            bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
            bpy.ops.arcflow.recalc_normals_outside()
        finally:
            RO.unregister()
        me.update()
        out = all((p.normal.dot(p.center)) > 0 for p in me.polygons)
        ok(out, "%s: random flips -> all outward (%d flipped before)" % (kind, len(flipped)))
        ok(me.uv_layers.active is not None and len(me.uv_layers.active.data) == len(me.loops), "%s: UV layer survives the flip" % kind)
    # two components
    reset()
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0)); a = bpy.context.active_object
    bpy.ops.mesh.primitive_cube_add(size=2, location=(4, 0, 0)); b = bpy.context.active_object
    bpy.ops.object.select_all(action='DESELECT'); a.select_set(True); b.select_set(True)
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.join()
    me = a.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.reverse_faces(bm, faces=[f for f in bm.faces if f.calc_center_median().x > 2])   # second cube inside out
    bm.faces.ensure_lookup_table(); bmesh.ops.reverse_faces(bm, faces=[bm.faces[0]])
    bm.to_mesh(me); bm.free()
    info = RO.recalc_normals_mesh(me)
    me.update()
    cen = lambda p: p.center - (Vector((4, 0, 0)) if p.center.x > 2 else Vector((0, 0, 0)))
    ok(info["components"] == 2 and all(p.normal.dot(cen(p)) > 0 for p in me.polygons), "two components fixed independently: %s" % info)


def src_uv_at(bm_src, bvh, c):
    import mathutils
    hit = bvh.find_nearest(c)
    bm_src.faces.ensure_lookup_table()
    f = bm_src.faces[hit[2]]
    uvl = bm_src.loops.layers.uv.active
    w = mathutils.interpolate.poly_3d_calc([v.co for v in f.verts], hit[0])
    u = sum((l[uvl].uv * wi for l, wi in zip(f.loops, w)), Vector((0, 0)))
    return u


def uv_sphere_obj(udim=False):
    reset()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0)
    ob = bpy.context.active_object
    if udim:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            if f.calc_center_median().x > 0:
                for l in f.loops:
                    l[uvl].uv.x += 1.0
        bm.to_mesh(ob.data); bm.free()
    return ob


def check_uv(ob, new, tag, udim=False):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bvh = BVHTree.FromBMesh(bm)
    nm = new.data
    ok([l.name for l in nm.uv_layers][:len(ob.data.uv_layers)] == [l.name for l in ob.data.uv_layers], "%s: original UV map names/order kept %s" % (tag, [l.name for l in nm.uv_layers]))
    uv = nm.uv_layers[0].data
    bad = 0; span_bad = 0; straddle = 0
    for p in nm.polygons:
        us = [uv[i].uv.copy() for i in p.loop_indices]
        cen = sum((u for u in us), Vector((0, 0))) / len(us)
        ref = src_uv_at(bm, bvh, p.center)
        if (cen - ref).length > 0.08:
            bad += 1
        if max((a - b).length for a in us for b in us) > 0.5:
            span_bad += 1
        if udim and (min(u.x for u in us) < 1.0 < max(u.x for u in us)):
            straddle += 1
    n = len(nm.polygons)
    ok(bad <= 0.03 * n, "%s: UVs within tolerance of the source at %d/%d face centres" % (tag, n - bad, n))
    ok(span_bad == 0, "%s: no cross-seam stretched faces (%d)" % (tag, span_bad))
    if udim:
        xs = [uv[i].uv.x for i in range(len(uv))]
        ok(straddle == 0 and max(xs) > 1.5 and min(xs) < 0.5, "%s: UDIM tiles kept (u range %.2f..%.2f, tile-straddling faces %d)" % (tag, min(xs), max(xs), straddle))
    bm.free()


def test_uv_transfer():
    ob = uv_sphere_obj()
    for res in (1.0, 4.0, 8.0, 0.25):
        new, rep, t = run(ob, resolution=res, use_symmetry=False, crease_density=0.0)
        tr = rep["transfer"]
        print("   uv res %.2f: faces %d, method %s, %s, %.1fs" % (res, len(new.data.polygons), rep["method"], {k: tr[k] for k in ("uv_maps_found", "uv_maps_transferred", "uv_max_deviation")}, t))
        if tr.get("skipped"):
            print("   skipped:", tr["skipped"])
        ok(tr["uv_maps_found"] == 1 and tr["uv_maps_transferred"] == 1, "res %.2f: UV report found/transferred %s/%s" % (res, tr["uv_maps_found"], tr["uv_maps_transferred"]))
        check_uv(ob, new, "res %.2f" % res)
    # UDIM
    obu = uv_sphere_obj(udim=True)
    new, rep, t = run(obu, use_symmetry=False, crease_density=0.0)
    check_uv(obu, new, "udim", udim=True)
    # option (b): extra generated map
    ob = uv_sphere_obj()
    new, rep, t = run(ob, use_symmetry=False, crease_density=0.0, uv_mode='KEEP_NEW')
    names = [l.name for l in new.data.uv_layers]
    ok(names[0] == ob.data.uv_layers[0].name and "UVMap_Tessera" in names, "UV option (b): original kept + UVMap_Tessera %s" % names)
    new, rep, t = run(ob, use_symmetry=False, crease_density=0.0, uv_mode='SKIP')
    ok(len(new.data.uv_layers) == 0, "UV option (d): skipped")


def test_color_attributes():
    ob = uv_sphere_obj()
    me = ob.data
    ca = me.color_attributes.new("PaintF", 'FLOAT_COLOR', 'POINT')
    for i, v in enumerate(me.vertices):
        ca.data[i].color = (v.co.x * 0.5 + 0.5, v.co.y * 0.5 + 0.5, v.co.z * 0.5 + 0.5, 1.0)
    cb = me.color_attributes.new("PaintB", 'BYTE_COLOR', 'CORNER')
    for i, l in enumerate(me.loops):
        co = me.vertices[l.vertex_index].co
        cb.data[i].color = (co.z * 0.5 + 0.5, 0.2, 0.3, 1.0)
    me.color_attributes.active_color = me.color_attributes["PaintB"]
    gi = me.attributes.new("faceint", 'INT', 'FACE')
    for i in range(len(me.polygons)):
        gi.data[i].value = 7 if me.polygons[i].center.z > 0 else 3
    new, rep, t = run(ob, use_symmetry=False, crease_density=0.0, resolution=4.0)
    nm = new.data
    a = nm.attributes.get("PaintF"); b = nm.attributes.get("PaintB"); g = nm.attributes.get("faceint")
    ok(a is not None and a.data_type == 'FLOAT_COLOR' and a.domain == 'POINT', "FLOAT_COLOR point attribute transferred with name/type/domain")
    ok(b is not None and b.data_type == 'BYTE_COLOR' and b.domain == 'CORNER', "BYTE_COLOR corner attribute transferred with name/type/domain")
    ok(g is not None and g.domain == 'FACE' and set(x.value for x in g.data) <= {3, 7}, "int face attribute transferred by nearest (values %s)" % sorted(set(x.value for x in g.data)))
    err = max(abs(a.data[i].color[0] - (nm.vertices[i].co.x * 0.5 + 0.5)) for i in range(len(nm.vertices)))
    ok(err < 0.08, "point colour interpolated by projection (max error %.3f)" % err)
    ok(nm.color_attributes.active_color_name == "PaintB", "active colour attribute carried over (%s)" % nm.color_attributes.active_color_name)


def monkey_tri(sub=1):
    reset()
    bpy.ops.mesh.primitive_monkey_add(size=2)
    ob = bpy.context.active_object
    md = ob.modifiers.new('s', 'SUBSURF'); md.levels = sub
    bpy.ops.object.modifier_apply(modifier=md.name)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()
    return ob


def mirror_err_plane(ob, n, p):
    V = np.array([v.co[:] for v in ob.data.vertices])
    n = np.array(n) / np.linalg.norm(n)
    Q = V - 2.0 * ((V - np.array(p)) @ n)[:, None] * n[None, :]
    return float(R._kd_nearest(Q, V).max() / R._bbox_diag(V))


def test_symmetry_detection():
    import random
    from mathutils import Matrix
    base = monkey_tri(1)
    new0, rep0, _ = run(base)
    n0 = len(new0.data.polygons)
    ok(rep0["symmetry"]["enforced"], "untransformed: plane detected %s" % rep0["symmetry"]["class"])
    for seed in (1, 2):
        rnd = random.Random(seed)
        ax = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        ang = rnd.uniform(0.3, 3.0)
        sc = rnd.uniform(0.5, 3.0)
        tr = Vector((rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(-20, 20)))
        M = Matrix.Translation(tr) @ Matrix.Rotation(ang, 4, ax) @ Matrix.Scale(sc, 4)
        ob = monkey_tri(1)
        ob.data.transform(M)
        ob.data.update()
        new, rep, t = run(ob)
        sy = rep["symmetry"]
        true_n = (M.to_3x3() @ Vector((1, 0, 0))).normalized()
        true_p = M @ Vector((0, 0, 0))
        dn = abs(Vector(sy["normal"]).dot(true_n))
        dp = abs((Vector(sy["point"]) - true_p).dot(true_n))
        diag = R._bbox_diag(np.array([v.co[:] for v in ob.data.vertices]))
        ok(sy["enforced"] and dn > math.cos(math.radians(2.0)) and dp < 0.01 * diag,
           "seed %d (rot %.1f deg, scale %.2f, shift %.1f): plane found, normal dot %.5f, offset err %.5f of diag, %s, %.1fs" % (seed, math.degrees(ang), sc, tr.length, dn, dp / diag, sy["class"], t))
        e = mirror_err_plane(new, sy["normal"], sy["point"])
        ok(e < 3e-4, "seed %d: result topology symmetric about the detected plane (err %.2e of diag)" % (seed, e))
        n1 = len(new.data.polygons)
        ok(abs(n1 - n0) / n0 < 0.10, "seed %d: face count %d vs untransformed %d" % (seed, n1, n0))
        ok(rep["output"]["quad_ratio"] >= 0.98 and rep["quality"]["max_deviation"] < 0.01, "seed %d: quad ratio %.3f, deviation %.5f" % (seed, rep["output"]["quad_ratio"], rep["quality"]["max_deviation"]))


def test_asym_triangulation():
    ob = monkey_tri(1)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    rnd = __import__("random").Random(7)
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and rnd.random() < 0.35]
    bmesh.ops.rotate_edges(bm, edges=edges, use_ccw=False)
    bm.to_mesh(ob.data); bm.free()
    V = np.array([v.co[:] for v in ob.data.vertices])
    new, rep, t = run(ob)
    sy = rep["symmetry"]
    ok(sy["enforced"] and sy["class"] in ("symmetric", "near-symmetric"), "random diagonal flips: still detected %s (mean dev %.2e)" % (sy["class"], sy["mean_dev"]))
    e = mirror_err_plane(new, sy["normal"], sy["point"])
    ok(e < 3e-4 and rep["output"]["quad_ratio"] >= 0.98, "flipped-diagonal mesh becomes symmetric all-quad (err %.2e, quads %.3f)" % (e, rep["output"]["quad_ratio"]))


def test_asymmetric_not_forced():
    reset()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0)
    ob = bpy.context.active_object
    for v in ob.data.vertices:
        c = v.co
        v.co = c * (1.0 + 0.7 * math.sin(2.3 * c.x + 1.1 * c.y + 0.7) * math.cos(1.7 * c.z + 0.4 * c.x) + 0.6 * c.x * c.y + 0.3 * c.z * c.z * c.x)
    ob.data.update()
    new, rep, t = run(ob)
    sy = rep["symmetry"]
    print("   asymmetric:", sy["class"], "mean %.4f p95 %.4f" % (sy["mean_dev"], sy["p95_dev"]))
    ok(sy["class"] == "asymmetric" and not sy["enforced"], "asymmetric mesh reported as such and not mirrored")
    ok(rep["output"]["quad_ratio"] >= 0.98, "asymmetric mesh still remeshed to quads (%.3f)" % rep["output"]["quad_ratio"])


def run_fast(ob, **kw):
    from arc_flow import retopo_fast_ops as FO
    st = R.RemeshSettings(**kw)
    gen = FO.fast_stages(ob, st, evaluated=True)
    stages = []
    try:
        while True:
            stages.append(next(gen))
    except StopIteration as e:
        new, rep = e.value
    return new, rep, stages


def test_fast_path():
    ob = monkey_tri(2)                       # 15.7k tris, has the default Suzanne UV map
    vg = ob.vertex_groups.new(name="fastgrp")
    vg.add([i for i in range(len(ob.data.vertices)) if ob.data.vertices[i].co.z > 0], 0.75, 'REPLACE')
    ob.data.materials.append(bpy.data.materials.new("fm"))
    nf = len(ob.data.polygons)
    try:
        fs = ob.data.attributes.new(".sculpt_face_set", 'INT', 'FACE')
        fs.data.foreach_set("value", np.where(np.array([p.center.z for p in ob.data.polygons]) > 0, 5, 2).astype(np.int32))
        ce = ob.data.attributes.new("crease_edge", 'FLOAT', 'EDGE')
        ce.data.foreach_set("value", np.where(np.array([(ob.data.vertices[e.vertices[0]].co.z) for e in ob.data.edges]) > 0, 1.0, 0.0).astype(np.float32))
        have_extra = True
    except Exception as e:
        print("   (sculpt/crease attribute creation not possible:", e, ")")
        have_extra = False
    new, rep, stages = run_fast(ob)
    if have_extra:
        a = new.data.attributes.get(".sculpt_face_set"); b = new.data.attributes.get("crease_edge")
        ok(a is not None and set(x.value for x in a.data) <= {2, 5}, "fast: sculpt face sets transferred")
        ok(b is not None and max(x.value for x in b.data) > 0.5, "fast: crease weights (edge) transferred")
    ok(new is not None and rep["method"] == "PAIR", "fast PAIR: %d -> %d faces, %s, total %.2fs" % (nf, len(new.data.polygons), rep["method"], rep["timing"]["total"]))
    ok(rep["output"]["quad_ratio"] >= 0.90, "fast quad ratio %.3f" % rep["output"]["quad_ratio"])
    ok(len(stages) >= 6 and stages[0][0] == 0.0 and stages[-1][0] == 1.0, "progress stages reported (%d)" % len(stages))
    ok(rep["quality"]["max_deviation"] < 0.005, "fast deviation (sampled) %.5f" % rep["quality"]["max_deviation"])
    ok(rep["symmetry"].get("class") in ("symmetric", "near-symmetric"), "fast: mirror plane detected %s" % rep["symmetry"].get("class"))
    check_uv_fast = [l.name for l in new.data.uv_layers] == [l.name for l in ob.data.uv_layers]
    ok(check_uv_fast, "fast: UV names kept %s" % [l.name for l in new.data.uv_layers])
    # UVs are carried by loop index map: the UV at each new corner equals the UV of the source corner at the same vertex+face region
    bm = bmesh.new(); bm.from_mesh(ob.data); bvh = BVHTree.FromBMesh(bm)
    uv = new.data.uv_layers[0].data
    worst = 0.0
    for p in list(new.data.polygons)[::50]:
        cen = sum((uv[i].uv.copy() for i in p.loop_indices), Vector((0, 0))) / len(p.loop_indices)
        worst = max(worst, (cen - src_uv_at(bm, bvh, p.center)).length)
    bm.free()
    ok(worst < 0.08, "fast: UVs match the source at sampled face centres (max %.4f)" % worst)
    ok(len(new.material_slots) == 1 and new.data.polygons[0].material_index == 0, "fast: materials kept")
    w = [(i, g.weight) for i, v in enumerate(new.data.vertices) for g in v.groups if new.vertex_groups[g.group].name == "fastgrp"]
    ok(len(w) > 100 and all(abs(x[1] - 0.75) < 1e-4 for x in w), "fast: vertex group weights transferred (%d verts)" % len(w))
    # reduce mode: much lower resolution -> working mesh + accurate pipeline, projected onto the original
    new2, rep2, _ = run_fast(ob, resolution=0.2)
    n2 = len(new2.data.polygons) if new2 else 0
    ok(new2 is not None and rep2["method"].startswith("REDUCE") and 0.4 * 0.2 * nf / 2 <= n2 <= 4.0 * 0.2 * nf / 2,
       "fast REDUCE: %d tris -> %d faces (target ~%d), method %s, %.1fs" % (nf, n2, int(0.2 * nf / 2), rep2["method"], rep2["timing"]["total"]))
    q2 = rep2["quality"]
    ok(q2["max_deviation"] < 0.15 and q2["symmetry_error"] is not None and q2["symmetry_error"] < 1e-3, "REDUCE: deviation to ORIGINAL %.5f, symmetry error %.2e" % (q2["max_deviation"], q2["symmetry_error"]))
    # too large a target for the fast path is refused with a message
    new3, rep3, _ = run_fast(ob, resolution=3.0)
    ok(new3 is None and "error" in rep3, "fast: unsupported resolution refused clearly")
    # cancel: closing the generator mid-way is safe
    from arc_flow import retopo_fast_ops as FO
    g = FO.fast_stages(ob, R.RemeshSettings(), evaluated=True)
    next(g); next(g); g.close()
    ok(True, "generator cancel (close) is safe")
    # operator (execute path, synchronous) with the fast path forced on
    RO.register()
    try:
        s = bpy.context.scene.arc_flow_retopo
        s.fast_path = 'ON'
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        r = bpy.ops.arcflow.quad_remesh()
        ok('FINISHED' in r and "_quad" in bpy.context.active_object.name and "PAIR" in s.report_text, "operator runs the fast path: %s" % s.report_text[:110])
    finally:
        RO.unregister()


def test_fix_and_replace():
    ob = make('sphere')
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.duplicate(bm, geom=bm.faces[:3])   # doubled faces + loose-ish
    bm.verts.new((9, 9, 9))
    bm.to_mesh(ob.data); bm.free()
    RO.register()
    try:
        bpy.context.view_layer.objects.active = ob
        n = len(ob.data.vertices)
        bpy.ops.arcflow.quad_fix()
        ok(len(ob.data.vertices) < n, "quick fix removed loose/duplicate verts (%d -> %d)" % (n, len(ob.data.vertices)))
    finally:
        RO.unregister()
    new, rep, _ = run(ob, use_symmetry=False, crease_density=0.0)
    ok(new is not ob and new.name.endswith("_quad"), "non-destructive: new object %s" % new.name)
    new2, _ = RO.remesh_object(ob, R.RemeshSettings(crease_density=0.0), replace=True)
    ok(new2 is ob and all(len(p.vertices) == 4 for p in ob.data.polygons[:50]), "replace mode")


def test_quadriflow():
    ob = make('monkey')
    new, rep, t = run(ob, method='QUADRIFLOW', target_faces=800, use_symmetry=True, crease_density=0.0)
    print("   quadriflow:", rep.get("output"), rep.get("quadriflow_failed"), "%.1fs" % t)
    ok("output" in rep and rep["output"]["quad_ratio"] > 0.9, "quadriflow path produces quads (or falls back) ratio=%.3f" % rep["output"]["quad_ratio"])


if __name__ == "__main__":
    print("Blender", bpy.app.version_string)
    test_odd_detect()
    test_cube()
    test_sphere_sym()
    ob, new = test_suzanne()
    test_auto_projection()
    test_symmetry_detection()
    test_asym_triangulation()
    test_asymmetric_not_forced()
    test_uv_transfer()
    test_fast_path()
    test_color_attributes()
    test_resolution()
    test_modifier_stacks()
    test_recalc_normals_op()
    test_fix_and_replace()
    test_quadriflow()
    print("FAILURES:", FAIL)
    sys.exit(1 if FAIL else 0)
