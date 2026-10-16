# SPDX-License-Identifier: GPL-3.0-or-later
# Frax JPEG XL + DCP Render — Radical Deepscale LLC / DART Meadow
#   · Save any render, Viewer or image as JPEG XL with every libjxl option (Image ▸ Save as JPEG XL…, Render menu)
#   · Render animations straight into one animated .jxl, or pack every Ctrl F12 frame sequence into one too
#   · Focus areas (regions of interest) from the camera's view of selected objects, tracked per frame
#   · Digital Cinema: DCI presets, ISDCF naming, festival checks, built-in SMPTE 2K DCP writer (JPEG 2000 + MXF +
#     CPL/PKL), or DCP-o-matic for 4K / Interop
#   · Frax JXL: a JPEG XL encoder written in pure Python + numpy (jxl/), the default encoder of the render line
# Works with EEVEE, Cycles and Workbench.  JPEG XL is ISO/IEC 18181; the Python encoder follows the reference
# implementation libjxl (© the JPEG XL Project Authors, BSD-3-Clause).  libjxl itself is also bundled as an optional
# WebAssembly engine run through wasmtime (Apache-2.0), and opens .jxl files.
bl_info = {
    "name": "Frax JXL DCP Render",
    "blender": (5, 2, 0),
    "category": "Render",
    "version": (1, 2, 0),
    "maintainer": "Radical Deepscale <justin@dartmeadow.com>",
    "description": "Render JPEG XL stills & animations (pure-Python JPEG XL encoder, or libjxl), and build festival-ready DCPs (EEVEE / Cycles)"
}

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
