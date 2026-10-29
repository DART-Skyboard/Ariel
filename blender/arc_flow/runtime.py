"""Bridge between Blender scene data and the NumPy solver: world building, frame stepping, cache,
particle objects, X-ray/tint, feedback, timeline sync."""
import json
import math
import os

import bpy
import numpy as np
from bpy.app.handlers import persistent

from . import gn, shading
from .cachefile import Cache
from .core import fluids as F
from .core import mathcards as MC
from .core import sdf as SDF
from .core import world as W

GROUP = "ArcFlow"


class Runtime:
    def __init__(self):
        self.reset_all()

    def reset_all(self):
        self.world = None
        self.dirty = True
        self.running = False
        self.recording = False
        self.cache = None
        self.rec_cache = None
        self.last_frame = None
        self.saw_playing = False
        self.t_start = 0.0
        self.parts = []          # objects, index == PartSpec index
        self.fluid_names = []
        self.fl_slots = []
        self.layout_sig = None
        self.saved_sync = None
        self.scene_name = None
        self.field_cache = {}
        self.autosave_every = 48
        self.msg = ""


RT = Runtime()


def mark_dirty():
    RT.dirty = True


def get_scene():
    return bpy.data.scenes.get(RT.scene_name) if RT.scene_name else bpy.context.scene


# ----------------------------------------------------------------------------- scene -> world
def _mesh_arrays(obj, deps):
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    try:
        me.calc_loop_triangles()
        nv, nt = len(me.vertices), len(me.loop_triangles)
        v = np.empty(nv * 3, np.float64)
        me.vertices.foreach_get('co', v)
        t = np.empty(nt * 3, np.int64)
        me.loop_triangles.foreach_get('vertices', t)
        return v.reshape(-1, 3), t.reshape(-1, 3)
    finally:
        ev.to_mesh_clear()


def _field(obj, deps):
    p = obj.arc_flow
    v, t = _mesh_arrays(obj, deps)
    sig = (v.shape[0], t.shape[0], float(v.sum()), float((v * v).sum()), p.cavity_mode, p.resolution, p.lotcbp_level)
    hit = RT.field_cache.get(obj.name)
    if hit and hit[0] == sig:
        return hit[1], v, t
    fld = SDF.PartField(v, t, p.cavity_mode, p.resolution, p.lotcbp_level)
    RT.field_cache[obj.name] = (sig, fld)
    return fld, v, t


def _emit_faces(obj, v, t):
    vg = obj.vertex_groups.get("AF_Emit")
    if vg is None:
        return None
    idx = set()
    for vert in obj.data.vertices:
        for g in vert.groups:
            if g.group == vg.index and g.weight > 0.5:
                idx.add(vert.index)
    if not idx:
        return None
    m = np.array([a in idx and b in idx and c in idx for a, b, c in t])
    return v[t[m]] if m.any() else None


def fluid_specs(scene):
    af = scene.arc_flow
    out = []
    for f in af.fluids:
        spec = dict(label=f.name, kind=f.kind, density=f.density, bulk=f.bulk, molar=f.molar, cp=f.cp, visc=f.visc,
                    temp=f.temperature, flame_t=f.flame_t, role=f.fluid_role, color=tuple(f.color))
        temp = f.temperature
        for c in af.physics_cards:
            if c.fluid == f.name:
                if c.kind == 'DENSITY':
                    spec['density'] = max(c.si(), 1e-3)
                elif c.kind == 'TEMPERATURE':
                    temp = c.si()
        out.append(dict(name=f.name, spec=spec, temp=temp, color=tuple(f.color)))
    return out


def fluid_card_volume(scene, fname, spec):
    """Total fill volume implied by the fluid's Volume / Mass / Weight cards (m3) or None."""
    af = scene.arc_flow
    vol = mass = weight = None
    for c in af.physics_cards:
        if c.fluid != fname:
            continue
        if c.kind == 'VOLUME': vol = c.si()
        elif c.kind == 'MASS': mass = c.si()
        elif c.kind == 'WEIGHT': weight = c.si()
    if vol is not None:
        return vol
    rho = spec['density']
    if mass is not None:
        return mass / rho
    if weight is not None:
        g = abs(scene.gravity[2]) or 9.81
        return weight / g / rho
    return None


