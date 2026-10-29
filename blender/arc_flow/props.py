"""All Arc Flow settings live in bpy.props PropertyGroups on Scene / Object, so they are saved
inside the .blend and come back when the add-on is (re)installed."""
import bpy
from bpy.props import (BoolProperty, CollectionProperty, EnumProperty, FloatProperty, FloatVectorProperty,
                       IntProperty, PointerProperty, StringProperty)
from bpy.types import PropertyGroup

from .core import fluids as F
from .core import materials as M
from .core import mathcards as MC
from .core import units as U

_enum_keepalive = {}


def _keep(key, items):
    _enum_keepalive[key] = items
    return items


def fluid_items(self, context):
    sc = context.scene if context else bpy.context.scene
    items = [('-', "None", "No fluid")] + [(f.name, f.name, "") for f in sc.arc_flow.fluids]
    return _keep('fluid', items)


def card_items(self, context):
    sc = context.scene if context else bpy.context.scene
    items = [(c.name, c.name, "") for c in sc.arc_flow.physics_cards] or [('-', "(no physics cards)", "")]
    return _keep('card', items)


def object_card_items(self, context):
    return card_items(self, context)


def group_items(self, context):
    return _keep('group', [('', "(none)", "")] + [(g.name, g.name, "") for g in getattr(self, '_groups_src', [])])


def _update_sync(self, context):
    from . import runtime
    runtime.mark_dirty()


def _xray_changed(self, context):
    from . import runtime
    try:
        runtime.apply_xray(context.scene)
        runtime.mark_dirty()
    except Exception:
        pass


# ----------------------------------------------------------------------------- fluids
class AF_FluidItem(PropertyGroup):
    name: StringProperty(name="Name", default="Fluid", update=_update_sync)
    preset: EnumProperty(name="Preset", items=F.FLUID_ITEMS, default='WATER')
    kind: EnumProperty(name="State", items=[('LIQUID', "Liquid", ""), ('GAS', "Gas", "")], default='LIQUID', update=_update_sync)
    density: FloatProperty(name="Density", default=997.0, min=1e-3, unit='NONE', description="kg/m3 at 101325 Pa", update=_update_sync)
    bulk: FloatProperty(name="Bulk modulus", default=2.2e9, min=1e6, description="Pa (liquids)", update=_update_sync)
    molar: FloatProperty(name="Molar mass", default=0.018, min=1e-4, description="kg/mol (gases)", update=_update_sync)
    visc: FloatProperty(name="Viscosity", default=1e-3, min=0.0, description="Pa s", update=_update_sync)
    cp: FloatProperty(name="Specific heat", default=4181.0, min=1.0, description="J/(kg K)", update=_update_sync)
    temperature: FloatProperty(name="Temperature", default=293.15, min=1.0, description="Initial temperature (K); a Temperature physics card assigned to this fluid overrides it", update=_update_sync)
    flame_t: FloatProperty(name="Flame temperature", default=293.15, min=1.0, description="K reached when burning in a chamber", update=_update_sync)
    fluid_role: EnumProperty(name="Role", items=[('GENERIC', "Generic", ""), ('FUEL', "Fuel", ""), ('OXIDIZER', "Oxidizer", "")],
                             default='GENERIC', update=_update_sync)
    color: FloatVectorProperty(name="Color", subtype='COLOR', size=3, default=(0.25, 0.55, 0.95), min=0, max=1)
    # render
    render_mode: EnumProperty(name="Render type", items=[('POINTS', "Points", "Instance an object on every point"),
                                                         ('RAYMARCH', "Ray marching", "Volumetric density rendered by the render engine"),
                                                         ('SPLAT', "Gaussian splat", "Soft gaussian blobs")], default='POINTS')
    # points card
    pt_object: PointerProperty(name="Instance object", type=bpy.types.Object, description="Object instanced on every point (empty = icosphere)")
    pt_collection: PointerProperty(name="Instance collection", type=bpy.types.Collection)
    pt_use_collection: BoolProperty(name="Use collection", default=False)
    pt_scale: FloatProperty(name="Scale", default=1.0, min=0.0)
    pt_material: PointerProperty(name="Shader", type=bpy.types.Material, description="Material of the instanced points (edit it in the Shader Editor)")
    # ray march card
    rm_density: FloatProperty(name="Density", default=40.0, min=0.0)
    rm_voxel: FloatProperty(name="Voxel size", default=0.0, min=0.0, description="0 = automatic (particle radius)")
    rm_radius: FloatProperty(name="Radius scale", default=2.0, min=0.1)
    rm_color_a: FloatVectorProperty(name="Color A", subtype='COLOR', size=3, default=(0.3, 0.6, 1.0), min=0, max=1)
    rm_color_b: FloatVectorProperty(name="Color B", subtype='COLOR', size=3, default=(1.0, 0.5, 0.15), min=0, max=1)
    rm_blend: FloatProperty(name="Color blend", default=0.0, min=0.0, max=1.0, description="Mixes Color A to B.  Driven by the 'AF_ColorBlend' shape key on the particle object, so you can animate it with shape keys or drivers")
    rm_emission: FloatProperty(name="Emission", default=0.0, min=0.0)
    rm_absorption: FloatProperty(name="Absorption", default=0.5, min=0.0)
    rm_anisotropy: FloatProperty(name="Anisotropy", default=0.3, min=-1.0, max=1.0)
    rm_noise: FloatProperty(name="Noise amount", default=0.3, min=0.0, max=1.0)
    rm_noise_scale: FloatProperty(name="Noise scale", default=6.0, min=0.01)
    rm_material: PointerProperty(name="Volume shader", type=bpy.types.Material)
    # gaussian splat card
    gs_resolution: IntProperty(name="Resolution", default=1, min=0, max=3, description="Subdivisions of the splat primitive")
    gs_density: FloatProperty(name="Density", default=1.0, min=0.0, max=1.0, description="Fraction of particles splatted")
    gs_scale: FloatProperty(name="Scale", default=2.5, min=0.0)
    gs_blend: FloatProperty(name="Blending", default=6.0, min=0.5, max=40.0, description="Gaussian falloff sharpness")
    gs_object: PointerProperty(name="Splat asset", type=bpy.types.Object, description="Object used as the splat (empty = icosphere)")
    gs_material: PointerProperty(name="Splat shader", type=bpy.types.Material)
    # runtime-created objects
    points_obj: PointerProperty(type=bpy.types.Object)
    volume_obj: PointerProperty(type=bpy.types.Object)
    splat_obj: PointerProperty(type=bpy.types.Object)
    expand: BoolProperty(default=True)


