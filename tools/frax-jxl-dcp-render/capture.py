# SPDX-License-Identifier: GPL-3.0-or-later
# Pixels in, JPEG XL out: reading renders / frame files, colour handling, focus areas, the streaming animation writer.
import os
import queue
import tempfile
import threading
import time

import bpy
import numpy as np

from . import engine
from .settings import depth_params, frame_options

LINEAR_EXTS = {".exr", ".hdr"}

# ── colour maths ──────────────────────────────────────────────────────────────────────────────────────────────
M_709_TO_2020 = np.array([[0.6274040, 0.3292820, 0.0433136], [0.0690970, 0.9195400, 0.0113612], [0.0163916, 0.0880132, 0.8955950]], np.float32)
M_709_TO_P3 = np.array([[0.8224622, 0.1775378, 0.0], [0.0331942, 0.9668058, 0.0], [0.0170827, 0.0723974, 0.9105199]], np.float32)


def srgb_to_linear(v):
    v = np.clip(v, 0.0, None)
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_to_srgb(v):
    v = np.clip(v, 0.0, None)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055).astype(np.float32)


def linear_to_bt709(v):
    v = np.clip(v, 0.0, None)
    return np.where(v < 0.018, 4.5 * v, 1.099 * np.power(v, 0.45) - 0.099).astype(np.float32)


def pq_encode(nits):            # SMPTE ST 2084
    m1, m2, c1, c2, c3 = 0.1593017578125, 78.84375, 0.8359375, 18.8515625, 18.6875
    y = np.clip(nits / 10000.0, 0.0, 1.0) ** m1
    return ((c1 + c2 * y) / (1 + c3 * y)) ** m2


def hlg_encode(e):              # ARIB STD-B67 / BT.2100
    a, b, c = 0.17883277, 0.28466892, 0.55991073
    e = np.clip(e, 0.0, 1.0)
    return np.where(e <= 1 / 12, np.sqrt(3 * e), a * np.log(np.maximum(12 * e - b, 1e-9)) + c).astype(np.float32)


def to_target(rgb, linear_src, color):
    """rgb HxWx3 float → values in the JPEG XL colour space chosen. Blender's scene-linear is Rec.709 primaries;
    HDR uses BT.2408 reference white (scene value 1.0 = 203 nits)."""
    color = int(color)
    if color == 0 and not linear_src:
        return rgb                                                    # already sRGB display values: keep exactly
    lin = rgb if linear_src else srgb_to_linear(rgb)
    if color == 0:
        return linear_to_srgb(lin)
    if color == 1:
        return lin
    if color == 2:
        return linear_to_srgb(lin @ M_709_TO_P3.T)
    l2020 = np.clip(lin @ M_709_TO_2020.T, 0.0, None)
    if color == 5:
        return linear_to_bt709(l2020)
    if color == 3:
        return pq_encode(l2020 * 203.0).astype(np.float32)
    if color == 4:
        return hlg_encode(l2020 * 0.2652)
    return rgb


# ── reading pixels ─────────────────────────────────────────────────────────────────────────────────────────────
def load_file_pixels(path):
    """Any image Blender can read → (H×W×4 float32 top-down, raw file values, is_linear)."""
    img = bpy.data.images.load(path, check_existing=False)
    try:
        img.colorspace_settings.is_data = True                           # raw values, no colour conversion on read
        w, h = img.size
        arr = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(arr)
    finally:
        bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)[::-1].copy(), os.path.splitext(path)[1].lower() in LINEAR_EXTS


def image_pixels(image, scene, linear):
    """A Blender image (including the Render Result and the compositor Viewer) → pixels via save_render, which
    applies the scene's view transform for display output and writes raw scene-linear for EXR."""
    st = scene.render.image_settings
    keep = dict(file_format=st.file_format, color_mode=st.color_mode, color_depth=st.color_depth)
    fd, tmp = tempfile.mkstemp(suffix=".exr" if linear else ".png", prefix="frax_jxl_")
    os.close(fd)
    try:
        st.file_format = "OPEN_EXR" if linear else "PNG"
        st.color_mode = "RGBA"
        st.color_depth = "32" if linear else "16"
        image.save_render(filepath=tmp, scene=scene)
        return load_file_pixels(tmp)
    finally:
        for k, v in keep.items():
            try:
                setattr(st, k, v)
            except Exception:
                pass
        try:
            os.remove(tmp)
        except OSError:
            pass


# ── settings → encoder job ────────────────────────────────────────────────────────────────────────────────────
def analyse(arr):
    a = arr[..., 3]
    has_alpha = bool((a < 0.999).any())
    rgb = arr[..., :3]
    grey = bool(np.abs(rgb[..., 0] - rgb[..., 1]).max() < 1e-4 and np.abs(rgb[..., 1] - rgb[..., 2]).max() < 1e-4)
    return has_alpha, grey


