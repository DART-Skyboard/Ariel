"""Projection Remesh (Tessera Projection / LOTBCBP) operators + settings.  Logic lives in core/retopo.py; see its docstring for limits."""
import math

import bmesh
import bpy
import numpy as np
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, PointerProperty
from bpy.types import Operator, PropertyGroup

from .core import retopo as R

CREASE_GROUP = "AF_Crease"


class AFRetopoProps(PropertyGroup):
    method: EnumProperty(name="Method", items=[
        ('AUTO', "Auto", "Join+split normally; Quadriflow when the target is far below the input face count"),
        ('JOIN_SPLIT', "Join + Split", "Triangles joined to quads, leftovers split (robust, symmetric-safe)"),
        ('QUADRIFLOW', "Quadriflow", "Blender's Quadriflow (reduces count; symmetry is only approximate)")],
        default='AUTO')
    auto: BoolProperty(name="Automatic", default=True,
                       description="Detect symmetry axis and crease angle from the object's own projection and "
                       "refine until the deviation tolerance is met. Off = use the manual values below")
    deviation_tol: FloatProperty(name="Deviation Tolerance", default=0.002, min=1e-5, max=0.05, precision=4,
                                 description="Max distance from the original surface, fraction of bbox diagonal")
    use_symmetry: BoolProperty(name="Symmetry", description="Quadrangulate one half and mirror it (exact symmetry). "
                               "Manual override of the automatic detection", default=False)
    axis: EnumProperty(name="Mirror Axis", items=[('X', "X", ""), ('Y', "Y", ""), ('Z', "Z", "")], default='X')
    sym_tolerance: FloatProperty(name="Tolerance", description="Weld/snap tolerance as a fraction of the bounding "
                                 "box diagonal", default=1e-4, min=1e-7, max=0.05, precision=5)
    keep_positive: BoolProperty(name="Keep +Side", description="Keep the positive side of the mirror plane "
                                "(otherwise the negative side)", default=True)
    crease_angle: FloatProperty(name="Crease Angle", subtype='ANGLE', default=math.radians(25.0), min=0.01,
                                max=math.pi, description="Dihedral angle at which an edge counts as a full crease "
                                "for the density field")
    threshold_mode: EnumProperty(name="Small/Large", items=[
        ('AUTO', "Auto", "Per-region Otsu split of log face size"),
        ('MANUAL', "Manual", "Faces smaller than this multiple of the median face size are small")], default='AUTO')
    manual_threshold: FloatProperty(name="Threshold", default=0.6, min=0.01, max=4.0,
                                    description="Multiple of the median face size")
    target_faces: IntProperty(name="Target Faces", default=0, min=0,
                              description="Desired quad count (0 = about the input's)")
    crease_density: FloatProperty(name="Crease Density", default=6.0, min=0.0, max=30.0,
                                  description="How strongly vertices cluster toward creases / small features (0 = off)")
    band_rings: IntProperty(name="Band Width", default=2, min=0, max=8, description="Rings the crease band spreads")
    relax_iterations: IntProperty(name="Relax Steps", default=24, min=0, max=100)
    preserve_sharp: BoolProperty(name="Preserve Sharp", default=True,
                                 description="Vertices on sharp edges stay on them")
    preserve_boundary: BoolProperty(name="Preserve Boundary", default=True)
    sharp_angle: FloatProperty(name="Sharp Angle", subtype='ANGLE', default=math.radians(50.0), min=0.01,
                               max=math.pi)
    source_mode: EnumProperty(name="Source", items=[
        ('EVALUATED', "Evaluated (with modifiers)", "Read the evaluated mesh from the depsgraph: every modifier "
         "(Mirror, Subsurf, Solidify, Boolean...) is baked in whatever its position in the stack. The original object "
         "and its stack are left untouched"),
        ('BASE', "Base mesh", "Ignore modifiers and read the object's own mesh data")], default='EVALUATED')
    resolution: FloatProperty(name="Resolution", default=1.0, min=0.01, max=12.0, soft_max=4.0, precision=2,
                              description="Output face count relative to the input (1.0 = one-to-one, 0.5 = half, "
                              "2.0 = double). The density field still decides where the faces go. Cap 12: run again "
                              "on the result for more")
    uv_mode: EnumProperty(name="UV Handling", items=[
        ('KEEP', "Keep + transfer all", "Transfer every UV map (and colour/attributes) by projection, same names"),
        ('KEEP_NEW', "Transfer + new UV", "Transfer, and add a freshly unwrapped 'UVMap_Tessera' (angle-based)"),
        ('NEW', "New UV only", "Only a freshly unwrapped 'UVMap_Tessera'"),
        ('SKIP', "Skip UVs", "No UV maps on the result")], default='KEEP')
    fast_path: EnumProperty(name="Large Meshes", items=[
        ('AUTO', "Auto", "Use the vectorised fast path above the face threshold"),
        ('ON', "Always fast", "Always use the vectorised fast path"),
        ('OFF', "Never", "Always use the accurate (bmesh) path")], default='AUTO')
    fast_threshold: IntProperty(name="Fast Path Above", default=200000, min=1000,
                                description="Face count above which the fast path is chosen automatically")
    recalc_before: BoolProperty(name="Normals Outside (before)", default=True,
                                description="Make normals consistent and outward before building the projection")
    recalc_after: BoolProperty(name="Normals Outside (after)", default=True,
                               description="Make the result's normals consistent and outward")
    keep_custom_normals: BoolProperty(name="Keep Custom Normals", default=False,
                                      description="Standalone normals tool: do not touch meshes with custom split normals")
    replace: BoolProperty(name="Replace Original", default=False,
                          description="Overwrite the object's mesh instead of writing <name>_quad")
    report_text: bpy.props.StringProperty(name="Last report", default="")