def card_velocity(scene, fname):
    for c in scene.arc_flow.physics_cards:
        if c.fluid == fname and c.kind == 'VELOCITY':
            return c.si()
    return None


def build_world(scene):
    af = scene.arc_flow
    deps = bpy.context.evaluated_depsgraph_get()
    fl = fluid_specs(scene)
    names = [f['name'] for f in fl]
    objs = [o for o in scene.objects if o.type == 'MESH' and (o.arc_flow.role != 'NONE' or o.arc_flow.is_emitter)]
    envobj = af.env.obj if af.env.source == 'OBJECT' and af.env.obj else None
    if envobj is not None and envobj not in objs:
        objs.append(envobj)
    per_fluid_cont = {}
    for o in objs:
        p = o.arc_flow
        if p.role == 'CONTAINER' and p.fluid in names:
            per_fluid_cont[p.fluid] = per_fluid_cont.get(p.fluid, 0) + 1
    parts = []
    for o in objs:
        p = o.arc_flow
        role = p.role if o is not envobj or p.role != 'NONE' else 'COLLIDER'
        if o is envobj and p.role == 'NONE':
            role = 'COLLIDER'
        fld, v, t = _field(o, deps)
        fi = names.index(p.fluid) if p.fluid in names else -1
        fill_mode, fill_val = p.fill_mode, p.fill_percent if p.fill_mode == 'PERCENT' else p.fill_volume
        if p.fill_mode == 'CARDS' and fi >= 0:
            tv = fluid_card_volume(scene, p.fluid, fl[fi]['spec'])
            fill_mode = 'ABSOLUTE'
            fill_val = (tv / max(per_fluid_cont.get(p.fluid, 1), 1)) if tv is not None else 0.0
        emit = None
        if p.is_emitter and p.emit_fluid in names:
            ef = names.index(p.emit_fluid)
            sp = p.emit_speed
            cv = card_velocity(scene, p.emit_fluid)
            if cv is not None:
                sp = cv
            emit = dict(mode=p.emit_mode, rate=p.emit_rate, speed=sp, fluid=ef, radius=p.emit_radius, inward=p.emit_inward,
                        particle_volume=p.emit_volume, cap=int(min(max(p.emit_rate * 25.0, 500), 40000)),
                        faces=_emit_faces(o, v, t) if p.emit_mode == 'FACES' else None)
        parts.append(W.PartSpec(o.name, fld, np.array(o.matrix_world), role, fluid=fi, fill_mode=fill_mode, fill_value=fill_val,
                                pressure=(p.pressure or None), n_particles=p.particles, mat_custom=p.material_dict(),
                                wall=p.wall, emit=emit))
    e = af.env
    g = tuple(scene.gravity) if e.use_scene_gravity else tuple(e.gravity)
    env = W.Env(pressure=e.pressure, gravity=g, wind=tuple(e.wind), temp=e.temperature, density=e.density,
                ground_z=None if e.ground_auto else e.ground_z, ground_on=e.ground)
    if e.atmo_fluid in names:
        a = fl[names.index(e.atmo_fluid)]
        env.density = F.density_at(a['spec'], e.pressure, e.temperature)
    prm = W.Params(continuous=af.continuous, net_res=af.net_res, vmax=af.vmax, max_sub=af.max_substeps, radius_scale=af.radius_scale,
                   seed=af.seed, lotcbp=af.lotcbp)
    world = W.World(parts, fl, env, prm)
    RT.parts = [bpy.data.objects[q.name] for q in parts]
    RT.fluid_names = names
    RT.fl_slots = []
    for fi in range(len(fl)):
        idx = [np.arange(s['lo'], s['hi']) for s in world.sources if s['fluid'] == fi]
        RT.fl_slots.append(np.concatenate(idx) if idx else np.zeros(0, int))
    RT.layout_sig = (world.N, tuple((s['kind'], s['part'], s['fluid'], s['lo'], s['hi']) for s in world.sources))
    return world


def ensure_world(scene, force=False):
    if RT.world is None or RT.dirty or force:
        old = RT.world
        snap_last = RT.last_frame
        RT.world = build_world(scene)
        RT.dirty = False
        bind_objects(scene)
        if old is not None and snap_last is not None and RT.cache is not None and RT.running:
            s = RT.cache.get(snap_last)
            if s is not None and s['pos'].shape[0] == RT.world.N:
                RT.world.restore(s)
                RT.world.time = (snap_last - 1) / fps(scene)
    return RT.world


