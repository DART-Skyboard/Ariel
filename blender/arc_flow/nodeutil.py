"""Small helpers for building node trees across Blender 4.2 - 5.x."""
import bpy


def fresh_group(name, tree_type='GeometryNodeTree'):
    ng = bpy.data.node_groups.get(name)
    if ng is None:
        ng = bpy.data.node_groups.new(name, tree_type)
    else:
        ng.nodes.clear()
        ng.interface.clear()
    return ng


def add_socket(ng, name, kind, io='INPUT', default=None, lo=None, hi=None, desc=""):
    s = ng.interface.new_socket(name=name, in_out=io, socket_type=kind)
    if desc:
        s.description = desc
    if default is not None and hasattr(s, 'default_value'):
        try:
            s.default_value = default
        except Exception:
            pass
    if lo is not None and hasattr(s, 'min_value'):
        s.min_value = lo
    if hi is not None and hasattr(s, 'max_value'):
        s.max_value = hi
    return s


_ALIAS = {'Fac': 'Factor', 'Factor': 'Fac'}


def inp(node, name, nth=0):
    """Enabled input socket by (display) name."""
    if name in _ALIAS and not any(s.name == name for s in node.inputs):
        name = _ALIAS[name]
    c = [s for s in node.inputs if s.name == name and s.enabled]
    if not c:
        c = [s for s in node.inputs if s.name == name]
    if not c:
        raise KeyError("%s has no input %r (have %s)" % (node.bl_idname, name, [s.name for s in node.inputs]))
    return c[nth]


def out(node, name):
    if name in _ALIAS and not any(s.name == name for s in node.outputs):
        name = _ALIAS[name]
    c = [s for s in node.outputs if s.name == name and s.enabled] or [s for s in node.outputs if s.name == name]
    if not c:
        raise KeyError("%s has no output %r (have %s)" % (node.bl_idname, name, [s.name for s in node.outputs]))
    return c[0]


class Builder:
    def __init__(self, ng):
        self.ng = ng
        self.nodes = ng.nodes
        self.links = ng.links
        self._x = 0

    def node(self, idname, label=None, x=None, y=0, **attrs):
        n = self.nodes.new(idname)
        for k, v in attrs.items():
            setattr(n, k, v)
        n.location = ((self._x if x is None else x), y)
        if x is None:
            self._x += 220
        if label:
            n.label = label
        return n

    def link(self, a, b):
        self.links.new(a, b)

    def math(self, op, a=None, b=None, y=0):
        n = self.node('ShaderNodeMath', operation=op, y=y)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.link(v, n.inputs[i])
        return n

    def group_io(self):
        gi = self.node('NodeGroupInput', x=-400)
        go = self.node('NodeGroupOutput', x=1600)
        return gi, go


def set_blended(mat):
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        if hasattr(mat, attr):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass
    for attr in ('use_transparent_shadow',):
        if hasattr(mat, attr):
            try:
                setattr(mat, attr, True)
            except Exception:
                pass


def enable_nodes(mat):
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        try:
            mat.use_nodes = True
        except Exception:
            pass
    return mat.node_tree
