import json
import os

import bpy
import numpy as np
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, StringProperty
from bpy.types import Operator
from bpy_extras.io_utils import ExportHelper, ImportHelper

from . import gn, runtime, shading
from .cachefile import Cache
from .core import fluids as F
from .core import mathcards as MC
from .core import primitives as PR

RT = runtime.RT


def _af(ctx):
    return ctx.scene.arc_flow


# ----------------------------------------------------------------------------- fluids
class AF_OT_add_fluid(Operator):
    bl_idname = "arcflow.add_fluid"
    bl_label = "Add Fluid"
    bl_options = {'REGISTER', 'UNDO'}
    preset: EnumProperty(name="Preset", items=F.FLUID_ITEMS, default='WATER')

    def execute(self, ctx):
        _add_fluid(ctx.scene, self.preset)
        return {'FINISHED'}

    def invoke(self, ctx, ev):
        return ctx.window_manager.invoke_props_dialog(self)


def _add_fluid(scene, key):
    af = scene.arc_flow
    sp = F.FLUIDS[key]
    f = af.fluids.add()
    base = sp['label'].split(' (')[0]
    names = {x.name for x in af.fluids if x is not f}
    n, k = base, 2
    while n in names:
        n = "%s %d" % (base, k); k += 1
    f.name, f.preset, f.kind = n, key, sp['kind']
    f.density, f.bulk, f.molar, f.visc, f.cp = sp['density'], sp['bulk'], sp['molar'], sp['visc'], sp['cp']
    f.temperature, f.flame_t, f.fluid_role = sp['temp'], sp['flame_t'], sp['role']
    f.color = sp['color']
    f.rm_color_a = sp['color']
    af.fluid_index = len(af.fluids) - 1
    runtime.mark_dirty()
    return f


class AF_OT_add_pair(Operator):
    bl_idname = "arcflow.add_propellant_pair"
    bl_label = "Add Propellant Pair"
    bl_options = {'REGISTER', 'UNDO'}
    pair: EnumProperty(name="Pair", items=[(k, v[0], "") for k, v in F.PROPELLANT_PAIRS.items()])

    def execute(self, ctx):
        for key in F.PROPELLANT_PAIRS[self.pair][1]:
            _add_fluid(ctx.scene, key)
        return {'FINISHED'}

    def invoke(self, ctx, ev):
        return ctx.window_manager.invoke_props_dialog(self)


class AF_OT_remove_fluid(Operator):
    bl_idname = "arcflow.remove_fluid"
    bl_label = "Remove Fluid"
    bl_options = {'REGISTER', 'UNDO'}
    index: IntProperty()

    def execute(self, ctx):
        af = _af(ctx)
        if 0 <= self.index < len(af.fluids):
            f = af.fluids[self.index]
            for o in (f.points_obj, f.volume_obj, f.splat_obj):
                if o:
                    bpy.data.objects.remove(o, do_unlink=True)
            af.fluids.remove(self.index)
            runtime.mark_dirty()
        return {'FINISHED'}


# ----------------------------------------------------------------------------- cards
class AF_OT_add_phys(Operator):
    bl_idname = "arcflow.add_physics_card"
    bl_label = "Add Physics Card"
    bl_options = {'REGISTER', 'UNDO'}
    kind: EnumProperty(name="Type", items=[('MASS', "Mass", ""), ('VOLUME', "Volume", ""), ('WEIGHT', "Weight", ""),
                                           ('DENSITY', "Density", ""), ('TEMPERATURE', "Temperature", ""), ('VELOCITY', "Velocity", "")])

    def execute(self, ctx):
        af = _af(ctx)
        c = af.physics_cards.add()
        n = sum(1 for x in af.physics_cards if x.kind == self.kind)
        c.kind = self.kind
        c.name = "%s %d" % (self.kind.title(), n)
        c.value = {'MASS': 1000.0, 'VOLUME': 1.0, 'WEIGHT': 9810.0, 'DENSITY': 997.0, 'TEMPERATURE': 293.15, 'VELOCITY': 1.0}[self.kind]
        if af.fluids:
            c.fluid = af.fluids[min(af.fluid_index, len(af.fluids) - 1)].name
        runtime.mark_dirty()
        return {'FINISHED'}


class AF_OT_remove_phys(Operator):
    bl_idname = "arcflow.remove_physics_card"
    bl_label = "Remove Physics Card"
    bl_options = {'REGISTER', 'UNDO'}
    index: IntProperty()

    def execute(self, ctx):
        af = _af(ctx)
        if 0 <= self.index < len(af.physics_cards):
            gone = af.physics_cards[self.index].name
            af.physics_cards.remove(self.index)
            for m in af.math_cards:
                for i in reversed(range(len(m.terms))):
                    if m.terms[i].kind == 'CARD' and m.terms[i].card == gone:
                        m.terms.remove(i)
            runtime.mark_dirty()
        return {'FINISHED'}