def fps(scene):
    return scene.render.fps / scene.render.fps_base


# ----------------------------------------------------------------------------- particle objects
def _collection(scene):
    c = bpy.data.collections.get(GROUP)
    if c is None:
        c = bpy.data.collections.new(GROUP)
    if c.name not in scene.collection.children:
        scene.collection.children.link(c)
    return c


def _mesh_for(fluid_name, n):
    name = "AF_%s_points" % fluid_name
    me = bpy.data.meshes.get(name)
    if me is None or len(me.vertices) != n:
        if me is not None:
            for o in list(bpy.data.objects):
                if o.data == me:
                    o.data = bpy.data.meshes.new(name + ".tmp")
            bpy.data.meshes.remove(me)
        me = bpy.data.meshes.new(name)
        me.vertices.add(n)
        me.update()
    for a in ('af_radius', 'af_tn', 'af_speed'):
        if a not in me.attributes:
            me.attributes.new(a, 'FLOAT', 'POINT')
    return me


def _obj(name, me, col):
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, me)
    else:
        o.data = me
    if o.name not in col.objects:
        col.objects.link(o)
    o.hide_select = False
    return o


def _own_material(base, fluid, f_attr, fl):
    cur = getattr(fl, f_attr)
    if cur is None:
        cur = base.copy()
        cur.name = "%s_%s" % (base.name, fluid)
        cur['af_fresh'] = False
        setattr(fl, f_attr, cur)
    return cur


def bind_objects(scene):
    """Create / refresh the per-fluid particle objects and push the card settings to modifiers + materials."""
    af = scene.arc_flow
    gn.ensure_render_groups()
    col = _collection(scene)
    base_pts, base_vol, base_spl = shading.points_material(), shading.volume_material(), shading.splat_material()
    for fi, fl in enumerate(af.fluids):
        slots = RT.fl_slots[fi] if fi < len(RT.fl_slots) else np.zeros(0, int)
        n = max(len(slots), 1)
        me = _mesh_for(fl.name, n)
        mats = {}
        for kind, attr, base in (('points', 'pt_material', base_pts), ('volume', 'rm_material', base_vol), ('splat', 'gs_material', base_spl)):
            mats[kind] = _own_material(base, fl.name, attr, fl)
        shading.set_params(mats['points'], AF_Color=fl.color, AF_TintMix=1.0)
        shading.set_params(mats['splat'], AF_Color=fl.color, AF_TintMix=1.0, AF_Sharpness=fl.gs_blend, AF_Emission=af.xray_emission if af.xray else 1.0)
        shading.set_params(mats['volume'], AF_ColorA=fl.rm_color_a, AF_ColorB=fl.rm_color_b, AF_Density=fl.rm_density, AF_Noise=fl.rm_noise,
                           AF_NoiseScale=fl.rm_noise_scale, AF_Emission=fl.rm_emission + (af.xray_emission if af.xray else 0.0),
                           AF_Absorb=fl.rm_absorption, AF_Anisotropy=fl.rm_anisotropy, AF_Blend=fl.rm_blend)
        if af.xray:
            shading.set_params(mats['points'], AF_Emission=af.xray_emission * 0.5)
        else:
            shading.set_params(mats['points'], AF_Emission=0.0)
        chain = gn.cards_chain(fl.name, scene)
        specs = (('points_obj', 'Points', 'AF_Points'), ('volume_obj', 'Volume', 'AF_RayMarch'), ('splat_obj', 'Splat', 'AF_Splat'))
        voxel = fl.rm_voxel
        if voxel <= 0:
            voxel = 0.05
            if RT.world is not None and len(slots):
                r = RT.world.rad[slots]
                r = r[r > 0]
                if len(r):
                    voxel = max(float(np.median(r)) * 0.9, 1e-3)
        for attr, label, gname in specs:
            o = _obj("AF_%s_%s" % (fl.name, label), me, col)
            setattr(fl, attr, o)
            for m in list(o.modifiers):
                if m.type == 'NODES' and m.name in ("AF Cards", "AF Render"):
                    pass
            mc = o.modifiers.get("AF Cards") or o.modifiers.new("AF Cards", 'NODES')
            mc.node_group = chain
            mr = o.modifiers.get("AF Render") or o.modifiers.new("AF Render", 'NODES')
            mr.node_group = bpy.data.node_groups[gname]
            if gname == 'AF_Points':
                gn.set_modifier_inputs(mr, {"Instance Object": fl.pt_object, "Use Object": fl.pt_object is not None,
                                            "Instance Collection": fl.pt_collection, "Use Collection": bool(fl.pt_use_collection and fl.pt_collection),
                                            "Scale": fl.pt_scale, "Material": mats['points']})
            elif gname == 'AF_RayMarch':
                gn.set_modifier_inputs(mr, {"Density": fl.rm_density * 0.02, "Voxel Size": voxel, "Radius Scale": fl.rm_radius, "Material": mats['volume']})
            else:
                gn.set_modifier_inputs(mr, {"Splat Object": fl.gs_object, "Use Object": fl.gs_object is not None, "Resolution": fl.gs_resolution,
                                            "Density": fl.gs_density, "Scale": fl.gs_scale, "Material": mats['splat']})
            on = fl.render_mode == {'Points': 'POINTS', 'Volume': 'RAYMARCH', 'Splat': 'SPLAT'}[label]
            o.hide_viewport = not on
            o.hide_render = not on
        # shape key used to drive the ray-march colour blend
        vo = fl.volume_obj
        if me.shape_keys is None:
            vo.shape_key_add(name="Basis")
        if "AF_ColorBlend" not in me.shape_keys.key_blocks:
            sk = vo.shape_key_add(name="AF_ColorBlend")
            sk.slider_min, sk.slider_max = 0.0, 1.0
        me.shape_keys.key_blocks["AF_ColorBlend"].value = fl.rm_blend
        shading.bind_blend_driver(mats['volume'], vo)
    apply_xray(scene)


