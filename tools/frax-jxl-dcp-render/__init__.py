# SPDX-License-Identifier: GPL-3.0-or-later
# Frax JPEG XL + DCP Render — Radical Deepscale LLC / DART Meadow
#   · Save any render, Viewer or image as JPEG XL with every libjxl option (Image ▸ Save as JPEG XL…, Render menu)
#   · Render animations straight into one animated .jxl, or pack every Ctrl F12 frame sequence into one too
#   · Focus areas (regions of interest) from the camera's view of selected objects, tracked per frame
#   · Digital Cinema: DCI presets, ISDCF naming, festival checks, 48 kHz/24-bit audio, DCP via DCP-o-matic
# Works with EEVEE, Cycles and Workbench. libjxl (BSD-3-Clause) runs as WebAssembly through wasmtime (Apache-2.0).
import bpy

from . import animation, dcp, operators, settings, ui

_classes = settings.classes + dcp.classes + operators.classes + ui.classes


def register():
    for c in _classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.frax_jxl = bpy.props.PointerProperty(type=settings.FRAXJXL_Settings)
    bpy.types.Scene.frax_dcp = bpy.props.PointerProperty(type=dcp.FRAXDCP_Settings)
    ui.register()
    animation.register()


def unregister():
    animation.unregister()
    ui.unregister()
    del bpy.types.Scene.frax_dcp
    del bpy.types.Scene.frax_jxl
    for c in reversed(_classes):
        bpy.utils.unregister_class(c)
