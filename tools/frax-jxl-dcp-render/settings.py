# SPDX-License-Identifier: GPL-3.0-or-later
# All JPEG XL + cinema settings, stored per scene (scene.frax_jxl), so every .blend keeps its own export setup.
import bpy
from bpy.props import (BoolProperty, CollectionProperty, EnumProperty, FloatProperty, IntProperty, PointerProperty,
                       StringProperty)

from .engine import ID, quality_to_distance

AUTO = ("-1", "Auto", "Let the encoder decide")
ONOFF = [AUTO, ("1", "On", ""), ("0", "Off", "")]


def _q_update(self, ctx):
    self["distance"] = round(quality_to_distance(self.quality), 3)


def _d_update(self, ctx):
    lo, hi = 0.0, 100.0
    for _ in range(40):
        m = (lo + hi) / 2
        if quality_to_distance(m) > self.distance:
            lo = m
        else:
            hi = m
    self["quality"] = round(hi, 1)


class FRAXJXL_FocusArea(bpy.types.PropertyGroup):
    """A region of interest in normalised image coordinates (0..1, origin top-left)."""
    name: StringProperty(default="Focus")
    x: FloatProperty(min=0, max=1, default=0.3)
    y: FloatProperty(min=0, max=1, default=0.3)
    w: FloatProperty(min=0, max=1, default=0.4)
    h: FloatProperty(min=0, max=1, default=0.4)
    track: PointerProperty(type=bpy.types.Object, name="Follow object",
                           description="Re-frame this focus area around the object every frame of an animation")


