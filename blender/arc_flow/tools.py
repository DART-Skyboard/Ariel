"""Standalone mesh tools + Geometry Nodes editor integration (no fluids, roles, Build or simulation required).

Operators (3D View sidebar "Arc Flow > Mesh Tools", 3D View Object/Mesh menus and the Geometry Node editor):
  Convert to Quads, LOTBCBP Projection, Analyze Geometry, Assign Role, Auto-setup Simulation,
  Prep Geometry Nodes setup, Add LOTBCBP node group, Assign point / splat source, Render mode presets.
All of them drive the same library as the simulation (core.quads, core.sdf.PartField, gn groups)."""
import json

import bmesh
import bpy
import numpy as np
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, StringProperty
from bpy.types import Menu, Operator, Panel

from . import gn, quadify, runtime
from .core import quads as Q
from .core import sdf as SDF
from .core import world as W

RT = runtime.RT


def _meshes(ctx):
    objs = [o for o in (ctx.selected_objects or []) if o.type == 'MESH']
    if not objs and ctx.object is not None and ctx.object.type == 'MESH':
        objs = [ctx.object]
    return objs


# ----------------------------------------------------------------------------- Convert to Quads
class AF_OT_convert_to_quads(Operator):
    bl_idname = "arcflow.convert_to_quads"
    bl_label = "Convert to Quads"
    bl_description = ("Quadrangulate and clean triangles / n-gons.  Object Mode: whole selected objects.  Edit Mode: the selected "
                      "faces only (all selected = whole mesh), the rest of the mesh and the patch border stay untouched")
    bl_options = {'REGISTER', 'UNDO'}

    merge_rel: FloatProperty(name="Merge (local)", default=0.02, min=0.0, max=0.5,
                             description="Merge vertices closer than this fraction of their local edge length (adaptive, keeps tight detail)")
    face_angle: FloatProperty(name="Max face angle", default=40.0, min=0.0, max=180.0, description="Degrees between triangle normals to still join")
    shape_angle: FloatProperty(name="Max shape angle", default=40.0, min=0.0, max=180.0, description="Degrees of corner deviation from 90 to still join")
    all_quads: BoolProperty(name="All quads (split leftovers)", default=False,
                            description="Split the region once (centre + edge midpoints) so no triangle remains; doubles density everywhere proportionally")
    symmetry: EnumProperty(name="Symmetry", items=[('AUTO', "Auto", "Mesh mirror flags or a detected X / Y / Z mirror"),
                                                   ('NONE', "Off", ""), ('X', "X", ""), ('Y', "Y", ""), ('Z', "Z", ""),
                                                   ('XY', "X + Y", ""), ('XYZ', "X + Y + Z", "")], default='AUTO')

    @classmethod
    def poll(cls, ctx):
        return any(o.type == 'MESH' for o in (ctx.selected_objects or [])) or (ctx.object is not None and ctx.object.type == 'MESH')

    def _sym(self, me):
        if self.symmetry != 'AUTO':
            return self.symmetry
        flags = ''.join(a for a in 'XYZ' if getattr(me, 'use_mirror_' + a.lower(), False))
        return flags or 'AUTO'

    def execute(self, ctx):
        stats = []
        if ctx.mode == 'EDIT_MESH':
            for o in (ctx.objects_in_mode or [ctx.object]):
                if o.type != 'MESH':
                    continue
                bm = bmesh.from_edit_mesh(o.data)
                sel = [f for f in bm.faces if f.select]
                if not sel:
                    continue
                whole = len(sel) == len(bm.faces)
                st = quadify.convert(bm, sel, self.merge_rel, self.face_angle, self.shape_angle, self.all_quads,
                                     self._sym(o.data) if whole else 'NONE', whole=whole)
                bmesh.update_edit_mesh(o.data)
                stats.append((o.name, st))
        else:
            for o in _meshes(ctx):
                bm = bmesh.new()
                bm.from_mesh(o.data)
                st = quadify.convert(bm, None, self.merge_rel, self.face_angle, self.shape_angle, self.all_quads, self._sym(o.data), whole=True)
                bm.to_mesh(o.data)
                bm.free()
                o.data.update()
                stats.append((o.name, st))
        if not stats:
            self.report({'WARNING'}, "Nothing to convert (select faces in Edit Mode or mesh objects in Object Mode)")
            return {'CANCELLED'}
        runtime.mark_dirty()
        msg = "; ".join("%s: %d -> %d quads, %d tris, %d n-gons left, %d merged%s" % (
            n, s['faces_in'], s['quads'], s['tris'], s['ngons'], s['merged'], (", symmetric " + "".join(s['symmetry'])) if s['symmetry'] else "")
            for n, s in stats)
        self.report({'INFO'}, msg)
        return {'FINISHED'}


