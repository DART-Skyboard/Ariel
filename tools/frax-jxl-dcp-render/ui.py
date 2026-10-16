# SPDX-License-Identifier: GPL-3.0-or-later
import bpy

from . import animation, dcp, engine


class _Out:
    bl_space_type, bl_region_type, bl_context = "PROPERTIES", "WINDOW", "output"


class FRAXJXL_UL_focus(bpy.types.UIList):
    def draw_item(self, ctx, layout, data, item, icon, active_data, active_prop, index=0):
        row = layout.row(align=True)
        row.prop(item, "name", text="", emboss=False, icon="OBJECT_DATA" if item.track else "SELECT_SET")
        if item.track:
            row.label(text="follows " + item.track.name)
        else:
            row.label(text="%d%%×%d%%" % (item.w * 100, item.h * 100))


class FRAXJXL_PT_main(_Out, bpy.types.Panel):
    bl_label = "JPEG XL (Frax)"
    bl_order = 100

    def draw_header(self, ctx):
        self.layout.label(icon="IMAGE_DATA")

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        row = l.row(align=True)
        row.menu("FRAXJXL_MT_presets", text="Presets", icon="PRESET")
        row.operator("frax_jxl.save_image", text="Save Render", icon="FILE_IMAGE").image_name = "Render Result"
        col = l.column(align=True)
        col.operator("frax_jxl.render_animation", icon="RENDER_ANIMATION")
        col.prop(s, "animation_path", text="")
        l.prop(s, "animation_auto")
        st = ctx.scene.get("frax_jxl_status")
        if st:
            box = l.box()
            box.label(text=st[:120], icon="INFO")
        if animation.SESSION is not None:
            l.label(text="Session running: " + animation.SESSION.kind, icon="TIME")


class _Sub(_Out):
    bl_parent_id = "FRAXJXL_PT_main"
    bl_options = {"DEFAULT_CLOSED"}


class FRAXJXL_PT_compression(_Sub, bpy.types.Panel):
    bl_label = "Compression"
    bl_options = set()

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        row = l.row()
        row.prop(s, "engine")
        if s.engine == "LIBJXL" and not engine.available():
            l.label(text="libjxl runtime not installed — the pure-Python encoder is used", icon="ERROR")
        l.prop(s, "mode")
        if s.mode != "LOSSLESS":
            l.prop(s, "quality", slider=True)
            l.prop(s, "distance")
        l.prop(s, "effort", slider=True)
        if s.engine == "PYTHON" or not engine.available():
            col = l.column(align=True)
            if s.mode != "LOSSLESS":
                col.label(text="Lossy uses Modular Squeeze coding (progressive)", icon="INFO")
            col.label(text="Pure-Python JPEG XL · format by the JPEG XL Project (libjxl)")
        else:
            l.prop(s, "decoding_speed", slider=True)


class FRAXJXL_PT_color(_Sub, bpy.types.Panel):
    bl_label = "Bit Depth & Colour"
    bl_options = set()

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        l.prop(s, "bit_depth")
        l.prop(s, "source")
        l.prop(s, "color")
        l.prop(s, "channels")
        l.prop(s, "intent")
        if s.color in {"3", "4"}:
            l.prop(s, "intensity")
        if s.source == "LINEAR" and s.bit_depth not in {"F16", "F32"} and s.color == "1":
            l.label(text="Linear light in integers bands: it is stored as sRGB instead", icon="ERROR")
        if s.source == "DISPLAY":
            l.label(text="View transform: %s · %s" % (ctx.scene.view_settings.view_transform, ctx.scene.view_settings.look), icon="COLOR")


class FRAXJXL_PT_alpha(_Sub, bpy.types.Panel):
    bl_label = "Transparency"

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        l.prop(ctx.scene.render, "film_transparent", text="Transparent film")
        l.prop(s, "alpha")
        l.prop(s, "alpha_bits")
        l.prop(s, "alpha_lossless")
        if not s.alpha_lossless:
            l.prop(s, "alpha_quality", slider=True)
        l.prop(s, "premultiplied")
        l.prop(s, "keep_invisible")
        if ctx.scene.render.film_transparent:
            l.label(text="Compositor output alpha is written as rendered", icon="NODE_COMPOSITING")