class Plan:
    """Everything fixed for the whole file: depth, channels, alpha, colour. Built from the first frame."""

    def __init__(self, s, first, linear_src, film_transparent=False):
        self.s = s
        has_alpha, grey = analyse(first)
        self.bits, self.exp, self.dtype = depth_params(s)
        self.float_out = self.exp > 0
        self.linear_src = linear_src
        self.color = int(s.color)
        if linear_src and not self.float_out and self.color == 1:
            self.color = 0                                              # linear in 8–16-bit integer bands badly: store sRGB
        self.grey = s.channels == "GREY" or (s.channels == "AUTO" and grey)
        self.alpha = s.alpha == "KEEP" or (s.alpha == "AUTO" and (has_alpha or film_transparent))
        if self.alpha:
            if s.alpha_bits == "SAME":
                self.alpha_bits, self.alpha_exp = self.bits, self.exp
            else:
                self.alpha_bits, self.alpha_exp = int(s.alpha_bits), (5 if self.float_out and s.alpha_bits == "16" else 0)
        else:
            self.alpha_bits = self.alpha_exp = 0
        self.channels = 1 if self.grey else 3

    def convert(self, arr, crop=None):
        if crop:
            x, y, w, h = crop
            arr = arr[y:y + h, x:x + w]
        rgb = to_target(arr[..., :3], self.linear_src, self.color)
        if self.grey:
            rgb = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2])[..., None]
        parts = [rgb]
        if self.alpha:
            parts.append(arr[..., 3:4])
        out = np.concatenate(parts, axis=2) if len(parts) > 1 else rgb
        if self.float_out:
            return np.ascontiguousarray(out, dtype=np.float32)
        top = 255.0 if self.dtype == np.uint8 else 65535.0
        return np.ascontiguousarray(np.clip(out, 0, 1) * top + 0.5).astype(self.dtype)

    def encoder(self, width, height, animated=False, fps=(24, 1), boxes=(), cache_dir=None):
        s = self.s
        lossless = s.mode == "LOSSLESS"
        return engine.Encoder(width, height, bits=self.bits, exp_bits=self.exp, channels=self.channels,
                              alpha_bits=self.alpha_bits, alpha_exp=self.alpha_exp, premultiplied=s.premultiplied,
                              animated=animated, tps_num=fps[0], tps_den=fps[1], loops=s.loops,
                              original_profile=lossless or s.color_transform == "1", intensity_target=s.intensity,
                              color=self.color, intent=int(s.intent), container=int(s.container), level=int(s.level),
                              boxes=boxes, cache_dir=cache_dir)


def xmp_box(s, scene, frame=None, extra=None):
    def esc(t):
        return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    info = {}
    if s.write_render_info and scene:
        r = scene.render
        info = {"Scene": scene.name, "Engine": r.engine.replace("BLENDER_", "").title(), "Blender": bpy.app.version_string,
                "Resolution": "%dx%d" % (r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100),
                "FPS": "%.3f" % (r.fps / r.fps_base), "Camera": scene.camera.name if scene.camera else "",
                "ViewTransform": scene.view_settings.view_transform}
        if r.engine == "CYCLES" and hasattr(scene, "cycles"):
            info["Samples"] = str(scene.cycles.samples)
        elif hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
            info["Samples"] = str(scene.eevee.taa_render_samples)
        if frame is not None:
            info["Frame"] = str(frame)
    if extra:
        info.update(extra)
    if not (info or s.author or s.copyright or s.title):
        return []
    x = ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
         'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" '
         'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" '
         'xmlns:frax="https://radicaldeepscale.com/ns/frax/1.0/" xmp:CreatorTool="Blender %s · Frax JPEG XL / DCP Render"' % esc(bpy.app.version_string))
    x += "".join(' frax:%s="%s"' % (k, esc(v)) for k, v in info.items()) + ">"
    if s.title:
        x += '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">%s</rdf:li></rdf:Alt></dc:title>' % esc(s.title)
    if s.author:
        x += "<dc:creator><rdf:Seq><rdf:li>%s</rdf:li></rdf:Seq></dc:creator>" % esc(s.author)
    if s.copyright:
        x += '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">%s</rdf:li></rdf:Alt></dc:rights>' % esc(s.copyright)
    x += '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
    return [("xml ", x.encode("utf-8"), s.compress_boxes == "1")]


def focus_pixels(rects, w, h):
    out = []
    for (x, y, rw, rh) in rects:
        px, py = max(0, int(round(x * w))), max(0, int(round(y * h)))
        pw, ph = min(w - px, int(round(rw * w))), min(h - py, int(round(rh * h)))
        if pw >= 8 and ph >= 8:
            out.append((px, py, pw, ph))
    return out


def object_rect(scene, obj, depsgraph=None):
    """Normalised (x, y, w, h), origin top-left, of an object's bounding box as the scene camera sees it."""
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    cam = scene.camera
    if not cam or not obj:
        return None
    ob = obj.evaluated_get(depsgraph) if depsgraph else obj
    pts = [world_to_camera_view(scene, cam, ob.matrix_world @ Vector(c)) for c in ob.bound_box]
    pts = [p for p in pts if p.z > 0]
    if not pts:
        return None
    x0, x1 = max(0.0, min(p.x for p in pts)), min(1.0, max(p.x for p in pts))
    y0, y1 = max(0.0, min(p.y for p in pts)), min(1.0, max(p.y for p in pts))
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0, 1.0 - y1, x1 - x0, y1 - y0)


