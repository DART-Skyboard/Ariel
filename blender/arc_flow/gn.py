"""Geometry Nodes generation: render groups (Points / Ray march / Gaussian splat), one group per
physics card, one group per math card, per-fluid card chains and the feedback group.

Every card the user makes in the panel gets the equivalent node group (inputs/outputs are real group
sockets), so it can be rewired, duplicated and extended in the Geometry Nodes editor."""
import re

import bpy

from .core import mathcards as MC
from .nodeutil import Builder, add_socket, fresh_group, inp, out


def slug(s):
    return re.sub(r'[^0-9a-zA-Z]+', '_', s).strip('_') or 'x'


def _matnode(b):
    n = b.node('GeometryNodeInputMaterial', label="Fluid shader", y=-650)
    n.name = 'AF_Material'
    return n


def set_group_material(ng, mat):
    n = ng.nodes.get('AF_Material')
    if n is not None:
        n.material = mat


def render_group(kind, fluid_name):
    """Per-fluid render group (created once; user edits are kept)."""
    name = "AF_%s_%s" % (kind, slug(fluid_name))
    ng = bpy.data.node_groups.get(name)
    if ng is None or not ng.nodes:
        ng = {'Points': points_group, 'RayMarch': raymarch_group, 'Splat': splat_group}[kind](name)
    return ng


def _any_in(node, *names):
    for n in names:
        if any(s.name == n for s in node.inputs):
            return inp(node, n)
    raise KeyError(names)


def _any_out(node, *names):
    for n in names:
        if any(s.name == n for s in node.outputs):
            return out(node, n)
    raise KeyError(names)


def _sw_geo(b, cond, false_geo, true_geo, y=0):
    n = b.node('GeometryNodeSwitch', input_type='GEOMETRY', y=y)
    b.link(cond, inp(n, 'Switch'))
    b.link(false_geo, inp(n, 'False'))
    b.link(true_geo, inp(n, 'True'))
    return out(n, 'Output')


def _alive_filter(b, gi, extra_cond=None, y=0):
    rad = b.node('GeometryNodeInputNamedAttribute', data_type='FLOAT', y=y + 200)
    inp(rad, 'Name').default_value = 'af_radius'
    cmp_ = b.node('FunctionNodeCompare', data_type='FLOAT', operation='LESS_THAN', y=y + 200)
    b.link(out(rad, 'Attribute'), cmp_.inputs[0])
    cmp_.inputs[1].default_value = 1e-6
    sel = out(cmp_, 'Result')
    if extra_cond is not None:
        orn = b.node('FunctionNodeBooleanMath', operation='OR', y=y + 200)
        b.link(sel, orn.inputs[0]); b.link(extra_cond, orn.inputs[1])
        sel = out(orn, 'Boolean')
    d = b.node('GeometryNodeDeleteGeometry', y=y)
    b.link(out(gi, 'Geometry'), inp(d, 'Geometry'))
    b.link(sel, inp(d, 'Selection'))
    return out(d, 'Geometry'), out(rad, 'Attribute')


def points_group(name="AF_Points"):
    ng = fresh_group(name)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    add_socket(ng, "Instance Object", 'NodeSocketObject', 'INPUT')
    add_socket(ng, "Use Object", 'NodeSocketBool', 'INPUT', False)
    add_socket(ng, "Instance Collection", 'NodeSocketCollection', 'INPUT')
    add_socket(ng, "Use Collection", 'NodeSocketBool', 'INPUT', False)
    add_socket(ng, "Scale", 'NodeSocketFloat', 'INPUT', 1.0, 0.0)
    add_socket(ng, "Subdivisions", 'NodeSocketInt', 'INPUT', 2, 0, 5)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    geo, rad = _alive_filter(b, gi)
    ico = b.node('GeometryNodeMeshIcoSphere', y=-200)
    b.link(out(gi, 'Subdivisions'), inp(ico, 'Subdivisions'))
    oi = b.node('GeometryNodeObjectInfo', y=-350, transform_space='ORIGINAL')
    b.link(out(gi, 'Instance Object'), inp(oi, 'Object'))
    inp(oi, 'As Instance').default_value = True
    ci = b.node('GeometryNodeCollectionInfo', y=-500)
    b.link(out(gi, 'Instance Collection'), inp(ci, 'Collection'))
    inp(ci, 'Separate Children').default_value = True
    inp(ci, 'Reset Children').default_value = True
    smooth = b.node('GeometryNodeSetShadeSmooth', y=-200)
    b.link(out(ico, 'Mesh'), _any_in(smooth, 'Geometry', 'Mesh'))
    s1 = _sw_geo(b, out(gi, 'Use Object'), _any_out(smooth, 'Mesh', 'Geometry'), out(oi, 'Geometry'), y=-250)
    s2 = _sw_geo(b, out(gi, 'Use Collection'), s1, out(ci, 'Instances'), y=-400)
    mul = b.math('MULTIPLY', rad, out(gi, 'Scale'), y=100)
    iop = b.node('GeometryNodeInstanceOnPoints', y=0)
    b.link(geo, inp(iop, 'Points'))
    b.link(s2, inp(iop, 'Instance'))
    b.link(out(mul, 'Value'), inp(iop, 'Scale'))
    if iop.inputs.get('Pick Instance') is not None:
        b.link(out(gi, 'Use Collection'), inp(iop, 'Pick Instance'))
    sm = b.node('GeometryNodeSetMaterial', y=0)
    b.link(out(iop, 'Instances'), inp(sm, 'Geometry'))
    b.link(out(_matnode(b), 'Material'), inp(sm, 'Material'))
    b.link(out(sm, 'Geometry'), inp(go, 'Geometry'))
    return ng