# ----------------------------------------------------------------------------- analysis (shared by auto-setup)
def _eval_mesh(o, deps):
    v, _t, pl = runtime._mesh_arrays(o, deps, polys=True)
    return v, pl


def analyze_objects(ctx, objs, resolution=32):
    """Mesh + quad quality, cavity / openings (PartField), and pairwise intersections.  Stored as JSON in
    obj['af_analysis'].  Returns {name: report}."""
    deps = ctx.evaluated_depsgraph_get()
    out, fields = {}, {}
    for o in objs:
        v, pl = _eval_mesh(o, deps)
        rep = Q.analyze(v, pl)
        try:
            f = SDF.PartField(v, pl, o.arc_flow.cavity_mode if o.arc_flow.role != 'NONE' else 'AUTO', resolution, 0)
            rep.update(cavity_mode=f.mode, cavity_volume=float(f.cavity_volume()), openings=len(f.openings))
            fields[o.name] = (f, np.array(o.evaluated_get(deps).matrix_world), v)
        except Exception as ex:
            rep.update(cavity_mode='?', cavity_volume=0.0, openings=0, error=str(ex))
        rep['intersects'] = []
        out[o.name] = rep
    names = list(fields)
    for i, a in enumerate(names):
        fa, ma, _va = fields[a]
        inv = np.linalg.inv(ma)
        for b in names[i + 1:]:
            fb, mb, vb = fields[b]
            if not len(vb):
                continue
            wb = vb @ mb[:3, :3].T + mb[:3, 3]
            la = wb @ inv[:3, :3].T + inv[:3, 3]
            cav, mat = fa.fields(la, bricks=False)
            hit = int(((cav < 0) | (mat < 0)).sum())
            if hit:
                out[a]['intersects'].append(b); out[b]['intersects'].append(a)
    for o in objs:
        r = out[o.name]
        o['af_analysis'] = json.dumps({k: v for k, v in r.items() if k not in ('quadify',)}, default=float)
    return out


class AF_OT_analyze(Operator):
    bl_idname = "arcflow.analyze"
    bl_label = "Analyze Geometry"
    bl_description = "Report cavities, openings, intersections and mesh / quad quality of the selected meshes (no simulation needed)"

    @classmethod
    def poll(cls, ctx):
        return bool(_meshes(ctx))

    def execute(self, ctx):
        if ctx.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        res = analyze_objects(ctx, _meshes(ctx))
        for n, r in res.items():
            self.report({'INFO'}, "%s: %d faces (%d tri, %d quad, %d n-gon), %d dup/short verts, %d degenerate, %d open edges, "
                        "cavity %s %.4g, %d openings, intersects %s" % (n, r['faces'], r['tris'], r['quads'], r['ngons'], r['duplicate_or_short'],
                                                                         r['degenerate'], r['boundary_edges'], r.get('cavity_mode'), r.get('cavity_volume', 0),
                                                                         r.get('openings', 0), ", ".join(r['intersects']) or "nothing"))
        return {'FINISHED'}


