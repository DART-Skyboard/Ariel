# SPDX-License-Identifier: GPL-3.0-or-later
# Digital Cinema Package (DCP) — festival / cinema delivery.
# A DCP is JPEG 2000 picture + PCM audio in MXF files with CPL/PKL/ASSETMAP XML (SMPTE ST 429 / DCI spec).
# Both builders start from a 16-bit TIFF master + 48 kHz/24-bit WAV rendered by Blender:
#   · Built-in (default): Blender's own JPEG 2000 writer (OpenJPEG, DCI cinema profile) + the Frax MXF / CPL / PKL
#     writer in dcpwriter.py → SMPTE 2K DCP, nothing else to install.
#   · DCP-o-matic (free, GPL, https://dcpomatic.com) through its command-line tools: also 4K and Interop.
import datetime
import os
import shutil
import subprocess
import sys
import threading

import numpy as np

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, StringProperty

# DCI containers (exact pixel sizes a DCP picture must have)
CONTAINERS = {
    ("FLAT", "2K"): (1998, 1080, "185"), ("SCOPE", "2K"): (2048, 858, "239"), ("FULL", "2K"): (2048, 1080, "190"),
    ("FLAT", "4K"): (3996, 2160, "185"), ("SCOPE", "4K"): (4096, 1716, "239"), ("FULL", "4K"): (4096, 2160, "190"),
}
CONTENT_TYPES = [("SHR", "Short", ""), ("FTR", "Feature", ""), ("TLR", "Trailer", ""), ("TSR", "Teaser", ""),
                 ("TST", "Test", ""), ("ADV", "Advertisement", ""), ("PSA", "Public service", ""), ("POL", "Policy", ""),
                 ("RTG", "Rating card", ""), ("XSN", "Transitional", "")]


class FRAXDCP_Settings(bpy.types.PropertyGroup):
    builder: EnumProperty(name="DCP builder", default="BUILTIN", items=[
        ("BUILTIN", "Built-in", "Blender's JPEG 2000 (DCI cinema profile) + Frax MXF/CPL writer: SMPTE 2K, no install"),
        ("DCPOMATIC", "DCP-o-matic", "The free DCP-o-matic command-line tools: also 4K and Interop")])
    container: EnumProperty(name="Aspect", default="FLAT", items=[
        ("FLAT", "Flat 1.85", "1998×1080 / 3996×2160 — most films and shorts"),
        ("SCOPE", "Scope 2.39", "2048×858 / 4096×1716 — widescreen"),
        ("FULL", "Full container 1.90", "2048×1080 / 4096×2160")])
    resolution: EnumProperty(name="Resolution", default="2K", items=[("2K", "2K", "What almost every festival asks for"), ("4K", "4K", "")])
    fps: EnumProperty(name="Frame rate", default="24", items=[
        ("24", "24 fps", "The safe choice for festivals"), ("25", "25 fps", "PAL territories"), ("30", "30 fps", ""),
        ("48", "48 fps (HFR)", ""), ("50", "50 fps (HFR)", ""), ("60", "60 fps (HFR)", "")])
    fit: EnumProperty(name="Fit", default="LETTERBOX", items=[
        ("RENDER", "Render at container size", "Change the scene resolution to the exact DCP size (best quality)"),
        ("LETTERBOX", "Fit into container", "Keep your resolution; DCP-o-matic scales and letter/pillar-boxes it")])
    standard: EnumProperty(name="Standard", default="SMPTE", items=[("SMPTE", "SMPTE", "Current standard; most festivals require it"), ("interop", "Interop", "Legacy; only if asked")])
    content_type: EnumProperty(name="Content type", default="SHR", items=CONTENT_TYPES)
    title: StringProperty(name="Title", default="")
    audio_lang: StringProperty(name="Audio language", default="EN", description="ISO 639 code, e.g. EN, FR, ES; XX for no dialogue")
    sub_lang: StringProperty(name="Subtitle language", default="XX", description="XX = no subtitles")
    territory: StringProperty(name="Territory", default="US")
    rating: StringProperty(name="Rating", default="NR")
    audio: EnumProperty(name="Audio", default="STEREO", items=[("STEREO", "Stereo (2.0)", ""), ("51", "5.1 surround", ""), ("NONE", "No audio (MOS)", "")])
    studio: StringProperty(name="Studio", default="DART")
    facility: StringProperty(name="Facility", default="RDS")
    bitrate: IntProperty(name="Picture bit rate (Mbit/s)", min=50, max=250, default=150, description="DCI maximum is 250")
    encrypt: BoolProperty(name="Encrypt (KDM)", default=False, description="Festivals almost always want UNencrypted DCPs")
    output: StringProperty(name="Output folder", subtype="DIR_PATH", default="//DCP/")
    keep_master: BoolProperty(name="Keep the TIFF master", default=True)
    dcpomatic_dir: StringProperty(name="DCP-o-matic folder", subtype="DIR_PATH", default="",
                                  description="Folder holding dcpomatic2_create / dcpomatic2_cli (found automatically if installed normally)")
    status: StringProperty(default="")
    progress: FloatProperty(default=0.0)