# ----------------------------------------------------------------------------- x-ray / tint
def apply_xray(scene):
    af = scene.arc_flow
    xm = shading.xray_material()
    shading.set_params(xm, AF_Opacity=af.xray_opacity)
    for o in scene.objects:
        if o.type != 'MESH':
            continue
        p = o.arc_flow
        part = p.role != 'NONE'
        if af.xray and part:
            if not p.xray_backup:
                p.xray_backup = json.dumps([s.material.name if s.material else "" for s in o.material_slots])
                if not o.material_slots:
                    o.data.materials.append(xm)
                else:
                    for s in o.material_slots:
                        s.material = xm
            else:
                for s in o.material_slots:
                    if s.material is not xm:
                        s.material = xm
        elif p.xray_backup:
            try:
                names = json.loads(p.xray_backup)
            except Exception:
                names = []
            for s, nme in zip(o.material_slots, names):
                s.material = bpy.data.materials.get(nme) if nme else None
            if not names and o.material_slots:
                o.data.materials.clear()
            p.xray_backup = ""


# ----------------------------------------------------------------------------- applying a state to the scene
def _eval_math(scene, world):
    af = scene.arc_flow
    cards = {c.name: c.si() for c in af.physics_cards}
    ign = None
    fb = None
    for m in af.math_cards:
        v = MC.evaluate(m.term_list(), lambda n: cards.get(n, 0.0)) * m.gain
        m.result = v
        if m.output == 'IGNITION':
            ign = float(min(max(v, 0.0), 1.0))
        elif m.output == 'FEEDBACK':
            fb = v
    if world is not None:
        world.p.ignition = ign
    return fb


