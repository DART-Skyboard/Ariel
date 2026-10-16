# SPDX-License-Identifier: GPL-3.0-or-later
import os
import tempfile

import bpy
import numpy as np
from bpy.props import EnumProperty, StringProperty
from bpy_extras.io_utils import ExportHelper, ImportHelper

from . import animation, capture, dcp, engine

PRESETS = {
    "WEB": dict(mode="LOSSY", quality=82.0, effort=7, progressive_dc="1", progressive_ac="1", bit_depth="8", source="DISPLAY", color="0"),
    "PHOTO": dict(mode="LOSSY", quality=90.0, effort=7, bit_depth="8", source="DISPLAY", color="0"),
    "VISUAL": dict(mode="LOSSY", quality=95.0, effort=8, bit_depth="10", source="DISPLAY", color="0"),
    "MASTER": dict(mode="LOSSLESS", effort=7, bit_depth="16", source="DISPLAY", color="0"),
    "LINEAR": dict(mode="LOSSLESS", effort=5, bit_depth="F32", source="LINEAR", color="1"),
    "HDR_PQ": dict(mode="LOSSY", quality=92.0, effort=7, bit_depth="F16", source="LINEAR", color="3", intensity=1000.0),
    "TOON": dict(mode="MODULAR", quality=92.0, effort=8, bit_depth="8", source="DISPLAY", patches="1"),
    "SMALL": dict(mode="LOSSY", quality=72.0, effort=9, bit_depth="8", source="DISPLAY"),
}
PRESET_ITEMS = [("WEB", "Web", "Progressive, small, fast to show"), ("PHOTO", "Render · high", "Quality 90"),
                ("VISUAL", "Visually lossless", "10-bit, quality 95"), ("MASTER", "Lossless 16-bit master", "Every pixel, 16 bits"),
                ("LINEAR", "Scene-linear float (comp plate)", "Lossless 32-bit float, no view transform"),
                ("HDR_PQ", "HDR · Rec.2100 PQ", "Half-float HDR for HDR displays"), ("TOON", "Toon / NPR", "Modular coding for flat shading"),
                ("SMALL", "Smallest", "Quality 72, effort 9")]


def _settings(ctx):
    return ctx.scene.frax_jxl


def draw_jxl_options(layout, s, compact=False):
    col = layout.column()
    col.prop(s, "mode")
    if s.mode != "LOSSLESS":
        row = col.row(align=True)
        row.prop(s, "quality", slider=True)
        row.prop(s, "distance")
    col.prop(s, "effort", slider=True)
    col.prop(s, "bit_depth")
    col.prop(s, "source")
    col.prop(s, "color")
    if compact:
        col.prop(s, "alpha")
        col.label(text="More options: Output Properties ▸ JPEG XL", icon="INFO")


class FRAXJXL_OT_preset(bpy.types.Operator):
    bl_idname = "frax_jxl.preset"
    bl_label = "JPEG XL Preset"
    bl_description = "Apply a JPEG XL preset"
    bl_options = {"REGISTER", "UNDO"}
    preset: EnumProperty(items=PRESET_ITEMS)

    def execute(self, ctx):
        s = _settings(ctx)
        for k, v in PRESETS[self.preset].items():
            setattr(s, k, v)
        if s.mode != "LOSSLESS":
            s.distance = round(engine.quality_to_distance(s.quality), 3)
        return {"FINISHED"}


