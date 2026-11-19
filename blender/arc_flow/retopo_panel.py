import bpy
from bpy.types import Panel


class AF_PT_retopo(Panel):
    bl_idname = "AF_PT_retopo"
    bl_label = "Projection Remesh"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Tessera"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        l = self.layout
        p = ctx.scene.arc_flow_retopo
        row = l.row(align=True)
        row.scale_y = 1.3
        row.operator("arcflow.quad_analyse", icon='VIEWZOOM')
        row.operator("arcflow.quad_remesh", icon='MOD_REMESH')
        l.operator("arcflow.quad_fix", icon='MODIFIER')
        r2 = l.row(align=True)
        r2.operator("arcflow.recalc_normals_outside", icon='NORMALS_FACE')
        r2.prop(p, "keep_custom_normals", text="Keep Custom")
        r2 = l.row(align=True)
        r2.prop(p, "recalc_before", text="Before")
        r2.prop(p, "recalc_after", text="After")
        if p.report_text:
            l.label(text=p.report_text[:70], icon='INFO')
        col = l.column(align=True)
        col.prop(p, "auto")
        col.prop(p, "deviation_tol")
        col.prop(p, "method")
        col.prop(p, "target_faces")
        r3 = col.row(align=True)
        r3.prop(p, "fast_path", text="Large")
        r3.prop(p, "fast_threshold", text="Above")
        col.prop(p, "source_mode")
        col.prop(p, "resolution")
        if ctx.active_object and ctx.active_object.type == 'MESH':
            from . import retopo_ops
            col.label(text="Predicted faces: ~%d" % (p.target_faces or retopo_ops.predicted_faces(
                ctx.active_object, p.resolution, p.source_mode == 'EVALUATED')))
        col.prop(p, "replace")
        b = l.box()
        b.prop(p, "use_symmetry")
        if p.use_symmetry:
            r = b.row(align=True)
            r.prop(p, "axis", expand=True)
            b.prop(p, "sym_tolerance")
            b.prop(p, "keep_positive")
        b = l.box()
        b.label(text="Crease density")
        b.prop(p, "crease_angle")
        b.prop(p, "crease_density")
        b.prop(p, "band_rings")
        b.prop(p, "relax_iterations")
        b.prop(p, "threshold_mode", expand=True)
        if p.threshold_mode == 'MANUAL':
            b.prop(p, "manual_threshold")
        b = l.box()
        b.prop(p, "preserve_sharp")
        if p.preserve_sharp:
            b.prop(p, "sharp_angle")
        b.prop(p, "preserve_boundary")


def register():
    bpy.utils.register_class(AF_PT_retopo)


def unregister():
    bpy.utils.unregister_class(AF_PT_retopo)
