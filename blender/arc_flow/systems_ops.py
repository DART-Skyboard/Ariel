"""Systems panel, Re-detect, Auto roles and the twin-engine demo operator (Tessera Projection / LOTBCBP)."""
import bpy
from bpy.types import Operator, Panel

from . import runtime, systems

ICON = {'idle': 'PAUSE', 'running': 'PLAY', 'enhanced': 'SOLO_ON', 'failed': 'CANCEL'}


class AF_OT_demo_twin(Operator):
    bl_idname = "arcflow.demo_twin"
    bl_label = "Load Demo: Twin Engines + Crossfeed"
    bl_description = ("Two engines side by side built from Blender primitives and a straight crossfeed pipe between them. "
                      "Variant Good: engine A's oxidizer tank into engine B's chamber manifold (enhanced). Bad: engine A's hot chamber into "
                      "engine B's fuel tank (failure). Press Build / Play")
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, ctx):
        from . import demos
        self.report({'INFO'}, demos.build_twin(ctx.scene))
        return {'FINISHED'}


class AF_OT_systems_detect(Operator):
    bl_idname = "arcflow.systems_detect"
    bl_label = "Re-detect"
    bl_description = "Scan the scene: interactive physics context, parts, joints, systems and crossfeed links (also runs on Build)"

    def execute(self, ctx):
        systems.scan_context(ctx.scene)
        det = systems.detect(ctx.scene)
        self.report({'INFO'}, "%d system(s), %d crossfeed link(s), %d context item(s)" % (len(det['systems']), len(det['links']), len(systems.ST.ctx)))
        return {'FINISHED'}


class AF_OT_systems_autoroles(Operator):
    bl_idname = "arcflow.systems_autoroles"
    bl_label = "Auto roles"
    bl_description = "Assign Container / Transport / Chamber to the selected meshes (or tagged parts) that have no role, from their geometry"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, ctx):
        objs = [o for o in ctx.selected_objects if o.type == 'MESH' and o.arc_flow.role == 'NONE'] or None
        roles = systems.autoroles(ctx.scene, objs)
        self.report({'INFO'}, "Roles: %s" % ", ".join("%s=%s" % (k, v[:4]) for k, v in roles.items()))
        return {'FINISHED'}


class AF_PT_systems(Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Tessera"
    bl_idname = "AF_PT_systems"
    bl_label = "Systems (Tessera Projection)"
    bl_parent_id = "AF_PT_main"

    def draw(self, ctx):
        l = self.layout
        sc = ctx.scene
        af = sc.arc_flow
        st = systems.ST
        col = l.column(align=True)
        col.operator("arcflow.demo", icon='MOD_FLUIDSIM')
        col.operator("arcflow.demo_twin", icon='MOD_FLUIDSIM')
        if bpy.data.objects.get("AF_Crossfeed") is not None:
            r = l.row(align=True)
            r.prop(af, "sys_crossfeed", toggle=True)
            r.prop(af, "sys_variant", text="")
        r = l.row(align=True)
        r.operator("arcflow.systems_detect", icon='FILE_REFRESH')
        r.operator("arcflow.systems_autoroles", icon='PRESET')
        if st.dirty:
            l.label(text="Parts changed: press Re-detect (also runs on Build)", icon='INFO')
        det = st.det
        if det is None or not det['systems']:
            l.label(text="No systems detected yet", icon='DOT')
        else:
            frame = ctx.scene.frame_current
            summ = st.hist.get(frame) or (st.sim.summary() if st.sim else {})
            for g in det['groups']:
                box = l.box()
                if len(g['systems']) > 1:
                    box.label(text="Linked group: %s via %s" % (" + ".join(next(s['name'] for s in det['systems'] if s['id'] == i) for i in g['systems']),
                                                               ", ".join(g['links'])), icon='LINKED')
                for sid in g['systems']:
                    s = next(x for x in det['systems'] if x['id'] == sid)
                    r = summ.get(sid, dict(status='idle', reason='', thrust=0.0, Pc=0.0, MR=0.0))
                    row = box.row()
                    row.label(text="%s: %s" % (s['name'], r['status'].upper()), icon=ICON.get(r['status'], 'DOT'))
                    row.label(text="%d tanks, %d lines, %s" % (len(s['containers']), len(s['transports']), "chamber" if s['chambers'] else "no chamber"))
                    if st.sim is not None:
                        rq = S_req(st, sid)
                        if rq:
                            box.label(text="  O/F %.2f (opt %.2f)  Pc %.1f bar  thrust est %.0f kN" % (rq['MR'], rq['mr_opt'], rq['Pc'] / 1e5, rq['thrust'] / 1e3))
                    if r['status'] in ('running', 'enhanced') or r['status'] == 'failed':
                        box.label(text="  now: Pc %.1f bar, thrust %.0f kN" % (r['Pc'] / 1e5, r['thrust'] / 1e3))
                    if r['reason']:
                        box.label(text="  " + r['reason'][:70], icon='ERROR' if r['status'] == 'failed' else 'CHECKMARK')
                    for w in s['warnings']:
                        box.label(text="  warning: " + w, icon='ERROR')
        if st.ctx:
            b = l.box()
            b.label(text="Interactive physics context", icon='PHYSICS')
            for it in st.ctx:
                b.label(text="%s%s" % (it['reason'], ": " + it['detail'] if it['detail'] else ""), icon='DOT')
            for k, v in list(st.asset_status.items())[:8]:
                b.label(text="  %s: %s" % (k, v))


def S_req(st, sid):
    try:
        from .core import systems as CS
        return CS.requirements(st.sim, sid)
    except Exception:
        return None


@bpy.app.handlers.persistent
def _on_depsgraph(scene, depsgraph=None):
    try:
        if runtime.RT.running:
            return
        for u in depsgraph.updates:
            idb = u.id
            if isinstance(idb, bpy.types.Object) and idb.type == 'MESH' and (u.is_updated_transform or u.is_updated_geometry) and (idb.arc_flow.role != 'NONE'):
                systems.mark_dirty()
                return
    except Exception:
        pass


CLASSES = (AF_OT_demo_twin, AF_OT_systems_detect, AF_OT_systems_autoroles, AF_PT_systems)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.app.handlers.depsgraph_update_post.append(_on_depsgraph)


def unregister():
    while _on_depsgraph in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_on_depsgraph)
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
