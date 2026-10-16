# Frax JPEG XL + DCP Render (Blender 5.2 LTS and later)

Radical Deepscale LLC / DART Meadow · GPL-3.0-or-later · libjxl 0.13 (BSD-3-Clause) via WebAssembly + wasmtime (Apache-2.0)

## Install
Edit ▸ Preferences ▸ Get Extensions ▸ ⌄ ▸ **Install from Disk…** → pick the zip for your system
(`windows_x64`, `windows_arm64`, `macos_arm64` (Apple Silicon), `macos_x64` (Intel), `linux_x64`, `linux_arm64`).

## JPEG XL
* **Stills** — Image Editor / render window: **Image ▸ Save as JPEG XL…** (also Render ▸ Save Render as JPEG XL…).
  Works for the Render Result, the compositor Viewer and any image. **Image ▸ Open JPEG XL…** loads .jxl files.
* **Animations** — Render ▸ **Render Animation → JPEG XL** renders the frame range into one animated .jxl, timed at the
  scene frame rate. Or tick **Also write an animated .jxl** and every normal Ctrl F12 image-sequence render is packed too.
* **Options** — Output Properties ▸ **JPEG XL (Frax)**: presets, lossy / modular / lossless, quality ↔ distance, effort,
  decode speed, 8 / 10 / 12 / 16-bit and 16 / 32-bit float, display (view transform) or scene-linear HDR, sRGB / linear /
  Display P3 / Rec.2020 / Rec.2100 PQ & HLG, alpha (depth, quality, premultiplied, colour under clear pixels), tiles and
  progressive loading, **focus areas** (from selected objects, the render region, or following objects every frame),
  filters, photon noise, modular expert options, container and XMP metadata (render info, title, author, copyright).
* EEVEE, Cycles and Workbench all work: the extension reads what the render writes, after the compositor.

## Digital Cinema (DCP)
Output Properties ▸ **Digital Cinema (DCP)**: 2K / 4K, Flat 1.85 / Scope 2.39 / Full 1.90, 24–60 fps, SMPTE or Interop,
stereo / 5.1 / no audio, ISDCF name builder, festival checks, **Apply DCP Format**, **Render DCP**.
A DCP is JPEG 2000 in MXF (that is what cinema servers and festival QC accept) — the extension renders a 16-bit TIFF
master and 48 kHz / 24-bit audio, then builds the DCP with the free **DCP-o-matic** (install from dcpomatic.com).
A lossless 16-bit .jxl master can be written alongside. A built-in JPEG 2000 / MXF writer is planned.

## Rebuild
`build.sh` downloads the wasmtime wheels and builds the per-platform zips with Blender's extension builder.
The WebAssembly engine is built from `tools/frax-jxl/jxw.c` (same bridge as Frax Studio in the browser).