class AF_OT_add_math(Operator):
    bl_idname = "arcflow.add_math_card"
    bl_label = "Add Math Card"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, ctx):
        af = _af(ctx)
        m = af.math_cards.add()
        m.name = "Math %d" % len(af.math_cards)
        runtime.mark_dirty()
        return {'FINISHED'}


class AF_OT_remove_math(Operator):
    bl_idname = "arcflow.remove_math_card"
    bl_label = "Remove Math Card"
    bl_options = {'REGISTER', 'UNDO'}
    index: IntProperty()

    def execute(self, ctx):
        af = _af(ctx)
        if 0 <= self.index < len(af.math_cards):
            af.math_cards.remove(self.index)
            runtime.mark_dirty()
        return {'FINISHED'}


class AF_OT_math_term(Operator):
    bl_idname = "arcflow.math_term"
    bl_label = "Math Card Item"
    bl_options = {'REGISTER', 'UNDO'}
    card: IntProperty()
    action: EnumProperty(items=[('ADD_CARD', "Physics card", ""), ('ADD_CONST', "Constant", ""), ('ADD_GROUP', "Group", ""),
                                ('CLOSE_GROUP', "Close group", ""), ('REMOVE', "Remove", "")])
    term: IntProperty(default=-1)

    def execute(self, ctx):
        af = _af(ctx)
        m = af.math_cards[self.card]
        if self.action == 'REMOVE':
            if 0 <= self.term < len(m.terms):
                kind, ref = m.terms[self.term].kind, m.terms[self.term].group_ref
                m.terms.remove(self.term)
                if kind == 'GROUP':          # drop the group's own terms and definition too
                    for i in reversed(range(len(m.terms))):
                        if m.terms[i].group == ref:
                            m.terms.remove(i)
                    for i in reversed(range(len(m.groups))):
                        if m.groups[i].name == ref:
                            m.groups.remove(i)
                    if m.target_group == ref:
                        m.target_group = ""
            runtime.mark_dirty()
            return {'FINISHED'}
        if self.action == 'CLOSE_GROUP':
            m.target_group = ""
            return {'FINISHED'}
        t = m.terms.add()
        t.group = m.target_group
        t.op = 'ADD'
        if self.action == 'ADD_CARD':
            t.kind = 'CARD'
            if af.physics_cards:
                t.card = af.physics_cards[0].name
        elif self.action == 'ADD_CONST':
            t.kind = 'CONST'
        else:
            g = m.groups.add()
            g.name = MC.group_name(len(m.groups) - 1)
            t.kind, t.group_ref = 'GROUP', g.name
            m.target_group = g.name           # new terms land inside the group until it is closed
        runtime.mark_dirty()
        return {'FINISHED'}


# ----------------------------------------------------------------------------- parts
PART_PRESETS = {
    'TANK_LIQUID': ("Pressurised liquid tank", dict(role='CONTAINER', cavity_mode='SHELL', pressure=5.0e5, fill_percent=80.0, material='STAINLESS_STEEL', wall=0.004)),
    'TANK_OPEN': ("Open box / bucket (solid body)", dict(role='CONTAINER', cavity_mode='SOLID', pressure=0.0, fill_percent=60.0, material='INDUSTRIAL_STEEL')),
    'PIPE': ("Pipe / hose / vein", dict(role='TRANSPORT', cavity_mode='AUTO', material='STAINLESS_STEEL', wall=0.003)),
    'CHAMBER': ("Combustion chamber", dict(role='CHAMBER', cavity_mode='AUTO', material='INCONEL', wall=0.008)),
    'NOZZLE': ("Nozzle / bell", dict(role='CHAMBER', cavity_mode='AUTO', material='COPPER', wall=0.004)),
    'ENV': ("Collider (floor, walls)", dict(role='COLLIDER', cavity_mode='SOLID')),
}


