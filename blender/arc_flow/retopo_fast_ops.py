"""Blender glue for the large-mesh fast path (core/retopo_fast.py).  Everything here is foreach_get/foreach_set +
NumPy; the only per-point Python loops are the small sampled BVH/KD queries used for detection and reporting.
`fast_stages` is a generator that yields (fraction, label) between stages so a modal operator can show progress and
honour Esc; its return value is (new_object, report)."""
import math
import resource
import time

import bmesh
import bpy
import mathutils
import numpy as np
from mathutils.bvhtree import BVHTree

from .core import retopo as R
from .core import retopo_fast as RF

ATTR_TYPES = {'FLOAT2': ('vector', 2, np.float32), 'FLOAT_VECTOR': ('vector', 3, np.float32),
              'FLOAT': ('value', 1, np.float32), 'INT': ('value', 1, np.int32), 'BOOLEAN': ('value', 1, np.bool_),
              'FLOAT_COLOR': ('color', 4, np.float32), 'BYTE_COLOR': ('color', 4, np.float32),
              'INT8': ('value', 1, np.int32), 'INT32_2D': ('value', 2, np.int32)}
SKIP_ATTRS = {'position', '.edge_verts', '.corner_vert', '.corner_edge'}
KEEP_DOTTED = {'.sculpt_face_set', '.sculpt_mask', '.uv_seam', '.hide_vert', '.hide_poly'}
FACE_ATTR_OK = True


def rss_mb():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0


def mesh_arrays(me):
    nv, nf, nl = len(me.vertices), len(me.polygons), len(me.loops)
    V = np.empty(nv * 3, dtype=np.float32); me.vertices.foreach_get("co", V)
    start = np.empty(nf, dtype=np.int32); me.polygons.foreach_get("loop_start", start)
    size = np.empty(nf, dtype=np.int32); me.polygons.foreach_get("loop_total", size)
    lv = np.empty(nl, dtype=np.int32); me.loops.foreach_get("vertex_index", lv)
    mat = np.empty(nf, dtype=np.int32); me.polygons.foreach_get("material_index", mat)
    return V.reshape(-1, 3), lv, start, size, mat


def bvh_for_mesh(me):
    """BVH of a Mesh datablock (C-speed build through a temporary object)."""
    ob = bpy.data.objects.new("_af_bvh", me)
    bpy.context.scene.collection.objects.link(ob)
    try:
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        return BVHTree.FromObject(ob, dg, epsilon=0.0)
    finally:
        bpy.context.scene.collection.objects.unlink(ob)
        bpy.data.objects.remove(ob)


def write_mesh(name, V, out_loops, out_size):
    me = bpy.data.meshes.new(name)
    nf = len(out_size)
    me.vertices.add(len(V)); me.vertices.foreach_set("co", np.ascontiguousarray(V, dtype=np.float32).ravel())
    me.loops.add(len(out_loops)); me.loops.foreach_set("vertex_index", out_loops.astype(np.int32))
    start = np.concatenate([[0], np.cumsum(out_size)[:-1]]).astype(np.int32)
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", start); me.polygons.foreach_set("loop_total", out_size.astype(np.int32))
    me.update(calc_edges=True)
    return me


