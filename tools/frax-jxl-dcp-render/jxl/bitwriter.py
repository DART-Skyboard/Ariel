# SPDX-License-Identifier: GPL-3.0-or-later AND BSD-3-Clause
# Bit writing for JPEG XL (LSB-first, like libjxl's BitWriter) and the field codings of the JPEG XL headers
# (U32 / U64 / Bool / Enum / F16, as defined by libjxl's fields.cc).
import struct

import numpy as np


class BitWriter:
    """LSB-first bit writer (like libjxl's BitWriter). Small header fields collect in a Python int; bulk entropy
    coded data arrives as packed uint64 segments (see entropy.pack_symbols) and is spliced in at any bit offset."""

    def __init__(self):
        self.segments = []        # [(uint64 words, nbits)]
        self._acc = 0
        self._n = 0
        self._total = 0

    def write(self, nbits, value):
        value = int(value)
        if nbits and (value >> nbits):
            raise ValueError("value %d does not fit in %d bits" % (value, nbits))
        if value < 0:
            raise ValueError("negative value")
        self._acc |= value << self._n
        self._n += nbits
        self._total += nbits
        if self._n >= 4096:
            self._flush()

    def _flush(self):
        if self._n:
            nw = (self._n + 63) // 64
            words = np.frombuffer(self._acc.to_bytes(nw * 8, "little"), dtype="<u8").astype(np.uint64)
            self.segments.append((words, self._n))
            self._acc, self._n = 0, 0

    def append_segment(self, words, nbits):
        """Packed bits: uint64 words (LSB-first), nbits valid bits."""
        if nbits:
            self._flush()
            self.segments.append((words, int(nbits)))
            self._total += int(nbits)

    def append_writer(self, other):
        other._flush()
        for w, n in other.segments:
            self.append_segment(w, n)

    @property
    def nbits(self):
        return self._total

    def zero_pad_to_byte(self):
        r = self._total % 8
        if r:
            self.write(8 - r, 0)

    def tobytes(self):
        self._flush()
        total = self._total
        out = np.zeros((total + 63) // 64 + 1, np.uint64)
        pos = 0
        for words, n in self.segments:
            nw = (n + 63) // 64
            w = words[:nw].copy()
            if n % 64:
                w[-1] &= np.uint64((1 << (n % 64)) - 1)
            i, o = pos >> 6, pos & 63
            if o == 0:
                out[i:i + nw] |= w
            else:
                out[i:i + nw] |= w << np.uint64(o)
                out[i + 1:i + 1 + nw] |= w >> np.uint64(64 - o)
            pos += n
        return out.astype("<u8").tobytes()[:(total + 7) // 8]

    # ── JPEG XL field codings ──────────────────────────────────────────────────────
    def bool(self, v):
        self.write(1, 1 if v else 0)

    def u32(self, value, dists):
        """dists: 4 tuples ('val', v) | ('bits', n) | ('bo', n, offset). Picks the first distribution that fits."""
        for sel, d in enumerate(dists):
            if d[0] == "val" and value == d[1]:
                self.write(2, sel)
                return
        for sel, d in enumerate(dists):
            if d[0] == "bits" and 0 <= value < (1 << d[1]):
                self.write(2, sel)
                self.write(d[1], value)
                return
            if d[0] == "bo" and d[2] <= value < d[2] + (1 << d[1]):
                self.write(2, sel)
                self.write(d[1], value - d[2])
                return
        raise ValueError("value %d not representable in U32 %r" % (value, dists))

    def u64(self, value):
        if value == 0:
            self.write(2, 0)
        elif value <= 16:
            self.write(2, 1)
            self.write(4, value - 1)
        elif value <= 272:
            self.write(2, 2)
            self.write(8, value - 17)
        else:
            self.write(2, 3)
            self.write(12, value & 0xFFF)
            value >>= 12
            shift = 12
            while value:
                self.write(1, 1)
                if shift == 60:
                    self.write(4, value & 0xF)
                    value = 0
                    break
                self.write(8, value & 0xFF)
                value >>= 8
                shift += 8
            if shift != 60:
                self.write(1, 0)

    def enum(self, value):
        self.u32(value, ENUM)

    def f16(self, value):
        (h,) = struct.unpack("<H", np.float16(value).tobytes())
        self.write(16, h)


VAL = lambda v: ("val", v)            # noqa: E731
BITS = lambda n: ("bits", n)          # noqa: E731
BO = lambda n, o: ("bo", n, o)        # noqa: E731
ENUM = (VAL(0), VAL(1), BO(4, 2), BO(6, 18))


def pack_signed(v):
    v = np.asarray(v, dtype=np.int64)
    return np.where(v >= 0, v << 1, ((-v) << 1) - 1).astype(np.uint64)


def pack_signed_int(v):
    return (v << 1) if v >= 0 else ((-v) << 1) - 1