# ----------------------------------------------------------------------------- standalone LOTBCBP projection
class AF_OT_lotbcbp_project(Operator):
    bl_idname = "arcflow.lotbcbp_project"
    bl_label = "LOTBCBP Projection"
    bl_description = ("Run the LOTBCBP tessellation / projection on the selected meshes without a simulation: quadrangulate a copy, "
                      "split quads as quads with Phong projection, write the result to a new '<name>_LOTBCBP' object")
    bl_options = {'REGISTER', 'UNDO'}

    resolution: IntProperty(name="Field resolution", default=24, min=8, max=96)
    edge: FloatProperty(name="Target edge", default=0.0, min=0.0, unit='LENGTH', description="0 = 2 x field voxel")
    phong: FloatProperty(name="Projection (Phong)", default=0.6, min=0.0, max=1.0)

    @classmethod
    def poll(cls, ctx):
        return bool(_meshes(ctx))

    def execute(self, ctx):
        if ctx.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        deps = ctx.evaluated_depsgraph_get()
        made = []
        for o in _meshes(ctx):
            if o.get('af_lotbcbp_of'):
                continue
            v, pl = _eval_mesh(o, deps)
            f = SDF.PartField(v, pl, 'AUTO', self.resolution, 2)
            qs = f.tessellate(max_edge=(self.edge or None), phong=self.phong)
            qv, qq = Q.soup_to_mesh(qs)
            name = o.name + "_LOTBCBP"
            me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
            me.clear_geometry()
            me.from_pydata(qv.tolist(), [], qq.tolist())
            me.update()
            ob = bpy.data.objects.get(name)
            if ob is None:
                ob = bpy.data.objects.new(name, me)
                (o.users_collection[0] if o.users_collection else ctx.collection).objects.link(ob)
            ob.data = me
            ob.matrix_world = o.matrix_world.copy()
            ob['af_lotbcbp_of'] = o.name
            made.append("%s: %d src quads -> %d projected quads" % (o.name, len(f.quads), len(qq)))
        self.report({'INFO'}, "; ".join(made) or "nothing projected")
        return {'FINISHED'}


# ----------------------------------------------------------------------------- roles + auto setup
ROLE_ITEMS = [('CONTAINER', "Container / tank", "Holds a fill of fluid"),
              ('PRESSURE_CHAMBER', "Pressure chamber / vessel", "Container role with a pressurised fill"),
              ('TRANSPORT', "Channel / transport", "Pipe, hose, duct, vein"),
              ('CHAMBER', "Combustion chamber", "Chamber role: fuel + oxidizer burn here"),
              ('NOZZLE', "Nozzle / bell", "Chamber role, copper preset"),
              ('COLLIDER', "Collider", "Solid obstacle"),
              ('NONE', "None", "Not part of the simulation")]


def apply_role(o, key, scene):
    from .ops import PART_PRESETS
    p = o.arc_flow
    preset = {'CONTAINER': 'TANK_LIQUID', 'PRESSURE_CHAMBER': 'PRESSURE_CHAMBER', 'TRANSPORT': 'PIPE', 'CHAMBER': 'CHAMBER',
              'NOZZLE': 'NOZZLE', 'COLLIDER': 'ENV'}.get(key)
    if preset is None:
        p.role = 'NONE'
        return
    for k, v in PART_PRESETS[preset][1].items():
        setattr(p, k, v)
    af = scene.arc_flow
    if p.role == 'CONTAINER' and af.fluids and not p.fluid:
        p.fluid = af.fluids[min(af.fluid_index, len(af.fluids) - 1)].name


class AF_OT_assign_role(Operator):
    bl_idname = "arcflow.assign_role"
    bl_label = "Assign Role"
    bl_description = "Assign an Arc Flow part role (with its preset values) to the selected meshes"
    bl_options = {'REGISTER', 'UNDO'}
    role: EnumProperty(name="Role", items=ROLE_ITEMS)

    def execute(self, ctx):
        for o in _meshes(ctx):
            apply_role(o, self.role, ctx.scene)
        runtime.mark_dirty()
        return {'FINISHED'}


def guess_role(name, rep):
    n = name.lower()
    for words, key in ((('nozzle', 'bell'), 'NOZZLE'), (('combust', 'chamber', 'engine'), 'CHAMBER'),
                       (('pressure', 'vessel'), 'PRESSURE_CHAMBER'), (('tank', 'bottle', 'reservoir'), 'CONTAINER'),
                       (('pipe', 'hose', 'line', 'duct', 'vein', 'channel'), 'TRANSPORT'), (('floor', 'wall', 'ground'), 'COLLIDER')):
        if any(w in n for w in words):
            return key
    if rep.get('cavity_volume', 0.0) <= 0.0:
        return 'COLLIDER'
    return 'CONTAINER' if rep.get('openings', 0) == 0 else 'TRANSPORT'