# ----------------------------------------------------------------------------- physics + math cards
class AF_PhysicsCard(PropertyGroup):
    name: StringProperty(name="Name", default="Card")
    kind: EnumProperty(name="Type", items=[('MASS', "Mass", "kg"), ('VOLUME', "Volume", "m3"), ('WEIGHT', "Weight", "N"),
                                            ('DENSITY', "Density", "kg/m3"), ('TEMPERATURE', "Temperature", "K / C / F"),
                                            ('VELOCITY', "Velocity", "m/s")], default='MASS', update=_update_sync)
    fluid: EnumProperty(name="Fluid", items=fluid_items, update=_update_sync)
    value: FloatProperty(name="Value", default=1.0, update=_update_sync)
    temp_unit: EnumProperty(name="Unit", items=[('K', "Kelvin", ""), ('C', "Celsius", ""), ('F', "Fahrenheit", "")], default='K', update=_update_sync)
    vel_preset: EnumProperty(name="Common", items=[(i, l, "") for i, l, _v in U.VELOCITY_PRESETS], default='CUSTOM',
                             update=lambda s, c: (s.__setattr__('value', U.velocity_from_preset(s.vel_preset, s.value)) if s.vel_preset != 'CUSTOM' else None))

    def si(self):
        if self.kind == 'TEMPERATURE':
            return U.to_kelvin(self.value, self.temp_unit)
        return float(self.value)

    def unit_label(self):
        return {'MASS': "kg", 'VOLUME': "m3", 'WEIGHT': "N", 'DENSITY': "kg/m3", 'VELOCITY': "m/s", 'TEMPERATURE': self.temp_unit}[self.kind]


