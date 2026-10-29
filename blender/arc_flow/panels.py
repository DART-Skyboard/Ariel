import bpy
from bpy.types import Panel

from . import runtime
from .core import mathcards as MC

RT = runtime.RT


class _Base:
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Arc Flow"


def _status_line(layout, af):
    row = layout.row()
    row.label(text=af.status, icon='INFO')
    if RT.msg:
        layout.label(text=RT.msg[:60], icon='ERROR')


class AF_PT_main(_Base, Panel):
    bl_idname = "AF_PT_main"
    bl_label = "Arc Flow  |  LOTCBP"

    def draw(self, ctx):
        l = self.layout
        af = ctx.scene.arc_flow
        row = l.row(align=True)
        row.scale_y = 1.4
        if RT.running:
            row.operator("arcflow.stop", icon='SNAP_FACE', text="Stop")
        else:
            row.operator("arcflow.build", icon='PLAY', text="Build")
        row.operator("arcflow.record", icon='REC', text="Record")
        row.operator("arcflow.bake", icon='FREEZE', text="Bake")
        _status_line(l, af)
        col = l.column(align=True)
        col.prop(af, "continuous")
        col.prop(af, "xray")
        row = l.row(align=True)
        row.prop(af, "use_scene_range")
        if not af.use_scene_range:
            r = l.row(align=True)
            r.prop(af, "frame_start"); r.prop(af, "frame_end")
        row = l.row(align=True)
        row.operator("arcflow.refresh", icon='FILE_REFRESH')
        row.operator("arcflow.demo", icon='MOD_FLUIDSIM')


class AF_PT_parts(_Base, Panel):
    bl_idname = "AF_PT_parts"
    bl_label = "Part (active object)"
    bl_parent_id = "AF_PT_main"

    def draw(self, ctx):
        draw_part(self.layout, ctx)


def draw_part(l, ctx):
    o = ctx.object
    af = ctx.scene.arc_flow
    if o is None or o.type != 'MESH':
        l.label(text="Select a mesh object", icon='MESH_DATA')
        return
    p = o.arc_flow
    l.label(text=o.name, icon='OBJECT_DATA')
    row = l.row(align=True)
    for r, lab in (('CONTAINER', "Container"), ('TRANSPORT', "Transport"), ('CHAMBER', "Chamber")):
        op = row.operator("arcflow.set_role", text=lab, depress=(p.role == r))
        op.role = r
    row = l.row(align=True)
    op = row.operator("arcflow.set_role", text="Collider", depress=(p.role == 'COLLIDER')); op.role = 'COLLIDER'
    op = row.operator("arcflow.set_role", text="None", depress=(p.role == 'NONE')); op.role = 'NONE'
    l.menu("AF_MT_part_presets", text="Part presets", icon='PRESET')
    if p.role != 'NONE':
        col = l.column(align=True)
        col.prop(p, "cavity_mode")
        col.prop(p, "resolution")
        col.prop(p, "lotcbp_level")
    if p.role == 'CONTAINER':
        b = l.box()
        b.label(text="Fluid fill", icon='MOD_FLUIDSIM')
        b.prop(p, "fluid")
        b.prop(p, "fill_mode")
        if p.fill_mode == 'PERCENT':
            b.prop(p, "fill_percent")
        elif p.fill_mode == 'ABSOLUTE':
            b.prop(p, "fill_volume")
        b.prop(p, "pressure")
        b.prop(p, "particles")
        b.label(text="Fill mass = volume x density(pressure)", icon='DOT')
    elif p.role in ('TRANSPORT', 'CHAMBER'):
        l.label(text="Starts empty; conducts fluid", icon='DOT')
    if p.role != 'NONE':
        b = l.box()
        b.label(text="Material", icon='MATERIAL')
        b.prop(p, "material")
        b.prop(p, "wall")
        if p.material == 'CUSTOM':
            for k in ("density", "young", "yield_strength", "conductivity", "specific_heat", "max_temp", "alpha", "poisson"):
                b.prop(p, k)
        else:
            c = b.column(align=True)
            c.enabled = False
            for k in ("density", "young", "yield_strength", "conductivity", "specific_heat", "max_temp"):
                c.prop(p, k)
        if RT.running or p.stress_now:
            r = b.row()
            r.label(text="T %.0f K" % p.temp_now); r.label(text="Stress %.0f%%" % (p.stress_now * 100)); r.label(text="P %.0f Pa" % p.pressure_now)
    # emitter (any object can be one)
    b = l.box()
    r = b.row()
    r.prop(p, "is_emitter")
    if p.is_emitter:
        b.prop(p, "emit_fluid")
        b.prop(p, "emit_mode")
        if p.emit_mode == 'ORIGIN':
            b.prop(p, "emit_radius")
        if p.emit_mode == 'FACES':
            r = b.row(align=True)
            r.operator("arcflow.select_faces", icon='FACESEL')
            r.operator("arcflow.assign_faces", icon='CHECKMARK')
            b.label(text="Faces assigned" if p.emit_faces_assigned else "No faces assigned yet", icon='CHECKMARK' if p.emit_faces_assigned else 'ERROR')
        b.prop(p, "emit_rate"); b.prop(p, "emit_speed"); b.prop(p, "emit_volume")
        if p.emit_mode in ('SURFACE', 'FACES'):
            b.prop(p, "emit_inward")