class FRAXJXL_OT_save_image(bpy.types.Operator, ExportHelper):
    """Save this image (Render Result, Viewer, any image) as JPEG XL with the scene's JPEG XL settings"""
    bl_idname = "frax_jxl.save_image"
    bl_label = "Save as JPEG XL"
    bl_options = {"REGISTER"}
    filename_ext = ".jxl"
    filter_glob: StringProperty(default="*.jxl", options={"HIDDEN"})
    image_name: StringProperty(options={"HIDDEN"})

    def invoke(self, ctx, event):
        img = self._image(ctx)
        if img is None:
            self.report({"ERROR"}, "No image to save — render something first")
            return {"CANCELLED"}
        base = bpy.path.display_name_from_filepath(img.filepath) if img.filepath else (bpy.path.display_name(bpy.data.filepath) or "render")
        self.filepath = os.path.join(os.path.dirname(bpy.path.abspath(ctx.scene.render.filepath)) or os.path.expanduser("~"), base + ".jxl")
        return ExportHelper.invoke(self, ctx, event)

    def _image(self, ctx):
        if self.image_name and self.image_name in bpy.data.images:
            return bpy.data.images[self.image_name]
        sp = getattr(ctx, "space_data", None)
        if sp and getattr(sp, "type", "") == "IMAGE_EDITOR" and sp.image:
            return sp.image
        return bpy.data.images.get("Render Result")

    def draw(self, ctx):
        s = _settings(ctx)
        self.layout.menu("FRAXJXL_MT_presets", icon="PRESET")
        draw_jxl_options(self.layout, s, compact=True)

    def execute(self, ctx):
        img = self._image(ctx)
        if img is None:
            self.report({"ERROR"}, "No image to save")
            return {"CANCELLED"}
        s = _settings(ctx)
        try:
            arr, linear = capture.image_pixels(img, ctx.scene, s.source == "LINEAR")
            rects = capture.scene_focus_rects(ctx.scene, s, ctx.evaluated_depsgraph_get())
            n, t = capture.encode_still(arr, linear, s, ctx.scene, self.filepath, rects=rects, cache_dir=animation.cache_dir(),
                                        frame=ctx.scene.frame_current)
        except Exception as e:                                   # noqa: BLE001
            self.report({"ERROR"}, "JPEG XL: %s" % e)
            return {"CANCELLED"}
        msg = "Saved %s — %s, %.1f s" % (os.path.basename(self.filepath), _size(n), t)
        ctx.scene["frax_jxl_status"] = msg
        self.report({"INFO"}, msg)
        return {"FINISHED"}


def _size(n):
    return "%.1f KB" % (n / 1024) if n < 1048576 else "%.2f MB" % (n / 1048576)


class FRAXJXL_OT_open_image(bpy.types.Operator, ImportHelper):
    """Open a JPEG XL image (first frame of animations) as a Blender image"""
    bl_idname = "frax_jxl.open_image"
    bl_label = "Open JPEG XL"
    filename_ext = ".jxl"
    filter_glob: StringProperty(default="*.jxl", options={"HIDDEN"})

    def execute(self, ctx):
        try:
            with open(self.filepath, "rb") as f:
                d = engine.decode(f.read(), want16=True, max_frames=1, cache_dir=animation.cache_dir())
        except Exception as e:                                   # noqa: BLE001
            self.report({"ERROR"}, "JPEG XL: %s" % e)
            return {"CANCELLED"}
        arr, _ = d["frames"][0]
        w, h = d["width"], d["height"]
        hi = d["bits"] > 8
        img = bpy.data.images.new(os.path.basename(self.filepath), w, h, alpha=True, float_buffer=hi)
        px = arr[::-1].astype(np.float32) / 65535.0
        if hi:                                                   # float buffers hold scene-linear light
            px[..., :3] = capture.srgb_to_linear(px[..., :3])
        img.pixels.foreach_set(px.ravel())
        img.pack()
        sp = getattr(ctx, "space_data", None)
        if sp and getattr(sp, "type", "") == "IMAGE_EDITOR":
            sp.image = img
        self.report({"INFO"}, "Opened %s (%d×%d, %d-bit%s)" % (os.path.basename(self.filepath), w, h, d["bits"],
                                                                ", animated" if d["animated"] else ""))
        return {"FINISHED"}