class AF_MathTerm(PropertyGroup):
    op: EnumProperty(name="Operator", items=[(i, l, "") for i, l, _s in MC.OPS], default='ADD', update=_update_sync)
    kind: EnumProperty(name="Operand", items=[('CARD', "Physics card", ""), ('GROUP', "Group", ""), ('CONST', "Constant", "")], default='CARD', update=_update_sync)
    card: EnumProperty(name="Card", items=card_items, update=_update_sync)
    group_ref: StringProperty(name="Group", default="")
    const: FloatProperty(name="Constant", default=1.0, update=_update_sync)
    group: StringProperty(name="In group", default="")


class AF_MathGroup(PropertyGroup):
    name: StringProperty(default="Group A")


class AF_MathCard(PropertyGroup):
    name: StringProperty(name="Name", default="Math")
    terms: CollectionProperty(type=AF_MathTerm)
    groups: CollectionProperty(type=AF_MathGroup)
    target_group: StringProperty(name="Add to", default="", description="Group that new terms are added to ('' = top level)")
    output: EnumProperty(name="Drives", items=[('NONE', "Nothing (value only)", ""), ('IGNITION', "Ignition / combustion", "Result 0..1 sets how strongly chamber fluid burns"),
                                                ('FEEDBACK', "Feedback value", "Result drives the feedback plane / asset")], default='NONE', update=_update_sync)
    gain: FloatProperty(name="Gain", default=1.0, update=_update_sync)
    result: FloatProperty(name="Result", default=0.0)

    def term_list(self):
        return [MC.Term(t.op, t.kind, t.card if t.kind == 'CARD' else t.group_ref, t.const, t.group) for t in self.terms]