class AF_OT_part_preset(Operator):
    bl_idname = "arcflow.part_preset"
    bl_label = "Apply Part Preset"
    bl_options = {'REGISTER', 'UNDO'}
    preset: EnumProperty(items=[(k, v[0], "") for k, v in PART_PRESETS.items()])

    def execute(self, ctx):
        af = _af(ctx)
        targets = [o for o in ctx.selected_objects if o.type == 'MESH'] or ([ctx.object] if ctx.object and ctx.object.type == 'MESH' else [])
        for o in targets:
            p = o.arc_flow
            for k, v in PART_PRESETS[self.preset][1].items():
                setattr(p, k, v)
            if p.role == 'CONTAINER' and af.fluids and not p.fluid:
                p.fluid = af.fluids[min(af.fluid_index, len(af.fluids) - 1)].name
        runtime.mark_dirty()
        return {'FINISHED'}


class AF_OT_set_role(Operator):
    bl_idname = "arcflow.set_role"
    bl_label = "Set Role"
    bl_options = {'REGISTER', 'UNDO'}
    role: StringProperty()

    def execute(self, ctx):
        for o in [o for o in ctx.selected_objects if o.type == 'MESH'] or ([ctx.object] if ctx.object else []):
            o.arc_flow.role = self.role
            if self.role == 'CONTAINER' and not o.arc_flow.fluid and _af(ctx).fluids:
                o.arc_flow.fluid = _af(ctx).fluids[0].name
        runtime.mark_dirty()
        return {'FINISHED'}


class AF_OT_select_faces(Operator):
    bl_idname = "arcflow.select_faces"
    bl_label = "Select Faces"
    bl_description = "Enter Edit Mode to pick the emitting faces; leaving Edit Mode (Tab) assigns them automatically"

    def execute(self, ctx):
        o = ctx.object
        if o is None or o.type != 'MESH':
            return {'CANCELLED'}
        o['af_selecting'] = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='FACE')
        return {'FINISHED'}


class AF_OT_assign_faces(Operator):
    bl_idname = "arcflow.assign_faces"
    bl_label = "Assign"
    bl_description = "Store the currently selected faces as the emitting region"

    def execute(self, ctx):
        o = ctx.object
        if o is None or o.type != 'MESH':
            return {'CANCELLED'}
        n = runtime.assign_selected_faces(o)
        self.report({'INFO'}, "%d vertices assigned to AF_Emit" % n)
        return {'FINISHED'}


# ----------------------------------------------------------------------------- run
class AF_OT_build(Operator):
    bl_idname = "arcflow.build"
    bl_label = "Build"
    bl_description = "Start the simulation and play the timeline at the scene frame rate, generating every frame"

    def execute(self, ctx):
        af = _af(ctx)
        if not [o for o in ctx.scene.objects if o.type == 'MESH' and (o.arc_flow.role != 'NONE' or o.arc_flow.is_emitter)]:
            self.report({'ERROR'}, "Assign a role (Container / Transport / Chamber) or an emitter to at least one mesh first")
            return {'CANCELLED'}
        try:
            runtime.start(ctx.scene, record=False)
        except Exception as ex:
            self.report({'ERROR'}, "Build failed: %s" % ex)
            return {'CANCELLED'}
        return {'FINISHED'}


class AF_OT_record(Operator):
    bl_idname = "arcflow.record"
    bl_label = "Record"
    bl_description = "Run the simulation from the playhead and record it to a separate file (freehand take)"

    def execute(self, ctx):
        try:
            runtime.start(ctx.scene, record=True)
        except Exception as ex:
            self.report({'ERROR'}, "Record failed: %s" % ex)
            return {'CANCELLED'}
        return {'FINISHED'}


class AF_OT_stop(Operator):
    bl_idname = "arcflow.stop"
    bl_label = "Stop"

    def execute(self, ctx):
        runtime.stop(ctx.scene)
        return {'FINISHED'}


class AF_OT_bake(Operator):
    bl_idname = "arcflow.bake"
    bl_label = "Bake"
    bl_description = "Simulate any missing frames in the range and write a frozen baked file (new version; older bakes stay)"

    def execute(self, ctx):
        wm = ctx.window_manager
        s, e = runtime.frame_range(ctx.scene)
        wm.progress_begin(0, max(e - s + 1, 1))
        try:
            runtime.bake(ctx.scene, progress=lambda k, n: wm.progress_update(k))
        except Exception as ex:
            self.report({'ERROR'}, "Bake failed: %s" % ex)
            return {'CANCELLED'}
        finally:
            wm.progress_end()
        self.report({'INFO'}, _af(ctx).status)
        return {'FINISHED'}


class AF_OT_refresh(Operator):
    bl_idname = "arcflow.refresh"
    bl_label = "Rebuild"
    bl_description = "Re-read the scene (parts, fluids, cards), rebuild collision fields and the node setups"

    def execute(self, ctx):
        RT.field_cache.clear()
        RT.scene_name = ctx.scene.name
        runtime.ensure_world(ctx.scene, force=True)
        return {'FINISHED'}


