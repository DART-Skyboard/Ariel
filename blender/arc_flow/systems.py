"""Tessera Projection (LOTBCBP) systems: every connected set of parts is a self-initialising system.

Scene side of `core.systems`: reads the parts into feature records, finds joints (cavity overlaps), detects independent
systems, crossfeed links and linked groups, runs the lumped outcome model on the timeline, and drives the rupture visuals
(breach jet emitters, flash light, glowing breach disc).  Also the "interactive physics context" scan (environment, moving /
rigid / mechanical bodies) that auto-initialises assets, the single- and twin-engine demos built from Blender primitives.

The outcome model is a simplified tracer-level model (see core/systems.py), not CFD.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from . import runtime
from .core import cavity as CV
from .core import fluids as F
from .core import systems as S

RT = runtime.RT


class State:
    def __init__(self):
        self.reset()

    def reset(self):
        self.det = None
        self.parts = {}
        self.edges = []
        self.sim = None
        self.frame = None
        self.hist = {}            # frame -> summary dict
        self.events = []          # [(frame, event)]
        self.objs = {}
        self.ctx = []             # interactive physics context items
        self.asset_status = {}    # object name -> "auto-initialised: reason"
        self.dirty = True
        self.t_mark = 0.0
        self.sig = None
        self.breach = {}          # part name -> dict(emitter, disc)
        self.flash = None


ST = State()


def mark_dirty():
    ST.dirty = True
    ST.t_mark = __import__('time').time()


# ----------------------------------------------------------------------------- features
def _prop_role(af, p):
    if p.sys_fluid_role != 'AUTO':
        return p.sys_fluid_role
    f = next((x for x in af.fluids if x.name == p.fluid), None)
    return f.fluid_role if f is not None and f.fluid_role in ('FUEL', 'OXIDIZER') else ''


def features(scene, obj, deps):
    af = scene.arc_flow
    p = obj.arc_flow
    fld, v, t = runtime._field(obj, deps)
    mw = np.array(obj.matrix_world)
    s = abs(np.linalg.det(mw[:3, :3])) ** (1.0 / 3.0)
    ext = np.maximum((fld.bmax - fld.bmin) * s, 1e-6)
    vol_mesh = abs(CV.mesh_volume(v, t)) * s ** 3 if CV.is_closed_manifold(v, t) else 0.0
    vol = vol_mesh if (vol_mesh > 0 and fld.mode == 'SHELL') else fld.cavity_volume() * s ** 3
    L = float(ext.max())
    srt = np.sort(ext)
    slender = L / max(srt[1], 1e-6) >= 2.5
    r_eq = math.sqrt(max(vol, 1e-9) / (math.pi * L)) if slender else (3.0 * max(vol, 1e-9) / (4.0 * math.pi)) ** (1.0 / 3.0)
    if 'af_r_eq' in obj:
        r_eq = float(obj['af_r_eq'])
    open_r = [float(o['radius']) * s for o in fld.openings]
    if 'af_open_r' in obj:
        open_r = [float(x) for x in obj['af_open_r']]
    taper = (max(open_r) / max(min(open_r), 1e-6)) if len(open_r) >= 2 else 1.0
    f = next((x for x in af.fluids if x.name == p.fluid), None)
    fill = 0.0
    if p.role == 'CONTAINER':
        fill = p.fill_percent / 100.0 if p.fill_mode == 'PERCENT' else (min(p.fill_volume / max(vol, 1e-9), 1.0) if p.fill_mode == 'ABSOLUTE' else 0.75)
    aspect = L / (2.0 * r_eq) if slender else 1.0 + 0.0 * L
    rho = F.density_at(dict(kind=f.kind, density=f.density, bulk=f.bulk, molar=f.molar), p.pressure or F.P_ATM, f.temperature) if f else 0.0
    center = mw[:3, :3] @ ((fld.bmin + fld.bmax) / 2) + mw[:3, 3]
    rec = S.make_part(obj.name, p.role, volume=vol, length=L, r_eq=r_eq, aspect=aspect, closed=not open_r, open_r=open_r, taper=taper,
                      wall=p.wall, material=dict(p.material_dict(), label=p.material.replace('_', ' ').title()), fluid=p.fluid,
                      fluid_preset=(f.preset if f else ''), rho=rho, prop_role=(f.fluid_role if f and f.fluid_role in ('FUEL', 'OXIDIZER') else ''),
                      prop_override=p.sys_fluid_role, flame_t=(f.flame_t if f else 293.15), fill=fill, pressure=p.pressure, pos=tuple(center))
    rec['orifice'] = float(p.sys_orifice)
    return rec, fld, mw, s


def world_aabb(fld, mw):
    b0, b1 = fld.bmin, fld.bmax
    corners = np.array([[x, y, z] for x in (b0[0], b1[0]) for y in (b0[1], b1[1]) for z in (b0[2], b1[2])])
    w = corners @ mw[:3, :3].T + mw[:3, 3]
    return w.min(0), w.max(0)


def find_edges(infos, flds, mats, scales, deps_cap=60000):
    """Joints: two parts are connected when their cavities share volume (sampled inside the overlap of their world boxes)."""
    names = sorted(infos)
    bb = {n: world_aabb(flds[n], mats[n]) for n in names}
    inv = {n: np.linalg.inv(mats[n]) for n in names}
    edges = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            lo = np.maximum(bb[a][0], bb[b][0])
            hi = np.minimum(bb[a][1], bb[b][1])
            if np.any(hi <= lo):
                continue
            rmin = max(min(infos[a]['r_eq'], infos[b]['r_eq']), 0.01)
            ext = hi - lo
            n = np.clip(np.ceil(ext / (0.4 * rmin)).astype(int) + 1, 2, 40)
            while np.prod(n) > deps_cap:
                n = np.maximum((n * 0.8).astype(int), 2)
            g = [np.linspace(lo[k], hi[k], n[k]) for k in range(3)]
            P = np.stack(np.meshgrid(*g, indexing='ij'), -1).reshape(-1, 3)
            ins = []
            for nm in (a, b):
                Pl = P @ inv[nm][:3, :3].T + inv[nm][:3, 3]
                cav, _m = flds[nm].fields(Pl, bricks=False)
                ins.append(cav * scales[nm] < 0.0)
            if int((ins[0] & ins[1]).sum()) >= 2:
                edges.append((a, b))
    return edges


# ----------------------------------------------------------------------------- detection
def part_objects(scene):
    return [o for o in scene.objects if o.type == 'MESH' and o.arc_flow.role in ('CONTAINER', 'TRANSPORT', 'CHAMBER') and not o.name.startswith('AF_Breach')]


def detect(scene, rebuild_sim=True):
    """Scan the scene: parts -> joints -> systems / links / groups; builds the outcome model.  Returns the detection dict."""
    af = scene.arc_flow
    deps = bpy.context.evaluated_depsgraph_get()
    infos, flds, mats, scales, objs = {}, {}, {}, {}, {}
    for o in part_objects(scene):
        rec, fld, mw, s = features(scene, o, deps)
        infos[o.name], flds[o.name], mats[o.name], scales[o.name], objs[o.name] = rec, fld, mw, s, o
    edges = find_edges(infos, flds, mats, scales) if infos else []
    ST.parts, ST.edges, ST.objs = infos, edges, objs
    ST.det = S.detect(infos, edges) if infos else dict(roles={}, systems=[], links=[], groups=[], link_pipes=[])
    amb = af.env.pressure
    ST.sim = S.GroupSim(infos, edges, amb=amb, det=ST.det) if (rebuild_sim and infos and ST.det['systems']) else None
    if ST.sim is not None:
        for L in ST.det['links']:            # the pipe's orifice setting (metering) scales its flow area
            infos[L['pipe']]['r_eq'] = infos[L['pipe']]['r_eq'] * math.sqrt(max(infos[L['pipe']].get('orifice', 1.0), 1e-4))
        ST.sim.reset()
    ST.frame = None
    ST.hist = {}
    ST.events = []
    ST.dirty = False
    return ST.det


def autoroles(scene, objs=None):
    """Assign Container / Transport / Chamber to selected (or tagged) mesh objects without a role, from geometry alone."""
    deps = bpy.context.evaluated_depsgraph_get()
    targets = objs if objs is not None else [o for o in scene.objects if o.type == 'MESH' and o.arc_flow.role == 'NONE' and o.get('af_part')]
    infos, flds, mats, scales = {}, {}, {}, {}
    for o in targets:
        rec, fld, mw, s = features(scene, o, deps)
        rec['declared'] = False
        infos[o.name], flds[o.name], mats[o.name], scales[o.name] = rec, fld, mw, s
    edges = find_edges(infos, flds, mats, scales) if infos else []
    roles = S.resolve_roles(infos, edges)
    af = scene.arc_flow
    for o in targets:
        r = roles[o.name]
        o.arc_flow.role = r
        o.arc_flow.cavity_mode = 'SHELL' if r != 'TRANSPORT' and infos[o.name]['closed'] else o.arc_flow.cavity_mode
        if r == 'CONTAINER' and not o.arc_flow.fluid and af.fluids:
            o.arc_flow.fluid = af.fluids[0].name
    # default fluids: first two containers of each assembly -> fuel / oxidizer by order
    runtime.mark_dirty()
    mark_dirty()
    return roles


# ----------------------------------------------------------------------------- timeline
def ensure_sim_to(scene, frame):
    if ST.dirty or ST.det is None:
        detect(scene)
    sim = ST.sim
    if sim is None:
        return None
    start = runtime.frame_range(scene)[0]
    dt = 1.0 / runtime.fps(scene)
    if ST.frame is None or frame < ST.frame:
        sim.reset()
        ST.frame, ST.hist, ST.events = start, {start: sim.summary()}, []
    while ST.frame < frame:
        sim.step(dt)
        ST.frame += 1
        ST.hist[ST.frame] = sim.summary()
        for ev in sim.new_events:
            ST.events.append((ST.frame, ev))
    return ST.hist.get(frame)


def failed_parts_at(frame):
    return {ev['part']: (f, ev) for f, ev in ST.events if f <= frame}


def pre_step(scene, world, frame):
    """Before every solver frame: pick the outcome-model state for that frame and drive ignition + breach emitters."""
    summ = ensure_sim_to(scene, frame)
    if summ is None:
        return
    ign = 0.0
    for sid, r in summ.items():
        if r['status'] in ('running', 'enhanced'):
            ign = max(ign, 1.0 if r['status'] == 'enhanced' else 0.7)
    world.p.ignition = ign
    bad = failed_parts_at(frame)
    for q in world.parts:
        if q.name.startswith('AF_Breach_') and q.emit is not None:
            q.emit.setdefault('rate0', q.emit['rate'])
            q.emit['rate'] = q.emit['rate0'] if q.name[len('AF_Breach_'):] in bad else 0.0


def apply_visuals(scene, frame):
    """Per displayed frame: failed walls, glowing breach discs and the flash light follow the stored outcome history."""
    if ST.sim is None or not ST.events and not ST.breach:
        return
    bad = failed_parts_at(frame)
    for name, d in ST.breach.items():
        o = d.get('disc')
        if o is None or o.name not in bpy.data.objects:
            continue
        on = name in bad
        o.hide_viewport = not on
        o.hide_render = not on
        po = bpy.data.objects.get(name)
        if po is not None:
            po['af_failed'] = 1.0 if on else 0.0
            if on:
                po['af_heat'] = 1.0
                po['af_stress'] = 1.0
                po['af_tint'] = 1.0
                po.arc_flow.stress_now = 1.0
    fl = ST.flash
    if fl is not None and fl.name in bpy.data.objects:
        e_best = None
        for f, ev in ST.events:
            if f <= frame and (e_best is None or f > e_best[0]):
                e_best = (f, ev)
        if e_best is None:
            fl.data.energy = 0.0
        else:
            age = (frame - e_best[0]) / runtime.fps(scene)
            br = ST.breach.get(e_best[1]['part'])
            if br and br.get('disc'):
                fl.location = br['disc'].matrix_world.translation + Vector((0, 0, 0.6))
            fl.data.energy = 60000.0 * math.exp(-age / 0.35) + 300.0


# ----------------------------------------------------------------------------- build / rebuild hook
def on_build(scene):
    scan_context(scene)
    detect(scene)
    ensure_breach(scene)


def on_demo_option(scene, what):
    from . import demos
    demos.apply_option(scene, what)


# ----------------------------------------------------------------------------- breach emitters
def _exhaust_name(scene):
    af = scene.arc_flow
    for f in af.fluids:
        if f.preset == 'EXHAUST':
            return f.name
    from . import ops
    return ops._add_fluid(scene, 'EXHAUST').name


def _disc_mesh(name, r=0.14):
    me = bpy.data.meshes.get(name)
    if me is None:
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, radius=r, segments=12, calc_uvs=False)
        bm.to_mesh(me)
        bm.free()
    return me


def _glow_material():
    m = bpy.data.materials.get("AF_BreachGlow")
    if m is None:
        m = bpy.data.materials.new("AF_BreachGlow")
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (1.0, 0.45, 0.08, 1.0)
        em.inputs['Strength'].default_value = 12.0
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(em.outputs[0], out.inputs[0])
    return m


def ensure_breach(scene):
    """Dormant breach jet emitters (one per tank / chamber / crossfeed pipe) parented to their part, plus one flash light.
    They sit idle (rate 0 from the outcome model) until the part ruptures."""
    if ST.det is None:
        return
    af = scene.arc_flow
    exh = _exhaust_name(scene)
    col = runtime._collection(scene)
    targets = [n for n, p in ST.parts.items() if p['kind'] == 'CONTAINER'] + [s['chambers'][0] for s in ST.det['systems'] if s['chambers']] + list(ST.det['link_pipes'])
    made = False
    for name in targets:
        po = bpy.data.objects.get(name)
        if po is None:
            continue
        bn = "AF_Breach_%s" % name
        d = ST.breach.get(name)
        if bn in bpy.data.objects and d and d.get('disc') and d['disc'].name in bpy.data.objects:
            continue
        info = ST.parts[name]
        c = Vector(info['pos'])
        sc_pos = np.mean([ST.parts[x]['pos'] for x in next(s['parts'] for s in ST.det['systems'] if name in s['parts'])], axis=0) if name not in ST.det['link_pipes'] else np.array(info['pos'])
        away = Vector((c.x - sc_pos[0], c.y - sc_pos[1], 0.0))
        away = away.normalized() if away.length > 1e-6 else Vector((0, 1, 0))
        direction = (Vector((0, 0, 0.7)) + away * 0.7).normalized()
        r = max(info['r_eq'], 0.05)
        loc = c + direction * (r if name not in ST.det['link_pipes'] else r * 1.1)
        o = bpy.data.objects.new(bn, _disc_mesh("AF_BreachDisc"))
        col.objects.link(o)
        o.data.materials.clear()
        o.data.materials.append(_glow_material())
        o.location = loc
        o.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
        o.parent = po
        o.matrix_parent_inverse = po.matrix_world.inverted()
        o.hide_viewport = True
        o.hide_render = True
        pp = o.arc_flow
        pp.is_emitter = True
        pp.emit_mode = 'SURFACE'
        pp.emit_fluid = info['fluid'] if (info['kind'] == 'CONTAINER' and info['fluid']) else exh
        pp.emit_rate = 240.0
        pp.emit_speed = 9.0
        pp.emit_volume = 2.5e-3
        o['af_emit_cap'] = 1400
        ST.breach[name] = dict(disc=o)
        made = True
    if ST.flash is None or ST.flash.name not in bpy.data.objects:
        ld = bpy.data.lights.new("AF_Flash", 'POINT')
        ld.energy = 0.0
        ld.color = (1.0, 0.7, 0.35)
        ld.shadow_soft_size = 0.4
        fo = bpy.data.objects.new("AF_Flash", ld)
        col.objects.link(fo)
        ST.flash = fo
    if made:
        runtime.mark_dirty()


# ----------------------------------------------------------------------------- interactive physics context
TRANSFORM_PATHS = ('location', 'rotation_euler', 'rotation_quaternion', 'rotation_axis_angle', 'scale', 'delta_location',
                   'delta_rotation_euler', 'delta_rotation_quaternion', 'delta_scale')


def _fcurves(action):
    fcs = getattr(action, 'fcurves', None)
    if fcs is not None:
        return list(fcs)
    out = []
    try:
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out += list(cb.fcurves)
    except Exception:
        pass
    return out


def is_animated(o):
    ad = o.animation_data
    if ad is None:
        return False
    try:
        for d in ad.drivers:
            if d.data_path.split('[')[0] in TRANSFORM_PATHS:
                return True
        if ad.action is not None:
            fcs = _fcurves(ad.action)
            return any(fc.data_path in TRANSFORM_PATHS for fc in fcs) if fcs else True
    except Exception:
        return True
    return False


def _sphere(o):
    corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
    ctr = sum(corners, Vector()) / 8.0
    return ctr, max((c - ctr).length for c in corners)


def _aabb(o):
    corners = np.array([list(o.matrix_world @ Vector(c)) for c in o.bound_box])
    return corners.min(0), corners.max(0)


def _near(o, asset):
    ctr, r = _sphere(o)
    lo, hi = _aabb(asset)
    d = max(0.5, 0.5 * float(np.linalg.norm(hi - lo)))
    q = np.array(list(ctr))
    nearest = np.minimum(np.maximum(q, lo), hi)
    return float(np.linalg.norm(q - nearest)) <= r + d


def scan_context(scene):
    """Detect interactive physics: environment card, other collision bodies, animated / rigid-body / mechanical bodies and fluids
    passing through them.  Auto-initialises the affected assets (moving bodies become colliders).  Cheap: runs on Build and Re-detect."""
    bpy.context.view_layer.update()
    af = scene.arc_flow
    e = af.env
    assets = [o for o in scene.objects if o.type == 'MESH' and (o.arc_flow.role in ('CONTAINER', 'TRANSPORT', 'CHAMBER') or o.arc_flow.is_emitter)
              and not o.name.startswith('AF_Breach')]
    items, status = [], {}
    if e.preset != 'CUSTOM' or e.use_mix or e.look_world or e.look_ground or e.source == 'OBJECT':
        items.append(dict(reason="environment physics", objects=[], assets=[a.name for a in assets], detail="atmosphere %s" % e.preset.title()))
        for a in assets:
            status[a.name] = "auto-initialised: environment physics"
    asset_set = set(assets)
    for o in scene.objects:
        if o.type != 'MESH' or o in asset_set or o.name.startswith('AF_') or o.arc_flow.is_emitter:
            continue
        reason = None
        if o.rigid_body is not None:
            reason = "rigid-body rig"
        elif is_animated(o):
            reason = "moving collision body"
        elif len(o.constraints):
            reason = "mechanical rig"
        elif o.arc_flow.role == 'COLLIDER':
            reason = "collision body"
        if reason is None:
            continue
        hit = [a for a in assets if _near(o, a)]
        if not hit:
            continue
        if o.arc_flow.role == 'NONE':
            o.arc_flow.role = 'COLLIDER'
            o.arc_flow.cavity_mode = 'SOLID'
            o['af_auto_role'] = True
            runtime.mark_dirty()
        items.append(dict(reason=reason, objects=[o.name], assets=[a.name for a in hit], detail=o.name))
        for a in hit:
            status[a.name] = "auto-initialised: %s" % reason
    ST.ctx, ST.asset_status = items, status
    return items