def copy_attributes(src, dst, loop_src, face_src, report):
    """Carry attributes over by index maps (point: same index; corner: loop_src; face: face_src; edge: vertex-pair key)."""
    nsv = len(src.vertices)
    skey = sval = None
    ek_src = np.empty(len(src.edges) * 2, dtype=np.int32); src.edges.foreach_get("vertices", ek_src)
    ek_src = ek_src.reshape(-1, 2)
    skey = np.minimum(ek_src[:, 0], ek_src[:, 1]).astype(np.int64) * (nsv + 1) + np.maximum(ek_src[:, 0], ek_src[:, 1])
    order = np.argsort(skey)
    ek_dst = np.empty(len(dst.edges) * 2, dtype=np.int32); dst.edges.foreach_get("vertices", ek_dst)
    ek_dst = ek_dst.reshape(-1, 2)
    dkey = np.minimum(ek_dst[:, 0], ek_dst[:, 1]).astype(np.int64) * (nsv + 1) + np.maximum(ek_dst[:, 0], ek_dst[:, 1])
    pos = np.minimum(np.searchsorted(skey[order], dkey), len(skey) - 1)
    emap = order[pos]
    ehit = skey[emap] == dkey
    done, skipped = [], []
    for a in src.attributes:
        n = a.name
        if n in SKIP_ATTRS or (n.startswith('.') and n not in KEEP_DOTTED):
            continue
        if a.data_type not in ATTR_TYPES or a.domain not in ('POINT', 'EDGE', 'FACE', 'CORNER'):
            skipped.append(n + " (" + a.data_type + "/" + a.domain + ")")
            continue
        try:
            key, comp, dt = ATTR_TYPES[a.data_type]
            cnt = len(a.data)
            buf = np.empty(cnt * comp, dtype=dt)
            a.data.foreach_get(key, buf)
            buf = buf.reshape(cnt, comp)
            if a.domain == 'POINT':
                out = buf
            elif a.domain == 'FACE':
                out = buf[face_src]
            elif a.domain == 'CORNER':
                out = buf[loop_src]
            else:
                out = np.where(ehit[:, None], buf[emap], np.zeros_like(buf[:1]))
            d = dst.attributes.get(n) or dst.attributes.new(n, a.data_type, a.domain)
            d.data.foreach_set(key, np.ascontiguousarray(out, dtype=dt).ravel())
            done.append(n)
        except Exception as e:
            skipped.append("%s (%s)" % (n, e))
    report["attributes_transferred"] = done
    if skipped:
        report["attributes_skipped"] = skipped


def transfer_vertex_groups(src_obj_or_none, src_me, new_obj, report):
    """Vertex-group weights: vertex indices are unchanged in PAIR mode, so a nearest-vertex DataTransfer is exact."""
    try:
        if src_obj_or_none is None or not src_obj_or_none.vertex_groups:
            return
        for g in src_obj_or_none.vertex_groups:
            new_obj.vertex_groups.new(name=g.name)
        md = new_obj.modifiers.new("af_dt", 'DATA_TRANSFER')
        md.object = src_obj_or_none
        md.use_vert_data = True
        md.data_types_verts = {'VGROUP_WEIGHTS'}
        md.vert_mapping = 'NEAREST'
        md.layers_vgroup_select_src = 'ALL'
        md.layers_vgroup_select_dst = 'NAME'
        bpy.context.view_layer.objects.active = new_obj
        with bpy.context.temp_override(object=new_obj, active_object=new_obj):
            bpy.ops.object.modifier_apply(modifier=md.name)
        report["vertex_groups"] = [g.name for g in new_obj.vertex_groups]
    except Exception as e:
        report.setdefault("attributes_skipped", []).append("vertex groups (%s)" % e)


