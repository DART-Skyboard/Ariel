# SPDX-License-Identifier: GPL-3.0-or-later
# Render-time plumbing: handlers that follow an animation render (any engine: EEVEE, Cycles, Workbench) and
# feed every written frame into the JPEG XL animation writer, and/or hand a finished master to the DCP builder.
import collections
import os

import bpy
from bpy.app.handlers import persistent

from . import capture, dcp

# One active session at a time.
#   kind: "jxl"  — our Render Animation → JPEG XL (we chose the frame format; settings restored afterwards)
#         "auto" — the user's own Ctrl F12 with "Also write an animated .jxl" switched on
#         "dcp"  — Render DCP (TIFF master → DCP-o-matic)
SESSION = None


class Session:
    def __init__(self, kind, scene, restore=None, jxl_path=None, temp_dir=None, dcp_info=None, track=None, reader="bpy"):
        self.kind, self.scene_name = kind, scene.name
        self.reader = reader              # "fast": our TIFF/EXR reader on the encoder thread · "bpy": after the render
        self.restore = restore or {}
        self.temp_dir = temp_dir
        self.dcp_info = dcp_info
        self.pending = collections.deque()
        self.seen = set()
        self.complete = False
        self.cancelled = False
        self.writer = None
        if jxl_path:
            self.writer = capture.AnimationWriter(scene.frax_jxl, scene, jxl_path, cache_dir=cache_dir(), track_rects=track)
        self.next_frame = scene.frame_start
        self.status = "Rendering…"


def cache_dir():
    try:
        return bpy.utils.extension_path_user(__package__, path="cache", create=True)
    except Exception:
        return os.path.join(bpy.app.tempdir or os.path.expanduser("~"), "frax_jxl_cache")


def _frame_file(scene, frame):
    return bpy.path.abspath(scene.render.frame_path(frame=frame))


def _set_status(msg):
    for sc in bpy.data.scenes:
        if hasattr(sc, "frax_jxl"):
            try:
                sc["frax_jxl_status"] = msg
            except Exception:
                pass
    for w in bpy.context.window_manager.windows if bpy.context.window_manager else []:
        for a in w.screen.areas:
            if a.type in {"PROPERTIES", "IMAGE_EDITOR"}:
                a.tag_redraw()
    print("[Frax JPEG XL/DCP]", msg)


def _ingest(path, frame):
    """Main thread only: read a written frame and queue it for the encoder thread."""
    s = SESSION
    if not s or not s.writer:
        return
    try:
        arr, linear = capture.load_file_pixels(path)
        s.writer.add(arr, linear, frame, file_path=path)
        s.status = "Encoding frame %d into JPEG XL…" % frame
    except Exception as e:                                     # noqa: BLE001
        s.writer.error = "could not read frame %d (%s): %s" % (frame, os.path.basename(path), e)


# ── handlers ──────────────────────────────────────────────────────────────────────────────────────────────────
@persistent
def on_render_write(scene, *_):
    global SESSION
    if SESSION is None:
        s = scene.frax_jxl
        if not s.animation_auto or scene.render.is_movie_format:
            return
        SESSION = Session("auto", scene, jxl_path=bpy.path.abspath(s.animation_path))
        _register_timer()
    frame = scene.frame_current
    path = _frame_file(scene, frame)
    if not os.path.exists(path):                              # fall back to counting frames ourselves
        frame = SESSION.next_frame
        path = _frame_file(scene, frame)
    SESSION.next_frame = frame + max(1, scene.frame_step)
    if frame in SESSION.seen or not os.path.exists(path):
        return
    SESSION.seen.add(frame)
    # Never touch Blender's image API here: this runs inside the render. Frames we chose the format of are read
    # on the encoder thread; anything else is read after the render has finished.
    if SESSION.reader == "fast" and SESSION.writer:
        SESSION.writer.add_file(path, frame)
        SESSION.status = "Encoding frame %d into JPEG XL…" % frame
    else:
        SESSION.pending.append((path, frame))


@persistent
def on_render_complete(scene, *_):
    if SESSION is not None:
        SESSION.complete = True
        if bpy.app.background:
            finish_now()


@persistent
def on_render_cancel(scene, *_):
    if SESSION is not None:
        SESSION.cancelled = True
        SESSION.complete = True
        if SESSION.writer:
            SESSION.writer.abort()
        if bpy.app.background:
            finish_now()


# ── main-thread pump (UI mode) ────────────────────────────────────────────────────────────────────────────────
def _register_timer():
    pass                                                       # the pump is always registered (see register())