class FRAXJXL_Settings(bpy.types.PropertyGroup):
    engine: EnumProperty(name="Encoder", default="PYTHON", items=[
        ("PYTHON", "Frax JXL · pure Python", "JPEG XL written by the extension's own Python encoder (Modular coding: "
         "lossless, lossy Squeeze, animation, focus areas). No external libraries"),
        ("LIBJXL", "libjxl · WebAssembly", "The reference libjxl encoder run in WebAssembly (VarDCT, patches, noise, "
         "JPEG recompression). Needs the bundled wasmtime runtime")])
    # ── compression ─────────────────────────────────────────────
    mode: EnumProperty(name="Mode", default="LOSSY", items=[
        ("LOSSY", "Lossy · VarDCT", "Best for rendered images and photos"),
        ("MODULAR", "Lossy · Modular", "Lossy modular coding: flat art, UI, toon / NPR renders"),
        ("LOSSLESS", "Lossless", "Every pixel exact: masters, archives, compositing plates")])
    quality: FloatProperty(name="Quality", min=0, max=100, default=90, precision=1, update=_q_update)
    distance: FloatProperty(name="Distance", min=0, max=25, default=1.0, precision=3, update=_d_update,
                            description="Butteraugli distance: 0 lossless · 1 visually lossless · 2–3 web")
    effort: IntProperty(name="Effort", min=1, max=10, default=7, description="1 fastest … 7 default … 10 slowest, smallest")
    decoding_speed: IntProperty(name="Decode speed", min=0, max=4, default=0, description="Higher decodes faster at some size cost")
    # ── bit depth & colour ──────────────────────────────────────
    bit_depth: EnumProperty(name="Bit depth", default="8", items=[
        ("8", "8-bit", ""), ("10", "10-bit", ""), ("12", "12-bit", ""), ("16", "16-bit", ""),
        ("F16", "16-bit float", "Half float — HDR / scene-linear"), ("F32", "32-bit float", "Full float — HDR / scene-linear")])
    source: EnumProperty(name="Pixels", default="DISPLAY", items=[
        ("DISPLAY", "Display (view transform)", "What you see: AgX / Filmic / Standard applied, sRGB"),
        ("LINEAR", "Scene-linear (HDR)", "Raw scene-linear light, no view transform: for compositing and HDR")])
    color: EnumProperty(name="Colour space", default="0", items=[
        ("0", "sRGB", ""), ("1", "Linear sRGB / Rec.709", ""), ("2", "Display P3", ""), ("5", "Rec.2020", ""),
        ("3", "Rec.2100 PQ (HDR)", ""), ("4", "Rec.2100 HLG (HDR)", "")])
    channels: EnumProperty(name="Channels", default="AUTO", items=[("AUTO", "Auto", ""), ("RGB", "Colour", ""), ("GREY", "Greyscale", "")])
    intent: EnumProperty(name="Intent", default="0", items=[("0", "Perceptual", ""), ("1", "Relative", ""), ("2", "Saturation", ""), ("3", "Absolute", "")])
    intensity: FloatProperty(name="HDR peak nits", min=0, max=10000, default=0, description="0 = default")
    # ── transparency ───────────────────────────────────────────
    alpha: EnumProperty(name="Alpha", default="AUTO", items=[
        ("AUTO", "Auto", "Keep alpha when Film ▸ Transparent is on or the image has transparency"),
        ("KEEP", "Keep", ""), ("DROP", "Remove", "")])
    alpha_bits: EnumProperty(name="Alpha depth", default="SAME", items=[("SAME", "Same as colour", ""), ("1", "1-bit", ""), ("8", "8-bit", ""), ("16", "16-bit", "")])
    alpha_lossless: BoolProperty(name="Lossless alpha", default=True)
    alpha_quality: FloatProperty(name="Alpha quality", min=50, max=100, default=95)
    premultiplied: BoolProperty(name="Premultiplied", default=False)
    keep_invisible: EnumProperty(name="Colour under clear pixels", default="-1", items=[AUTO, ("1", "Keep", "Needed for re-compositing"), ("0", "Discard", "Smaller")])
    # ── animation ──────────────────────────────────────────────
    animation_auto: BoolProperty(name="Also write an animated .jxl", default=False,
                                 description="Whenever you render an animation (Ctrl F12), also pack the written frames into one animated .jxl")
    animation_path: StringProperty(name="Animation file", subtype="FILE_PATH", default="//render.jxl")
    loops: IntProperty(name="Loops", min=0, max=65535, default=0, description="0 = loop forever")
    remove_frames: BoolProperty(name="Remove frame files afterwards", default=False)
    # ── focus areas ────────────────────────────────────────────
    focus: CollectionProperty(type=FRAXJXL_FocusArea)
    focus_index: IntProperty()
    focus_on: BoolProperty(name="Use focus areas", default=True)
    focus_quality: FloatProperty(name="Focus quality", min=50, max=100, default=97)
    focus_first: BoolProperty(name="Load focus first", default=True, description="Centre-first tile order around the first focus area")
    # ── tiles & progressive ────────────────────────────────────
    group_size: EnumProperty(name="Tile size", default="-1", items=[AUTO, ("0", "128", ""), ("1", "256", ""), ("2", "512", ""), ("3", "1024", "")])
    group_order: EnumProperty(name="Tile order", default="-1", items=[AUTO, ("0", "Scanline", ""), ("1", "Centre-first", "")])
    center_x: IntProperty(name="Centre X", min=-1, default=-1)
    center_y: IntProperty(name="Centre Y", min=-1, default=-1)
    progressive_dc: EnumProperty(name="Progressive DC", default="-1", items=[AUTO, ("0", "Off", ""), ("1", "1 pass", ""), ("2", "2 passes", "")])
    progressive_ac: EnumProperty(name="Progressive AC", default="-1", items=ONOFF)
    qprogressive_ac: EnumProperty(name="Quantised AC", default="-1", items=ONOFF)
    responsive: EnumProperty(name="Responsive", default="-1", items=ONOFF)
    buffering: EnumProperty(name="Buffering", default="-1", items=[AUTO, ("0", "Whole image", ""), ("1", "1", ""), ("2", "2", ""), ("3", "Streaming", "")])
    # ── detail ─────────────────────────────────────────────────
    epf: EnumProperty(name="Edge-preserving filter", default="-1", items=[AUTO, ("0", "Off", ""), ("1", "1", ""), ("2", "2", ""), ("3", "3", "")])
    gaborish: EnumProperty(name="Gaborish", default="-1", items=ONOFF)
    photon_noise: FloatProperty(name="Photon noise ISO", min=0, max=102400, default=0, description="Film grain; hides banding in skies")
    noise: EnumProperty(name="Adaptive noise", default="-1", items=ONOFF)
    dots: EnumProperty(name="Dots", default="-1", items=ONOFF)
    patches: EnumProperty(name="Patches", default="-1", items=ONOFF)
    resampling: EnumProperty(name="Downsample", default="-1", items=[AUTO, ("1", "1×", ""), ("2", "2×", ""), ("4", "4×", ""), ("8", "8×", "")])
    ec_resampling: EnumProperty(name="Alpha downsample", default="-1", items=[AUTO, ("1", "1×", ""), ("2", "2×", ""), ("4", "4×", ""), ("8", "8×", "")])
    disable_perceptual: EnumProperty(name="Perceptual optimisation", default="-1", items=[("-1", "On", ""), ("1", "Off", "")])
    full_heuristics: EnumProperty(name="Whole-image heuristics", default="-1", items=ONOFF)
    # ── modular (expert) ───────────────────────────────────────
    force_modular: EnumProperty(name="Coding", default="-1", items=[AUTO, ("0", "Force VarDCT", ""), ("1", "Force Modular", "")])
    predictor: IntProperty(name="Predictor", min=-1, max=15, default=-1)
    ma_tree: FloatProperty(name="MA-tree learning %", min=-1, max=100, default=-1)
    nb_prev: IntProperty(name="Previous channels", min=-1, max=11, default=-1)
    palette_colors: IntProperty(name="Palette colours", min=-1, max=70913, default=-1)
    lossy_palette: EnumProperty(name="Lossy palette", default="-1", items=ONOFF)
    colors_global: FloatProperty(name="Channel palette % global", min=-1, max=100, default=-1)
    colors_group: FloatProperty(name="Channel palette % tile", min=-1, max=100, default=-1)
    modular_color_space: IntProperty(name="RCT", min=-1, max=41, default=-1)
    color_transform: EnumProperty(name="Internal transform", default="-1", items=[AUTO, ("0", "XYB", ""), ("1", "None", ""), ("2", "YCbCr", "")])
    # ── container & metadata ───────────────────────────────────
    container: EnumProperty(name="File structure", default="-1", items=[AUTO, ("0", "Bare codestream", ""), ("1", "Container", "")])
    level: EnumProperty(name="Codestream level", default="0", items=[("0", "Auto", ""), ("5", "Level 5", ""), ("10", "Level 10", "")])
    compress_boxes: EnumProperty(name="Compress metadata", default="-1", items=ONOFF)
    brotli_effort: IntProperty(name="Brotli effort", min=-1, max=11, default=-1)
    write_render_info: BoolProperty(name="Embed render info (XMP)", default=True,
                                    description="Scene, frame, engine, samples, camera and Blender version in the file's XMP")
    author: StringProperty(name="Author")
    copyright: StringProperty(name="Copyright")
    title: StringProperty(name="Title")