class FRAXJXL_OT_render_animation(bpy.types.Operator):
    """Render the frame range and pack it into one animated JPEG XL with your JPEG XL settings"""
    bl_idname = "frax_jxl.render_animation"
    bl_label = "Render Animation → JPEG XL"

    def execute(self, ctx):
        scene = ctx.scene
        if animation.SESSION is not None:
            self.report({"ERROR"}, "A JPEG XL / DCP render is already running")
            return {"CANCELLED"}
        s = scene.frax_jxl
        out = bpy.path.abspath(s.animation_path)
        if not out.lower().endswith(".jxl"):
            out += ".jxl"
        tmp = tempfile.mkdtemp(prefix="frax_jxl_frames_")
        keep = animation.snapshot(scene)
        linear = s.source == "LINEAR"
        scene.render.filepath = os.path.join(tmp, "frame_")
        scene.render.use_file_extension = True
        scene.render.use_overwrite = True
        animation.set_frame_format(scene, "OPEN_EXR" if linear else "TIFF", "32" if linear else "16", "RGBA", codec="NONE")
        if not linear and hasattr(scene.render.image_settings, "tiff_codec"):
            scene.render.image_settings.tiff_codec = "NONE"
        track = _track_rects(ctx, scene)
        animation.start("jxl", scene, restore=keep, jxl_path=out, temp_dir=tmp, track=track, reader="fast")
        try:
            bpy.ops.render.render("EXEC_DEFAULT" if bpy.app.background else "INVOKE_DEFAULT", animation=True)
        except Exception as e:                                   # noqa: BLE001
            animation.SESSION = None
            animation._restore(scene, keep)
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        self.report({"INFO"}, "Rendering %d frames → %s" % (scene.frame_end - scene.frame_start + 1, out))
        return {"FINISHED"}


def _track_rects(ctx, scene):
    """Per-frame focus rectangles for focus areas that follow an object (computed before the render starts)."""
    s = scene.frax_jxl
    tracked = [f.track for f in s.focus if f.track] if s.focus_on else []
    if not tracked:
        return {}
    keep = scene.frame_current
    out = {}
    try:
        for fr in range(scene.frame_start, scene.frame_end + 1, max(1, scene.frame_step)):
            scene.frame_set(fr)
            dg = ctx.evaluated_depsgraph_get()
            out[fr] = [r for r in (capture.object_rect(scene, ob, dg) for ob in tracked) if r]
    finally:
        scene.frame_set(keep)
    return out


class FRAXJXL_OT_focus_add(bpy.types.Operator):
    """Add a focus area (region of interest coded at higher quality)"""
    bl_idname = "frax_jxl.focus_add"
    bl_label = "Add Focus Area"
    bl_options = {"REGISTER", "UNDO"}
    source: EnumProperty(items=[("MANUAL", "Manual", ""), ("BORDER", "From Render Region", ""),
                                ("SELECTED", "From Selected Objects", "Frame each selected object as seen by the camera"),
                                ("TRACK", "Follow Selected Objects", "Re-frame around each selected object every frame")])

    def execute(self, ctx):
        s, scene = _settings(ctx), ctx.scene
        r = scene.render
        if self.source == "MANUAL":
            f = s.focus.add()
            f.name = "Focus %d" % len(s.focus)
        elif self.source == "BORDER":
            if not r.use_border:
                self.report({"WARNING"}, "Set a render region first (Ctrl B in the camera view)")
                return {"CANCELLED"}
            f = s.focus.add()
            f.name = "Render region"
            f.x, f.w = r.border_min_x, r.border_max_x - r.border_min_x
            f.y, f.h = 1.0 - r.border_max_y, r.border_max_y - r.border_min_y
        else:
            obs = [o for o in ctx.selected_objects if o.type not in {"CAMERA", "LIGHT"}]
            if not obs:
                self.report({"WARNING"}, "Select the objects that matter (faces, logos, hero props)")
                return {"CANCELLED"}
            dg = ctx.evaluated_depsgraph_get()
            for o in obs:
                rect = capture.object_rect(scene, o, dg)
                f = s.focus.add()
                f.name = o.name
                if rect:
                    f.x, f.y, f.w, f.h = rect
                if self.source == "TRACK":
                    f.track = o
        s.focus_index = len(s.focus) - 1
        return {"FINISHED"}