# ----------------------------------------------------------------------------- cache
class AF_OT_cache_save(Operator, ExportHelper):
    bl_idname = "arcflow.cache_save"
    bl_label = "Save Simulation Data As"
    filename_ext = ".npz"
    filter_glob: StringProperty(default="*.npz", options={'HIDDEN'})

    def execute(self, ctx):
        c = RT.cache or runtime.ensure_cache(ctx.scene)
        c.save(self.filepath)
        af = _af(ctx)
        af.cache_dir = os.path.dirname(self.filepath) + os.sep
        name = os.path.splitext(os.path.basename(self.filepath))[0]
        if "_v" in name:
            af.cache_name = name.rsplit("_v", 1)[0]
        return {'FINISHED'}


class AF_OT_cache_import(Operator, ImportHelper):
    bl_idname = "arcflow.cache_import"
    bl_label = "Import Simulation Data"
    filename_ext = ".npz"
    filter_glob: StringProperty(default="*.npz", options={'HIDDEN'})

    def execute(self, ctx):
        af = _af(ctx)
        c = Cache.load(self.filepath)
        RT.cache = c
        base = os.path.splitext(os.path.basename(self.filepath))[0]
        baked = base.endswith("_baked")
        af.cache_dir = os.path.dirname(self.filepath) + os.sep
        if "_v" in base:
            head, tail = base.rsplit("_v", 1)
            af.cache_name = head
            try:
                af.cache_version = int(tail.split("_")[0])
            except ValueError:
                pass
        af.baked, af.baked_file = baked, (self.filepath if baked else "")
        if not baked:
            c.path = runtime.work_path(af)
        self.report({'INFO'}, "Imported %d frames" % len(c.frames))
        return {'FINISHED'}


class AF_OT_cache_pack(Operator):
    bl_idname = "arcflow.cache_pack"
    bl_label = "Pack Cache into .blend"

    def execute(self, ctx):
        if RT.cache is None or not RT.cache.frames:
            self.report({'WARNING'}, "No simulation data to pack")
            return {'CANCELLED'}
        n = runtime.pack_cache(ctx.scene)
        self.report({'INFO'}, "Packed %.1f MB" % (n / 1e6))
        return {'FINISHED'}


class AF_OT_cache_unpack(Operator):
    bl_idname = "arcflow.cache_unpack"
    bl_label = "Unpack Cache to File"

    def execute(self, ctx):
        t = bpy.data.texts.get("ArcFlow_Cache")
        if t is None:
            self.report({'WARNING'}, "Nothing packed")
            return {'CANCELLED'}
        af = _af(ctx)
        c = Cache.from_text(t.as_string())
        c.save(runtime.work_path(af))
        RT.cache = c
        return {'FINISHED'}


class AF_OT_export_ply(Operator):
    bl_idname = "arcflow.export_ply"
    bl_label = "Export PLY Sequence"
    directory: StringProperty(subtype='DIR_PATH')

    def invoke(self, ctx, ev):
        ctx.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, ctx):
        c = runtime.playback_cache(ctx.scene)
        if c is None or not c.frames:
            self.report({'WARNING'}, "No simulation data")
            return {'CANCELLED'}
        n = c.export_ply_sequence(self.directory, _af(ctx).cache_name)
        self.report({'INFO'}, "Wrote %d PLY frames" % n)
        return {'FINISHED'}


class AF_OT_export_abc(Operator, ExportHelper):
    bl_idname = "arcflow.export_alembic"
    bl_label = "Export Alembic (particle points)"
    bl_description = "Plays the cached simulation back and writes the particle point objects to an Alembic archive"
    filename_ext = ".abc"
    filter_glob: StringProperty(default="*.abc", options={'HIDDEN'})

    def execute(self, ctx):
        af = _af(ctx)
        sc = ctx.scene
        objs = [f.points_obj for f in af.fluids if f.points_obj]
        if not objs:
            self.report({'WARNING'}, "Build or rebuild first so the particle objects exist")
            return {'CANCELLED'}
        for o in sc.objects:
            o.select_set(False)
        for o in objs:
            o.hide_viewport = False
            o.select_set(True)
        s, e = runtime.frame_range(sc)
        bpy.ops.wm.alembic_export(filepath=self.filepath, start=s, end=e, selected=True, evaluation_mode='VIEWPORT')
        return {'FINISHED'}


