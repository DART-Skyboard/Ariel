# SPDX-License-Identifier: GPL-3.0-or-later AND BSD-3-Clause
# Frax JXL encoder — pure Python + numpy. Writes standard JPEG XL (ISO/IEC 18181) codestreams.
# Header/frame layout follows libjxl (© the JPEG XL Project Authors, BSD-3-Clause); see jxl/__init__.py.
from dataclasses import dataclass, field, replace

import numpy as np

from . import modular
from .bitwriter import BITS, BO, VAL, BitWriter, pack_signed_int

# colour presets: (colour space, white point, primaries, transfer function)  — enum values from libjxl cms
#   ColorSpace: 0 RGB, 1 Grey · WhitePoint: 1 D65 · Primaries: 1 sRGB, 9 BT.2100, 11 P3
#   TransferFunction: 1 BT.709, 8 linear, 13 sRGB, 16 PQ, 18 HLG · RenderingIntent: 0 perceptual, 1 relative …
COLOR_PRESETS = {
    "srgb": (1, 13), "linear": (1, 8), "p3": (11, 13), "rec2020": (9, 1), "pq": (9, 16), "hlg": (9, 18),
}


@dataclass
class ExtraChannel:
    """JPEG XL extra channel. type: 0 alpha, 1 depth, 2 spot colour, 3 selection mask, 4 black (CMYK), 5 CFA,
    6 thermal, 15 unknown, 16 optional.  Stored losslessly."""
    type: int = 1
    bits: int = 16
    float: bool = False
    name: str = ""
    premultiplied: bool = False
    spot: tuple = (0.0, 0.0, 0.0, 1.0)


@dataclass
class ImageOptions:
    width: int
    height: int
    bits: int = 8                     # 1..16 integer (lossless keeps every bit); 16 or 32 when float_samples
    float_samples: bool = False       # samples are IEEE half (bits=16) or single (bits=32) floats, stored losslessly
    grey: bool = False
    alpha: bool = False
    alpha_bits: int = 0               # 0 = same as colour
    alpha_premultiplied: bool = False
    alpha_float: bool = None          # None: same as the colour samples
    extra_channels: list = field(default_factory=list)   # [ExtraChannel] after alpha (depth, masks, spot colours…)
    color: str = "srgb"               # see COLOR_PRESETS
    intent: int = 1                   # 0 perceptual, 1 relative, 2 saturation, 3 absolute
    intensity_target: float = 0.0     # nits; 0 = default (255 SDR)
    orientation: int = 1
    animated: bool = False
    tps_num: int = 1000
    tps_den: int = 1
    loops: int = 0
    container: bool = False
    boxes: list = field(default_factory=list)   # [(type4, bytes, brotli_compress=False)]  e.g. ("xml ", xmp)


@dataclass
class FrameOptions:
    duration: int = 0                 # ticks (animation only)
    crop: tuple = None                # (x0, y0, w, h) for a layer placed on the canvas
    blend: int = 0                    # 0 replace, 1 add, 2 blend (alpha over), 4 mul
    blend_source: int = 0             # reference slot to blend onto
    save_as_reference: int = 0        # 0..3
    name: str = ""
    lossless: bool = True
    quality: float = 90.0             # lossy (modular): 0..100
    effort: int = 5                   # 1..9: spends more time searching predictors / contexts
    group_shift: int = 1              # tile size: 0=128, 1=256, 2=512, 3=1024
    progressive: bool = False         # squeeze pyramid even when lossless (lossy is always progressive)
    focus: list = None                # [(x, y, w, h)] pixel rects coded at focus_quality (lossy)
    focus_quality: float = 0.0
    focus_first: bool = False         # store the tiles around the first focus area first
    center: tuple = None              # (x, y): centre-first tile order around this point
    upsampling: int = 1               # 1, 2, 4, 8: code the frame at 1/n size, decoder upsamples


