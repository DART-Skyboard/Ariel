# SPDX-License-Identifier: GPL-3.0-or-later
# Thread-safe frame readers (pure numpy, no bpy): TIFF (8/16-bit, none / deflate / LZW-free, predictor 1–2)
# and OpenEXR scanline (half / float, NONE / ZIPS / ZIP compression). Used while a render is still running,
# where Blender's own image API must not be touched from other threads.
import struct
import zlib

import numpy as np


def read_any(path):
    """→ (H×W×4 float32, is_linear)"""
    with open(path, "rb") as f:
        head = f.read(4)
    if head[:4] == b"\x76\x2f\x31\x01":
        return read_exr(path), True
    if head[:2] in (b"II", b"MM"):
        return read_tiff(path), False
    raise ValueError("unsupported frame file for streaming: " + path)


# ── TIFF ──────────────────────────────────────────────────────────────────────────────────────────────────────
def read_tiff(path):
    with open(path, "rb") as f:
        b = f.read()
    e = "<" if b[:2] == b"II" else ">"
    (ifd,) = struct.unpack(e + "I", b[4:8])
    (n,) = struct.unpack(e + "H", b[ifd:ifd + 2])
    tags = {}
    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 16: 8}
    for i in range(n):
        tag, typ, cnt = struct.unpack(e + "HHI", b[ifd + 2 + i * 12: ifd + 10 + i * 12])
        raw = b[ifd + 10 + i * 12: ifd + 14 + i * 12]
        size = sizes.get(typ, 1) * cnt
        data = raw if size <= 4 else b[struct.unpack(e + "I", raw)[0]:][:size]
        fmt = {1: "B", 3: "H", 4: "I"}.get(typ)
        tags[tag] = list(struct.unpack(e + fmt * cnt, data[:sizes[typ] * cnt])) if fmt else data
    w, h = tags[256][0], tags[257][0]
    bits = tags.get(258, [8])[0]
    spp = tags.get(277, [1])[0]
    comp = tags.get(259, [1])[0]
    pred = tags.get(317, [1])[0]
    if tags.get(284, [1])[0] != 1:
        raise ValueError("planar TIFF not supported")
    offs, cnts = tags[273], tags[279]
    raw = bytearray()
    for o, c in zip(offs, cnts):
        chunk = b[o:o + c]
        if comp in (8, 32946):
            chunk = zlib.decompress(chunk)
        elif comp != 1:
            raise ValueError("TIFF compression %d not supported (use None or Deflate)" % comp)
        raw += chunk
    dt = np.dtype(e + ("u2" if bits == 16 else "u1"))
    a = np.frombuffer(bytes(raw), dtype=dt, count=w * h * spp).reshape(h, w, spp)
    if pred == 2:
        a = np.cumsum(a.astype(np.uint32), axis=1).astype(dt)
    top = 65535.0 if bits == 16 else 255.0
    a = a.astype(np.float32) / top
    out = np.ones((h, w, 4), np.float32)
    if spp >= 3:
        out[..., :3] = a[..., :3]
    else:
        out[..., :3] = a[..., :1]
    if spp in (2, 4):
        out[..., 3] = a[..., -1]
    return out


# ── OpenEXR (scanline) ────────────────────────────────────────────────────────────────────────────────────────
def _unpredict_exr(d):
    """ZIP/ZIPS: undo the byte predictor, then de-interleave the two halves."""
    t = np.frombuffer(d, np.uint8).astype(np.int32)
    t = (np.cumsum(t - 128 * (np.arange(t.size) > 0)) ) & 0xFF   # predictor: t[i] = t[i-1] + d[i] - 128
    t = t.astype(np.uint8)
    half = (t.size + 1) // 2
    out = np.empty_like(t)
    out[0::2] = t[:half]
    out[1::2] = t[half:]
    return out.tobytes()


def read_exr(path):
    with open(path, "rb") as f:
        b = f.read()
    p = 8
    hdr = {}
    while b[p] != 0:
        q = b.index(b"\0", p)
        name = b[p:q].decode()
        p = q + 1
        q = b.index(b"\0", p)
        typ = b[p:q].decode()
        p = q + 1
        (size,) = struct.unpack("<i", b[p:p + 4])
        p += 4
        hdr[name] = (typ, b[p:p + size])
        p += size
    p += 1
    chans = []
    cl = hdr["channels"][1]
    i = 0
    while cl[i] != 0:
        q = cl.index(b"\0", i)
        nm = cl[i:q].decode()
        ptype, = struct.unpack("<i", cl[q + 1:q + 5])
        chans.append((nm, ptype))
        i = q + 17
    x0, y0, x1, y1 = struct.unpack("<iiii", hdr["dataWindow"][1])
    w, h = x1 - x0 + 1, y1 - y0 + 1
    comp = hdr["compression"][1][0]
    lines_per_block = {0: 1, 2: 1, 3: 16}.get(comp)
    if lines_per_block is None:
        raise ValueError("EXR compression %d not supported (use None, ZIPS or ZIP)" % comp)
    nblocks = (h + lines_per_block - 1) // lines_per_block
    offsets = struct.unpack("<%dQ" % nblocks, b[p:p + 8 * nblocks])
    sz = {0: 4, 1: 2, 2: 4}
    dts = {0: np.uint32, 1: np.float16, 2: np.float32}
    planes = {nm: np.zeros((h, w), np.float32) for nm, _ in chans}
    for off in offsets:
        y, n = struct.unpack("<ii", b[off:off + 8])
        data = b[off + 8: off + 8 + n]
        rows = min(lines_per_block, y1 - y + 1)
        expect = sum(sz[t] for _, t in chans) * w * rows
        if comp in (2, 3) and n < expect:
            data = _unpredict_exr(zlib.decompress(data))
        pos = 0
        for r in range(rows):
            for nm, t in chans:
                cnt = w * sz[t]
                planes[nm][y - y0 + r] = np.frombuffer(data[pos:pos + cnt], dtype=dts[t]).astype(np.float32)
                pos += cnt
    def pick(*names):
        for nm in names:
            for c in planes:
                if c == nm or c.endswith("." + nm):
                    return planes[c]
        return None
    out = np.ones((h, w, 4), np.float32)
    for k, nm in enumerate(("R", "G", "B")):
        v = pick(nm)
        if v is None:
            v = pick("Y")
        if v is not None:
            out[..., k] = v
    a = pick("A")
    if a is not None:
        out[..., 3] = a
    return out