def _opt(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return -1


def frame_options(s, distance=None, lossless=None):
    """Settings → the dict Encoder.add_frame expects."""
    ints, floats = {}, {}

    def I(k, v):
        v = _opt(v)
        if v != -1:
            ints[ID[k]] = v
    I("EFFORT", s.effort)
    if s.decoding_speed:
        I("DECODING_SPEED", s.decoding_speed)
    for k, a in (("MODULAR_GROUP_SIZE", "group_size"), ("GROUP_ORDER", "group_order"), ("PROGRESSIVE_DC", "progressive_dc"),
                 ("PROGRESSIVE_AC", "progressive_ac"), ("QPROGRESSIVE_AC", "qprogressive_ac"), ("RESPONSIVE", "responsive"),
                 ("BUFFERING", "buffering"), ("EPF", "epf"), ("GABORISH", "gaborish"), ("NOISE", "noise"), ("DOTS", "dots"),
                 ("PATCHES", "patches"), ("RESAMPLING", "resampling"), ("EC_RESAMPLING", "ec_resampling"),
                 ("KEEP_INVISIBLE", "keep_invisible"), ("LOSSY_PALETTE", "lossy_palette"), ("COLOR_TRANSFORM", "color_transform"),
                 ("DISABLE_PERCEPTUAL", "disable_perceptual"), ("FULL_IMAGE_HEURISTICS", "full_heuristics"),
                 ("JPEG_COMPRESS_BOXES", "compress_boxes")):
        I(k, getattr(s, a))
    I("CENTER_X", s.center_x)
    I("CENTER_Y", s.center_y)
    I("MODULAR", 1 if s.mode == "MODULAR" else s.force_modular)
    I("MODULAR_PREDICTOR", s.predictor)
    I("PALETTE_COLORS", s.palette_colors)
    I("NB_PREV_CH", s.nb_prev)
    I("MODULAR_COLOR_SPACE", s.modular_color_space)
    I("BROTLI_EFFORT", s.brotli_effort)
    if s.photon_noise > 0:
        floats[ID["PHOTON_NOISE"]] = s.photon_noise
    if s.ma_tree >= 0:
        floats[ID["MA_TREE_PCT"]] = s.ma_tree
    if s.colors_global >= 0:
        floats[ID["CH_COLORS_GLOBAL"]] = s.colors_global
    if s.colors_group >= 0:
        floats[ID["CH_COLORS_GROUP"]] = s.colors_group
    ll = (s.mode == "LOSSLESS") if lossless is None else lossless
    return dict(ints=ints, floats=floats, lossless=ll, distance=None if ll else (s.distance if distance is None else distance),
                alpha_distance=0.0 if s.alpha_lossless else quality_to_distance(s.alpha_quality))


def depth_params(s):
    """→ bits, exp_bits, numpy dtype for the chosen bit depth"""
    import numpy as np
    return {"8": (8, 0, np.uint8), "10": (10, 0, np.uint16), "12": (12, 0, np.uint16), "16": (16, 0, np.uint16),
            "F16": (16, 5, np.float32), "F32": (32, 8, np.float32)}[s.bit_depth]


classes = (FRAXJXL_FocusArea, FRAXJXL_Settings)