class AF_OT_auto_setup(Operator):
    bl_idname = "arcflow.auto_setup"
    bl_label = "Auto-setup Simulation"
    bl_description = ("Analyze the selected meshes, give unassigned ones a role from their cavities / openings / name, add a fluid if "
                      "none exists, then build the world: joints come from the mesh intersections, no manual joints needed")
    bl_options = {'REGISTER', 'UNDO'}
    start: BoolProperty(name="Start simulation", default=False)
    overwrite: BoolProperty(name="Re-assign existing roles", default=False)

    def execute(self, ctx):
        if ctx.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        sc = ctx.scene
        objs = _meshes(ctx) or [o for o in sc.objects if o.type == 'MESH' and o.arc_flow.role != 'NONE']
        objs = [o for o in objs if not o.name.startswith('AF_') or o.arc_flow.role != 'NONE']
        if not objs:
            self.report({'ERROR'}, "Select the meshes of the system")
            return {'CANCELLED'}
        from .ops import _add_fluid
        if not sc.arc_flow.fluids:
            _add_fluid(sc, 'WATER')
        rep = analyze_objects(ctx, objs)
        assigned = []
        for o in objs:
            if o.arc_flow.role == 'NONE' or self.overwrite:
                key = guess_role(o.name, rep[o.name])
                apply_role(o, key, sc)
                assigned.append("%s=%s" % (o.name, key))
        runtime.mark_dirty()
        RT.scene_name = sc.name
        try:
            w = runtime.ensure_world(sc, force=True)
        except Exception as ex:
            self.report({'ERROR'}, "Auto-setup build failed: %s" % ex)
            return {'CANCELLED'}
        cnt = {}
        for op in w.openings:
            cnt[op['state']] = cnt.get(op['state'], 0) + 1
        self.report({'INFO'}, "Roles: %s | joints %s" % (", ".join(assigned) or "kept",
                                                         ", ".join("%s %d" % kv for kv in sorted(cnt.items())) or "none"))
        if self.start:
            runtime.start(sc, record=False)
        return {'FINISHED'}


# ----------------------------------------------------------------------------- Geometry Nodes prep + node menu
class AF_OT_prep_gn(Operator):
    bl_idname = "arcflow.prep_gn"
    bl_label = "Prep Geometry Nodes setup"
    bl_description = ("Drop the AF LOTBCBP Prep node group into the active object's Geometry Nodes graph (creates a GN modifier + tree "
                      "if there is none) so the tool can be wired with other nodes in the Geometry Node editor")
    bl_options = {'REGISTER', 'UNDO'}
    insert: BoolProperty(name="Insert before Group Output", default=False, description="Existing trees: wire the node in instead of only adding it")

    @classmethod
    def poll(cls, ctx):
        return ctx.object is not None and ctx.object.type == 'MESH'

    def execute(self, ctx):
        o = ctx.object
        mod, node = gn.prep_object(o, insert=self.insert)
        sp = ctx.space_data
        if sp is not None and sp.type == 'NODE_EDITOR' and sp.tree_type == 'GeometryNodeTree' and not sp.pin:
            try:
                sp.node_tree = mod.node_group
            except Exception:
                pass
        self.report({'INFO'}, "%s: AF LOTBCBP Prep in '%s' (modifier '%s')" % (o.name, mod.node_group.name, mod.name))
        return {'FINISHED'}


class AF_OT_gn_add_group(Operator):
    bl_idname = "arcflow.gn_add_group"
    bl_label = "Add LOTBCBP Node"
    bl_description = "Add an Arc Flow / LOTBCBP node group to the current Geometry Nodes tree"
    bl_options = {'REGISTER', 'UNDO'}
    group: StringProperty(default="AF LOTBCBP Prep")

    @classmethod
    def poll(cls, ctx):
        sp = ctx.space_data
        return sp is not None and sp.type == 'NODE_EDITOR' and sp.tree_type == 'GeometryNodeTree' and sp.edit_tree is not None

    def execute(self, ctx):
        tree = ctx.space_data.edit_tree
        ng = gn.ensure_lotbcbp_group(self.group)
        if ng is tree:
            return {'CANCELLED'}
        for n in tree.nodes:
            n.select = False
        node = tree.nodes.new('GeometryNodeGroup')
        node.node_tree = ng
        node.location = ctx.space_data.cursor_location
        node.select = True
        tree.nodes.active = node
        return {'FINISHED'}