def apply_state(scene, world, snap=None):
    """Write particle positions/attributes and part colours into the scene."""
    af = scene.arc_flow
    src = snap if snap is not None else world.snapshot()
    pos, state, rad, temp, vel = src['pos'], src['state'], src['rad'], src['temp'], src['vel']
    tn = np.clip((temp - af.t_lo) / max(af.t_hi - af.t_lo, 1.0), 0.0, 1.0).astype(np.float32)
    speed = np.linalg.norm(vel, axis=1).astype(np.float32)
    r = np.where(state > 0, rad, 0.0).astype(np.float32)
    for fi, fl in enumerate(af.fluids):
        if fi >= len(RT.fl_slots) or len(RT.fl_slots[fi]) == 0:
            continue
        idx = RT.fl_slots[fi]
        o = fl.points_obj
        if o is None:
            continue
        me = o.data
        if len(me.vertices) != len(idx):
            continue
        me.vertices.foreach_set('co', pos[idx].astype(np.float32).ravel())
        me.attributes['af_radius'].data.foreach_set('value', r[idx])
        me.attributes['af_tn'].data.foreach_set('value', tn[idx])
        me.attributes['af_speed'].data.foreach_set('value', speed[idx])
        me.update()
        ign = float(src.get('ignition', 0.0))
        for ob in (fl.points_obj, fl.volume_obj, fl.splat_obj):
            if ob is not None:
                ob['af_ignition'] = ign
    ht, st, pr, te = src['part_heat'], src['part_stress'], src['part_press'], src['part_T']
    for i, o in enumerate(RT.parts):
        if i >= len(ht):
            break
        o['af_heat'] = float(ht[i]); o['af_stress'] = float(min(st[i], 1.0))
        o['af_tint'] = float(min(st[i], 1.0)) if af.tint_mode == 'STRESS' else (float(ht[i]) if af.tint_mode == 'THERMAL' else 0.0)
        p = o.arc_flow
        p.temp_now, p.stress_now, p.pressure_now = float(te[i]), float(st[i]), float(pr[i])
    # feedback
    fbv = _feedback_value(af, src)
    for o in {af.feedback_obj} - {None}:
        o['af_fb'] = fbv


def _feedback_value(af, src):
    ch = [i for i, o in enumerate(RT.parts) if o.arc_flow.role == 'CHAMBER'] or list(range(len(RT.parts)))
    if not ch:
        return 0.0
    ch = [i for i in ch if i < len(src['part_heat'])]
    if not ch:
        return 0.0
    if af.feedback_mode == 'IGNITION':
        return float(src.get('ignition', 0.0))
    if af.feedback_mode == 'PRESSURE':
        return float(min(max(src['part_press'][ch].max() / 1.0e6, 0.0), 1.0))
    if af.feedback_mode == 'STRESS':
        return float(min(src['part_stress'][ch].max(), 1.0))
    return float(src['part_heat'][ch].max())


# ----------------------------------------------------------------------------- cache paths
def _abs(path):
    return bpy.path.abspath(path)


def work_path(af, version=None):
    return os.path.join(_abs(af.cache_dir), "%s_v%03d.npz" % (af.cache_name, version or af.cache_version))


def baked_path(af, version=None):
    return os.path.join(_abs(af.cache_dir), "%s_v%03d_baked.npz" % (af.cache_name, version or af.cache_version))


def next_record_path(af):
    d = _abs(af.cache_dir)
    k = 1
    while os.path.exists(os.path.join(d, "%s_rec%03d.npz" % (af.cache_name, k))):
        k += 1
    return os.path.join(d, "%s_rec%03d.npz" % (af.cache_name, k))


def ensure_cache(scene):
    af = scene.arc_flow
    if RT.cache is None:
        p = work_path(af)
        RT.cache = Cache(layout=_layout())
        if os.path.exists(p):
            try:
                RT.cache = Cache.load(p)
            except Exception as ex:
                RT.msg = "cache load failed: %s" % ex
        RT.cache.path = p
    return RT.cache


def _layout():
    w = RT.world
    return dict(fluids=RT.fluid_names, parts=[o.name for o in RT.parts], n=(w.N if w else 0))


def playback_cache(scene):
    af = scene.arc_flow
    if af.baked and af.baked_file:
        if RT.cache is None or RT.cache.path != _abs(af.baked_file):
            try:
                RT.cache = Cache.load(_abs(af.baked_file))
            except Exception as ex:
                RT.msg = "baked cache missing: %s" % ex
                return None
        return RT.cache
    return ensure_cache(scene)


# ----------------------------------------------------------------------------- stepping
def frame_range(scene):
    af = scene.arc_flow
    return (scene.frame_start, scene.frame_end) if af.use_scene_range else (af.frame_start, af.frame_end)