class Encoder:
    """Streaming JPEG XL encoder: add frames one by one (animation or layers), then finish()."""

    def __init__(self, opts: ImageOptions):
        self.o = opts
        self.parts = []
        self.frames = 0
        self._pending = None          # last frame is written when we know whether another follows
        hdr = BitWriter()
        self._image_header(hdr)
        hdr.zero_pad_to_byte()
        self.parts.append(hdr.tobytes())

    def extra_channels(self):
        o = self.o
        out = []
        if o.alpha:
            out.append(ExtraChannel(0, o.alpha_bits or o.bits,
                                    o.float_samples if o.alpha_float is None else o.alpha_float,
                                    premultiplied=o.alpha_premultiplied))
        return out + list(o.extra_channels)

    # ── image header ───────────────────────────────────────────────────────────────────────────────
    def _image_header(self, bw):
        o = self.o
        bw.write(16, 0x0AFF)                                     # signature FF 0A
        # SizeHeader
        small = o.width % 8 == 0 and o.height % 8 == 0 and o.width <= 256 and o.height <= 256
        bw.bool(small)
        size_dists = (BO(9, 1), BO(13, 1), BO(18, 1), BO(30, 1))
        if small:
            bw.write(5, o.height // 8 - 1)
        else:
            bw.u32(o.height, size_dists)
        bw.write(3, 0)                                           # ratio 0: explicit width
        if small:
            bw.write(5, o.width // 8 - 1)
        else:
            bw.u32(o.width, size_dists)
        # ImageMetadata
        bw.bool(False)                                           # all_default
        extra_fields = o.orientation != 1 or o.animated or (o.intensity_target > 0)
        bw.bool(extra_fields)
        if extra_fields:
            bw.write(3, o.orientation - 1)
            bw.bool(False)                                       # have_intrinsic_size
            bw.bool(False)                                       # have_preview
            bw.bool(o.animated)
            if o.animated:
                bw.u32(o.tps_num, (VAL(100), VAL(1000), BO(10, 1), BO(30, 1)))
                bw.u32(o.tps_den, (VAL(1), VAL(1001), BO(8, 1), BO(10, 1)))
                bw.u32(o.loops, (VAL(0), BITS(3), BITS(16), BITS(32)))
                bw.bool(False)                                   # have_timecodes
        self._bit_depth(bw, o.bits, o.float_samples)
        small = o.bits <= 12 and not o.float_samples and all(e.bits <= 12 and not e.float for e in self.extra_channels())
        bw.bool(small)                                           # modular_16_bit_buffer_sufficient
        ecs = self.extra_channels()
        bw.u32(len(ecs), (VAL(0), VAL(1), BO(4, 2), BO(12, 1)))
        for ec in ecs:
            if ec.type == 0 and ec.bits == 8 and not ec.float and not ec.premultiplied and not ec.name:
                bw.bool(True)                                    # all_default: 8-bit straight alpha
                continue
            bw.bool(False)
            bw.enum(ec.type)
            self._bit_depth(bw, ec.bits, ec.float)
            bw.u32(0, (VAL(0), VAL(3), VAL(4), BO(3, 1)))        # dim_shift
            name = ec.name.encode("utf-8")[:1071]
            bw.u32(len(name), (VAL(0), BITS(4), BO(5, 16), BO(10, 48)))
            for ch in name:
                bw.write(8, ch)
            if ec.type == 0:
                bw.bool(ec.premultiplied)
            elif ec.type == 2:                                   # spot colour: linear RGB + solidity
                for v in ec.spot:
                    bw.f16(v)
            elif ec.type == 5:
                bw.u32(1, (VAL(1), BITS(2), BO(4, 3), BO(8, 19)))   # CFA channel
        bw.bool(False)                                           # xyb_encoded = false (modular, original space)
        self._color_encoding(bw)
        if extra_fields:                                         # tone mapping
            if o.intensity_target > 0:
                bw.bool(False)
                bw.f16(o.intensity_target)
                bw.f16(0.0)                                      # min_nits
                bw.bool(False)                                   # relative_to_max_display
                bw.f16(0.0)                                      # linear_below
            else:
                bw.bool(True)
        bw.u64(0)                                                # no extensions
        bw.bool(True)                                            # default CustomTransformData

    @staticmethod
    def _bit_depth(bw, bits, fp=False):
        bw.bool(fp)
        if not fp:
            bw.u32(bits, (VAL(8), VAL(10), VAL(12), BO(6, 1)))
        else:                                                    # half: 5 exponent bits, single: 8
            bw.u32(bits, (VAL(32), VAL(16), VAL(24), BO(6, 1)))
            bw.write(4, (5 if bits == 16 else 8) - 1)

    def _color_encoding(self, bw):
        o = self.o
        prim, tf = COLOR_PRESETS[o.color]
        if o.color == "srgb" and not o.grey and o.intent == 1:
            bw.bool(True)                                        # all_default = sRGB, relative
            return
        bw.bool(False)                                           # all_default
        bw.bool(False)                                           # want_icc
        bw.enum(1 if o.grey else 0)                              # colour space
        bw.enum(1)                                               # white point D65
        if not o.grey:
            bw.enum(prim)
        bw.bool(False)                                           # have_gamma
        bw.enum(tf)
        bw.enum(o.intent)

    # ── frames ─────────────────────────────────────────────────────────────────────────────────────
    def add_frame(self, planes, fo: FrameOptions = None):
        """planes: list of 2-D int arrays (H×W) in channel order: colour (1 or 3), then alpha.  Values are the
        integer samples at the image bit depth."""
        fo = fo or FrameOptions()
        h, w = planes[0].shape
        partial = fo.crop is not None and (fo.crop[0] > 0 or fo.crop[1] > 0 or fo.crop[0] + w < self.o.width
                                           or fo.crop[1] + h < self.o.height)
        if self._pending is not None and (partial or fo.blend != 0):
            # this frame paints over the previous one: make sure the previous one is kept in a reference slot
            # (a frame with a duration is only kept when save_as_reference != 0)
            prev = self._pending[1]
            if prev.save_as_reference == 0 and (self.o.animated and prev.duration > 0):
                slot = fo.blend_source or 1
                self._pending = (self._pending[0], replace(prev, save_as_reference=slot))
                fo = replace(fo, blend_source=slot)
        if self._pending is not None:
            self.parts.append(self._encode_frame(*self._pending, is_last=False))
        self._pending = (planes, fo)
        self.frames += 1

    def finish(self):
        if self._pending is None:
            raise ValueError("no frames")
        self.parts.append(self._encode_frame(*self._pending, is_last=True))
        self._pending = None
        stream = b"".join(self.parts)
        return self._wrap(stream) if (self.o.container or self.o.boxes) else stream

    def _frame_header(self, bw, fo, w, h, is_last):
        o = self.o
        n_ec = len(self.extra_channels())
        bw.bool(False)                                           # all_default
        bw.u32(0, (VAL(0), VAL(1), VAL(2), VAL(3)))              # frame type: regular
        bw.bool(True)                                            # modular
        bw.u64(0)                                                # flags
        bw.bool(False)                                           # not YCbCr (xyb_encoded is false)
        bw.u32(fo.upsampling, (VAL(1), VAL(2), VAL(4), VAL(8)))  # upsampling (decoder's default 2/4/8× filter)
        for _ in range(n_ec):
            bw.u32(fo.upsampling, (VAL(1), VAL(2), VAL(4), VAL(8)))
        bw.write(2, fo.group_shift)
        bw.u32(1, (VAL(1), VAL(2), VAL(3), BO(3, 4)))            # passes
        crop = fo.crop
        bw.bool(crop is not None)                                # custom size / origin
        partial = False
        if crop is not None:
            enc = (BITS(8), BO(11, 256), BO(14, 2304), BO(30, 18688))
            x0, y0, cw, ch = crop
            bw.u32(pack_signed_int(x0), enc)
            bw.u32(pack_signed_int(y0), enc)
            bw.u32(cw, enc)
            bw.u32(ch, enc)
            partial = x0 > 0 or y0 > 0 or cw + x0 < o.width or ch + y0 < o.height
        self._blending(bw, fo, n_ec, partial)
        for _ in range(n_ec):
            self._blending(bw, fo, n_ec, partial)
        if o.animated:
            bw.u32(fo.duration, (VAL(0), VAL(1), BITS(8), BITS(32)))
        bw.bool(is_last)
        save_ref = 0
        if not is_last:
            save_ref = fo.save_as_reference
            if not o.animated or fo.duration == 0:
                save_ref = save_ref or 0
            bw.u32(save_ref, (VAL(0), VAL(1), VAL(2), VAL(3)))
        can_ref = (not is_last) and ((fo.duration == 0 if o.animated else True) or save_ref != 0)
        if can_ref and fo.blend == 0 and not partial:
            bw.bool(False)                                       # save_before_color_transform
        name = fo.name.encode("utf-8")[:1071]
        bw.u32(len(name), (VAL(0), BITS(4), BO(5, 16), BO(10, 48)))
        for c in name:
            bw.write(8, c)
        # loop filter: modular → no gaborish, no EPF
        bw.bool(False)                                           # loop filter all_default
        bw.bool(False)                                           # gab
        bw.write(2, 0)                                           # epf iterations
        bw.u64(0)                                                # loop filter extensions
        bw.u64(0)                                                # frame header extensions

    @staticmethod
    def _blending(bw, fo, n_ec, partial):
        mode = fo.blend
        bw.u32(mode, (VAL(0), VAL(1), VAL(2), BO(2, 3)))
        if n_ec > 0 and mode in (2, 3):
            bw.u32(0, (VAL(0), VAL(1), VAL(2), BO(3, 3)))        # alpha channel 0
        if (n_ec > 0 and mode in (2, 3)) or mode == 4:
            bw.bool(False)                                       # clamp
        if mode != 0 or partial:
            bw.u32(fo.blend_source, (VAL(0), VAL(1), VAL(2), VAL(3)))

    def _encode_frame(self, planes, fo, is_last):
        o = self.o
        h, w = planes[0].shape
        if fo.crop is None and (w != o.width or h != o.height):
            raise ValueError("frame is %dx%d but the image is %dx%d (use crop)" % (w, h, o.width, o.height))
        if fo.upsampling > 1:
            planes = [downsample(p, fo.upsampling, o) for p in planes]
        hdr = BitWriter()
        self._frame_header(hdr, fo, w, h, is_last)
        sections, layout = modular.encode_frame_sections(planes, o, fo)   # one bytes object per TOC entry
        toc = hdr                                                 # the TOC follows the frame header bit-for-bit
        order = self._group_order(fo, layout, len(sections))
        if order is None:
            toc.bool(False)                                       # sections in natural order
        else:
            toc.bool(True)
            write_permutation(toc, order)
        toc.zero_pad_to_byte()
        file_order = list(range(len(sections))) if order is None else order
        for i in file_order:
            toc.u32(len(sections[i]), (BITS(10), BO(14, 1024), BO(22, 17408), BO(30, 4211712)))
        toc.zero_pad_to_byte()
        return toc.tobytes() + b"".join(sections[i] for i in file_order)

    @staticmethod
    def _group_order(fo, L, n):
        """Centre-first group order (libjxl's group_order=1): tiles nearest the centre (or the focus area) are
        stored first so they show first while the file streams in."""
        c = fo.center
        if c is None and fo.focus and fo.focus_first:
            x, y, w, h = fo.focus[0]
            c = (x + w / 2, y + h / 2)
        if c is None or L.single:
            return None
        head = 2 + L.num_dc                                       # LfGlobal, LfGroups, HfGlobal stay first
        gd = L.gdim
        d = [((((g % L.gx) + 0.5) * gd - c[0]) ** 2 + (((g // L.gx) + 0.5) * gd - c[1]) ** 2, g)
             for g in range(L.num_groups)]
        return list(range(head)) + [head + g for _, g in sorted(d)]

    # ── ISOBMFF container (needed for metadata boxes) ──────────────────────────────────────────────
    def _wrap(self, stream):
        import struct

        def box(t, data):
            return struct.pack(">I", 8 + len(data)) + t + data
        out = box(b"JXL ", b"\r\n\x87\n") + box(b"ftyp", b"jxl \x00\x00\x00\x00jxl ")
        for t, data, _compress in self.o.boxes:
            out += box(t.encode("ascii")[:4].ljust(4), bytes(data))
        out += box(b"jxlc", stream)
        return out


def downsample(p, k, o):
    """k×k box average (rounded) — the frame is then coded at 1/k size and upsampled by the decoder."""
    if getattr(o, "float_samples", False):
        raise ValueError("downsampling needs integer samples")
    h, w = p.shape
    H, W = -(-h // k), -(-w // k)
    q = np.pad(p.astype(np.float64), ((0, H * k - h), (0, W * k - w)), mode="edge")
    return np.round(q.reshape(H, k, W, k).mean(axis=(1, 3))).astype(np.int64)


def write_permutation(bw, file_order):
    """TOC permutation (toc.cc / coeff_order.cc): logical section i is stored at file position perm[i]; the
    permutation is sent as a Lehmer code with an 8-context prefix-coded stream."""
    import numpy as np
    from .entropy import CodeTable, PrefixCode, hybrid_uint_000, pack_symbols, write_histograms
    n = len(file_order)
    perm = [0] * n
    for pos, i in enumerate(file_order):
        perm[i] = pos
    lehmer = [sum(1 for j in range(i + 1, n) if perm[j] < perm[i]) for i in range(n)]
    end = n
    while end > 0 and lehmer[end - 1] == 0:
        end -= 1

    def ctx(v):
        return min(int(v).bit_length(), 7)                       # CoeffOrderContext: token of HybridUint(0,0,0)
    vals, ctxs, last = [end], [ctx(n)], 0
    for i in range(end):
        vals.append(lehmer[i])
        ctxs.append(ctx(last))
        last = lehmer[i]
    t, nb, ex = hybrid_uint_000(np.array(vals, np.uint64))
    code = PrefixCode(np.bincount(t))
    write_histograms(bw, [0] * 8, [code])
    w, nbits = pack_symbols(t, nb, ex, CodeTable([code]), np.zeros(t.size, np.int64))
    bw.append_segment(w, nbits)


def float_to_samples(a, bits=32):
    """float array → the integer sample patterns JPEG XL stores for lossless float (half or single)."""
    a = np.asarray(a)
    if bits == 16:
        return a.astype(np.float16).view(np.uint16).astype(np.int64)
    return a.astype(np.float32).view(np.int32).astype(np.int64)


def encode_image(rgba, bits=8, **kw):
    """Convenience: one still image from an H×W×C array (C = 1, 2, 3, 4): integers at `bits`, or floats
    (stored losslessly as half when bits=16, else single precision)."""
    a = np.asarray(rgba)
    if a.dtype.kind == "f":
        bits = 16 if bits == 16 else 32
        kw["float_samples"] = True
        a = float_to_samples(a, bits)
    if a.ndim == 2:
        a = a[:, :, None]
    c = a.shape[2]
    grey, alpha = c in (1, 2), c in (2, 4)
    enc = Encoder(ImageOptions(width=a.shape[1], height=a.shape[0], bits=bits, grey=grey, alpha=alpha,
                               **{k: v for k, v in kw.items() if k in ImageOptions.__dataclass_fields__}))
    fo = FrameOptions(**{k: v for k, v in kw.items() if k in FrameOptions.__dataclass_fields__})
    enc.add_frame([a[:, :, i].astype(np.int64) for i in range(c)], fo)
    return enc.finish()