# ----------------------------------------------------------------------------- point / splat source + render presets
class AF_OT_assign_point_source(Operator):
    bl_idname = "arcflow.assign_point_source"
    bl_label = "Assign Selected Mesh"
    bl_description = "Use the active (selected) mesh as the instanced primitive of this fluid's Points or Splat render instead of the icosphere"
    bl_options = {'REGISTER', 'UNDO'}
    index: IntProperty(default=0)
    target: EnumProperty(items=[('POINTS', "Points", ""), ('SPLAT', "Splat", "")], default='POINTS')
    clear: BoolProperty(default=False)

    def execute(self, ctx):
        af = ctx.scene.arc_flow
        if not (0 <= self.index < len(af.fluids)):
            return {'CANCELLED'}
        fl = af.fluids[self.index]
        src = None
        if not self.clear:
            src = ctx.object if (ctx.object is not None and ctx.object.select_get()) else None
            if src is None or src.type not in ('MESH', 'CURVE', 'FONT', 'META', 'SURFACE', 'CURVES', 'POINTCLOUD', 'VOLUME', 'EMPTY'):
                self.report({'ERROR'}, "Select the mesh (or other object) to instance first")
                return {'CANCELLED'}
            if src in (fl.points_obj, fl.volume_obj, fl.splat_obj):
                self.report({'ERROR'}, "Pick a different object than the fluid's own particle object")
                return {'CANCELLED'}
        if self.target == 'POINTS':
            fl.pt_object = src
        else:
            fl.gs_object = src
        if RT.world is not None:
            runtime.bind_objects(ctx.scene)
        self.report({'INFO'}, "%s %s source: %s" % (fl.name, self.target.title(), src.name if src else "icosphere"))
        return {'FINISHED'}


def _reset_props(item, names):
    for k in names:
        prop = item.bl_rna.properties[k]
        if getattr(prop, 'is_array', False):
            setattr(item, k, tuple(prop.default_array))
        elif prop.type == 'POINTER':
            continue
        else:
            setattr(item, k, prop.default)


RENDER_PRESETS = {
    'POINTS': ("Points (default card)", ('pt_scale', 'pt_subdivisions', 'pt_use_collection')),
    'RAYMARCH': ("Ray-march (default card)", ('rm_density', 'rm_voxel', 'rm_radius', 'rm_color_a', 'rm_color_b', 'rm_blend',
                                              'rm_emission', 'rm_absorption', 'rm_anisotropy', 'rm_noise', 'rm_noise_scale')),
    'SPLAT': ("Gaussian splat (default card)", ('gs_resolution', 'gs_density', 'gs_scale', 'gs_blend')),
}


class AF_OT_render_preset(Operator):
    bl_idname = "arcflow.render_preset"
    bl_label = "Render Mode Preset"
    bl_description = "Switch the fluid to a render mode and reset that mode's card to its default values (works in Cycles and EEVEE)"
    bl_options = {'REGISTER', 'UNDO'}
    index: IntProperty(default=0)
    preset: EnumProperty(items=[(k, v[0], "") for k, v in RENDER_PRESETS.items()])

    def execute(self, ctx):
        af = ctx.scene.arc_flow
        if not (0 <= self.index < len(af.fluids)):
            return {'CANCELLED'}
        fl = af.fluids[self.index]
        fl.render_mode = self.preset
        _reset_props(fl, RENDER_PRESETS[self.preset][1])
        if RT.world is not None:
            runtime.bind_objects(ctx.scene)
        return {'FINISHED'}


# ----------------------------------------------------------------------------- UI
def draw_mesh_tools(l, ctx):
    o = ctx.object
    col = l.column(align=True)
    col.label(text="Standalone (no simulation needed)", icon='MOD_REMESH')
    col.operator("arcflow.convert_to_quads", icon='MESH_GRID')
    col.operator("arcflow.lotbcbp_project", icon='MOD_SUBSURF')
    col.operator("arcflow.analyze", icon='VIEWZOOM')
    col = l.column(align=True)
    col.label(text="Geometry Nodes", icon='GEOMETRY_NODES')
    if o is not None and o.type == 'MESH' and not gn.has_af_setup(o):
        r = col.row()
        r.alert = True
        r.operator("arcflow.prep_gn", icon='NODETREE')
    else:
        col.operator("arcflow.prep_gn", icon='NODETREE')
    col = l.column(align=True)
    col.label(text="Simulation setup", icon='MOD_FLUIDSIM')
    col.operator_menu_enum("arcflow.assign_role", "role", text="Assign Role", icon='OBJECT_DATA')
    col.operator("arcflow.auto_setup", icon='AUTO')
    if o is not None and o.get('af_analysis'):
        try:
            r = json.loads(o['af_analysis'])
            b = l.box()
            b.label(text="%s: %d tri / %d quad / %d n-gon" % (o.name, r['tris'], r['quads'], r['ngons']), icon='INFO')
            b.label(text="cavity %s, %d openings, %d open edges" % (r.get('cavity_mode'), r.get('openings', 0), r['boundary_edges']))
            if r.get('intersects'):
                b.label(text="intersects: " + ", ".join(r['intersects'])[:60])
        except Exception:
            pass