# ── ISDCF Digital Cinema Naming Convention ─────────────────────────────────────────────────────────────────────
def isdcf_name(scene):
    d = scene.frax_dcp
    title = "".join(ch for ch in (d.title or bpy.path.display_name(bpy.data.filepath) or scene.name).title() if ch.isalnum())[:14] or "Untitled"
    fps = d.fps if d.fps != "24" else ""
    aspect = {"FLAT": "F", "SCOPE": "S", "FULL": "C"}[d.container]
    audio = {"STEREO": "20", "51": "51", "NONE": "MOS"}[d.audio]
    date = datetime.date.today().strftime("%Y%m%d")
    std = "SMPTE" if d.standard == "SMPTE" else "IOP"
    parts = [title + ("-" + fps if fps else ""), d.content_type, aspect, "%s-%s" % (d.audio_lang.upper()[:3], d.sub_lang.upper()[:3]),
             "%s-%s" % (d.territory.upper()[:3], d.rating.upper()[:5]), audio, d.resolution, d.studio.upper()[:4], date,
             d.facility.upper()[:4], std, "OV"]
    return "_".join(p for p in parts if p)


# ── compliance checks shown in the panel ───────────────────────────────────────────────────────────────────────
def checks(scene):
    d, r = scene.frax_dcp, scene.render
    w, h, _ = CONTAINERS[(d.container, d.resolution)]
    rw, rh = r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100
    fps = r.fps / r.fps_base
    out = []
    if (rw, rh) == (w, h):
        out.append((True, "Resolution %d×%d matches the %s %s container" % (w, h, d.resolution, d.container.title())))
    elif d.fit == "LETTERBOX":
        out.append((True, "%d×%d will be fitted into %d×%d (letter/pillar-boxed)" % (rw, rh, w, h)))
    else:
        out.append((False, "Render size %d×%d ≠ DCP %d×%d — press Apply DCP format" % (rw, rh, w, h)))
    if abs(fps - int(d.fps)) < 1e-6:
        out.append((True, "Frame rate %s fps" % d.fps))
    else:
        out.append((False, "Scene runs at %.3f fps; DCP is %s fps — press Apply DCP format" % (fps, d.fps)))
    if r.pixel_aspect_x != r.pixel_aspect_y:
        out.append((False, "Pixel aspect must be 1:1"))
    if d.audio != "NONE":
        has_sound = any(s.type == "SOUND" for s in (scene.sequence_editor.strips_all if scene.sequence_editor and hasattr(scene.sequence_editor, "strips_all")
                                                      else (scene.sequence_editor.sequences_all if scene.sequence_editor else [])))
        out.append((True, "Audio will be mixed down at 48 kHz / 24-bit") if has_sound else (False, "No sound strips found — choose No audio (MOS) or add sound"))
    if d.encrypt:
        out.append((False, "Encrypted DCPs need a KDM per cinema; festivals usually refuse them"))
    if d.bitrate > 250:
        out.append((False, "Bit rate above the DCI 250 Mbit/s limit"))
    secs = (scene.frame_end - scene.frame_start + 1) / max(fps, 1)
    out.append((True, "Length %d:%02d (%d frames)" % (secs // 60, secs % 60, scene.frame_end - scene.frame_start + 1)))
    if d.builder == "BUILTIN":
        out.append(builtin_ok(d))
        if int(d.fps) > 48:
            out.append((False, "%s fps pushes JPEG 2000 above the DCI 250 Mbit/s limit — 24/25/30/48 are safe" % d.fps))
    else:
        out.append((dcpomatic_tool("dcpomatic2_create") is not None, "DCP-o-matic found" if dcpomatic_tool("dcpomatic2_create") else
                    "DCP-o-matic not found — install it (free) from dcpomatic.com or set its folder"))
    return out


def wait_for_file(path, timeout=300):
    """The audio mixdown runs as a Blender job: wait until the WAV exists and has stopped growing."""
    import time
    t0, last = time.time(), -1
    while time.time() - t0 < timeout:
        if os.path.exists(path):
            n = os.path.getsize(path)
            if n == last and n > 44:
                return True
            last = n
        time.sleep(0.5)
    return os.path.exists(path)


def builtin_ok(d):
    if d.resolution != "2K":
        return False, "Built-in builder makes 2K DCPs — choose 2K, or the DCP-o-matic builder for 4K"
    if d.standard != "SMPTE":
        return False, "Built-in builder makes SMPTE DCPs — choose SMPTE, or DCP-o-matic for Interop"
    if d.encrypt:
        return False, "Built-in builder writes unencrypted DCPs (what festivals ask for)"
    return True, "Built-in builder: SMPTE 2K, JPEG 2000 ≈125 Mbit/s, nothing to install"


# ── locating DCP-o-matic ───────────────────────────────────────────────────────────────────────────────────────
def _candidates():
    try:
        d = bpy.context.scene.frax_dcp.dcpomatic_dir
    except Exception:
        d = ""
    c = []
    if d:
        c.append(bpy.path.abspath(d))
    if sys.platform == "win32":
        for base in (os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")):
            c += [os.path.join(base, "DCP-o-matic 2", "bin"), os.path.join(base, "DCP-o-matic", "bin")]
    elif sys.platform == "darwin":
        for app in ("DCP-o-matic 2 CLI.app", "DCP-o-matic 2.app", "DCP-o-matic CLI.app", "DCP-o-matic.app"):
            c.append(os.path.join("/Applications", app, "Contents", "MacOS"))
    else:
        c += ["/usr/bin", "/usr/local/bin", "/opt/dcpomatic/bin", os.path.expanduser("~/.local/bin")]
    return c


def dcpomatic_tool(name):
    exe = name + (".exe" if sys.platform == "win32" else "")
    for d in _candidates():
        p = os.path.join(d, exe)
        if os.path.isfile(p):
            return p
    return shutil.which(name)


# ── running DCP-o-matic in the background ──────────────────────────────────────────────────────────────────────
class DCPJob:
    current = None

    def __init__(self, scene, master_dir, wav, film_dir):
        d = scene.frax_dcp
        self.scene_name = scene.name
        self.cmd_create = [dcpomatic_tool("dcpomatic2_create"), "-o", film_dir, "-n", isdcf_name(scene), "--no-use-isdcf-name",
                           "-c", d.content_type, "-f", d.fps, "--container-ratio", CONTAINERS[(d.container, d.resolution)][2],
                           "--standard", d.standard, "--fourk" if d.resolution == "4K" else "--twok",
                           "--video-bit-rate", str(d.bitrate), "--encrypt" if d.encrypt else "--no-encrypt", "--twod"]
        if d.audio != "NONE":
            self.cmd_create += ["-a", "6"]
        self.cmd_create += ["--colourspace", "srgb", master_dir]
        if wav:
            self.cmd_create += [wav]
        self.cmd_cli = [dcpomatic_tool("dcpomatic2_cli"), film_dir]
        self.wav_path = wav
        self.film_dir = film_dir
        self.master_dir = master_dir if not d.keep_master else None
        self.log = []
        self.status = "Starting DCP-o-matic…"
        self.progress = 0.0
        self.done = False
        self.ok = False
        self.proc = None
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        try:
            if self.wav_path:
                wait_for_file(self.wav_path)
            for cmd, label in ((self.cmd_create, "Setting up the DCP project"), (self.cmd_cli, "Encoding JPEG 2000 / writing MXF")):
                if not cmd[0]:
                    raise RuntimeError("DCP-o-matic is not installed (dcpomatic.com) or its folder is not set")
                self.status = label + "…"
                self.log.append("$ " + " ".join('"%s"' % c if " " in c else c for c in cmd))
                self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
                                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                for line in self.proc.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    self.log.append(line)
                    if "%" in line:                                   # dcpomatic2_cli prints "...; 42%" style progress
                        try:
                            pct = float(line.split("%")[0].split()[-1].strip(";:"))
                            self.progress = pct / 100.0
                        except Exception:
                            pass
                    self.status = label + ": " + line[-90:]
                if self.proc.wait() != 0:
                    raise RuntimeError("%s failed (exit %d): %s" % (os.path.basename(cmd[0]), self.proc.returncode, " | ".join(self.log[-4:])))
            self.ok = True
            self.status = "DCP ready in " + self.film_dir
            if self.master_dir:
                shutil.rmtree(self.master_dir, ignore_errors=True)
        except Exception as e:                                       # noqa: BLE001
            self.status = "DCP failed: %s" % e
        finally:
            self.done = True
            try:
                with open(self.film_dir.rstrip("/\\") + "_log.txt", "w", encoding="utf-8") as f:
                    f.write("\n".join(self.log))
            except Exception:
                pass

    def cancel(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


# ── built-in builder: TIFF master → JPEG 2000 (Blender) → MXF + CPL/PKL/ASSETMAP (dcpwriter) ─────────────────────
IMAGE_EXTS = (".tif", ".tiff", ".exr", ".png", ".jpg", ".jpeg", ".dpx", ".bmp", ".tga")


class BuiltinDCPJob:
    """Runs on Blender's main thread, a few frames per timer tick (the JPEG 2000 writer is Blender's), so the UI
    stays responsive; MXF hashing and the XML are finished on a worker thread."""

    def __init__(self, scene, master_dir, wav, film_dir, delete_master=False):
        from . import dcpwriter
        self.W = dcpwriter
        d = scene.frax_dcp
        self.scene_name = scene.name
        self.files = sorted(os.path.join(master_dir, f) for f in os.listdir(master_dir)
                            if f.lower().endswith(IMAGE_EXTS) and not f.startswith("."))
        self.master_dir = master_dir if delete_master else None
        self.wav, self.film_dir = wav, film_dir
        self.name = os.path.basename(film_dir.rstrip("/\\"))
        self.w, self.h, _ = CONTAINERS[(d.container, "2K")]
        self.fps = int(d.fps)
        self.meta = dict(kind=d.content_type, territory=d.territory.upper()[:3] or "US", facility=d.facility,
                         audio=d.audio, title=d.title or self.name, issuer=d.studio or "Radical Deepscale",
                         lang=(d.audio_lang or "en").lower()[:3])
        self.status, self.progress, self.done, self.ok, self.cancelled = "Preparing…", 0.0, False, False, False
        self.i = 0
        self.pic = None
        self.thread = None
        self.error = None
        if not self.files:
            self._fail("no frames found in " + master_dir)
            return
        os.makedirs(film_dir, exist_ok=True)
        self.tmp = os.path.join(film_dir, ".frax_frame.j2c")
        self._setup(scene)
        self.pic = self.W.TrackFile(os.path.join(film_dir, self.name + "_pic.mxf"), "picture", self.fps)
        if bpy.app.background:                               # no event loop: run to the end right here
            import time
            while True:
                r = self._tick()
                if r is None:
                    break
                time.sleep(min(r, 0.05))
        else:
            bpy.app.timers.register(self._tick, first_interval=0.05)

    def _setup(self, scene):
        st, vs = scene.render.image_settings, scene.view_settings
        self.keep = {"st": {k: getattr(st, k) for k in ("file_format", "color_mode", "color_depth", "quality")},
                     "vs": {k: getattr(vs, k) for k in ("view_transform", "look", "exposure", "gamma", "use_curve_mapping")}}
        for k in ("jpeg2k_codec", "use_jpeg2k_cinema_preset", "use_jpeg2k_cinema_48", "use_jpeg2k_ycc"):
            self.keep["st"][k] = getattr(st, k)
        st.file_format = "JPEG2000"
        st.jpeg2k_codec = "J2K"
        st.color_mode = "RGB"
        st.color_depth = "12"
        st.use_jpeg2k_cinema_preset = True
        st.use_jpeg2k_cinema_48 = True             # half the 24 fps budget: ≈125 Mbit/s, inside DCI's safe limit
        st.use_jpeg2k_ycc = False
        vs.view_transform, vs.look, vs.exposure, vs.gamma, vs.use_curve_mapping = "Standard", "None", 0.0, 1.0, False
        self.img = bpy.data.images.new(".frax_dcp_frame", self.w, self.h, alpha=False, float_buffer=True)
        self.img.colorspace_settings.name = "Non-Color"     # X'Y'Z' code values go straight to the codestream

    def _restore(self):
        scene = bpy.data.scenes.get(self.scene_name)
        if scene and getattr(self, "keep", None):
            st, vs = scene.render.image_settings, scene.view_settings
            try:
                st.file_format = self.keep["st"]["file_format"]
            except Exception:
                pass
            for obj, kv in ((st, self.keep["st"]), (vs, self.keep["vs"])):
                for k, v in kv.items():
                    try:
                        setattr(obj, k, v)
                    except Exception:
                        pass
        if getattr(self, "img", None):
            try:
                bpy.data.images.remove(self.img)
            except Exception:
                pass
            self.img = None

    def _read(self, path):
        from . import capture, frames
        try:
            return frames.read_any(path)
        except ValueError:
            return capture.load_file_pixels(path)          # PNG / DPX / JPEG …: Blender reads it (not inside a render)

    def _tick(self):
        if self.cancelled:
            self._abort("cancelled")
            return None
        if self.thread is not None:
            if self.thread.is_alive():
                return 0.2
            self._finish()
            return None
        import time
        t0 = time.time()
        scene = bpy.data.scenes.get(self.scene_name)
        try:
            while self.i < len(self.files) and time.time() - t0 < 0.25:
                arr, linear = self._read(self.files[self.i])
                rgb = self.W.fit_into(arr[..., :3], self.w, self.h)
                xyz = self.W.srgb_to_xyz12(rgb, linear)
                px = np.ones((self.h, self.w, 4), np.float32)
                px[..., :3] = xyz[::-1]
                self.img.pixels.foreach_set(px.ravel())
                self.img.save_render(filepath=self.tmp, scene=scene)
                with open(self.tmp, "rb") as f:
                    self.pic.write_frame(f.read())
                self.i += 1
            self.progress = 0.9 * self.i / len(self.files)
            self.status = "JPEG 2000 frame %d / %d" % (self.i, len(self.files))
        except Exception as e:                                       # noqa: BLE001
            self._abort("frame %d: %s" % (self.i + 1, e))
            return None
        if self.i < len(self.files):
            return 0.01
        self._restore()
        self.status = "Writing MXF, CPL, PKL and ASSETMAP…"
        self.thread = threading.Thread(target=self._wrap, daemon=True)
        self.thread.start()
        return 0.2

    def _wrap(self):
        try:
            W, n = self.W, self.pic.frames
            self.pic.close()
            snd = None
            if self.wav:
                wait_for_file(self.wav)
            if self.wav and os.path.exists(self.wav):
                snd = W.TrackFile(os.path.join(self.film_dir, self.name + "_snd.mxf"), "sound", self.fps, channels=6,
                                  language=self.meta["lang"])
                for blk in W.wav_frames(self.wav, self.fps, n, self.meta["audio"]):
                    snd.write_frame(blk)
                snd.close()
            m = self.meta
            W.finish_package(self.film_dir, self.name, m["kind"], self.pic, snd, self.fps, self.w, self.h,
                             issuer=m["issuer"], territory=m["territory"], facility=m["facility"], audio=m["audio"],
                             title=m["title"])
        except Exception as e:                                       # noqa: BLE001
            self.error = str(e)

    def _finish(self):
        try:
            os.remove(self.tmp)
        except OSError:
            pass
        if self.error:
            self._fail(self.error)
            return
        if self.master_dir:
            shutil.rmtree(self.master_dir, ignore_errors=True)
        self.ok, self.done, self.progress = True, True, 1.0
        self.status = "DCP ready in " + self.film_dir
        self._log()

    def _abort(self, why):
        self._restore()
        try:
            if self.pic and not self.pic.f.closed:
                self.pic.f.close()
        except Exception:
            pass
        self._fail(why)

    def _fail(self, why):
        self.status = "DCP failed: " + why
        self.done = True
        self._log()

    def _log(self):
        try:
            with open(self.film_dir.rstrip("/\\") + "_log.txt", "w", encoding="utf-8") as f:
                f.write("Built-in DCP builder (Frax JXL DCP Render)\n%s\nframes: %d\n" % (self.status, self.i))
        except Exception:
            pass

    def cancel(self):
        self.cancelled = True


def make_job(scene, master_dir, wav, film_dir):
    d = scene.frax_dcp
    if d.builder == "BUILTIN" and builtin_ok(d)[0]:
        return BuiltinDCPJob(scene, master_dir, wav, film_dir, delete_master=not d.keep_master)
    return DCPJob(scene, master_dir, wav, film_dir)


classes = (FRAXDCP_Settings,)
