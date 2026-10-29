"""Render-engine agnostic materials (Cycles + EEVEE): points, volume, splat, X-ray, feedback.

Every tunable lives on a labelled node (name 'AF_*') so users can edit the materials in the Shader Editor
and the add-on only changes the values of those named nodes."""
import bpy

from .core.materials import THERMAL_STOPS
from .nodeutil import Builder, enable_nodes, inp, out, set_blended


def _mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m['af_fresh'] = True
    fresh = m.get('af_fresh', False)
    nt = enable_nodes(m)
    return m, nt, fresh


def _ramp(b, fac=None, y=0):
    n = b.node('ShaderNodeValToRGB', label="Thermal ramp", y=y)
    els = n.color_ramp.elements
    while len(els) < len(THERMAL_STOPS):
        els.new(0.5)
    for e, (p, r, g, bl) in zip(els, THERMAL_STOPS):
        e.position = p
        e.color = (r, g, bl, 1.0)
    if fac is not None:
        b.link(fac, n.inputs[0])
    return n


def _value(b, name, v, y=0):
    n = b.node('ShaderNodeValue', label=name, y=y)
    n.name = name
    n.outputs[0].default_value = v
    return n


def _rgb(b, name, c, y=0):
    n = b.node('ShaderNodeRGB', label=name, y=y)
    n.name = name
    n.outputs[0].default_value = (c[0], c[1], c[2], 1.0)
    return n


def _prin(nt_node, **kv):
    for k, v in kv.items():
        for s in nt_node.inputs:
            if s.name == k:
                try:
                    s.default_value = v
                except Exception:
                    pass
                break


def points_material():
    m, nt, fresh = _mat("AF_Points")
    if not fresh:
        return m
    m['af_fresh'] = False
    nt.nodes.clear()
    b = Builder(nt)
    attr = b.node('ShaderNodeAttribute', attribute_type='INSTANCER', attribute_name='af_tn', y=250)
    ramp = _ramp(b, out(attr, 'Fac'), y=250)
    col = _rgb(b, 'AF_Color', (0.25, 0.55, 0.95), y=0)
    tint = _value(b, 'AF_TintMix', 0.0, y=-120)
    mix = b.node('ShaderNodeMix', data_type='RGBA', y=150)
    b.link(out(tint, 'Value'), inp(mix, 'Factor'))
    b.link(out(col, 'Color'), mix.inputs['A'] if 'A' in mix.inputs else mix.inputs[6])
    b.link(out(ramp, 'Color'), mix.inputs['B'] if 'B' in mix.inputs else mix.inputs[7])
    em = _value(b, 'AF_Emission', 0.0, y=-240)
    bsdf = b.node('ShaderNodeBsdfPrincipled', y=100)
    _prin(bsdf, Roughness=0.05, IOR=1.33)
    _prin(bsdf, **{'Transmission Weight': 0.6})
    b.link(out(mix, 'Result'), inp(bsdf, 'Base Color'))
    b.link(out(mix, 'Result'), inp(bsdf, 'Emission Color'))
    b.link(out(em, 'Value'), inp(bsdf, 'Emission Strength'))
    o = b.node('ShaderNodeOutputMaterial', y=100)
    b.link(out(bsdf, 'BSDF'), inp(o, 'Surface'))
    return m