class FRAXJXL_PT_animation(_Sub, bpy.types.Panel):
    bl_label = "Animation"

    def draw(self, ctx):
        s, l, r = ctx.scene.frax_jxl, self.layout, ctx.scene.render
        l.use_property_split = True
        l.prop(s, "loops")
        l.prop(s, "remove_frames")
        col = l.column(align=True)
        col.label(text="Frames %d – %d, step %d · %.3f fps" % (ctx.scene.frame_start, ctx.scene.frame_end, ctx.scene.frame_step, r.fps / r.fps_base))
        col.label(text="Timing is exact: the file plays at the scene's frame rate")
        if r.is_movie_format:
            col.label(text="Output is a movie format: 'Also write' needs an image sequence", icon="ERROR")


class FRAXJXL_PT_focus(_Sub, bpy.types.Panel):
    bl_label = "Focus Areas"

    def draw_header(self, ctx):
        self.layout.prop(ctx.scene.frax_jxl, "focus_on", text="")

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.active = s.focus_on
        l.label(text="Regions coded sharper and streamed first (lossy)")
        row = l.row()
        row.template_list("FRAXJXL_UL_focus", "", s, "focus", s, "focus_index", rows=3)
        col = row.column(align=True)
        col.operator("frax_jxl.focus_add", text="", icon="ADD").source = "MANUAL"
        col.operator("frax_jxl.focus_remove", text="", icon="REMOVE")
        grid = l.grid_flow(columns=2, align=True)
        grid.operator("frax_jxl.focus_add", text="From Selected", icon="RESTRICT_SELECT_OFF").source = "SELECTED"
        grid.operator("frax_jxl.focus_add", text="Follow Selected", icon="TRACKER").source = "TRACK"
        grid.operator("frax_jxl.focus_add", text="From Render Region", icon="SELECT_SET").source = "BORDER"
        if 0 <= s.focus_index < len(s.focus):
            f = s.focus[s.focus_index]
            box = l.box()
            box.use_property_split = True
            box.prop(f, "track")
            if not f.track:
                c = box.column(align=True)
                c.prop(f, "x")
                c.prop(f, "y")
                c.prop(f, "w", text="Width")
                c.prop(f, "h", text="Height")
        l.use_property_split = True
        l.prop(s, "focus_quality", slider=True)
        l.prop(s, "focus_first")


class FRAXJXL_PT_tiles(_Sub, bpy.types.Panel):
    bl_label = "Tiles & Progressive"

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        for p in ("group_size", "group_order", "center_x", "center_y", "progressive_dc", "progressive_ac", "qprogressive_ac", "responsive", "buffering"):
            l.prop(s, p)


class FRAXJXL_PT_detail(_Sub, bpy.types.Panel):
    bl_label = "Detail & Filters"

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        for p in ("epf", "gaborish", "photon_noise", "noise", "dots", "patches", "resampling", "ec_resampling", "disable_perceptual", "full_heuristics"):
            l.prop(s, p)


class FRAXJXL_PT_modular(_Sub, bpy.types.Panel):
    bl_label = "Modular & Palette (Expert)"

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        for p in ("force_modular", "predictor", "ma_tree", "nb_prev", "palette_colors", "lossy_palette", "colors_global",
                  "colors_group", "modular_color_space", "color_transform"):
            l.prop(s, p)


class FRAXJXL_PT_meta(_Sub, bpy.types.Panel):
    bl_label = "Container & Metadata"

    def draw(self, ctx):
        s, l = ctx.scene.frax_jxl, self.layout
        l.use_property_split = True
        for p in ("container", "level", "compress_boxes", "brotli_effort", "write_render_info", "title", "author", "copyright"):
            l.prop(s, p)


