# Frax JPEG XL + DCP Render (Blender 5.2 LTS and later)

Radical Deepscale LLC / DART Meadow · GPL-3.0-or-later

## Frax JXL — JPEG XL in pure Python
The default encoder (**Encoder ▸ Frax JXL · pure Python**) is a JPEG XL encoder written in Python + numpy, in `jxl/`.
JPEG XL works exactly as standardised (ISO/IEC 18181) — this is the same format, written from Blender's own Python,
so the render line needs no external library. Every file it writes is a standard JPEG XL that any viewer opens.

* Modular coding: YCoCg colour transform, all non-weighted predictors, learned MA context trees, LZ77 run coding,
  per-context hybrid-integer tokens and Huffman (prefix) codes
* Lossless 1–16-bit integer and 16/32-bit float, greyscale, alpha (own depth, premultiplied), extra channels
  (depth, selection masks, spot colours, thermal…)
* Lossy with a quality slider: the Squeeze transform + quantised detail bands — always progressive
* Animation: many frames in one file with exact frame timing and loops; crop layers, blend modes, reference frames
* Focus areas: tiles under a focus area are coded at the focus quality and stored first (TOC permutation)
* Tile size 128–1024, effort 1–9, centre-first tile order, 2/4/8× downsampling, XMP / container boxes, level 10

Credit: the JPEG XL format and its reference implementation **libjxl** are by the JPEG XL Project Authors
(Google, Cloudinary and contributors), BSD-3-Clause — see `LICENSE-libjxl.txt`. Header layouts, predictors, the
Squeeze transform and entropy-coding conventions follow libjxl's source; the fast-lossless ideas come from
Luca Versari's `enc_fast_lossless`. Frax JXL is an independent re-implementation, not a port of their code.

**Encoder ▸ libjxl · WebAssembly** is still there: libjxl 0.13 itself, run through wasmtime (Apache-2.0), for VarDCT,
patches, photon noise and JPEG recompression. It also powers **Open JPEG XL…**.

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