def volume_material():
    m, nt, fresh = _mat("AF_Volume")
    if not fresh:
        return m
    m['af_fresh'] = False
    nt.nodes.clear()
    b = Builder(nt)
    ca, cb = _rgb(b, 'AF_ColorA', (0.3, 0.6, 1.0), y=300), _rgb(b, 'AF_ColorB', (1.0, 0.5, 0.15), y=180)
    blend = _value(b, 'AF_Blend', 0.0, y=60)
    mix = b.node('ShaderNodeMix', data_type='RGBA', y=200)
    b.link(out(blend, 'Value'), inp(mix, 'Factor'))
    b.link(out(ca, 'Color'), mix.inputs['A'] if 'A' in mix.inputs else mix.inputs[6])
    b.link(out(cb, 'Color'), mix.inputs['B'] if 'B' in mix.inputs else mix.inputs[7])
    dens, nz, nsc = _value(b, 'AF_Density', 40.0, y=-60), _value(b, 'AF_Noise', 0.3, y=-180), _value(b, 'AF_NoiseScale', 6.0, y=-300)
    noise = b.node('ShaderNodeTexNoise', y=-300)
    b.link(out(nsc, 'Value'), inp(noise, 'Scale'))
    one_minus = b.math('SUBTRACT', 1.0, out(nz, 'Value'), y=-180)
    nmul = b.math('MULTIPLY', out(noise, 'Fac'), out(nz, 'Value'), y=-240)
    nadd = b.math('ADD', out(one_minus, 'Value'), out(nmul, 'Value'), y=-200)
    dmul = b.math('MULTIPLY', out(dens, 'Value'), out(nadd, 'Value'), y=-100)
    em, ab, an = _value(b, 'AF_Emission', 0.0, y=-420), _value(b, 'AF_Absorb', 0.5, y=-540), _value(b, 'AF_Anisotropy', 0.3, y=-660)
    ign = b.node('ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='af_ignition', y=-420)
    ramp = _ramp(b, out(ign, 'Fac'), y=-420)
    pv = b.node('ShaderNodeVolumePrincipled', y=100)
    b.link(out(mix, 'Result'), inp(pv, 'Color'))
    b.link(out(dmul, 'Value'), inp(pv, 'Density'))
    b.link(out(an, 'Value'), inp(pv, 'Anisotropy'))
    b.link(out(ramp, 'Color'), inp(pv, 'Emission Color'))
    b.link(out(em, 'Value'), inp(pv, 'Emission Strength'))
    ab2 = b.math('MULTIPLY', out(ab, 'Value'), 1.0, y=-540)
    try:
        b.link(out(mix, 'Result'), inp(pv, 'Absorption Color'))
    except KeyError:
        pass
    o = b.node('ShaderNodeOutputMaterial', y=100)
    b.link(out(pv, 'Volume'), inp(o, 'Volume'))
    return m


def splat_material():
    m, nt, fresh = _mat("AF_Splat")
    if not fresh:
        return m
    m['af_fresh'] = False
    set_blended(m)
    nt.nodes.clear()
    b = Builder(nt)
    geo = b.node('ShaderNodeNewGeometry', y=300)
    dot = b.node('ShaderNodeVectorMath', operation='DOT_PRODUCT', y=300)
    b.link(out(geo, 'Normal'), dot.inputs[0]); b.link(out(geo, 'Incoming'), dot.inputs[1])
    c2 = b.math('MULTIPLY', out(dot, 'Value'), out(dot, 'Value'), y=300)
    r2 = b.math('SUBTRACT', 1.0, out(c2, 'Value'), y=300)
    k = _value(b, 'AF_Sharpness', 6.0, y=150)
    neg = b.math('MULTIPLY', out(r2, 'Value'), out(k, 'Value'), y=200)
    neg2 = b.math('MULTIPLY', out(neg, 'Value'), -1.0, y=200)
    g = b.math('EXPONENT', out(neg2, 'Value'), y=200)
    attr = b.node('ShaderNodeAttribute', attribute_type='INSTANCER', attribute_name='af_tn', y=0)
    ramp = _ramp(b, out(attr, 'Fac'), y=0)
    col = _rgb(b, 'AF_Color', (0.25, 0.55, 0.95), y=-150)
    tint = _value(b, 'AF_TintMix', 0.0, y=-280)
    mix = b.node('ShaderNodeMix', data_type='RGBA', y=-100)
    b.link(out(tint, 'Value'), inp(mix, 'Factor'))
    b.link(out(col, 'Color'), mix.inputs['A'] if 'A' in mix.inputs else mix.inputs[6])
    b.link(out(ramp, 'Color'), mix.inputs['B'] if 'B' in mix.inputs else mix.inputs[7])
    em = _value(b, 'AF_Emission', 2.0, y=-400)
    emit = b.node('ShaderNodeEmission', y=-100)
    b.link(out(mix, 'Result'), inp(emit, 'Color')); b.link(out(em, 'Value'), inp(emit, 'Strength'))
    tr = b.node('ShaderNodeBsdfTransparent', y=100)
    ms = b.node('ShaderNodeMixShader', y=100)
    b.link(out(g, 'Value'), inp(ms, 'Fac'))
    b.link(out(tr, 'BSDF'), ms.inputs[1]); b.link(out(emit, 'Emission'), ms.inputs[2])
    o = b.node('ShaderNodeOutputMaterial', y=100)
    b.link(out(ms, 'Shader'), inp(o, 'Surface'))
    return m


def xray_material():
    """Shared see-through material.  Colour comes from the per-object custom property 'af_tint' (0..1)."""
    m, nt, fresh = _mat("AF_XRay")
    if not fresh:
        return m
    m['af_fresh'] = False
    set_blended(m)
    nt.nodes.clear()
    b = Builder(nt)
    attr = b.node('ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='af_tint', y=200)
    ramp = _ramp(b, out(attr, 'Fac'), y=200)
    fr = b.node('ShaderNodeFresnel', y=-100)
    op = _value(b, 'AF_Opacity', 0.12, y=-250)
    edge = b.math('ADD', out(op, 'Value'), out(fr, 'Fac'), y=-100)
    clamp = b.math('MINIMUM', out(edge, 'Value'), 1.0, y=-100)
    emit = b.node('ShaderNodeEmission', y=100)
    b.link(out(ramp, 'Color'), inp(emit, 'Color'))
    b.link(out(op, 'Value'), inp(emit, 'Strength'))
    tr = b.node('ShaderNodeBsdfTransparent', y=-50)
    ms = b.node('ShaderNodeMixShader', y=0)
    b.link(out(clamp, 'Value'), inp(ms, 'Fac'))
    b.link(out(tr, 'BSDF'), ms.inputs[1]); b.link(out(emit, 'Emission'), ms.inputs[2])
    o = b.node('ShaderNodeOutputMaterial', y=0)
    b.link(out(ms, 'Shader'), inp(o, 'Surface'))
    return m


def feedback_material():
    m, nt, fresh = _mat("AF_Feedback")
    if not fresh:
        return m
    m['af_fresh'] = False
    nt.nodes.clear()
    b = Builder(nt)
    attr = b.node('ShaderNodeAttribute', attribute_type='OBJECT', attribute_name='af_fb', y=0)
    ramp = _ramp(b, out(attr, 'Fac'), y=0)
    emit = b.node('ShaderNodeEmission', y=0)
    b.link(out(ramp, 'Color'), inp(emit, 'Color'))
    emit.inputs['Strength'].default_value = 2.0
    o = b.node('ShaderNodeOutputMaterial', y=0)
    b.link(out(emit, 'Emission'), inp(o, 'Surface'))
    return m


def set_params(mat, **values):
    """Set labelled 'AF_*' Value / RGB nodes: set_params(mat, AF_Density=3.0, AF_Color=(r,g,b))."""
    if mat is None or mat.node_tree is None:
        return
    for k, v in values.items():
        n = mat.node_tree.nodes.get(k)
        if n is None:
            continue
        if n.bl_idname == 'ShaderNodeRGB':
            n.outputs[0].default_value = (v[0], v[1], v[2], 1.0)
        else:
            n.outputs[0].default_value = v


def bind_blend_driver(mat, obj, key_name="AF_ColorBlend"):
    """Drive the volume material's AF_Blend from a shape key on the particle object."""
    if mat is None or obj is None or obj.data.shape_keys is None:
        return
    node = mat.node_tree.nodes.get('AF_Blend')
    if node is None:
        return
    sk = obj.data.shape_keys
    if key_name not in sk.key_blocks:
        return
    try:
        node.outputs[0].driver_remove('default_value')
    except Exception:
        pass
    fc = node.outputs[0].driver_add('default_value')
    d = fc.driver
    d.type = 'AVERAGE'
    var = d.variables.new()
    var.name = 'v'
    var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'KEY'
    var.targets[0].id = sk
    var.targets[0].data_path = 'key_blocks["%s"].value' % key_name