# ----------------------------------------------------------------------------- feedback + demo
class AF_OT_add_feedback_plane(Operator):
    bl_idname = "arcflow.add_feedback_plane"
    bl_label = "Add Feedback Plane"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, ctx):
        af = _af(ctx)
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=ctx.scene.cursor.location)
        o = ctx.object
        o.name = "AF_FeedbackPlane"
        o.data.materials.append(shading.feedback_material())
        o['af_fb'] = 0.0
        af.feedback_obj = o
        return {'FINISHED'}


class AF_OT_assign_feedback(Operator):
    bl_idname = "arcflow.assign_feedback"
    bl_label = "Assign Active Object"
    bl_description = "Use the active object (mesh, hair curves, anything with a material) as the feedback asset"

    def execute(self, ctx):
        o = ctx.object
        if o is None:
            return {'CANCELLED'}
        _af(ctx).feedback_obj = o
        o['af_fb'] = 0.0
        if o.data is not None and hasattr(o.data, 'materials') and not len(o.data.materials):
            o.data.materials.append(shading.feedback_material())
        self.report({'INFO'}, "Feedback value is written to the custom property 'af_fb' (read it with an Attribute node, type Object)")
        return {'FINISHED'}


class AF_OT_demo(Operator):
    bl_idname = "arcflow.demo"
    bl_label = "Add Demo Rig"
    bl_description = "Pressurised RP-1 tank + pipe (cavities intersect) + chamber with a LOX tank, ready to Build"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, ctx):
        sc = ctx.scene
        af = sc.arc_flow
        if not af.fluids:
            _add_fluid(sc, 'RP1'); _add_fluid(sc, 'LOX')
        fu, ox = af.fluids[0].name, af.fluids[min(1, len(af.fluids) - 1)].name

        def mk(name, vt, loc, role, **kw):
            v, t = vt
            me = bpy.data.meshes.new(name)
            me.from_pydata(np.asarray(v, float).tolist(), [], np.asarray(t, int).tolist())
            me.update()
            o = bpy.data.objects.new(name, me)
            ctx.collection.objects.link(o)
            o.location = loc
            for k, val in kw.items():
                setattr(o.arc_flow, k, val)
            o.arc_flow.role = role
            return o
        mk("AF_FuelTank", PR.uvsphere(r=1.0), (-3.5, 0, 1.2), 'CONTAINER', cavity_mode='SHELL', fluid=fu, pressure=6.0e5, fill_percent=75.0, material='ALUMINUM')
        mk("AF_OxTank", PR.uvsphere(r=1.0), (2.2, 4.0, 1.2), 'CONTAINER', cavity_mode='SHELL', fluid=ox, pressure=6.0e5, fill_percent=75.0, material='ALUMINUM')
        mk("AF_FuelLine", PR.tube(n=24, r0=0.3, r1=0.22, L=4.4), (-0.6, 0, 1.2), 'TRANSPORT', cavity_mode='SOLID', material='STAINLESS_STEEL')
        mk("AF_OxLine", PR.tube(n=24, r0=0.3, r1=0.22, L=4.4, axis='y'), (2.2, 2.0, 1.2), 'TRANSPORT', cavity_mode='SOLID', material='STAINLESS_STEEL')
        c = mk("AF_Chamber", PR.uvsphere(r=1.0), (2.2, 0.0, 1.2), 'CHAMBER', cavity_mode='SHELL', material='INCONEL')
        c.scale = (1.0, 1.2, 1.0)
        mk("AF_Nozzle", PR.tube(n=24, r0=0.45, r1=0.35, L=3.0, axis='z'), (2.2, 0.0, -0.2), 'CHAMBER', cavity_mode='SOLID', material='COPPER')
        af.env.ground_auto = False
        af.env.ground_z = -3.5
        af.xray = True
        runtime.mark_dirty()
        self.report({'INFO'}, "Demo rig added (pipe ends already enter the tanks and the chamber). Press Build.")
        return {'FINISHED'}


CLASSES = (AF_OT_add_fluid, AF_OT_add_pair, AF_OT_remove_fluid, AF_OT_add_phys, AF_OT_remove_phys, AF_OT_add_math, AF_OT_remove_math,
           AF_OT_math_term, AF_OT_part_preset, AF_OT_set_role, AF_OT_select_faces, AF_OT_assign_faces, AF_OT_build, AF_OT_record,
           AF_OT_stop, AF_OT_bake, AF_OT_refresh, AF_OT_cache_save, AF_OT_cache_import, AF_OT_cache_pack, AF_OT_cache_unpack,
           AF_OT_export_ply, AF_OT_export_abc, AF_OT_add_feedback_plane, AF_OT_assign_feedback, AF_OT_demo)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
