# SPDX-License-Identifier: GPL-3.0-or-later
# Digital Cinema Package (DCP) — festival / cinema delivery.
# A DCP is JPEG 2000 picture + PCM audio in MXF files with CPL/PKL/ASSETMAP XML (SMPTE ST 429 / DCI spec).
# Engine 1 (now): renders a DCI-correct 16-bit TIFF master + 48 kHz/24-bit WAV, then drives DCP-o-matic's
# command-line tools (free, GPL, https://dcpomatic.com) to build an ISDCF-named SMPTE or Interop DCP.
# Engine 2 (planned): built-in JPEG 2000 + MXF writer, no other install.
import datetime
import os
import shutil
import subprocess
import sys
import threading

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
    out.append((dcpomatic_tool("dcpomatic2_create") is not None, "DCP-o-matic found" if dcpomatic_tool("dcpomatic2_create") else
                "DCP-o-matic not found — install it (free) from dcpomatic.com or set its folder"))
    return out


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
                with open(os.path.join(self.film_dir, "frax-dcp-log.txt"), "w", encoding="utf-8") as f:
                    f.write("\n".join(self.log))
            except Exception:
                pass

    def cancel(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


classes = (FRAXDCP_Settings,)