# ----------------------------------------------------------------------------- object properties
class AF_ObjectProps(PropertyGroup):
    role: EnumProperty(name="Role", items=[('NONE', "None", "Not part of the simulation"),
                                           ('CONTAINER', "Container", "Holds a finite fill of fluid"),
                                           ('TRANSPORT', "Transport", "Conducts fluid (pipe, hose, vein...). Starts empty"),
                                           ('CHAMBER', "Chamber", "Same as Transport; the usual target for visual feedback (engines)"),
                                           ('COLLIDER', "Collider", "Solid obstacle only")], default='NONE', update=_update_sync)
    cavity_mode: EnumProperty(name="Cavity", items=[('AUTO', "Auto", "Detect modelled inner cavities; otherwise treat the surface as enclosing the fluid"),
                                                    ('SHELL', "Surface encloses fluid", "Sealed bag / tank / pipe surface: the fluid is inside the surface"),
                                                    ('SOLID', "Solid body", "Mesh is a solid with modelled cavities. With no cavity the fluid rests on top and spills")],
                              default='AUTO', update=_update_sync)
    resolution: IntProperty(name="Field resolution", default=40, min=8, max=96, description="Voxels along the longest side of the LOTCBP base field", update=_update_sync)
    lotcbp_level: IntProperty(name="LOTCBP level", default=2, min=0, max=3, description="Refinement levels of the virtual tessellation bricks (0 = off)", update=_update_sync)
    material: EnumProperty(name="Material", items=M.MATERIAL_ITEMS, default='INDUSTRIAL_STEEL',
                           update=lambda s, c: s.apply_material())
    density: FloatProperty(name="Density", default=7850.0, min=1.0, description="kg/m3", update=_update_sync)
    young: FloatProperty(name="Young's modulus", default=200e9, min=1e3, description="Pa", update=_update_sync)
    yield_strength: FloatProperty(name="Yield strength", default=250e6, min=1e3, description="Pa", update=_update_sync)
    conductivity: FloatProperty(name="Thermal conductivity", default=50.0, min=1e-3, description="W/(m K)", update=_update_sync)
    specific_heat: FloatProperty(name="Specific heat", default=490.0, min=1.0, description="J/(kg K)", update=_update_sync)
    max_temp: FloatProperty(name="Max temperature", default=1000.0, min=10.0, description="Service limit, K", update=_update_sync)
    alpha: FloatProperty(name="Thermal expansion", default=12e-6, min=0.0, precision=7, update=_update_sync)
    poisson: FloatProperty(name="Poisson ratio", default=0.29, min=0.0, max=0.49, update=_update_sync)
    wall: FloatProperty(name="Wall thickness", default=0.005, min=1e-4, unit='LENGTH', update=_update_sync)
    fluid: EnumProperty(name="Fluid", items=fluid_items, update=_update_sync)
    fill_mode: EnumProperty(name="Fill by", items=[('PERCENT', "Percent of cavity", ""), ('ABSOLUTE', "Volume (m3)", ""),
                                                    ('CARDS', "Physics cards", "Volume / mass / weight cards of the fluid, shared equally by its containers")], default='PERCENT', update=_update_sync)
    fill_percent: FloatProperty(name="Fill", default=80.0, min=0.0, max=100.0, subtype='PERCENTAGE', update=_update_sync)
    fill_volume: FloatProperty(name="Fill volume", default=1.0, min=0.0, description="m3", update=_update_sync)
    pressure: FloatProperty(name="Pressure", default=0.0, min=0.0, description="Absolute pressure in Pa (0 = ambient)", update=_update_sync)
    particles: IntProperty(name="Particles", default=1500, min=16, max=60000, update=_update_sync)
    # emitter (anything can be one; nothing is by default)
    is_emitter: BoolProperty(name="Emitter", default=False, update=_update_sync)
    emit_mode: EnumProperty(name="Emit from", items=[('VOLUME', "Volume", "Inside the object"), ('ORIGIN', "Origin", "Volumetric ball at the object origin"),
                                                     ('SURFACE', "Surface", "Whole surface"), ('FACES', "Selected faces", "Only the assigned faces")],
                            default='SURFACE', update=_update_sync)
    emit_fluid: EnumProperty(name="Fluid", items=fluid_items, update=_update_sync)
    emit_rate: FloatProperty(name="Rate", default=300.0, min=0.0, description="Particles per second", update=_update_sync)
    emit_speed: FloatProperty(name="Speed", default=1.0, update=_update_sync)
    emit_radius: FloatProperty(name="Origin radius", default=0.2, min=0.0, unit='LENGTH', update=_update_sync)
    emit_inward: BoolProperty(name="Inward", default=False, update=_update_sync)
    emit_volume: FloatProperty(name="Particle volume", default=2e-5, min=1e-9, precision=7, description="m3 per emitted particle", update=_update_sync)
    emit_faces_assigned: BoolProperty(name="Faces assigned", default=False)
    # live results
    temp_now: FloatProperty(name="Temperature", default=293.15, precision=1)
    stress_now: FloatProperty(name="Stress / yield", default=0.0, precision=3)
    pressure_now: FloatProperty(name="Pressure", default=0.0, precision=0)
    xray_backup: StringProperty(default="")

    def apply_material(self):
        if self.material in M.MATERIALS and self.material != 'CUSTOM':
            m = M.MATERIALS[self.material]
            self.density, self.young, self.yield_strength = m['density'], m['young'], m['yield_']
            self.conductivity, self.specific_heat, self.max_temp = m['k'], m['cp'], m['tmax']
            self.alpha, self.poisson = m['alpha'], m['poisson']
        _update_sync(self, None)

    def material_dict(self):
        return dict(label=self.material, density=self.density, young=self.young, yield_=self.yield_strength,
                    k=self.conductivity, cp=self.specific_heat, tmax=self.max_temp, alpha=self.alpha, poisson=self.poisson)


# ----------------------------------------------------------------------------- environment + scene
class AF_Env(PropertyGroup):
    source: EnumProperty(name="Environment", items=[('WORLD', "Blender scene", "Uses the scene gravity; open air around everything"),
                                                    ('OBJECT', "Environment object", "Fluid lives inside this asset (vacuum chamber, room, cave...)")], default='WORLD', update=_update_sync)
    obj: PointerProperty(name="Object", type=bpy.types.Object, poll=lambda s, o: o.type == 'MESH')
    pressure: FloatProperty(name="Atmospheric pressure", default=101325.0, min=0.0, description="Pa", update=_update_sync)
    use_scene_gravity: BoolProperty(name="Scene gravity", default=True, update=_update_sync)
    gravity: FloatVectorProperty(name="Gravity", default=(0.0, 0.0, -9.81), subtype='ACCELERATION', size=3, update=_update_sync)
    wind: FloatVectorProperty(name="Wind velocity", default=(0.0, 0.0, 0.0), subtype='VELOCITY', size=3, update=_update_sync)
    temperature: FloatProperty(name="Temperature", default=293.15, min=0.0, description="K", update=_update_sync)
    density: FloatProperty(name="Atmospheric density", default=1.225, min=0.0, description="kg/m3", update=_update_sync)
    atmo_fluid: EnumProperty(name="Atmospheric fluid", items=fluid_items, update=_update_sync)
    ground: BoolProperty(name="Ground plane", default=True, update=_update_sync)
    ground_auto: BoolProperty(name="Auto height", default=True, description="Ground sits at the lowest simulation part", update=_update_sync)
    ground_z: FloatProperty(name="Ground height", default=0.0, unit='LENGTH', update=_update_sync)