# ── Digital Cinema ───────────────────────────────────────────────────────────────────────────────────────────
class FRAXDCP_PT_main(_Out, bpy.types.Panel):
    bl_label = "Digital Cinema (DCP)"
    bl_order = 101

    def draw_header(self, ctx):
        self.layout.label(icon="SEQUENCE")

    def draw(self, ctx):
        d, l = ctx.scene.frax_dcp, self.layout
        l.use_property_split = True
        col = l.column()
        col.prop(d, "resolution")
        col.prop(d, "container")
        col.prop(d, "fps")
        col.prop(d, "fit")
        col.prop(d, "standard")
        col.prop(d, "audio")
        col.prop(d, "builder")
        l.operator("frax_dcp.apply_format", icon="CHECKMARK")
        box = l.box()
        box.label(text="Festival checks", icon="VIEWZOOM")
        for ok, msg in dcp.checks(ctx.scene):
            box.label(text=msg, icon="CHECKMARK" if ok else "ERROR")
        l.separator()
        row = l.row(align=True)
        row.scale_y = 1.4
        row.operator("frax_dcp.render", icon="RENDER_ANIMATION")
        l.operator("frax_dcp.build_from_folder", icon="FILE_FOLDER")
        l.prop(d, "output")
        job = dcp.DCPJob.current
        if job and not job.done:
            l.label(text=job.status[:100], icon="TIME")
            if job.progress:
                l.progress(factor=job.progress, text="%d%%" % round(job.progress * 100))
            l.operator("frax_dcp.cancel", icon="CANCEL")
        elif job:
            l.label(text=job.status[:110], icon="CHECKMARK" if job.ok else "ERROR")
            l.operator("frax_dcp.open_folder", icon="FILE_FOLDER")


class FRAXDCP_PT_naming(_Out, bpy.types.Panel):
    bl_label = "Title & Naming (ISDCF)"
    bl_parent_id = "FRAXDCP_PT_main"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, ctx):
        d, l = ctx.scene.frax_dcp, self.layout
        l.use_property_split = True
        for p in ("title", "content_type", "audio_lang", "sub_lang", "territory", "rating", "studio", "facility"):
            l.prop(d, p)
        l.label(text=dcp.isdcf_name(ctx.scene))


class FRAXDCP_PT_advanced(_Out, bpy.types.Panel):
    bl_label = "Encoding"
    bl_parent_id = "FRAXDCP_PT_main"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, ctx):
        d, l = ctx.scene.frax_dcp, self.layout
        l.use_property_split = True
        l.prop(d, "keep_master")
        if d.builder == "BUILTIN":
            col = l.column(align=True)
            col.label(text="JPEG 2000: Blender's OpenJPEG, DCI 2K cinema profile, X'Y'Z' 12-bit", icon="INFO")
            col.label(text="MXF (SMPTE 429-4 / 382, MCA 5.1) + CPL with ISDCF metadata, unencrypted")
        else:
            l.prop(d, "bitrate")
            l.prop(d, "encrypt")
            l.prop(d, "dcpomatic_dir")
            p = dcp.dcpomatic_tool("dcpomatic2_create")
            l.label(text=("Using " + p) if p else "DCP-o-matic not found — free download: dcpomatic.com", icon="CHECKMARK" if p else "URL")


# ── menus ──────────────────────────────────────────────────────────────────────────────────────────────────────
def image_menu(self, ctx):
    l = self.layout
    l.separator()
    l.operator("frax_jxl.save_image", text="Save as JPEG XL…", icon="FILE_IMAGE")
    l.operator("frax_jxl.open_image", text="Open JPEG XL…", icon="FILE_FOLDER")


def render_menu(self, ctx):
    l = self.layout
    l.separator()
    l.operator("frax_jxl.save_image", text="Save Render as JPEG XL…", icon="FILE_IMAGE").image_name = "Render Result"
    l.operator("frax_jxl.render_animation", icon="RENDER_ANIMATION")
    l.operator("frax_dcp.render", text="Render DCP (Digital Cinema)", icon="SEQUENCE")


classes = (FRAXJXL_UL_focus, FRAXJXL_PT_main, FRAXJXL_PT_compression, FRAXJXL_PT_color, FRAXJXL_PT_alpha, FRAXJXL_PT_animation,
           FRAXJXL_PT_focus, FRAXJXL_PT_tiles, FRAXJXL_PT_detail, FRAXJXL_PT_modular, FRAXJXL_PT_meta,
           FRAXDCP_PT_main, FRAXDCP_PT_naming, FRAXDCP_PT_advanced)


def register():
    bpy.types.IMAGE_MT_image.append(image_menu)
    bpy.types.TOPBAR_MT_render.append(render_menu)


def unregister():
    bpy.types.IMAGE_MT_image.remove(image_menu)
    bpy.types.TOPBAR_MT_render.remove(render_menu)