class FRAXJXL_OT_focus_remove(bpy.types.Operator):
    bl_idname = "frax_jxl.focus_remove"
    bl_label = "Remove Focus Area"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, ctx):
        s = _settings(ctx)
        if 0 <= s.focus_index < len(s.focus):
            s.focus.remove(s.focus_index)
            s.focus_index = max(0, s.focus_index - 1)
        return {"FINISHED"}


# ── DCP ────────────────────────────────────────────────────────────────────────────────────────────────────────
class FRAXDCP_OT_apply_format(bpy.types.Operator):
    """Set the scene to the DCP's exact frame rate (and size, if 'Render at container size' is chosen)"""
    bl_idname = "frax_dcp.apply_format"
    bl_label = "Apply DCP Format"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, ctx):
        scene = ctx.scene
        d, r = scene.frax_dcp, scene.render
        w, h, _ = dcp.CONTAINERS[(d.container, d.resolution)]
        if d.fit == "RENDER":
            r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
        r.pixel_aspect_x = r.pixel_aspect_y = 1.0
        r.fps, r.fps_base = int(d.fps), 1.0
        self.report({"INFO"}, "Scene set to %s fps%s" % (d.fps, " and %d×%d" % (w, h) if d.fit == "RENDER" else ""))
        return {"FINISHED"}


class FRAXDCP_OT_render(bpy.types.Operator):
    """Render a DCI master (16-bit TIFF + 48 kHz/24-bit WAV) and build a festival-ready DCP with DCP-o-matic"""
    bl_idname = "frax_dcp.render"
    bl_label = "Render DCP"

    def execute(self, ctx):
        scene = ctx.scene
        d = scene.frax_dcp
        if animation.SESSION is not None:
            self.report({"ERROR"}, "A JPEG XL / DCP render is already running")
            return {"CANCELLED"}
        if not dcp.dcpomatic_tool("dcpomatic2_create"):
            self.report({"ERROR"}, "DCP-o-matic not found — install it free from dcpomatic.com, or set its folder in the DCP panel")
            return {"CANCELLED"}
        if abs(scene.render.fps / scene.render.fps_base - int(d.fps)) > 1e-6:
            self.report({"ERROR"}, "Scene frame rate isn't %s fps — press Apply DCP Format first" % d.fps)
            return {"CANCELLED"}
        name = dcp.isdcf_name(scene)
        root = bpy.path.abspath(d.output) or os.path.join(os.path.expanduser("~"), "DCP")
        master = os.path.join(root, name + "_master")
        film = os.path.join(root, name)
        os.makedirs(master, exist_ok=True)
        wav = None
        if d.audio != "NONE":
            wav = os.path.join(root, name + "_audio.wav")
            if not _mixdown(ctx, scene, wav, d.audio):
                self.report({"WARNING"}, "Audio mixdown failed — continuing without sound")
                wav = None
        keep = animation.snapshot(scene)
        scene.render.filepath = os.path.join(master, "frame_")
        scene.render.use_file_extension = True
        scene.render.use_overwrite = True
        animation.set_frame_format(scene, "TIFF", "16", "RGB")
        jxl = None
        if scene.frax_jxl.animation_auto:
            jxl = bpy.path.abspath(scene.frax_jxl.animation_path)
        animation.start("dcp", scene, restore=keep, jxl_path=jxl, dcp_info=dict(master=master, wav=wav, film=film), reader="fast")
        try:
            bpy.ops.render.render("EXEC_DEFAULT" if bpy.app.background else "INVOKE_DEFAULT", animation=True)
        except Exception as e:                                   # noqa: BLE001
            animation.SESSION = None
            animation._restore(scene, keep)
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        self.report({"INFO"}, "Rendering the DCP master → " + name)
        return {"FINISHED"}