def _settings(p):
    return R.RemeshSettings(
        method=p.method, auto=p.auto, deviation_tol=p.deviation_tol,
        use_symmetry=(None if p.auto and not p.use_symmetry else p.use_symmetry), axis=p.axis, sym_tolerance=p.sym_tolerance,
        keep_positive_side=p.keep_positive, crease_angle=(None if p.auto else p.crease_angle), sharp_angle=p.sharp_angle,
        threshold_mode=p.threshold_mode, manual_threshold=p.manual_threshold, target_faces=p.target_faces,
        crease_density=p.crease_density, band_rings=p.band_rings, relax_iterations=p.relax_iterations,
        preserve_sharp=p.preserve_sharp, preserve_boundary=p.preserve_boundary, resolution=p.resolution, uv_mode=p.uv_mode,
        recalc_before=p.recalc_before, recalc_after=p.recalc_after)


def settings_from_dict(**kw):
    return R.RemeshSettings(**kw)


def quadriflow_fn(bm, target, st):
    """Run bpy.ops.object.quadriflow_remesh on a temporary object; returns a new bmesh or None on failure."""
    me = bpy.data.meshes.new("_af_qf")
    bm.to_mesh(me)
    ob = bpy.data.objects.new("_af_qf", me)
    bpy.context.scene.collection.objects.link(ob)
    out = None
    try:
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob],
                                       selected_editable_objects=[ob]):
            kw = dict(mode='FACES', target_faces=int(target), use_mesh_symmetry=bool(st.use_symmetry),
                      use_preserve_sharp=bool(st.preserve_sharp), use_preserve_boundary=bool(st.preserve_boundary),
                      smooth_normals=False, seed=0)
            res = bpy.ops.object.quadriflow_remesh(**kw)
        if 'FINISHED' in res and len(ob.data.polygons):
            out = bmesh.new()
            out.from_mesh(ob.data)
    except Exception as e:  # quadriflow can fail on non-manifold input
        print("quadriflow failed:", e)
        out = None
    finally:
        bpy.context.scene.collection.objects.unlink(ob)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
    return out


def source_bmesh(obj, apply_modifiers=True):
    bm = bmesh.new()
    if apply_modifiers:
        dg = bpy.context.evaluated_depsgraph_get()
        bm.from_mesh(obj.evaluated_get(dg).to_mesh())
        obj.evaluated_get(dg).to_mesh_clear()
    else:
        bm.from_mesh(obj.data)
    for lay in list(bm.verts.layers.shape):       # shape keys: the current (evaluated) coordinates are used
        bm.verts.layers.shape.remove(lay)
    return bm


