"""Arc Flow - LOTBCBP fluid simulation through connected cavities (Blender 5.2.3+ extension).

LOTBCBP = Level Of Tessellation Boolean Collision Body Projection: collision bodies are resolved by a base signed-distance
field plus virtual tessellation bricks that are generated on demand where fluid touches a surface, so the
interaction resolution can exceed both the modelled mesh and the fluid's own particle spacing."""
from . import ops, panels, props, runtime
from . import retopo_ops, retopo_panel  # Quad Remesh (LOTBCBP)
from . import systems_ops  # Systems, crossfeed demos (Tessera Projection)


def register():
    props.register()
    ops.register()
    panels.register()
    runtime.register()
    retopo_ops.register(); retopo_panel.register()
    systems_ops.register()


def unregister():
    systems_ops.unregister()
    retopo_panel.unregister(); retopo_ops.unregister()
    runtime.unregister()
    panels.unregister()
    ops.unregister()
    props.unregister()