def _mixdown(ctx, scene, path, layout):
    ff = scene.render.ffmpeg
    keep = (ff.audio_mixrate, ff.audio_channels)
    try:
        ff.audio_mixrate = 48000
        ff.audio_channels = "SURROUND51" if layout == "51" else "STEREO"
        with ctx.temp_override(scene=scene):
            r = bpy.ops.sound.mixdown(filepath=path, check_existing=False, container="WAV", codec="PCM", format="S24", accuracy=1024)
        return "FINISHED" in r and os.path.exists(path)
    except Exception as e:                                       # noqa: BLE001
        print("[Frax DCP] mixdown:", e)
        return False
    finally:
        ff.audio_mixrate, ff.audio_channels = keep


class FRAXDCP_OT_build_from_folder(bpy.types.Operator, ImportHelper):
    """Build a DCP from an image sequence you already rendered (choose any frame in the folder)"""
    bl_idname = "frax_dcp.build_from_folder"
    bl_label = "Build DCP from Rendered Frames"
    filter_glob: StringProperty(default="*.png;*.tif;*.tiff;*.exr;*.dpx;*.jpg", options={"HIDDEN"})

    def execute(self, ctx):
        scene = ctx.scene
        d = scene.frax_dcp
        if not dcp.dcpomatic_tool("dcpomatic2_create"):
            self.report({"ERROR"}, "DCP-o-matic not found — install it free from dcpomatic.com")
            return {"CANCELLED"}
        folder = os.path.dirname(self.filepath)
        name = dcp.isdcf_name(scene)
        root = bpy.path.abspath(d.output) or os.path.dirname(folder)
        wav = None
        if d.audio != "NONE":
            wav = os.path.join(root, name + "_audio.wav")
            if not _mixdown(ctx, scene, wav, d.audio):
                wav = None
        keep = d.keep_master
        d.keep_master = True                                     # never delete frames we didn't make
        job = dcp.DCPJob(scene, folder, wav, os.path.join(root, name))
        d.keep_master = keep
        dcp.DCPJob.current = job
        bpy.app.timers.register(animation._dcp_poll, first_interval=0.5)
        self.report({"INFO"}, "Building DCP " + name)
        return {"FINISHED"}


class FRAXDCP_OT_cancel(bpy.types.Operator):
    bl_idname = "frax_dcp.cancel"
    bl_label = "Cancel DCP Build"

    def execute(self, ctx):
        if dcp.DCPJob.current:
            dcp.DCPJob.current.cancel()
        return {"FINISHED"}


class FRAXDCP_OT_open_folder(bpy.types.Operator):
    bl_idname = "frax_dcp.open_folder"
    bl_label = "Open DCP Folder"

    def execute(self, ctx):
        p = bpy.path.abspath(ctx.scene.frax_dcp.output)
        os.makedirs(p, exist_ok=True)
        bpy.ops.wm.path_open(filepath=p)
        return {"FINISHED"}


class FRAXJXL_MT_presets(bpy.types.Menu):
    bl_label = "JPEG XL Presets"
    bl_idname = "FRAXJXL_MT_presets"

    def draw(self, ctx):
        for key, label, desc in PRESET_ITEMS:
            self.layout.operator("frax_jxl.preset", text=label).preset = key


classes = (FRAXJXL_OT_preset, FRAXJXL_OT_save_image, FRAXJXL_OT_open_image, FRAXJXL_OT_render_animation,
           FRAXJXL_OT_focus_add, FRAXJXL_OT_focus_remove, FRAXDCP_OT_apply_format, FRAXDCP_OT_render,
           FRAXDCP_OT_build_from_folder, FRAXDCP_OT_cancel, FRAXDCP_OT_open_folder, FRAXJXL_MT_presets)