def sample_deviation(out_me, src_bvh, src_V, plane, diag, n=20000):
    """Sampled deviation (both directions) and mirror error about the detected plane; returns dict."""
    Vo = np.empty(len(out_me.vertices) * 3, dtype=np.float32); out_me.vertices.foreach_get("co", Vo); Vo = Vo.reshape(-1, 3)
    out_bvh = bvh_for_mesh(out_me)
    so = Vo[:: max(1, len(Vo) // n)]
    d1 = max((src_bvh.find_nearest(mathutils.Vector(p.tolist()))[3] for p in so), default=0.0)
    ss = src_V[:: max(1, len(src_V) // n)]
    d2 = max((out_bvh.find_nearest(mathutils.Vector(p.tolist()))[3] for p in ss), default=0.0)
    sym = None
    if plane is not None:
        nn = np.array(plane[0]); pp = np.array(plane[1])
        Q = so - 2.0 * ((so - pp) @ nn)[:, None] * nn[None, :]
        sym = max((out_bvh.find_nearest(mathutils.Vector(q.tolist()))[3] for q in Q), default=0.0) / diag
    return {"max_deviation": float(max(d1, d2) / diag), "symmetry_error": sym, "sampled": True,
            "samples": int(len(so) + len(ss))}


def detect_plane_fast(V, loops, start, size, diag):
    """Mirror-plane detection on a sampled subset: nearest-sample distance through a mathutils KDTree."""
    nrm, area, cen = R.face_geometry(V, loops, start, size)
    P = np.concatenate([V, cen])
    stride = max(1, len(P) // 250000)
    dense = P[::stride]
    kd = mathutils.kdtree.KDTree(len(dense))
    for i, p in enumerate(dense):
        kd.insert(p.tolist(), i)
    kd.balance()
    # nearest-sample distance over-estimates distance to the surface by up to the sample spacing: floor it
    spacing = float(np.sqrt(max(area.sum(), 1e-300) / max(len(dense), 1)))

    def dist_fn(Q):
        return np.array([max(kd.find(q.tolist())[2] - 0.5 * spacing, 0.0) for q in Q])
    samples = P[:: max(1, len(P) // 1500)]
    c = (cen * area[:, None]).sum(0) / max(area.sum(), 1e-300)
    return R.detect_symmetry(samples, c, dist_fn, diag)


def fast_stages(obj, st, evaluated=True, mode="AUTO", target_reduce_max=300000):
    """Generator: yields (fraction, label); returns (new_object, report)."""
    T = {}
    rep = {"fast_path": True, "timing": T}
    t0 = time.time(); tl = [t0]

    def lap(name):
        now = time.time(); T[name] = round(now - tl[0], 3); tl[0] = now
    yield 0.0, "Reading mesh"
    dg = bpy.context.evaluated_depsgraph_get()
    if evaluated:
        src_me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
        own = True
    else:
        src_me, own = obj.data, False
    V32, lv32, st32, sz32, mat = mesh_arrays(src_me)
    V = V32.astype(np.float64); loops = lv32.astype(np.int64); start = st32.astype(np.int64); size = sz32.astype(np.int64)
    nf = len(size)
    diag = R._bbox_diag(V32)
    base = float(((size - 2) / 2.0).sum())
    res = min(max(float(st.resolution), 0.01), 12.0)
    target = st.target_faces if st.target_faces > 0 else int(round(res * base))
    rep["input"] = R.count_report(size); rep["base_faces"] = base; rep["predicted_faces"] = target
    lap("read")
    yield 0.08, "Normals outside"
    flipped = 0
    if st.recalc_before:
        flip, ninfo = R.orient_outward(V, loops, start, size)
        flipped = int(flip.sum())
        rep["normals_before"] = ninfo
        if flipped:
            perm = R.flip_packed(loops, start, size, flip)
            loops = loops[perm]
        else:
            perm = np.arange(len(loops))
    else:
        perm = np.arange(len(loops))
    lap("normals")
    yield 0.16, "Analysis (curvature, Arc Edge scale, creases)"
    an = R.analyse_packed(V, loops, start, size, st.crease_angle or math.radians(25.0), st.sharp_angle, st.band_rings,
                          threshold_mode=st.threshold_mode, manual_threshold=st.manual_threshold, per_region=False)
    rep["analysis"] = {"counts": an.counts, "oversize_faces": an.info["oversize_faces"]}
    lap("analysis")
    plane = None
    sym_rep = {"mode": "OFF" if st.use_symmetry is False else ("AXIS" if st.use_symmetry else "AUTO")}
    if st.use_symmetry is not False:
        yield 0.35, "Symmetry plane (sampled)"
        det = detect_plane_fast(V, loops, start, size, diag)
        sym_rep.update({"class": det["cls"], "confidence": det["confidence"], "mean_dev": det["mean"], "p95_dev": det["p95"],
                        "normal": tuple(float(x) for x in det["normal"]), "point": tuple(float(x) for x in det["point"]),
                        "enforced": False,
                        "note": "fast path: plane detected on a sample; topology is symmetric only if the source triangulation is"})
        if det["cls"] != "asymmetric":
            plane = (det["normal"], det["point"])
    rep["symmetry"] = sym_rep
    lap("symmetry")
    new_me = None
    if abs(res - 1.0) <= 0.12:
        rep["method"] = "PAIR"
        yield 0.45, "Pairing triangles into quads"
        cuvs = []
        if st.uv_mode != "SKIP":
            for a in src_me.attributes:
                if a.domain == 'CORNER' and a.data_type == 'FLOAT2' and not a.name.startswith('.'):
                    u = np.empty(len(a.data) * 2, dtype=np.float32); a.data.foreach_get("vector", u)
                    cuvs.append(u.reshape(-1, 2)[perm])           # in the (possibly flipped) loop order
        pr = RF.pair_triangles(V, loops, start, size, an, st.join_angle, st.join_shape, mat, corner_uvs=cuvs)
        lap("pairing")
        out_loops, out_size = pr["out_loops"], pr["out_size"]
        loop_src = perm[pr["loop_src"]]
        yield 0.6, "Crease-density relaxation"
        P = V
        if st.crease_density > 0 and st.relax_iterations > 0:
            vn = R.vertex_normals(V, loops, start, size, len(V))
            outE, _, _ = R.build_edges(out_loops, np.concatenate([[0], np.cumsum(out_size)[:-1]]), out_size)
            pinned = np.zeros(len(V), dtype=bool)
            if st.preserve_boundary:
                pinned[an.edges[an.boundary_edge].ravel()] = True
            if st.preserve_sharp:
                pinned[an.edges[an.sharp_edge].ravel()] = True
            P, nact = RF.relax_active(V, vn, outE, an.density_v, pinned, min(st.relax_iterations, 10), st.crease_density)
            rep["relaxed_vertices"] = nact
        lap("relax")
        yield 0.75, "Writing mesh + attributes"
        new_me = write_mesh(obj.name + "_quad", P, out_loops, out_size)
        copy_attributes(src_me, new_me, loop_src, pr["face_src"], rep)
        rep["pairing"] = {"pairs": pr["n_pairs"], "candidates": pr["candidates"]}
        lap("write")
    elif res < 0.88 and target <= target_reduce_max:
        rep["method"] = "REDUCE"
        yield 0.45, "Decimating to a working mesh"
        tris_total = int(((size - 2)).sum())
        if tris_total > 600000:                                   # crude vertex clustering down to ~400k first ...
            Vc, tris = RF.cluster_decimate(V, loops, size, 400000)
            wme = write_mesh("_af_cl", Vc, tris.ravel(), np.full(len(tris), 3, dtype=np.int32))
        else:
            wme = src_me.copy()
        lap("cluster")
        # ... then Blender's collapse Decimate (robust, manifold-preserving) to the working size
        ntri = len(wme.polygons) if wme.polygons else 1
        sym_exact = plane is not None and st.use_symmetry is not False
        # with a mirror plane the exact-symmetry join/split pipeline is used: its natural output is ~2x the working
        # triangle count, so decimate to target/2; otherwise Quadriflow gets a 2x-target working mesh
        wk_tris = max(int(target // 2), 200) if sym_exact else 2 * target
        ratio = min(1.0, max(0.001, wk_tris / max(ntri, 1)))
        tmp = bpy.data.objects.new("_af_dec", wme)
        bpy.context.scene.collection.objects.link(tmp)
        md = tmp.modifiers.new("d", 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = ratio
        md.use_collapse_triangulate = True; md.use_symmetry = False
        dg2 = bpy.context.evaluated_depsgraph_get(); dg2.update()
        dec = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg2), depsgraph=dg2)
        bpy.context.scene.collection.objects.unlink(tmp); bpy.data.objects.remove(tmp); bpy.data.meshes.remove(wme)
        rep["working_mesh_faces"] = len(dec.polygons)
        lap("decimate")
        yield 0.55, "Projection BVH of the original surface"
        src_bvh = bvh_for_mesh(src_me)
        lap("bvh")
        yield 0.62, "Accurate remesh on the working mesh"
        wk = bmesh.new()
        wk.from_mesh(dec); bpy.data.meshes.remove(dec)
        stw = _copy_settings(st, 0 if sym_exact else target)
        if sym_exact:
            stw.method = 'JOIN_SPLIT'
        pts = np.concatenate([V[:: max(1, len(V) // 150000)]])
        dens = an.density_v[:: max(1, len(V) // 150000)][: len(pts)]
        out_bm, r2 = R.remesh_bmesh(wk, stw, None if sym_exact else _qf(), ref_bvh=src_bvh, ref_sample_V=V[:: max(1, len(V) // 20000)],
                                    density_samples=(pts, dens))
        wk.free()
        for k in ("output", "quality", "symmetry", "after_join", "auto", "cleanup"):
            if k in r2:
                rep["reduce_" + k if k in ("cleanup",) else k] = r2[k]
        rep["method"] = "REDUCE (%s)" % r2.get("method")
        lap("remesh")
        yield 0.9, "Writing mesh"
        new_me = bpy.data.meshes.new(obj.name + "_quad")
        out_bm.to_mesh(new_me); out_bm.free()
        rep["attributes_skipped"] = ["REDUCE mode: UV/attributes are not transferred (use Resolution ~1 or the accurate path)"]
        lap("write")
    else:
        if own:
            bpy.data.meshes.remove(src_me)
        rep["error"] = ("Resolution %.2f gives ~%d faces: above %d the fast path only supports Resolution about 1 (pairing); "
                        "lower the Resolution or use the accurate path on a smaller mesh." % (res, target, target_reduce_max))
        return None, rep
    rep["output"] = R.count_report(np.array([len(p.vertices) for p in new_me.polygons[:0]]) if False else _sizes(new_me))
    new_obj = bpy.data.objects.new(obj.name + "_quad", new_me)
    new_obj.matrix_world = obj.matrix_world
    for c in (obj.users_collection or [bpy.context.scene.collection]):
        c.objects.link(new_obj)
    for m in obj.data.materials:
        new_me.materials.append(m)
    for p in new_me.polygons:
        pass
    new_me.shade_smooth() if hasattr(new_me, "shade_smooth") else None
    if rep["method"] == "PAIR":
        transfer_vertex_groups(obj, src_me, new_obj, rep)
    yield 0.95, "Measuring deviation (sampled)"
    sb = bvh_for_mesh(src_me)
    q = sample_deviation(new_me, sb, V32, plane, diag)
    q["within_tolerance"] = q["max_deviation"] <= st.deviation_tol
    q["deviation_tol"] = st.deviation_tol
    rep["quality"] = q
    lap("measure")
    if obj.data.shape_keys:
        rep["shape_keys"] = "source has shape keys: the %s coordinates were used; keys are NOT transferred" % (
            "evaluated" if evaluated else "basis")
    if own:
        bpy.data.meshes.remove(src_me)
    T["total"] = round(time.time() - t0, 3)
    rep["peak_rss_mb"] = round(rss_mb())
    yield 1.0, "Done"
    return new_obj, rep


def _qf():
    from .retopo_ops import quadriflow_fn
    return quadriflow_fn


def _sizes(me):
    s = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get("loop_total", s)
    return s


def _copy_settings(st, target):
    import copy
    s = copy.copy(st)
    s.target_faces = int(target)
    s.resolution = 1.0
    s.uv_mode = "SKIP"
    return s