class AF_PT_mesh_tools(Panel):
    bl_idname = "AF_PT_mesh_tools"
    bl_label = "Mesh Tools (LOTBCBP)"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Arc Flow"
    bl_order = 0

    def draw(self, ctx):
        draw_mesh_tools(self.layout, ctx)


class AF_PT_node_tools(Panel):
    bl_idname = "AF_PT_node_tools"
    bl_label = "Arc Flow | LOTBCBP"
    bl_space_type = 'NODE_EDITOR'
    bl_region_type = 'UI'
    bl_category = "Arc Flow"

    @classmethod
    def poll(cls, ctx):
        return ctx.space_data is not None and ctx.space_data.tree_type == 'GeometryNodeTree'

    def draw(self, ctx):
        l = self.layout
        col = l.column(align=True)
        col.label(text="Add node group", icon='NODE')
        for g in gn.LOTBCBP_GROUPS:
            col.operator("arcflow.gn_add_group", text=g).group = g
        draw_mesh_tools(l, ctx)
        l.operator("arcflow.assign_feedback", text="Feedback -> Geometry Nodes", icon='LINKED').target = 'GN'


class AF_MT_gn_add(Menu):
    bl_idname = "AF_MT_gn_add"
    bl_label = "Arc Flow (LOTBCBP)"

    def draw(self, ctx):
        for g in gn.LOTBCBP_GROUPS:
            self.layout.operator("arcflow.gn_add_group", text=g, icon='NODE').group = g


class AF_MT_gn_tools(Menu):
    bl_idname = "AF_MT_gn_tools"
    bl_label = "Arc Flow"

    def draw(self, ctx):
        l = self.layout
        l.operator("arcflow.prep_gn", icon='NODETREE')
        l.menu("AF_MT_gn_add", icon='ADD')
        l.separator()
        l.operator("arcflow.convert_to_quads", icon='MESH_GRID')
        l.operator("arcflow.lotbcbp_project", icon='MOD_SUBSURF')
        l.operator("arcflow.analyze", icon='VIEWZOOM')
        l.separator()
        l.operator_menu_enum("arcflow.assign_role", "role", text="Assign Role")
        l.operator("arcflow.auto_setup", icon='AUTO')
        l.operator("arcflow.assign_feedback", text="Feedback -> Geometry Nodes", icon='LINKED').target = 'GN'


def _node_add_menu(self, ctx):
    if ctx.space_data is not None and ctx.space_data.tree_type == 'GeometryNodeTree':
        self.layout.separator()
        self.layout.menu("AF_MT_gn_add", icon='MOD_FLUIDSIM')


def _node_header_menu(self, ctx):
    if ctx.space_data is not None and ctx.space_data.tree_type == 'GeometryNodeTree':
        self.layout.menu("AF_MT_gn_tools")


def _view3d_menu(self, ctx):
    self.layout.separator()
    self.layout.operator("arcflow.convert_to_quads", icon='MESH_GRID')
    self.layout.operator("arcflow.lotbcbp_project", icon='MOD_SUBSURF')


CLASSES = (AF_OT_convert_to_quads, AF_OT_analyze, AF_OT_lotbcbp_project, AF_OT_assign_role, AF_OT_auto_setup, AF_OT_prep_gn,
           AF_OT_gn_add_group, AF_OT_assign_point_source, AF_OT_render_preset, AF_PT_mesh_tools, AF_PT_node_tools,
           AF_MT_gn_add, AF_MT_gn_tools)
_MENUS = (('NODE_MT_add', _node_add_menu), ('NODE_MT_editor_menus', _node_header_menu),
          ('VIEW3D_MT_object', _view3d_menu), ('VIEW3D_MT_edit_mesh_faces', _view3d_menu))


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    for m, fn in _MENUS:
        t = getattr(bpy.types, m, None)
        if t is not None:
            t.append(fn)


def unregister():
    for m, fn in _MENUS:
        t = getattr(bpy.types, m, None)
        if t is not None:
            try:
                t.remove(fn)
            except Exception:
                pass
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