def _fmt(rep):
    i = rep["input"]
    o = rep.get("output", {})
    s = "in: %d faces (%d tri, %d odd n-gon)" % (i["faces"], i["tris"], i["odd_ngons"])
    if o:
        s += " -> out: %d faces, %.1f%% quads, %d tri, %d odd n-gon" % (
            o["faces"], 100 * o["quad_ratio"], o["tris"], o["odd_ngons"])
    q = rep.get("quality")
    if q:
        se = q.get("symmetry_error")
        s += "; max dev %.3f%%%s" % (100 * q["max_deviation"], (", sym err %.1e" % se) if se is not None else "")
        if "poles_valence3" in q:
            s += ", poles %d" % (q["poles_valence3"] + q["poles_valence5plus"])
    if rep.get("method"):
        s += " [%s%s]" % (rep["method"], ", %.1fs" % rep["timing"]["total"] if rep.get("timing") else "")
    return s


def analyse_object(obj, p):
    """Write attributes + vertex group + face selection on obj.data (object mode). Returns the Analysis."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    V, faces = R.bm_arrays(bm)
    bm.free()
    an = R.analyse(V, faces, p.crease_angle, p.sharp_angle, p.band_rings, threshold_mode=p.threshold_mode,
                   manual_threshold=p.manual_threshold)

    def attr(name, typ, dom, data):
        a = me.attributes.get(name)
        if a is not None and (a.data_type != typ or a.domain != dom):
            me.attributes.remove(a)
            a = None
        if a is None:
            a = me.attributes.new(name, typ, dom)
        a.data.foreach_set("value", data)
    attr("af_odd_face", 'BOOLEAN', 'FACE', an.odd_mask.astype(bool))
    attr("af_tri_face", 'BOOLEAN', 'FACE', an.tri_mask.astype(bool))
    attr("af_small_face", 'BOOLEAN', 'FACE', an.small_mask.astype(bool))
    attr("af_crease", 'FLOAT', 'POINT', an.density_v.astype(np.float32))
    vg = obj.vertex_groups.get(CREASE_GROUP) or obj.vertex_groups.new(name=CREASE_GROUP)
    for i, w in enumerate(an.density_v):
        if w > 0.0:
            vg.add([i], float(w), 'REPLACE')
    me.polygons.foreach_set("select", an.odd_mask.astype(bool))
    me.update()
    return an


class AF_OT_quad_analyse(Operator):
    bl_idname = "arcflow.quad_analyse"
    bl_label = "Analyse Topology"
    bl_description = "Count triangles / odd n-gons, select them, store crease weights (attribute + vertex group)"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, ctx):
        return ctx.active_object is not None and ctx.active_object.type == 'MESH'

    def execute(self, ctx):
        obj = ctx.active_object
        was_edit = obj.mode == 'EDIT'
        if was_edit:
            bpy.ops.object.mode_set(mode='OBJECT')
        p = ctx.scene.arc_flow_retopo
        an = analyse_object(obj, p)
        c = an.counts
        p.report_text = "%d faces: %d tri, %d odd n-gon (%d selected), %.1f%% quads; %d small / %d regions" % (
            c["faces"], c["tris"], c["odd_ngons"], c["odd_total"], 100 * c["quad_ratio"], an.info["small_faces"],
            an.info["regions"])
        if was_edit:
            bpy.ops.object.mode_set(mode='EDIT')
        self.report({'INFO'}, p.report_text)
        return {'FINISHED'}


class AF_OT_quad_fix(Operator):
    bl_idname = "arcflow.quad_fix"
    bl_label = "Quick Topology Fix"
    bl_description = "Weld doubles, drop degenerate faces / loose geometry, recalculate normals (sculpt / CAD import)"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, ctx):
        return ctx.active_object is not None and ctx.active_object.type == 'MESH'

    def execute(self, ctx):
        obj = ctx.active_object
        if obj.mode == 'EDIT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        V, _ = R.bm_arrays(bm)
        rep = R.cleanup_bmesh(bm, ctx.scene.arc_flow_retopo.sym_tolerance * 0.1 * R._bbox_diag(V))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        self.report({'INFO'}, "Fix: %s" % rep)
        return {'FINISHED'}


def _carry_selection(src, tgt, st, rep):
    """Active / render UV map and active / render colour attribute carry over by name; optional new unwrap."""
    try:
        sm, tm = src.data, tgt.data
        if sm.uv_layers.active and tm.uv_layers.get(sm.uv_layers.active.name):
            tm.uv_layers.active = tm.uv_layers[sm.uv_layers.active.name]
        for l in sm.uv_layers:
            if l.active_render and tm.uv_layers.get(l.name):
                tm.uv_layers[l.name].active_render = True
        ac = sm.color_attributes.active_color_name
        if ac and ac in tm.color_attributes:
            tm.color_attributes.active_color = tm.color_attributes[ac]
        rc = sm.color_attributes.render_color_index
        if 0 <= rc < len(sm.color_attributes) and sm.color_attributes[rc].name in tm.color_attributes:
            tm.color_attributes.render_color_index = list(tm.color_attributes.keys()).index(sm.color_attributes[rc].name)
    except Exception as e:
        rep.setdefault("transfer", {}).setdefault("skipped", []).append("active selection (%s)" % e)
    if st.uv_mode in ("KEEP_NEW", "NEW"):
        try:
            if st.uv_mode == "NEW":
                while tgt.data.uv_layers:
                    tgt.data.uv_layers.remove(tgt.data.uv_layers[0])
            keep_active = tgt.data.uv_layers.active.name if tgt.data.uv_layers.active else None
            nl = tgt.data.uv_layers.new(name="UVMap_Tessera")
            tgt.data.uv_layers.active = nl
            for o in bpy.context.view_layer.objects:
                o.select_set(False)
            bpy.context.view_layer.objects.active = tgt
            tgt.select_set(True)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.003)
            bpy.ops.object.mode_set(mode='OBJECT')
            if keep_active:
                tgt.data.uv_layers.active = tgt.data.uv_layers[keep_active]
            rep.setdefault("transfer", {})["new_uv"] = "UVMap_Tessera (smart project, angle-based)"
        except Exception as e:
            rep.setdefault("transfer", {}).setdefault("skipped", []).append("new UV (%s)" % e)
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except Exception:
                pass


def remesh_object(obj, st, apply_modifiers=True, replace=False, suffix="_quad"):
    """Programmatic entry (also used by tests). Returns (object, report)."""
    src = source_bmesh(obj, apply_modifiers)
    out, rep = R.remesh_bmesh(src, st, quadriflow_fn)
    src.free()
    if replace:
        tgt = obj
        me = tgt.data
        if me.users > 1:
            me = me.copy()
            tgt.data = me
        for m in list(tgt.modifiers):
            if apply_modifiers:
                tgt.modifiers.remove(m)
        me.clear_geometry()
    else:
        me = bpy.data.meshes.new(obj.name + suffix)
        for m in obj.data.materials:
            me.materials.append(m)
        tgt = bpy.data.objects.new(obj.name + suffix, me)
        tgt.matrix_world = obj.matrix_world
        for c in (obj.users_collection or [bpy.context.scene.collection]):
            c.objects.link(tgt)
        for g in obj.vertex_groups:
            tgt.vertex_groups.new(name=g.name)
    out.to_mesh(me)
    out.free()
    _carry_selection(obj, tgt, st, rep)
    for poly in me.polygons:
        poly.use_smooth = True
    me.update()
    return tgt, rep


class AF_OT_quad_remesh(Operator):
    bl_idname = "arcflow.quad_remesh"
    bl_label = "Projection Remesh"
    bl_description = ("Balanced quad retopology with crease-weighted density and symmetry detection. Large meshes use "
                      "a vectorised fast path with progress (Esc cancels between stages)")
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, ctx):
        return ctx.active_object is not None and ctx.active_object.type == 'MESH'

    def _use_fast(self, ctx, obj, p):
        if p.fast_path == 'ON':
            return True
        if p.fast_path == 'OFF':
            return False
        try:
            if p.source_mode == 'EVALUATED':
                n = len(obj.evaluated_get(ctx.evaluated_depsgraph_get()).data.polygons)
            else:
                n = len(obj.data.polygons)
        except Exception:
            n = len(obj.data.polygons)
        return n > p.fast_threshold

    def _finish(self, ctx, obj, p, new, rep):
        if new is None:
            p.report_text = rep.get("error", "failed")[:200]
            self.report({'ERROR'}, p.report_text)
            return {'CANCELLED'}
        p.report_text = _fmt(rep)
        for o in ctx.selected_objects:
            o.select_set(False)
        new.select_set(True)
        ctx.view_layer.objects.active = new
        self.report({'INFO'}, p.report_text)
        return {'FINISHED'}

    def execute(self, ctx):
        obj = ctx.active_object
        if obj.mode == 'EDIT':
            bpy.ops.object.mode_set(mode='OBJECT')
        p = ctx.scene.arc_flow_retopo
        st = _settings(p)
        wm = ctx.window_manager
        try:
            if self._use_fast(ctx, obj, p):
                from . import retopo_fast_ops as FO
                gen = FO.fast_stages(obj, st, p.source_mode == 'EVALUATED')
                wm.progress_begin(0, 100)
                new = rep = None
                try:
                    while True:
                        frac, label = next(gen)
                        wm.progress_update(int(frac * 100))
                except StopIteration as e:
                    new, rep = e.value
                finally:
                    wm.progress_end()
            else:
                new, rep = remesh_object(obj, st, p.source_mode == 'EVALUATED', p.replace)
        except Exception as e:
            self.report({'ERROR'}, "Projection remesh failed: %s" % e)
            return {'CANCELLED'}
        return self._finish(ctx, obj, p, new, rep)

    def invoke(self, ctx, event):
        obj = ctx.active_object
        p = ctx.scene.arc_flow_retopo
        if obj.mode == 'EDIT' or not self._use_fast(ctx, obj, p):
            return self.execute(ctx)
        from . import retopo_fast_ops as FO
        self._gen = FO.fast_stages(obj, _settings(p), p.source_mode == 'EVALUATED')
        wm = ctx.window_manager
        wm.progress_begin(0, 100)
        self._timer = wm.event_timer_add(0.05, window=ctx.window)
        wm.modal_handler_add(self)
        return {'RUNNING_MODAL'}

    def _end(self, ctx):
        wm = ctx.window_manager
        wm.event_timer_remove(self._timer)
        wm.progress_end()
        ctx.workspace.status_text_set(None)

    def modal(self, ctx, event):
        p = ctx.scene.arc_flow_retopo
        if event.type == 'ESC':
            self._gen.close()
            self._end(ctx)
            self.report({'WARNING'}, "Projection remesh cancelled")
            return {'CANCELLED'}
        if event.type == 'TIMER':
            try:
                frac, label = next(self._gen)
                ctx.window_manager.progress_update(int(frac * 100))
                ctx.workspace.status_text_set("Projection Remesh: %s (%d%%)  -  Esc to cancel" % (label, int(frac * 100)))
            except StopIteration as e:
                self._end(ctx)
                new, rep = e.value
                return self._finish(ctx, ctx.active_object, p, new, rep)
            except Exception as e:
                self._end(ctx)
                self.report({'ERROR'}, "Projection remesh failed: %s" % e)
                return {'CANCELLED'}
        return {'RUNNING_MODAL'}


def predicted_faces(obj, resolution, evaluated=True):
    """Cheap face-count prediction: quad-equivalents of the source (sum (n-2)/2 = loop triangles / 2) * resolution."""
    try:
        if evaluated:
            dg = bpy.context.evaluated_depsgraph_get()
            me = obj.evaluated_get(dg).data
        else:
            me = obj.data
        return int(round(len(me.loop_triangles) / 2.0 * resolution))
    except Exception:
        return 0


def recalc_normals_mesh(me, keep_custom=False):
    """Consistent outward normals on a Mesh via foreach_get/foreach_set (vectorised, no bmesh). Returns info dict."""
    nf = len(me.polygons)
    if nf == 0:
        return {"flipped_faces": 0, "components": 0}
    if keep_custom and me.has_custom_normals:
        return {"skipped": "custom split normals present", "flipped_faces": 0, "components": 0}
    nv = len(me.vertices)
    V = np.empty(nv * 3, dtype=np.float32); me.vertices.foreach_get("co", V)
    start = np.empty(nf, dtype=np.int32); me.polygons.foreach_get("loop_start", start)
    size = np.empty(nf, dtype=np.int32); me.polygons.foreach_get("loop_total", size)
    nl = len(me.loops)
    lv = np.empty(nl, dtype=np.int32); me.loops.foreach_get("vertex_index", lv)
    le = np.empty(nl, dtype=np.int32); me.loops.foreach_get("edge_index", le)
    start = start.astype(np.int64); size = size.astype(np.int64)
    flip, info = R.orient_outward(V.reshape(-1, 3).astype(np.float64), lv.astype(np.int64), start, size)
    if not flip.any():
        return info
    perm = R.flip_packed(lv, start, size, flip)
    fi = np.repeat(np.arange(nf), size)
    rel = np.arange(nl) - start[fi]
    eperm = np.where(flip[fi], start[fi] + (size[fi] - 2 - rel) % size[fi], np.arange(nl))
    me.loops.foreach_set("vertex_index", lv[perm])
    me.loops.foreach_set("edge_index", le[eperm])
    skipped = []
    for a in list(me.attributes):
        if a.domain != 'CORNER' or a.name in ('.corner_vert', '.corner_edge'):
            continue
        try:
            key, comp = {'FLOAT2': ('vector', 2), 'FLOAT_VECTOR': ('vector', 3), 'FLOAT': ('value', 1),
                         'INT': ('value', 1), 'BOOLEAN': ('value', 1), 'FLOAT_COLOR': ('color', 4),
                         'BYTE_COLOR': ('color', 4), 'INT8': ('value', 1), 'INT32_2D': ('value', 2)}[a.data_type]
            dt = np.float32 if a.data_type in ('FLOAT2', 'FLOAT_VECTOR', 'FLOAT', 'FLOAT_COLOR', 'BYTE_COLOR') else \
                (np.bool_ if a.data_type == 'BOOLEAN' else np.int32)
            buf = np.empty(nl * comp, dtype=dt)
            a.data.foreach_get(key, buf)
            a.data.foreach_set(key, buf.reshape(nl, comp)[perm].ravel())
        except Exception:
            skipped.append(a.name)
    if skipped:
        info["skipped_attributes"] = skipped
    if me.has_custom_normals:
        info["custom_normals_cleared"] = True
        try:
            me.attributes.remove(me.attributes["custom_normal"])
        except Exception:
            pass
    me.update()
    return info


class AF_OT_recalc_normals(Operator):
    bl_idname = "arcflow.recalc_normals_outside"
    bl_label = "Recalculate Normals (Outside)"
    bl_description = ("Consistent outward normals on every selected mesh (vectorised, per connected component; open "
                      "shells are oriented away from their centre and reported)")
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, ctx):
        p = ctx.scene.arc_flow_retopo
        n = tot = 0
        notes = []
        for o in ctx.selected_objects:
            if o.type != 'MESH':
                continue
            if o.mode == 'EDIT':
                bpy.ops.object.mode_set(mode='OBJECT')
            info = recalc_normals_mesh(o.data, p.keep_custom_normals)
            n += 1
            tot += info.get("flipped_faces", 0)
            if info.get("open_heuristic"):
                notes.append("%s: %d open shell(s) oriented by heuristic" % (o.name, info["open_heuristic"]))
            if info.get("inconsistent_edges"):
                notes.append("%s: %d non-orientable edges left" % (o.name, info["inconsistent_edges"]))
            if info.get("skipped"):
                notes.append("%s: %s" % (o.name, info["skipped"]))
        msg = "Normals: %d mesh(es), %d faces flipped. %s" % (n, tot, "; ".join(notes))
        self.report({'INFO'}, msg)
        p.report_text = msg
        return {'FINISHED'}


CLASSES = (AFRetopoProps, AF_OT_recalc_normals, AF_OT_quad_analyse, AF_OT_quad_fix, AF_OT_quad_remesh)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.arc_flow_retopo = PointerProperty(type=AFRetopoProps)


def unregister():
    del bpy.types.Scene.arc_flow_retopo
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