def raymarch_group(name="AF_RayMarch"):
    ng = fresh_group(name)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    add_socket(ng, "Density", 'NodeSocketFloat', 'INPUT', 1.0, 0.0, desc="Density written into the volume grid")
    add_socket(ng, "Voxel Size", 'NodeSocketFloat', 'INPUT', 0.05, 1e-4)
    add_socket(ng, "Radius Scale", 'NodeSocketFloat', 'INPUT', 2.0, 0.01)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    geo, rad = _alive_filter(b, gi)
    mul = b.math('MULTIPLY', rad, out(gi, 'Radius Scale'), y=150)
    p2v = b.node('GeometryNodePointsToVolume', y=0)
    if hasattr(p2v, 'resolution_mode'):          # 4.2 - 4.5: node property
        p2v.resolution_mode = 'VOXEL_SIZE'
    else:                                         # 5.x: menu socket
        inp(p2v, 'Resolution Mode').default_value = 'Size'
    b.link(geo, inp(p2v, 'Points'))
    b.link(out(gi, 'Density'), inp(p2v, 'Density'))
    b.link(out(gi, 'Voxel Size'), inp(p2v, 'Voxel Size'))
    b.link(out(mul, 'Value'), inp(p2v, 'Radius'))
    sm = b.node('GeometryNodeSetMaterial', y=0)
    b.link(out(p2v, 'Volume'), inp(sm, 'Geometry'))
    b.link(out(_matnode(b), 'Material'), inp(sm, 'Material'))
    b.link(out(sm, 'Geometry'), inp(go, 'Geometry'))
    return ng


def splat_group(name="AF_Splat"):
    ng = fresh_group(name)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    add_socket(ng, "Splat Object", 'NodeSocketObject', 'INPUT')
    add_socket(ng, "Use Object", 'NodeSocketBool', 'INPUT', False)
    add_socket(ng, "Resolution", 'NodeSocketInt', 'INPUT', 1, 0, 4)
    add_socket(ng, "Density", 'NodeSocketFloat', 'INPUT', 1.0, 0.0, 1.0)
    add_socket(ng, "Scale", 'NodeSocketFloat', 'INPUT', 2.5, 0.0)
    add_socket(ng, "Seed", 'NodeSocketInt', 'INPUT', 0)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    rv = b.node('FunctionNodeRandomValue', data_type='FLOAT', y=300)
    inp(rv, 'Min', 0).default_value = 0.0
    inp(rv, 'Max', 0).default_value = 1.0
    b.link(out(gi, 'Seed'), inp(rv, 'Seed'))
    gt = b.node('FunctionNodeCompare', data_type='FLOAT', operation='GREATER_THAN', y=300)
    b.link(out(rv, 'Value'), gt.inputs[0]); b.link(out(gi, 'Density'), gt.inputs[1])
    geo, rad = _alive_filter(b, gi, extra_cond=out(gt, 'Result'))
    ico = b.node('GeometryNodeMeshIcoSphere', y=-200)
    b.link(out(gi, 'Resolution'), inp(ico, 'Subdivisions'))
    oi = b.node('GeometryNodeObjectInfo', y=-350, transform_space='ORIGINAL')
    b.link(out(gi, 'Splat Object'), inp(oi, 'Object'))
    inp(oi, 'As Instance').default_value = True
    smooth = b.node('GeometryNodeSetShadeSmooth', y=-200)
    b.link(out(ico, 'Mesh'), _any_in(smooth, 'Geometry', 'Mesh'))
    s1 = _sw_geo(b, out(gi, 'Use Object'), _any_out(smooth, 'Mesh', 'Geometry'), out(oi, 'Geometry'), y=-250)
    mul = b.math('MULTIPLY', rad, out(gi, 'Scale'), y=100)
    iop = b.node('GeometryNodeInstanceOnPoints', y=0)
    b.link(geo, inp(iop, 'Points')); b.link(s1, inp(iop, 'Instance')); b.link(out(mul, 'Value'), inp(iop, 'Scale'))
    sm = b.node('GeometryNodeSetMaterial', y=0)
    b.link(out(iop, 'Instances'), inp(sm, 'Geometry')); b.link(out(_matnode(b), 'Material'), inp(sm, 'Material'))
    b.link(out(sm, 'Geometry'), inp(go, 'Geometry'))
    return ng