class AF_MT_part_presets(bpy.types.Menu):
    bl_idname = "AF_MT_part_presets"
    bl_label = "Part presets"

    def draw(self, ctx):
        from .ops import PART_PRESETS
        for k, v in PART_PRESETS.items():
            self.layout.operator("arcflow.part_preset", text=v[0]).preset = k


class AF_PT_fluids(_Base, Panel):
    bl_idname = "AF_PT_fluids"
    bl_label = "Fluids and Render"
    bl_parent_id = "AF_PT_main"

    def draw(self, ctx):
        l = self.layout
        af = ctx.scene.arc_flow
        row = l.row(align=True)
        row.operator("arcflow.add_fluid", icon='ADD', text="Add fluid")
        row.operator("arcflow.add_propellant_pair", icon='ADD', text="Propellants")
        for i, f in enumerate(af.fluids):
            b = l.box()
            r = b.row()
            r.prop(f, "expand", text="", icon='TRIA_DOWN' if f.expand else 'TRIA_RIGHT', emboss=False)
            r.prop(f, "name", text="")
            r.prop(f, "color", text="")
            r.operator("arcflow.remove_fluid", text="", icon='X').index = i
            if not f.expand:
                continue
            c = b.column(align=True)
            c.prop(f, "kind"); c.prop(f, "density"); c.prop(f, "temperature"); c.prop(f, "visc")
            c.prop(f, "fluid_role")
            if f.fluid_role != 'GENERIC':
                c.prop(f, "flame_t")
            b.prop(f, "render_mode", expand=True)
            if f.render_mode == 'POINTS':
                c = b.box()
                c.label(text="Points", icon='POINTCLOUD_DATA')
                c.prop(f, "pt_object"); c.prop(f, "pt_use_collection")
                if f.pt_use_collection:
                    c.prop(f, "pt_collection")
                c.prop(f, "pt_scale")
                c.prop(f, "pt_material")
                c.label(text="Edit the shader in the Shader Editor; edit AF Cards / AF Render in Geometry Nodes", icon='NODETREE')
            elif f.render_mode == 'RAYMARCH':
                c = b.box()
                c.label(text="Ray marching", icon='VOLUME_DATA')
                for k in ("rm_density", "rm_voxel", "rm_radius", "rm_color_a", "rm_color_b", "rm_blend", "rm_emission", "rm_absorption", "rm_anisotropy", "rm_noise", "rm_noise_scale", "rm_material"):
                    c.prop(f, k)
                c.label(text="Color blend is driven by the AF_ColorBlend shape key", icon='SHAPEKEY_DATA')
            else:
                c = b.box()
                c.label(text="Gaussian splat", icon='LIGHTPROBE_SPHERE')
                for k in ("gs_resolution", "gs_density", "gs_scale", "gs_blend", "gs_object", "gs_material"):
                    c.prop(f, k)
        if af.fluids:
            l.operator("arcflow.refresh", text="Apply render settings", icon='FILE_REFRESH')