class AF_Scene(PropertyGroup):
    fluids: CollectionProperty(type=AF_FluidItem)
    fluid_index: IntProperty(default=0)
    physics_cards: CollectionProperty(type=AF_PhysicsCard)
    math_cards: CollectionProperty(type=AF_MathCard)
    env: PointerProperty(type=AF_Env)
    # modes
    continuous: BoolProperty(name="Continuous flow", default=True, description="On: containers refill as they are used.  Off: containers deplete until empty", update=_update_sync)
    xray: BoolProperty(name="X-ray", default=True, description="See through the parts and light the fluid inside; thermal / stress tint on the surfaces", update=_xray_changed)
    xray_opacity: FloatProperty(name="Wall opacity", default=0.12, min=0.0, max=1.0)
    xray_emission: FloatProperty(name="Interior light", default=3.0, min=0.0, description="Artificial emission added to the fluid so it is visible inside closed parts")
    tint_mode: EnumProperty(name="Surface tint", items=[('THERMAL', "Thermal", ""), ('STRESS', "Stress / yield", ""), ('NONE', "Off", "")], default='THERMAL')
    t_lo: FloatProperty(name="Fluid color min", default=250.0, description="K at the cold end of the thermal ramp")
    t_hi: FloatProperty(name="Fluid color max", default=3500.0, description="K at the hot end of the thermal ramp")
    # solver
    net_res: IntProperty(name="Network resolution", default=40, min=16, max=96, description="Voxels for the path-length / joint field", update=_update_sync)
    vmax: FloatProperty(name="Max speed", default=60.0, min=1.0, description="m/s, hard clamp", update=_update_sync)
    radius_scale: FloatProperty(name="Particle size", default=1.0, min=0.05, update=_update_sync)
    seed: IntProperty(name="Seed", default=1, update=_update_sync)
    lotcbp: BoolProperty(name="LOTCBP refinement", default=True, description="Dynamic virtual tessellation of the collision bodies where fluid touches them", update=_update_sync)
    max_substeps: IntProperty(name="Max substeps", default=6, min=1, max=32)
    # timeline
    use_scene_range: BoolProperty(name="Use scene frame range", default=True)
    frame_start: IntProperty(name="Start", default=1)
    frame_end: IntProperty(name="End", default=250)
    # cache
    cache_dir: StringProperty(name="Cache folder", subtype='DIR_PATH', default="//arcflow_cache/")
    cache_name: StringProperty(name="Name", default="sim")
    cache_version: IntProperty(name="Version", default=1, min=1)
    baked: BoolProperty(name="Baked", default=False)
    baked_file: StringProperty(name="Baked file", subtype='FILE_PATH', default="")
    record_file: StringProperty(name="Last record", subtype='FILE_PATH', default="")
    pack_in_blend: BoolProperty(name="Pack cache into .blend", default=False)
    # feedback
    feedback_obj: PointerProperty(name="Feedback asset", type=bpy.types.Object)
    feedback_mode: EnumProperty(name="Feedback shows", items=[('TEMPERATURE', "Chamber temperature", ""), ('IGNITION', "Ignition", ""),
                                                              ('PRESSURE', "Pressure", ""), ('STRESS', "Stress / yield", "")], default='TEMPERATURE')
    # runtime flags (not meant to be edited)
    status: StringProperty(default="Idle")
    ui_physics: BoolProperty(default=True)
    ui_math: BoolProperty(default=True)


CLASSES = (AF_FluidItem, AF_PhysicsCard, AF_MathTerm, AF_MathGroup, AF_MathCard, AF_ObjectProps, AF_Env, AF_Scene)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.arc_flow = PointerProperty(type=AF_Scene)
    bpy.types.Object.arc_flow = PointerProperty(type=AF_ObjectProps)


def unregister():
    del bpy.types.Object.arc_flow
    del bpy.types.Scene.arc_flow
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