def sim_frame(scene, frame):
    """Advance the solver so that `frame` exists in the active cache.  Returns True if a step ran."""
    af = scene.arc_flow
    world = ensure_world(scene)
    cache = RT.rec_cache if RT.recording else ensure_cache(scene)
    if not cache.compatible(world.N):
        cache.frames.clear()
    cache.layout = _layout()
    start, end = frame_range(scene)
    last = RT.last_frame
    stepped = False
    if last is None or frame < last or frame > last + 240:
        seed = cache.get(frame)
        if frame <= start or seed is None:
            world.reset()
            _eval_math(scene, world)
            RT.last_frame = start
            cache.erase_after(start - 1)
            cache.put(start, world.snapshot())
            stepped = True
        else:                                   # resume from a cached frame (scrubbed back / jumped)
            world.restore(seed)
            world.time = (frame - start) / fps(scene)
            RT.last_frame = frame
            cache.erase_after(frame)
    if frame == RT.last_frame:
        return stepped
    dt = 1.0 / fps(scene)
    while RT.last_frame < frame:
        world.set_matrices([np.array(o.matrix_world) for o in RT.parts])
        _eval_math(scene, world)
        world.step(dt)
        RT.last_frame += 1
        cache.put(RT.last_frame, world.snapshot())
        stepped = True
    return stepped


def flush_cache(scene, force=False):
    cache = RT.rec_cache if RT.recording else RT.cache
    if cache is None:
        return
    af = scene.arc_flow
    if force or cache.unsaved >= RT.autosave_every:
        try:
            if RT.recording:
                if not cache.path:
                    cache.path = next_record_path(af)
                cache.save(cache.path)
                af.record_file = cache.path
            else:
                cache.save(work_path(af))
        except Exception as ex:
            RT.msg = "cache save failed: %s" % ex


@persistent
def on_frame_change(scene, *args):
    af = getattr(scene, 'arc_flow', None)
    if af is None or (RT.scene_name and scene.name != RT.scene_name):
        return
    frame = scene.frame_current
    try:
        if RT.running:
            start, end = frame_range(scene)
            if frame > end:
                stop(scene, "Reached end frame")
                return
            sim_frame(scene, frame)
            cache = RT.rec_cache if RT.recording else RT.cache
            snap = cache.get(frame) if cache else None
            apply_state(scene, RT.world, snap)
            flush_cache(scene)
            af.status = ("Recording " if RT.recording else "Simulating ") + "frame %d" % frame
        else:
            if RT.world is None and not (af.baked or af.fluids):
                return
            c = playback_cache(scene)
            snap = c.get(frame) if c else None
            if snap is not None and RT.fl_slots and snap['pos'].shape[0] == (RT.world.N if RT.world else -1):
                apply_state(scene, RT.world, snap)
    except Exception as ex:   # never break the timeline
        RT.msg = "Arc Flow: %s" % ex
        af.status = RT.msg
        import traceback
        traceback.print_exc()


# ----------------------------------------------------------------------------- control
def start(scene, record=False, play=True):
    af = scene.arc_flow
    RT.scene_name = scene.name
    if af.baked:        # reworking a baked sim: new version, the baked file stays untouched
        old = RT.cache if RT.cache is not None and RT.cache.path == _abs(af.baked_file) else None
        if old is None:
            try:
                old = Cache.load(_abs(af.baked_file))
            except Exception:
                old = None
        af.cache_version += 1
        af.baked = False
        RT.cache = Cache(layout=_layout())
        if old:
            RT.cache.frames = {f: s for f, s in old.frames.items()}
        RT.cache.path = work_path(af)
    ensure_world(scene, force=True)
    RT.recording = bool(record)
    if record:
        RT.rec_cache = Cache(layout=_layout())
        RT.rec_cache.path = next_record_path(af)
    ensure_cache(scene)
    RT.running = True
    RT.last_frame = None
    RT.saw_playing = False
    RT.t_start = __import__('time').time()
    RT.saved_sync = scene.sync_mode
    try:
        scene.sync_mode = 'NONE'          # play every frame: the solver must generate each one
    except Exception:
        pass
    af.status = "Running"
    if play:
        start_f, _e = frame_range(scene)
        if scene.frame_current < start_f or scene.frame_current > frame_range(scene)[1]:
            scene.frame_set(start_f)
        else:
            on_frame_change(scene)
        try:
            if not bpy.context.screen.is_animation_playing:
                bpy.ops.screen.animation_play()
        except Exception:
            pass


def stop(scene, why="Stopped"):
    af = scene.arc_flow
    was = RT.running
    RT.running = False
    flush_cache(scene, force=True)
    if RT.recording:
        RT.recording = False
        RT.rec_cache = None
    if was and RT.saved_sync is not None:
        try:
            scene.sync_mode = RT.saved_sync
        except Exception:
            pass
    try:
        if bpy.context.screen and bpy.context.screen.is_animation_playing:
            bpy.ops.screen.animation_cancel(restore_frame=False)
    except Exception:
        pass
    af.status = why


