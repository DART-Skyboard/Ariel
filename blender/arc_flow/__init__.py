"""Arc Flow - LOTCBP fluid simulation through connected cavities (Blender 4.2+ extension).

LOTCBP = Level Of Tessellation Collision Body Projection: collision bodies are resolved by a base signed-distance
field plus virtual tessellation bricks that are generated on demand where fluid touches a surface, so the
interaction resolution can exceed both the modelled mesh and the fluid's own particle spacing."""
from . import ops, panels, props, runtime


def register():
    props.register()
    ops.register()
    panels.register()
    runtime.register()


def unregister():
    runtime.unregister()
    panels.unregister()
    ops.unregister()
    props.unregister()
