# SPDX-License-Identifier: GPL-3.0-or-later
# Frax JXL pure-Python engine: the same Encoder interface as engine.py (libjxl in WebAssembly), backed by the
# Python JPEG XL encoder in jxl/.  Blender's render line (stills, EEVEE / Cycles animations, focus areas) talks
# to whichever engine the scene picks; this one needs nothing but Python and numpy.
import numpy as np

from .engine import ID
from .jxl.encoder import Encoder as _JXL
from .jxl.encoder import FrameOptions, ImageOptions, float_to_samples

COLOR_NAMES = {0: "srgb", 1: "linear", 2: "p3", 3: "pq", 4: "hlg", 5: "rec2020"}
GROUP_SHIFT_DEFAULT = 1
# libjxl's effort scale → this encoder's (7, the default, ≈ 1–3 s per 1080p frame; 9–10 search much harder)
EFFORT_MAP = {1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 7, 10: 9}


def distance_to_quality(d):
    """Inverse of libjxl's JxlEncoderDistanceFromQuality (the scene stores both)."""
    if d is None or d <= 0:
        return 100.0
    if d <= 6.4:
        return max(30.0, 100.0 - (d - 0.1) / 0.09)
    lo, hi = 0.0, 30.0                                        # quadratic branch below q=30
    for _ in range(40):
        m = (lo + hi) / 2
        if 53.0 / 3000.0 * m * m - 23.0 / 20.0 * m + 25.0 > d:
            lo = m
        else:
            hi = m
    return hi


class Encoder:
    """Drop-in for engine.Encoder.  Pixels: (H, W, C) uint8 / uint16 (full-range 16-bit, rescaled to the chosen
    depth) or float32 (stored losslessly as half / single float, or as 16-bit integers when lossy)."""

    def __init__(self, width, height, bits=8, exp_bits=0, channels=3, alpha_bits=0, alpha_exp=0, premultiplied=False,
                 animated=False, tps_num=1000, tps_den=1, loops=0, original_profile=False, intensity_target=0.0,
                 orientation=1, color=0, intent=0, container=-1, level=0, boxes=(), cache_dir=None, lossy_float=False,
                 **_ignored):
        self.w, self.h = int(width), int(height)
        self.bits, self.exp = int(bits), int(exp_bits)
        self.float_in = self.exp > 0
        if self.float_in and lossy_float:
            # lossy JPEG XL is integer-sample here: store display / PQ / HLG values as 16-bit
            self.float_in, self.bits = False, 16
            self._float_to_int = True
        else:
            self._float_to_int = False
        self.grey = int(channels) == 1
        self.alpha = int(alpha_bits) > 0
        self.alpha_bits = int(alpha_bits) if self.alpha else 0
        self.alpha_float = bool(alpha_exp) and not self._float_to_int
        if self._float_to_int and self.alpha:
            self.alpha_bits = 16 if self.alpha_bits > 8 else self.alpha_bits
        boxes = [(t, bytes(d), False) for t, d, _c in (boxes or [])]
        lvl = int(level)
        if lvl == 0 and (self.bits > 16 or (self.alpha and self.alpha_bits > 16)):
            lvl = 10
        if lvl == 10:
            boxes = [("jxll", bytes([10]), False)] + boxes
        self.enc = _JXL(ImageOptions(
            width=self.w, height=self.h, bits=self.bits, float_samples=self.float_in, grey=self.grey, alpha=self.alpha,
            alpha_bits=self.alpha_bits, alpha_float=self.alpha_float, alpha_premultiplied=bool(premultiplied),
            color=COLOR_NAMES.get(int(color), "srgb"),
            intent=int(intent), intensity_target=float(intensity_target or 0.0), orientation=int(orientation or 1),
            animated=bool(animated), tps_num=int(tps_num), tps_den=int(tps_den), loops=int(loops),
            container=int(container) == 1 or bool(boxes), boxes=boxes))
        self.frames = 0

    # ── pixels → integer sample planes ──
    def _planes(self, a):
        a = np.asarray(a)
        if a.ndim == 2:
            a = a[:, :, None]
        ncol = 1 if self.grey else 3
        col, alp = a[..., :ncol], (a[..., ncol] if self.alpha and a.shape[2] > ncol else None)
        planes = [self._colour(col[..., i]) for i in range(ncol)]
        if self.alpha:
            if alp is None:
                alp = np.ones(a.shape[:2], np.float32) if a.dtype.kind == "f" else np.full(a.shape[:2], np.iinfo(a.dtype).max)
            planes.append(self._alpha(alp))
        return planes

    def _colour(self, p):
        if self.float_in:
            return float_to_samples(p, 16 if self.bits == 16 else 32)
        return _to_int(p, self.bits)

    def _alpha(self, p):
        if self.alpha_float:
            return float_to_samples(p, 16 if self.alpha_bits == 16 else 32)
        return _to_int(p, self.alpha_bits)

    def add_frame(self, pixels, opts, duration=0, crop=None, blend=0, name="", focus=None, focus_quality=0.0,
                  focus_first=False):
        ints = opts.get("ints") or {}

        def opt(k, default=-1):
            v = ints.get(ID[k], -1)
            return default if v is None or int(v) == -1 else int(v)
        lossless = bool(opts.get("lossless"))
        quality = 100.0 if lossless else distance_to_quality(opts.get("distance"))
        gs = opt("MODULAR_GROUP_SIZE", GROUP_SHIFT_DEFAULT)
        center = None
        if opt("GROUP_ORDER", 0) == 1:
            cx, cy = opt("CENTER_X"), opt("CENTER_Y")
            center = (cx if cx >= 0 else self.w // 2, cy if cy >= 0 else self.h // 2)
        progressive = any(opt(k, 0) > 0 for k in ("PROGRESSIVE_DC", "PROGRESSIVE_AC", "QPROGRESSIVE_AC", "RESPONSIVE"))
        ups = opt("RESAMPLING", 1)
        if self.float_in or ups not in (1, 2, 4, 8):
            ups = 1
        fo = FrameOptions(duration=int(duration), crop=tuple(crop) if crop else None, blend=int(blend), name=name or "",
                          lossless=lossless, quality=quality, effort=EFFORT_MAP.get(opt("EFFORT", 7), 5),
                          group_shift=max(0, min(3, gs)), progressive=progressive,
                          focus=list(focus) if focus else None, focus_quality=float(focus_quality or 0),
                          focus_first=bool(focus_first), center=center, upsampling=ups)
        self.enc.add_frame(self._planes(pixels), fo)
        self.frames += 1

    def finish(self):
        return self.enc.finish()

    def close(self):
        pass


def _to_int(p, bits):
    """uint8 / uint16 (full range) / float 0..1 → integers at `bits`."""
    top = (1 << bits) - 1
    if p.dtype.kind == "f":
        return np.round(np.clip(p.astype(np.float64), 0.0, 1.0) * top).astype(np.int64)
    src = np.iinfo(p.dtype).max
    if src == top:
        return p.astype(np.int64)
    return ((p.astype(np.int64) * top * 2 + src) // (2 * src)).astype(np.int64)