def bake(scene, progress=None):
    af = scene.arc_flow
    RT.scene_name = scene.name
    start_f, end_f = frame_range(scene)
    was_running = RT.running
    RT.running = False
    ensure_world(scene)
    cache = ensure_cache(scene)
    cache.layout = _layout()
    if not cache.compatible(RT.world.N):
        cache.frames.clear()
    missing = [f for f in range(start_f, end_f + 1) if f not in cache]
    if missing:
        RT.last_frame = None
        for k, f in enumerate(range(start_f, end_f + 1)):
            sim_frame(scene, f)
            if progress:
                progress(k, end_f - start_f + 1)
    path = baked_path(af)
    sub = Cache(layout=cache.layout)
    sub.frames = {f: cache.frames[f] for f in range(start_f, end_f + 1) if f in cache.frames}
    sub.save(path)
    cache.save(work_path(af))
    af.baked, af.baked_file = True, path
    RT.cache = sub
    af.status = "Baked %d frames -> %s" % (len(sub.frames), os.path.basename(path))
    return path


# ----------------------------------------------------------------------------- timers / handlers
def _poll():
    try:
        if RT.running:
            sc = get_scene()
            wm = bpy.context.window_manager
            playing = any(w.screen.is_animation_playing for w in wm.windows) if wm else False
            if playing:
                RT.saw_playing = True
            elif RT.saw_playing or (__import__('time').time() - RT.t_start > 3.0 and wm and wm.windows):
                stop(sc, "Stopped with the timeline")
        # 'Select faces' returned from edit mode -> assign automatically
        for o in bpy.data.objects:
            if o.get('af_selecting') and o.mode == 'OBJECT':
                assign_selected_faces(o)
    except Exception:
        pass
    return 0.25


def assign_selected_faces(obj):
    me = obj.data
    if obj.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    idx = set()
    for poly in me.polygons:
        if poly.select:
            idx.update(poly.vertices)
    vg = obj.vertex_groups.get("AF_Emit") or obj.vertex_groups.new(name="AF_Emit")
    vg.remove(list(range(len(me.vertices))))
    if idx:
        vg.add(sorted(idx), 1.0, 'REPLACE')
    obj.arc_flow.emit_faces_assigned = bool(idx)
    obj['af_selecting'] = False
    mark_dirty()
    return len(idx)


@persistent
def on_load(*args):
    RT.reset_all()
    for sc in bpy.data.scenes:
        af = getattr(sc, 'arc_flow', None)
        if af is None:
            continue
        af.status = "Idle"
        # restore a packed cache if the external file is missing
        t = bpy.data.texts.get("ArcFlow_Cache")
        if t is not None and not os.path.exists(work_path(af)) and not af.baked:
            try:
                RT.cache = Cache.from_text(t.as_string())
                RT.cache.path = work_path(af)
            except Exception:
                pass
        if af.fluids:
            RT.scene_name = sc.name
            try:
                ensure_world(sc, force=False)
            except Exception:
                RT.dirty = True


@persistent
def on_save_pre(*args):
    for sc in bpy.data.scenes:
        af = getattr(sc, 'arc_flow', None)
        if af is not None and af.pack_in_blend and RT.cache is not None and RT.cache.frames:
            pack_cache(sc)


def pack_cache(scene):
    t = bpy.data.texts.get("ArcFlow_Cache") or bpy.data.texts.new("ArcFlow_Cache")
    t.clear()
    t.write(RT.cache.to_text())
    return len(t.as_string())


def register():
    bpy.app.handlers.frame_change_post.append(on_frame_change)
    bpy.app.handlers.load_post.append(on_load)
    bpy.app.handlers.save_pre.append(on_save_pre)
    if not bpy.app.timers.is_registered(_poll):
        bpy.app.timers.register(_poll, persistent=True)


def unregister():
    for lst, fn in ((bpy.app.handlers.frame_change_post, on_frame_change), (bpy.app.handlers.load_post, on_load),
                    (bpy.app.handlers.save_pre, on_save_pre)):
        while fn in lst:
            lst.remove(fn)
    if bpy.app.timers.is_registered(_poll):
        bpy.app.timers.unregister(_poll)