class AF_PT_physics(_Base, Panel):
    bl_idname = "AF_PT_physics"
    bl_label = "Physics Cards"
    bl_parent_id = "AF_PT_main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        l = self.layout
        af = ctx.scene.arc_flow
        l.operator_menu_enum("arcflow.add_physics_card", "kind", text="Add physics card", icon='ADD')
        for i, c in enumerate(af.physics_cards):
            b = l.box()
            r = b.row()
            r.prop(c, "name", text="")
            r.label(text=c.kind.title())
            r.operator("arcflow.remove_physics_card", text="", icon='X').index = i
            b.prop(c, "fluid")
            r = b.row(align=True)
            r.prop(c, "value", text=c.unit_label())
            if c.kind == 'TEMPERATURE':
                r.prop(c, "temp_unit", text="")
            if c.kind == 'VELOCITY':
                b.prop(c, "vel_preset", text="Common")
            b.label(text="Node group: AF_Phys_%s" % gn_slug(c.name), icon='NODETREE')


def gn_slug(s):
    from .gn import slug
    return slug(s)


class AF_PT_math(_Base, Panel):
    bl_idname = "AF_PT_math"
    bl_label = "Math Cards"
    bl_parent_id = "AF_PT_main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        l = self.layout
        af = ctx.scene.arc_flow
        l.operator("arcflow.add_math_card", icon='ADD')
        for i, m in enumerate(af.math_cards):
            b = l.box()
            r = b.row()
            r.prop(m, "name", text="")
            r.operator("arcflow.remove_math_card", text="", icon='X').index = i
            row = b.row(align=True)
            for act, lab in (('ADD_CARD', "Card"), ('ADD_CONST', "Const"), ('ADD_GROUP', "Group")):
                op = row.operator("arcflow.math_term", text="+ " + lab)
                op.card, op.action = i, act
            if m.target_group:
                row = b.row(align=True)
                row.label(text="Adding inside %s" % m.target_group, icon='MOD_SOLIDIFY')
                op = row.operator("arcflow.math_term", text="Close group")
                op.card, op.action = i, 'CLOSE_GROUP'
            self._terms(b, m, i, '')
            b.label(text="= %s" % MC.to_string(m.term_list()), icon='DOT')
            r = b.row()
            r.prop(m, "output"); r.prop(m, "gain")
            b.label(text="Result: %.5g" % m.result)
            b.label(text="Node group: AF_Math_%s" % gn_slug(m.name), icon='NODETREE')

    def _terms(self, layout, m, ci, group, depth=0):
        for ti, t in enumerate(m.terms):
            if t.group != group:
                continue
            row = layout.row(align=True)
            row.separator(factor=depth * 1.5)
            first = not any(tt.group == group for tt in list(m.terms)[:ti])
            if not first:
                row.prop(t, "op", text="")
            else:
                row.label(text="", icon='DOT')
            if t.kind == 'CARD':
                row.prop(t, "card", text="")
            elif t.kind == 'CONST':
                row.prop(t, "const", text="")
            else:
                row.label(text="( %s )" % t.group_ref, icon='MOD_SOLIDIFY')
            op = row.operator("arcflow.math_term", text="", icon='X')
            op.card, op.action, op.term = ci, 'REMOVE', ti
            if t.kind == 'GROUP':
                self._terms(layout, m, ci, t.group_ref, depth + 1)