def scene_focus_rects(scene, s, depsgraph=None):
    if not s.focus_on:
        return []
    out = []
    for f in s.focus:
        if f.track:
            r = object_rect(scene, f.track, depsgraph)
            if r:
                out.append(r)
        else:
            out.append((f.x, f.y, f.w, f.h))
    return out


def add_with_focus(enc, plan, arr, rects_px, duration):
    """One displayed frame: base image, then sharper focus layers on top (JPEG XL crop + replace blending)."""
    s = plan.s
    base = frame_options(s)
    if not rects_px or s.mode == "LOSSLESS":
        enc.add_frame(plan.convert(arr), base, duration=duration)
        return
    if s.focus_first and int(s.group_order) == -1:
        x, y, w, h = rects_px[0]
        base["ints"][13] = 1
        base["ints"][14] = x + w // 2
        base["ints"][15] = y + h // 2
    enc.add_frame(plan.convert(arr), base, duration=0)
    fd = min(engine.quality_to_distance(s.focus_quality), s.distance)
    for i, c in enumerate(rects_px):
        last = i == len(rects_px) - 1
        enc.add_frame(plan.convert(arr, crop=c), frame_options(s, distance=fd, lossless=False),
                      duration=duration if last else 0, crop=c, blend=0, name="focus %d" % (i + 1))


def encode_still(arr, linear, s, scene, path, rects=None, cache_dir=None, frame=None):
    h, w = arr.shape[:2]
    film = bool(scene and scene.render.film_transparent)
    plan = Plan(s, arr, linear, film)
    enc = plan.encoder(w, h, boxes=xmp_box(s, scene, frame), cache_dir=cache_dir)
    t0 = time.time()
    try:
        add_with_focus(enc, plan, arr, focus_pixels(rects or [], w, h), 0)
        data = enc.finish()
    finally:
        enc.close()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return len(data), time.time() - t0


# ── streaming animation writer (one background thread owns the encoder) ──────────────────────────────────────
class AnimationWriter:
    """Frames go in as they are rendered; the encoder runs on its own thread so rendering never waits for it
    (except when it is more than a few frames behind)."""

    def __init__(self, s, scene, path, cache_dir=None, track_rects=None):
        self.s, self.path, self.cache_dir = s, path, cache_dir
        r = scene.render
        # exact frame timing: ticks per second = fps / fps_base, each frame lasts frame_step ticks
        self.tps = (int(round(r.fps * 1000)), int(round(r.fps_base * 1000)))
        self.step = max(1, scene.frame_step)
        self.film = r.film_transparent
        self.boxes = xmp_box(s, scene, extra={"FrameStart": str(scene.frame_start), "FrameEnd": str(scene.frame_end)})
        self.static_rects = [(f.x, f.y, f.w, f.h) for f in s.focus if not f.track] if s.focus_on else []
        self.track_rects = track_rects or {}
        self.q = queue.Queue(maxsize=3)
        self.error = None
        self.frames = 0
        self.bytes = 0
        self.files = []
        self.done = threading.Event()
        self.t = threading.Thread(target=self._run, name="frax-jxl-animation", daemon=True)
        self.t.start()

    def add(self, arr, linear, frame, file_path=None):
        if self.error:
            return
        if file_path:
            self.files.append(file_path)
        self.q.put((arr, linear, frame, None))

    def add_file(self, path, frame):
        """Queue a frame file; it is read on the encoder thread (TIFF / EXR, no Blender API)."""
        if self.error:
            return
        self.files.append(path)
        self.q.put((None, None, frame, path))

    def finish(self):
        self.q.put(None)

    def abort(self):
        self.error = self.error or "cancelled"
        self.q.put(None)

    def _run(self):
        enc = plan = None
        try:
            while True:
                item = self.q.get()
                if item is None:
                    break
                if self.error:
                    continue
                arr, linear, frame, path = item
                if arr is None:
                    from . import frames
                    arr, linear = frames.read_any(path)
                h, w = arr.shape[:2]
                if enc is None:
                    plan = Plan(self.s, arr, linear, self.film)
                    enc = plan.encoder(w, h, animated=True, fps=self.tps, boxes=self.boxes, cache_dir=self.cache_dir)
                rects = list(self.static_rects) + list(self.track_rects.get(frame, []))
                add_with_focus(enc, plan, arr, focus_pixels(rects, w, h), self.step)
                self.frames += 1
            if enc is not None and not self.error:
                data = enc.finish()
                os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
                with open(self.path, "wb") as f:
                    f.write(data)
                self.bytes = len(data)
                if self.s.remove_frames:
                    for p in self.files:
                        try:
                            os.remove(p)
                        except OSError:
                            pass
        except Exception as e:                       # noqa: BLE001 — surfaced in the UI
            self.error = str(e)
        finally:
            if enc is not None:
                enc.close()
            self.done.set()