def _pump():
    global SESSION
    s = SESSION
    if s is None:
        return 0.5                                             # idle heartbeat (registered once, persistent)
    if s.complete and s.pending and not s.cancelled:
        path, frame = s.pending.popleft()                      # after the render: one frame per tick keeps the UI responsive
        _ingest(path, frame)
        _set_status("Packing frame %d into JPEG XL…" % frame)
        return 0.01
    if s.cancelled:
        s.pending.clear()
    if s.writer and not s.complete:
        _set_status(s.status if not s.writer.error else "JPEG XL error: " + s.writer.error)
    if s.complete and not s.pending:
        if s.writer and not s.writer.done.is_set():
            if not getattr(s, "_finishing", False):
                s._finishing = True
                s.writer.finish()
            _set_status("Finishing the JPEG XL animation (%d frames)…" % s.writer.frames)
            return 0.25
        _finalise()
        return 0.5
    return 0.1


def finish_now():
    """Background mode: drain, wait for the encoder, finalise."""
    s = SESSION
    if s is None:
        return
    while s.pending and not s.cancelled:
        _ingest(*s.pending.popleft())
    if s.writer:
        s.writer.finish()
        s.writer.done.wait()
    _finalise()


def _finalise():
    global SESSION
    s = SESSION
    SESSION = None
    scene = bpy.data.scenes.get(s.scene_name)
    if scene and s.restore:
        _restore(scene, s.restore)
    msg = []
    if s.writer:
        w = s.writer
        if s.cancelled:
            msg.append("Render cancelled — no JPEG XL written")
        elif w.error:
            msg.append("JPEG XL failed: " + w.error)
        else:
            msg.append("JPEG XL animation: %d frames, %.1f MB → %s" % (w.frames, w.bytes / 1048576, w.path))
        if s.temp_dir and s.kind == "jxl" and not s.cancelled and not w.error:
            import shutil
            shutil.rmtree(s.temp_dir, ignore_errors=True)
    if s.kind == "dcp" and scene and not s.cancelled:
        info = s.dcp_info
        job = dcp.DCPJob(scene, info["master"], info.get("wav"), info["film"])
        dcp.DCPJob.current = job
        bpy.app.timers.register(_dcp_poll, first_interval=0.5)
        msg.append("Master rendered — building the DCP…")
    _set_status(" · ".join(msg) or "Done")


def _dcp_poll():
    job = dcp.DCPJob.current
    if job is None:
        return None
    pct = (" %d%%" % round(job.progress * 100)) if job.progress else ""
    _set_status(job.status + pct)
    if job.done:
        if not bpy.app.background:
            try:
                bpy.ops.wm.call_menu  # noqa: B018 — just ensure ops exist
            except Exception:
                pass
        return None
    return 0.5


# ── saving / restoring the user's output settings ─────────────────────────────────────────────────────────────
OUT_KEYS = ("filepath", "use_file_extension", "use_overwrite", "use_placeholder")
IMG_KEYS = ("file_format", "color_mode", "color_depth", "exr_codec", "tiff_codec", "compression")


def snapshot(scene):
    r, im = scene.render, scene.render.image_settings
    d = {"render." + k: getattr(r, k) for k in OUT_KEYS if hasattr(r, k)}
    d.update({"image." + k: getattr(im, k) for k in IMG_KEYS if hasattr(im, k)})
    return d


def _restore(scene, d):
    r, im = scene.render, scene.render.image_settings
    # format first: colour depth / mode options depend on it
    if "image.file_format" in d:
        try:
            im.file_format = d["image.file_format"]
        except Exception:
            pass
    for k, v in d.items():
        obj, name = (r, k[7:]) if k.startswith("render.") else (im, k[6:])
        if name == "file_format":
            continue
        try:
            setattr(obj, name, v)
        except Exception:
            pass


def set_frame_format(scene, fmt, depth, mode="RGBA", codec=None):
    im = scene.render.image_settings
    im.file_format = fmt
    try:
        im.color_mode = mode
    except Exception:
        im.color_mode = "RGB"
    try:
        im.color_depth = depth
    except Exception:
        pass
    if codec and hasattr(im, "exr_codec") and fmt == "OPEN_EXR":
        try:
            im.exr_codec = codec
        except Exception:
            pass
    if fmt == "TIFF" and hasattr(im, "tiff_codec"):
        try:
            im.tiff_codec = "DEFLATE"
        except Exception:
            pass


def start(kind, scene, **kw):
    global SESSION
    SESSION = Session(kind, scene, **kw)
    if not bpy.app.background:
        _register_timer()
    return SESSION


HANDLERS = ((bpy.app.handlers.render_write, on_render_write), (bpy.app.handlers.render_complete, on_render_complete),
            (bpy.app.handlers.render_cancel, on_render_cancel))


def register():
    for lst, fn in HANDLERS:
        if fn not in lst:
            lst.append(fn)
    if not bpy.app.timers.is_registered(_pump):
        bpy.app.timers.register(_pump, first_interval=1.0, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(_pump):
        bpy.app.timers.unregister(_pump)
    for lst, fn in HANDLERS:
        while fn in lst:
            lst.remove(fn)