class AF_PT_env(_Base, Panel):
    bl_idname = "AF_PT_env"
    bl_label = "Environment"
    bl_parent_id = "AF_PT_main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        l = self.layout
        e = ctx.scene.arc_flow.env
        l.prop(e, "source", expand=True)
        if e.source == 'OBJECT':
            l.prop(e, "obj")
        col = l.column(align=True)
        col.prop(e, "pressure"); col.prop(e, "temperature"); col.prop(e, "density")
        col.prop(e, "atmo_fluid")
        col = l.column(align=True)
        col.prop(e, "use_scene_gravity")
        if not e.use_scene_gravity:
            col.prop(e, "gravity", text="")
        col.prop(e, "wind")
        r = l.row()
        r.prop(e, "ground")
        if e.ground:
            r.prop(e, "ground_auto")
            if not e.ground_auto:
                l.prop(e, "ground_z")


class AF_PT_xray(_Base, Panel):
    bl_idname = "AF_PT_xray"
    bl_label = "X-ray and Feedback"
    bl_parent_id = "AF_PT_main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        l = self.layout
        af = ctx.scene.arc_flow
        l.prop(af, "xray")
        col = l.column(align=True)
        col.prop(af, "xray_opacity"); col.prop(af, "xray_emission"); col.prop(af, "tint_mode")
        col.prop(af, "t_lo"); col.prop(af, "t_hi")
        l.label(text="X-ray off = clean film look", icon='DOT')
        b = l.box()
        b.label(text="Feedback", icon='LIGHT_AREA')
        r = b.row(align=True)
        r.operator("arcflow.add_feedback_plane", icon='MESH_PLANE')
        r.operator("arcflow.assign_feedback", icon='EYEDROPPER')
        b.prop(af, "feedback_obj")
        b.prop(af, "feedback_mode")


class AF_PT_solver(_Base, Panel):
    bl_idname = "AF_PT_solver"
    bl_label = "Solver (LOTCBP)"
    bl_parent_id = "AF_PT_main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        af = ctx.scene.arc_flow
        col = self.layout.column(align=True)
        for k in ("lotcbp", "net_res", "vmax", "radius_scale", "max_substeps", "seed"):
            col.prop(af, k)
        w = RT.world
        if w is not None:
            ref = sum(q.field.n_refined for q in w.parts)
            self.layout.label(text="%d particles | %d refined bricks" % (w.N, ref))
            for o in w.openings:
                self.layout.label(text="%s opening: %s" % (w.parts[o['part']].name, o['state']), icon='DOT')


class AF_PT_cache(_Base, Panel):
    bl_idname = "AF_PT_cache"
    bl_label = "Simulation Data"
    bl_parent_id = "AF_PT_main"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, ctx):
        l = self.layout
        af = ctx.scene.arc_flow
        l.prop(af, "cache_dir")
        r = l.row(align=True)
        r.prop(af, "cache_name"); r.prop(af, "cache_version")
        c = RT.cache
        if c is not None and c.frames:
            a, b = c.range()
            l.label(text="%d frames cached (%d - %d)%s" % (len(c.frames), a, b, "  [BAKED]" if af.baked else ""), icon='FILE_CACHE')
        if af.record_file:
            l.label(text="Last record: " + af.record_file.split("/")[-1], icon='REC')
        r = l.row(align=True)
        r.operator("arcflow.cache_save", text="Save As", icon='EXPORT')
        r.operator("arcflow.cache_import", text="Import", icon='IMPORT')
        l.prop(af, "pack_in_blend")
        r = l.row(align=True)
        r.operator("arcflow.cache_pack"); r.operator("arcflow.cache_unpack")
        r = l.row(align=True)
        r.operator("arcflow.export_alembic", text="Alembic"); r.operator("arcflow.export_ply", text="PLY")


class AF_PT_object_tab(Panel):
    bl_idname = "AF_PT_object_tab"
    bl_label = "Arc Flow"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "object"

    @classmethod
    def poll(cls, ctx):
        return ctx.object is not None and ctx.object.type == 'MESH'

    def draw(self, ctx):
        draw_part(self.layout, ctx)


CLASSES = (AF_PT_main, AF_MT_part_presets, AF_PT_parts, AF_PT_fluids, AF_PT_physics, AF_PT_math, AF_PT_env, AF_PT_xray, AF_PT_solver,
           AF_PT_cache, AF_PT_object_tab)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