def feedback_group():
    ng = fresh_group("AF_Feedback")
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    add_socket(ng, "Value", 'NodeSocketFloat', 'INPUT', 0.0, desc="0..1 feedback value (wire a physics / math card here)")
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    st = b.node('GeometryNodeStoreNamedAttribute', data_type='FLOAT', domain='POINT')
    inp(st, 'Name').default_value = 'af_feedback'
    b.link(out(gi, 'Geometry'), inp(st, 'Geometry')); b.link(out(gi, 'Value'), inp(st, 'Value'))
    b.link(out(st, 'Geometry'), inp(go, 'Geometry'))
    return ng


# ----------------------------------------------------------------------------- cards
def physics_card_group(card):
    ng = fresh_group("AF_Phys_" + slug(card.name))
    ng['af_kind'] = card.kind
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    add_socket(ng, "Value", 'NodeSocketFloat', 'INPUT', card.si(), desc="%s in SI units (%s)" % (card.kind.title(), {
        'MASS': 'kg', 'VOLUME': 'm3', 'WEIGHT': 'N', 'DENSITY': 'kg/m3', 'TEMPERATURE': 'K', 'VELOCITY': 'm/s'}[card.kind]))
    add_socket(ng, "Scale", 'NodeSocketFloat', 'INPUT', 1.0)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    add_socket(ng, "Value", 'NodeSocketFloat', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    mul = b.math('MULTIPLY', out(gi, 'Value'), out(gi, 'Scale'))
    st = b.node('GeometryNodeStoreNamedAttribute', data_type='FLOAT', domain='POINT')
    inp(st, 'Name').default_value = "af_%s_%s" % (card.kind.lower(), slug(card.name))
    b.link(out(gi, 'Geometry'), inp(st, 'Geometry')); b.link(out(mul, 'Value'), inp(st, 'Value'))
    b.link(out(st, 'Geometry'), inp(go, 'Geometry')); b.link(out(mul, 'Value'), inp(go, 'Value'))
    return ng


def _expr(b, gi, terms, group, cache, y):
    mine = [t for t in terms if t.group == group]
    items = []
    for t in mine:
        if t.kind == 'CARD':
            key = 'c:' + t.ref
            if key not in cache:
                cache[key] = out(gi, t.ref)
            sock = cache[key]
        elif t.kind == 'GROUP':
            sock = _expr(b, gi, terms, t.ref, cache, y - 160) if t.ref != group else None
            if sock is None:
                v = b.node('ShaderNodeValue', y=y); v.outputs[0].default_value = 0.0; sock = out(v, 'Value')
        else:
            v = b.node('ShaderNodeValue', y=y - 60)
            v.outputs[0].default_value = float(t.value)
            sock = out(v, 'Value')
        items.append((t.op, sock))
    if not items:
        v = b.node('ShaderNodeValue', y=y); v.outputs[0].default_value = 0.0
        return out(v, 'Value')
    vals = [items[0][1]]; ops = []
    for op, s in items[1:]:
        ops.append(op); vals.append(s)

    def comb(op, a, c):
        if op == 'ADD': return out(b.math('ADD', a, c, y=y), 'Value')
        if op == 'SUB': return out(b.math('SUBTRACT', a, c, y=y), 'Value')
        if op == 'MUL': return out(b.math('MULTIPLY', a, c, y=y), 'Value')
        if op == 'DIV': return out(b.math('DIVIDE', a, c, y=y), 'Value')
        if op == 'POW': return out(b.math('POWER', a, c, y=y), 'Value')
        inv = b.math('DIVIDE', 1.0, c, y=y)             # ROOT: a ** (1/c)
        return out(b.math('POWER', a, out(inv, 'Value'), y=y), 'Value')
    i = len(ops) - 1
    while i >= 0:
        if ops[i] in ('POW', 'ROOT'):
            vals[i] = comb(ops[i], vals[i], vals[i + 1]); del vals[i + 1]; del ops[i]
        i -= 1
    i = 0
    while i < len(ops):
        if ops[i] in ('MUL', 'DIV'):
            vals[i] = comb(ops[i], vals[i], vals[i + 1]); del vals[i + 1]; del ops[i]
        else:
            i += 1
    res = vals[0]
    for op, v in zip(ops, vals[1:]):
        res = comb(op, res, v)
    return res


def math_card_group(card):
    ng = fresh_group("AF_Math_" + slug(card.name))
    terms = card.term_list()
    names = []
    for t in terms:
        if t.kind == 'CARD' and t.ref and t.ref not in names:
            names.append(t.ref)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    for n in names:
        add_socket(ng, n, 'NodeSocketFloat', 'INPUT', 0.0, desc="Wire a physics card Value here")
    add_socket(ng, "Gain", 'NodeSocketFloat', 'INPUT', card.gain)
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    add_socket(ng, "Result", 'NodeSocketFloat', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    res = _expr(b, gi, terms, '', {}, 0)
    g = b.math('MULTIPLY', res, out(gi, 'Gain'), y=0)
    st = b.node('GeometryNodeStoreNamedAttribute', data_type='FLOAT', domain='POINT')
    inp(st, 'Name').default_value = "af_math_" + slug(card.name)
    b.link(out(gi, 'Geometry'), inp(st, 'Geometry')); b.link(out(g, 'Value'), inp(st, 'Value'))
    b.link(out(st, 'Geometry'), inp(go, 'Geometry')); b.link(out(g, 'Value'), inp(go, 'Result'))
    return ng


def cards_chain(fluid_name, scene):
    """Per-fluid group that chains every physics-card group (assigned to this fluid or used by any math
    card) and every math card group, wiring card Value outputs into math inputs."""
    af = scene.arc_flow
    ng = fresh_group("AF_Cards_" + slug(fluid_name))
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'INPUT')
    add_socket(ng, "Geometry", 'NodeSocketGeometry', 'OUTPUT')
    b = Builder(ng)
    gi, go = b.group_io()
    prev = out(gi, 'Geometry')
    used = {t.card for m in af.math_cards for t in m.terms if t.kind == 'CARD'}
    nodes = {}
    for c in af.physics_cards:
        if c.fluid != fluid_name and c.name not in used:
            continue
        g = physics_card_group(c)
        n = b.node('GeometryNodeGroup', label=c.name, y=-len(nodes) * 180)
        n.node_tree = g
        b.link(prev, inp(n, 'Geometry'))
        prev = out(n, 'Geometry')
        nodes[c.name] = n
    for k, m in enumerate(af.math_cards):
        g = math_card_group(m)
        n = b.node('GeometryNodeGroup', label=m.name, y=-len(nodes) * 180 - k * 180)
        n.node_tree = g
        b.link(prev, inp(n, 'Geometry'))
        prev = out(n, 'Geometry')
        for t in m.terms:
            if t.kind == 'CARD' and t.card in nodes:
                try:
                    b.link(out(nodes[t.card], 'Value'), inp(n, t.card))
                except KeyError:
                    pass
        if m.gain is not None:
            inp(n, 'Gain').default_value = m.gain
    b.link(prev, inp(go, 'Geometry'))
    return ng


def ensure_render_groups():
    for name, fn in (("AF_Points", points_group), ("AF_RayMarch", raymarch_group), ("AF_Splat", splat_group), ("AF_Feedback", feedback_group)):
        if name not in bpy.data.node_groups or not bpy.data.node_groups[name].nodes:
            fn()


def _set_input(mod, ident, value):
    """Blender <= 5.1: mod[identifier]; Blender 5.2+: mod.properties.inputs[identifier]."""
    try:
        mod[ident] = value
        return True
    except Exception:
        pass
    try:
        mod.properties.inputs[ident] = value
        return True
    except Exception:
        pass
    try:
        setattr(mod.properties.inputs, ident, value)
        return True
    except Exception:
        return False


def set_modifier_inputs(mod, values):
    """values: {socket display name: value}; resolves interface identifiers."""
    ng = mod.node_group
    if ng is None:
        return
    for item in ng.interface.items_tree:
        if getattr(item, 'item_type', '') != 'SOCKET' or item.in_out != 'INPUT':
            continue
        if item.name in values and values[item.name] is not None:
            _set_input(mod, item.identifier, values[item.name])
