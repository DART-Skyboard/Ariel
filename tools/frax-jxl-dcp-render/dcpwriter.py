# SPDX-License-Identifier: GPL-3.0-or-later
# Built-in Digital Cinema Package writer (no other install): SMPTE DCP = JPEG 2000 picture + 24-bit PCM sound,
# each frame-wrapped in an MXF OP-Atom track file (SMPTE ST 429-4 / ST 382 / ST 377-1, MCA labels ST 377-4),
# plus CPL / PKL / ASSETMAP / VOLINDEX (ST 429-7, 429-8, 429-9, CPL metadata ST 429-16).
# The JPEG 2000 codestreams come from Blender's own OpenJPEG writer with its DCI cinema profile; this module does
# the colour (sRGB → X'Y'Z'), the fit into the DCI container, the MXF wrapping and the XML.
# The MXF layout mirrors the reference asdcplib (CineCert, BSD) writer byte-for-byte in structure.
import base64
import datetime
import hashlib
import os
import struct
import uuid
import wave

import numpy as np

# ── colour: display sRGB → DCI X'Y'Z' (12-bit, gamma 2.6, 48 cd/m² peak white of 52.37 normalisation) ─────────
M_SRGB_TO_XYZ = np.array([[0.4124564, 0.3575761, 0.1804375],
                          [0.2126729, 0.7151522, 0.0721750],
                          [0.0193339, 0.1191920, 0.9503041]], np.float64)


def srgb_to_xyz12(rgb, linear=False):
    """rgb: H×W×3 display-referred sRGB in 0..1 (or scene-linear Rec.709 when linear) → H×W×3 X'Y'Z' code
    values / 4095 (what the JPEG 2000 writer stores)."""
    v = np.clip(rgb.astype(np.float32), 0.0, None if linear else 1.0)
    lin = v if linear else np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4).astype(np.float32)
    xyz = lin @ M_SRGB_TO_XYZ.T.astype(np.float32)
    xyz = np.clip(xyz * (48.0 / 52.37), 0.0, 1.0)
    return np.round(xyz ** (1.0 / 2.6) * 4095.0) / 4095.0


def fit_into(img, w, h):
    """Scale an H×W×C image to fit w×h keeping its aspect (area filter down, linear up), centred on black."""
    ih, iw = img.shape[:2]
    if (iw, ih) == (w, h):
        return img
    s = min(w / iw, h / ih)
    nw, nh = max(1, int(round(iw * s))), max(1, int(round(ih * s)))
    out = np.zeros((h, w, img.shape[2]), np.float32)
    r = _resize(img.astype(np.float32), nw, nh)
    x0, y0 = (w - nw) // 2, (h - nh) // 2
    out[y0:y0 + nh, x0:x0 + nw] = r
    return out


def _resize_axis(a, n, axis):
    m = a.shape[axis]
    if m == n:
        return a
    if n < m:                                                  # area average
        edges = np.linspace(0, m, n + 1)
        c = np.cumsum(np.insert(np.moveaxis(a, axis, 0), 0, 0, axis=0), axis=0)

        def at(x):
            i = np.clip(np.floor(x).astype(int), 0, m - 1)
            f = (x - i).reshape((-1,) + (1,) * (c.ndim - 1))
            return c[i] + (c[i + 1] - c[i]) * f
        r = (at(edges[1:]) - at(edges[:-1])) / (m / n)
        return np.moveaxis(r, 0, axis)
    x = (np.arange(n) + 0.5) * m / n - 0.5                     # linear
    i0 = np.clip(np.floor(x).astype(int), 0, m - 1)
    i1 = np.clip(i0 + 1, 0, m - 1)
    f = np.clip(x - i0, 0, 1)
    aa = np.moveaxis(a, axis, 0)
    f = f.reshape((-1,) + (1,) * (aa.ndim - 1))
    return np.moveaxis(aa[i0] * (1 - f) + aa[i1] * f, 0, axis)


def _resize(a, w, h):
    return _resize_axis(_resize_axis(a, h, 0), w, 1)


# ── JPEG 2000 codestream header (for the MXF picture sub-descriptor) ────────────────────────────────────────────
def j2k_params(cs):
    if cs[:4] != b"\xff\x4f\xff\x51":
        raise ValueError("not a JPEG 2000 codestream")
    out, i = {}, 2
    while i + 4 <= len(cs):
        m, L = struct.unpack(">HH", cs[i:i + 4])
        body = cs[i + 4:i + 2 + L]
        if m == 0xFF51:
            rsiz, xs, ys, xo, yo, xt, yt, xto, yto, c = struct.unpack(">HIIIIIIIIH", body[:36])
            out.update(rsiz=rsiz, xsiz=xs, ysiz=ys, xosiz=xo, yosiz=yo, xtsiz=xt, ytsiz=yt, xtosiz=xto, ytosiz=yto,
                       csiz=c, comps=body[36:36 + 3 * c])
        elif m == 0xFF52:
            out["cod"] = body
        elif m == 0xFF5C:
            out["qcd"] = body
        elif m == 0xFF90:
            break
        i += 2 + L
    return out


# ── KLV / MXF primitives ─────────────────────────────────────────────────────────────────────────────────────
def UL(h):
    return bytes.fromhex(h.replace(".", ""))


def ber4(n):
    return b"\x83" + n.to_bytes(3, "big")


def klv(key, value):
    return key + ber4(len(value)) + value


def u8(v):
    return struct.pack(">B", v)


def u16(v):
    return struct.pack(">H", v)


def u32(v):
    return struct.pack(">I", v)


def u64(v):
    return struct.pack(">Q", v)


def i64(v):
    return struct.pack(">q", v)


def rational(n, d):
    return u32(n) + u32(d)


def utf16(s):
    return s.encode("utf-16-be")


def batch(items, size=16):
    return u32(len(items)) + u32(size) + b"".join(items)


def timestamp(t):
    return u16(t.year) + bytes([t.month, t.day, t.hour, t.minute, t.second, 0])


def umid(material):
    return UL("060a2b34.01010105.01010f20.13000000") + material


K = {
    "header": "060e2b34.02050101.0d010201.01020400", "body": "060e2b34.02050101.0d010201.01030400",
    "footer": "060e2b34.02050101.0d010201.01040400", "primer": "060e2b34.02050101.0d010201.01050100",
    "rip": "060e2b34.02050101.0d010201.01110100", "fill": "060e2b34.01010102.03010210.01000000",
    "index": "060e2b34.02530101.0d010201.01100100",
    "Preface": "060e2b34.02530101.0d010101.01012f00", "Identification": "060e2b34.02530101.0d010101.01013000",
    "ContentStorage": "060e2b34.02530101.0d010101.01011800", "EssenceContainerData": "060e2b34.02530101.0d010101.01012300",
    "MaterialPackage": "060e2b34.02530101.0d010101.01013600", "SourcePackage": "060e2b34.02530101.0d010101.01013700",
    "Track": "060e2b34.02530101.0d010101.01013b00", "Sequence": "060e2b34.02530101.0d010101.01010f00",
    "TimecodeComponent": "060e2b34.02530101.0d010101.01011400", "SourceClip": "060e2b34.02530101.0d010101.01011100",
    "RGBADescriptor": "060e2b34.02530101.0d010101.01012900", "J2KSubDescriptor": "060e2b34.02530101.0d010101.01015a00",
    "WaveDescriptor": "060e2b34.02530101.0d010101.01014800",
    "SoundfieldGroup": "060e2b34.02530101.0d010101.01016c00", "AudioChannel": "060e2b34.02530101.0d010101.01016b00",
}
K = {k: UL(v) for k, v in K.items()}

OP_ATOM = UL("060e2b34.04010102.0d010201.10000000")
EC_GENERIC = UL("060e2b34.04010103.0d010301.027f0100")
EC_J2K = UL("060e2b34.04010107.0d010301.020c0100")
EC_WAVE = UL("060e2b34.04010101.0d010301.02060100")
DD_TIMECODE = UL("060e2b34.04010101.01030201.01000000")
DD_PICTURE = UL("060e2b34.04010101.01030202.01000000")
DD_SOUND = UL("060e2b34.04010101.01030202.02000000")
PIC_CODING = {"2K": UL("060e2b34.04010109.04010202.03010103"), "4K": UL("060e2b34.04010109.04010202.03010104")}
ELEMENT_PICTURE = UL("060e2b34.01020101.0d010301.15010801")
ELEMENT_SOUND = UL("060e2b34.01020101.0d010301.16010101")
CHANNEL_ASSIGNMENT_MCA = UL("060e2b34.0401010d.04020210.03020000")
MCA_SOUNDFIELD_51 = UL("060e2b34.0401010d.03020201.00000000")
MCA_CHANNELS = [("chL", "Left", "01"), ("chR", "Right", "02"), ("chC", "Center", "03"), ("chLFE", "LFE", "04"),
                ("chLs", "Left Surround", "05"), ("chRs", "Right Surround", "06")]

# local tag → UL (SMPTE metadata registry); ff** are dynamic tags declared per file
TAGS = {
    0x0201: "060e2b34.01010102.04070100.00000000", 0x0202: "060e2b34.01010102.07020201.01030000",
    0x1001: "060e2b34.01010102.06010104.06090000", 0x1101: "060e2b34.01010102.06010103.01000000",
    0x1102: "060e2b34.01010102.06010103.02000000", 0x1201: "060e2b34.01010102.07020103.01040000",
    0x1501: "060e2b34.01010102.07020103.01050000", 0x1502: "060e2b34.01010102.04040101.02060000",
    0x1503: "060e2b34.01010101.04040101.05000000", 0x1901: "060e2b34.01010102.06010104.05010000",
    0x1902: "060e2b34.01010102.06010104.05020000", 0x2701: "060e2b34.01010102.06010106.01000000",
    0x3001: "060e2b34.01010101.04060101.00000000", 0x3002: "060e2b34.01010101.04060102.00000000",
    0x3004: "060e2b34.01010102.06010104.01020000", 0x3006: "060e2b34.01010105.06010103.05000000",
    0x3201: "060e2b34.01010102.04010601.00000000", 0x3202: "060e2b34.01010101.04010502.01000000",
    0x3203: "060e2b34.01010101.04010502.02000000", 0x320c: "060e2b34.01010101.04010301.04000000",
    0x320e: "060e2b34.01010101.04010101.01000000", 0x3401: "060e2b34.01010102.04010503.06000000",
    0x3406: "060e2b34.01010105.04010503.0b000000", 0x3407: "060e2b34.01010105.04010503.0c000000",
    0x3b02: "060e2b34.01010102.07020110.02040000", 0x3b03: "060e2b34.01010102.06010104.02010000",
    0x3b05: "060e2b34.01010102.03010201.05000000", 0x3b06: "060e2b34.01010102.06010104.06040000",
    0x3b07: "060e2b34.01010102.03010201.04000000", 0x3b08: "060e2b34.01010104.06010104.01080000",
    0x3b09: "060e2b34.01010105.01020203.00000000", 0x3b0a: "060e2b34.01010105.01020210.02010000",
    0x3b0b: "060e2b34.01010105.01020210.02020000", 0x3c01: "060e2b34.01010102.05200701.02010000",
    0x3c02: "060e2b34.01010102.05200701.03010000", 0x3c03: "060e2b34.01010102.05200701.04000000",
    0x3c04: "060e2b34.01010102.05200701.05010000", 0x3c05: "060e2b34.01010102.05200701.07000000",
    0x3c06: "060e2b34.01010102.07020110.02030000", 0x3c07: "060e2b34.01010102.05200701.0a000000",
    0x3c08: "060e2b34.01010102.05200701.06010000", 0x3c09: "060e2b34.01010102.05200701.01000000",
    0x3c0a: "060e2b34.01010101.01011502.00000000", 0x3d01: "060e2b34.01010104.04020303.04000000",
    0x3d02: "060e2b34.01010104.04020301.04000000", 0x3d03: "060e2b34.01010105.04020301.01010000",
    0x3d07: "060e2b34.01010105.04020101.04000000", 0x3d09: "060e2b34.01010105.04020303.05000000",
    0x3d0a: "060e2b34.01010105.04020302.01000000", 0x3d32: "060e2b34.01010107.04020101.05000000",
    0x3f05: "060e2b34.01010104.04060201.00000000", 0x3f06: "060e2b34.01010104.01030405.00000000",
    0x3f07: "060e2b34.01010104.01030404.00000000", 0x3f08: "060e2b34.01010104.04040401.01000000",
    0x3f09: "060e2b34.01010105.04040401.06000000", 0x3f0a: "060e2b34.01010105.04040402.05000000",
    0x3f0b: "060e2b34.01010105.05300406.00000000", 0x3f0c: "060e2b34.01010105.07020103.010a0000",
    0x3f0d: "060e2b34.01010105.07020201.01020000", 0x3f0e: "060e2b34.01010105.04040401.07000000",
    0x4401: "060e2b34.01010101.01011510.00000000", 0x4402: "060e2b34.01010101.01030302.01000000",
    0x4403: "060e2b34.01010102.06010104.06050000", 0x4404: "060e2b34.01010102.07020110.02050000",
    0x4405: "060e2b34.01010102.07020110.01030000", 0x4701: "060e2b34.01010102.06010104.02030000",
    0x4801: "060e2b34.01010102.01070101.00000000", 0x4802: "060e2b34.01010102.01070102.01000000",
    0x4803: "060e2b34.01010102.06010104.02040000", 0x4804: "060e2b34.01010102.01040103.00000000",
    0x4b01: "060e2b34.01010102.05300405.00000000", 0x4b02: "060e2b34.01010102.07020103.01030000",
}
PICTURE_TAGS = {
    0xfff2: "060e2b34.0101010a.04010603.0d000000", 0xfff3: "060e2b34.0101010a.04010603.0c000000",
    0xfff4: "060e2b34.0101010a.04010603.0b000000", 0xfff5: "060e2b34.0101010a.04010603.0a000000",
    0xfff6: "060e2b34.0101010a.04010603.09000000", 0xfff7: "060e2b34.0101010a.04010603.08000000",
    0xfff8: "060e2b34.0101010a.04010603.07000000", 0xfff9: "060e2b34.0101010a.04010603.06000000",
    0xfffa: "060e2b34.0101010a.04010603.05000000", 0xfffb: "060e2b34.0101010a.04010603.04000000",
    0xfffc: "060e2b34.0101010a.04010603.03000000", 0xfffd: "060e2b34.0101010a.04010603.02000000",
    0xfffe: "060e2b34.0101010a.04010603.01000000", 0xffff: "060e2b34.01010109.06010104.06100000",
}
SOUND_TAGS = {
    0xfff8: "060e2b34.0101010e.01030701.06000000", 0xfff9: "060e2b34.0101010e.01030401.0a000000",
    0xfffa: "060e2b34.0101010d.03010102.03150000", 0xfffb: "060e2b34.0101010e.01030701.03000000",
    0xfffc: "060e2b34.0101010e.01030701.02000000", 0xfffd: "060e2b34.0101010e.01030701.05000000",
    0xfffe: "060e2b34.0101010e.01030701.01000000", 0xffff: "060e2b34.01010109.06010104.06100000",
}
PICTURE_ONLY = {0x3201, 0x3202, 0x3203, 0x320c, 0x320e, 0x3401, 0x3406, 0x3407}
SOUND_ONLY = {0x3d01, 0x3d02, 0x3d03, 0x3d07, 0x3d09, 0x3d0a, 0x3d32}
HEADER_SIZE = 16384                                           # header partition + metadata + fill, as asdcplib
PRODUCT_UID = uuid.UUID("5f3a2c1e-8d4b-4e6a-9b1f-6c2d7e8a9f30").bytes


def local_set(key, items):
    return klv(key, b"".join(u16(t) + u16(len(v)) + v for t, v in items))


def partition(key, this, prev, footer, header_bytes, index_bytes, index_sid, body_sid, ecs):
    v = (u16(1) + u16(2) + u32(1) + u64(this) + u64(prev) + u64(footer) + u64(header_bytes) + u64(index_bytes) +
         u32(index_sid) + u64(0) + u32(body_sid) + OP_ATOM + batch(ecs))
    return klv(key, v)


class TrackFile:
    """One MXF OP-Atom track file, written frame by frame; the header is rewritten in place at close()."""

    def __init__(self, path, kind, edit_rate, product_version="1.2.0", company="Radical Deepscale",
                 product="Frax JXL DCP Render", **kw):
        self.path, self.kind, self.rate = path, kind, (int(edit_rate), 1)
        self.kw = kw
        self.company, self.product, self.version = company, product, product_version
        self.asset_uuid = kw.get("asset_uuid") or uuid.uuid4()
        self.ecs = [EC_GENERIC, EC_J2K] if kind == "picture" else [EC_WAVE, EC_GENERIC]
        self.f = open(path, "wb")
        self.f.write(b"\0" * HEADER_SIZE)
        self.f.write(partition(K["body"], HEADER_SIZE, 0, 0, 0, 0, 0, 1, self.ecs))
        self.essence_start = self.f.tell()
        self.offsets = []
        self.frames = 0
        self.first = None
        self.sha1 = None
        self.created = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)

    def write_frame(self, data):
        if self.first is None:
            self.first = bytes(data[:4096])
        self.offsets.append(self.f.tell() - self.essence_start)
        self.f.write(klv(ELEMENT_PICTURE if self.kind == "picture" else ELEMENT_SOUND, bytes(data)))
        self.frames += 1

    # ── header metadata ──
    def _header_metadata(self):
        n, er = self.frames, self.rate
        now = timestamp(self.created)
        U = lambda: uuid.uuid4().bytes                                       # noqa: E731
        ids = {k: U() for k in ("preface", "ident", "storage", "ecd", "mp", "fp", "desc", "sub",
                                "mtc_t", "mtc_s", "mtc_c", "mes_t", "mes_s", "mes_c",
                                "ftc_t", "ftc_s", "ftc_c", "fes_t", "fes_s", "fes_c")}
        mp_umid, fp_umid = umid(uuid.uuid4().bytes), umid(self.asset_uuid.bytes)
        pic = self.kind == "picture"
        dd = DD_PICTURE if pic else DD_SOUND
        sets = []
        sets.append(local_set(K["Preface"], [
            (0x3c0a, ids["preface"]), (0x3b02, now), (0x3b05, u16(0x0102)), (0x3b07, u32(1)), (0x3b08, ids["fp"]),
            (0x3b06, batch([ids["ident"]])), (0x3b03, ids["storage"]), (0x3b09, OP_ATOM), (0x3b0a, batch(self.ecs)),
            (0x3b0b, batch([]))]))
        vs = [int(x) for x in (self.version.split(".") + ["0", "0"])[:3]]
        sets.append(local_set(K["Identification"], [
            (0x3c0a, ids["ident"]), (0x3c09, U()), (0x3c01, utf16(self.company)), (0x3c02, utf16(self.product)),
            (0x3c03, u16(vs[0]) + u16(vs[1]) + u16(vs[2]) + u16(0) + u16(1)), (0x3c04, utf16(self.version)),
            (0x3c05, PRODUCT_UID), (0x3c06, now), (0x3c07, u16(vs[0]) + u16(vs[1]) + u16(vs[2]) + u16(0) + u16(1)),
            (0x3c08, utf16("Blender"))]))
        sets.append(local_set(K["ContentStorage"], [
            (0x3c0a, ids["storage"]), (0x1901, batch([ids["mp"], ids["fp"]])), (0x1902, batch([ids["ecd"]]))]))
        sets.append(local_set(K["EssenceContainerData"], [
            (0x3c0a, ids["ecd"]), (0x2701, fp_umid), (0x3f06, u32(129)), (0x3f07, u32(1))]))

        def tracks(prefix, src_clip_umid, src_track, essence_track_number, essence_name):
            out = []
            out.append(local_set(K["Track"], [
                (0x3c0a, ids[prefix + "tc_t"]), (0x4801, u32(1)), (0x4804, u32(0)), (0x4802, utf16("Timecode Track")),
                (0x4803, ids[prefix + "tc_s"]), (0x4b01, rational(*er)), (0x4b02, i64(0))]))
            out.append(local_set(K["Sequence"], [
                (0x3c0a, ids[prefix + "tc_s"]), (0x0201, DD_TIMECODE), (0x0202, i64(n)), (0x1001, batch([ids[prefix + "tc_c"]]))]))
            out.append(local_set(K["TimecodeComponent"], [
                (0x3c0a, ids[prefix + "tc_c"]), (0x0201, DD_TIMECODE), (0x0202, i64(n)), (0x1502, u16(er[0])),
                (0x1501, i64(0)), (0x1503, u8(0))]))
            out.append(local_set(K["Track"], [
                (0x3c0a, ids[prefix + "es_t"]), (0x4801, u32(2)), (0x4804, u32(essence_track_number)),
                (0x4802, utf16(essence_name)), (0x4803, ids[prefix + "es_s"]), (0x4b01, rational(*er)), (0x4b02, i64(0))]))
            out.append(local_set(K["Sequence"], [
                (0x3c0a, ids[prefix + "es_s"]), (0x0201, dd), (0x0202, i64(n)), (0x1001, batch([ids[prefix + "es_c"]]))]))
            out.append(local_set(K["SourceClip"], [
                (0x3c0a, ids[prefix + "es_c"]), (0x0201, dd), (0x0202, i64(n)), (0x1201, i64(0)),
                (0x1101, src_clip_umid), (0x1102, u32(src_track))]))
            return out

        name = "Picture Track" if pic else "Sound Track"
        sets.append(local_set(K["MaterialPackage"], [
            (0x3c0a, ids["mp"]), (0x4401, mp_umid), (0x4402, utf16("Material Package")), (0x4405, now), (0x4404, now),
            (0x4403, batch([ids["mtc_t"], ids["mes_t"]]))]))
        sets += tracks("m", fp_umid, 2, 0, name)
        fp_name = ("File Package: SMPTE 429-4 frame wrapping of JPEG 2000 codestreams" if pic else
                   "File Package: SMPTE 382M frame wrapping of wave audio")
        sets.append(local_set(K["SourcePackage"], [
            (0x3c0a, ids["fp"]), (0x4401, fp_umid), (0x4402, utf16(fp_name)), (0x4405, now), (0x4404, now),
            (0x4403, batch([ids["ftc_t"], ids["fes_t"]])), (0x4701, ids["desc"])]))
        sets += tracks("f", b"\0" * 32, 0, 0x15010801 if pic else 0x16010101, name)
        sets += self._descriptor(ids, n)
        tags = dict(TAGS)
        tags.update(PICTURE_TAGS if pic else SOUND_TAGS)
        skip = SOUND_ONLY if pic else PICTURE_ONLY
        entries = [u16(t) + UL(v) for t, v in sorted(tags.items()) if t not in skip]
        primer = klv(K["primer"], batch(entries, 18))
        return primer + b"".join(sets)

    def _descriptor(self, ids, n):
        er = self.rate
        if self.kind == "picture":
            p = j2k_params(self.first)
            w, h = p["xsiz"], p["ysiz"]
            desc = local_set(K["RGBADescriptor"], [
                (0x3c0a, ids["desc"]), (0xffff, batch([ids["sub"]])), (0x3006, u32(2)), (0x3001, rational(*er)),
                (0x3002, i64(n)), (0x3004, EC_J2K), (0x320c, u8(0)), (0x3203, u32(w)), (0x3202, u32(h)),
                (0x320e, rational(w, h)), (0x3201, PIC_CODING["4K" if w > 2048 else "2K"]), (0x3406, u32(4095)),
                (0x3407, u32(0)), (0x3401, b"\0" * 16)])
            sub = local_set(K["J2KSubDescriptor"], [
                (0x3c0a, ids["sub"]), (0xfffe, u16(p["rsiz"])), (0xfffd, u32(p["xsiz"])), (0xfffc, u32(p["ysiz"])),
                (0xfffb, u32(p["xosiz"])), (0xfffa, u32(p["yosiz"])), (0xfff9, u32(p["xtsiz"])),
                (0xfff8, u32(p["ytsiz"])), (0xfff7, u32(p["xtosiz"])), (0xfff6, u32(p["ytosiz"])),
                (0xfff5, u16(p["csiz"])), (0xfff4, u32(p["csiz"]) + u32(3) + p["comps"]), (0xfff3, p["cod"]),
                (0xfff2, p["qcd"])])
            return [desc, sub]
        ch = self.kw.get("channels", 6)
        lang = self.kw.get("language", "en")
        sg_link = uuid.uuid4().bytes
        subs = [uuid.uuid4().bytes for _ in range(1 + len(MCA_CHANNELS))]
        desc = local_set(K["WaveDescriptor"], [
            (0x3c0a, ids["desc"]), (0xffff, batch(subs)), (0x3006, u32(2)), (0x3001, rational(*er)), (0x3002, i64(n)),
            (0x3004, EC_WAVE), (0x3d03, rational(48000, 1)), (0x3d02, u8(0)), (0x3d07, u32(ch)), (0x3d01, u32(24)),
            (0x3d0a, u16(3 * ch)), (0x3d09, u32(48000 * 3 * ch)), (0x3d32, CHANNEL_ASSIGNMENT_MCA)])
        out = [desc, local_set(K["SoundfieldGroup"], [
            (0x3c0a, subs[0]), (0xfffe, MCA_SOUNDFIELD_51), (0xfffd, sg_link), (0xfffc, utf16("sg51")),
            (0xfffb, utf16("5.1")), (0xfffa, lang.encode("ascii"))])]
        for i, (sym, nm, d) in enumerate(MCA_CHANNELS):
            out.append(local_set(K["AudioChannel"], [
                (0x3c0a, subs[i + 1]), (0xfffe, UL("060e2b34.0401010d.030201%s.00000000" % d)), (0xfffd, uuid.uuid4().bytes),
                (0xfffc, utf16(sym)), (0xfffb, utf16(nm)), (0xfff9, u32(i + 1)), (0xfffa, lang.encode("ascii")),
                (0xfff8, sg_link)]))
        return out

    def _index(self):
        er = self.rate
        items = [(0x3c0a, uuid.uuid4().bytes), (0x3f0b, rational(*er)), (0x3f0c, i64(0)), (0x3f0d, i64(self.frames))]
        if self.kind == "picture":
            items += [(0x3f05, u32(0)), (0x3f06, u32(129)), (0x3f07, u32(1)), (0x3f08, u8(0)), (0x3f0e, u8(0)),
                      (0x3f09, u32(1) + u32(6) + b"\0\0" + u32(0)),
                      (0x3f0a, u32(len(self.offsets)) + u32(11) + b"".join(b"\0\0\x80" + u64(o) for o in self.offsets))]
        else:
            eu = self.offsets[1] - self.offsets[0] if len(self.offsets) > 1 else (20 + self.kw.get("bytes_per_frame", 0))
            items += [(0x3f05, u32(eu)), (0x3f06, u32(129)), (0x3f07, u32(1)), (0x3f08, u8(0)), (0x3f0e, u8(0)),
                      (0x3f0a, u32(0) + u32(11))]
        return local_set(K["index"], items)

    def close(self):
        if self.frames == 0:
            self.f.close()
            raise ValueError("no frames written")
        footer_at = self.f.tell()
        index = self._index()
        self.f.write(partition(K["footer"], footer_at, HEADER_SIZE, footer_at, 0, len(index), 129, 0, self.ecs))
        self.f.write(index)
        rip = u32(0) + u64(0) + u32(1) + u64(HEADER_SIZE) + u32(0) + u64(footer_at)
        self.f.write(klv(K["rip"], rip + u32(16 + 4 + len(rip) + 4)))
        # header partition + metadata, padded with a fill item to exactly HEADER_SIZE
        meta = self._header_metadata()
        hp = partition(K["header"], 0, 0, footer_at, HEADER_SIZE - 140, 0, 0, 0, self.ecs)
        room = HEADER_SIZE - len(hp) - len(meta) - 20
        if room < 0:
            raise ValueError("MXF header metadata too large")
        head = hp + meta + klv(K["fill"], b"\0" * room)
        assert len(head) == HEADER_SIZE and len(hp) == 140
        self.f.seek(0)
        self.f.write(head)
        self.f.close()
        self.sha1 = sha1_b64(self.path)
        return self


def sha1_b64(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return base64.b64encode(h.digest()).decode("ascii")


# ── sound: WAV (any channel count, 24-bit or 16-bit, 48 kHz) → 6-channel 5.1 frames ─────────────────────────────
def wav_frames(path, fps, frames, layout="STEREO"):
    """Yields `frames` blocks of 48000/fps samples × 6 channels × 24-bit LE (silence-padded / trimmed)."""
    spf = 48000 // int(fps)
    with wave.open(path, "rb") as w:
        if w.getframerate() != 48000:
            raise ValueError("audio must be 48 kHz (it is %d Hz)" % w.getframerate())
        nch, sw = w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    a = np.frombuffer(raw, np.uint8).reshape(-1, nch, sw)
    s24 = np.zeros((a.shape[0], nch, 3), np.uint8)
    if sw == 3:
        s24 = a
    elif sw == 2:
        s24[..., 1:] = a
    elif sw == 4:
        s24 = a[..., 1:]
    else:
        raise ValueError("unsupported sample width %d" % sw)
    out = np.zeros((spf * frames, 6, 3), np.uint8)
    n = min(out.shape[0], s24.shape[0])
    if nch >= 6:
        out[:n] = s24[:n, :6]
    elif nch == 1:
        out[:n, 2] = s24[:n, 0]                               # mono → centre
    else:
        out[:n, :2] = s24[:n, :2]                             # stereo → L, R (C, LFE, Ls, Rs silent)
    for i in range(frames):
        yield out[i * spf:(i + 1) * spf].tobytes()


# ── XML: CPL, PKL, ASSETMAP, VOLINDEX (SMPTE) ───────────────────────────────────────────────────────────────────
NS_CPL = "http://www.smpte-ra.org/schemas/429-7/2006/CPL"
NS_PKL = "http://www.smpte-ra.org/schemas/429-8/2007/PKL"
NS_AM = "http://www.smpte-ra.org/schemas/429-9/2007/AM"
NS_META = "http://www.smpte-ra.org/schemas/429-16/2014/CPL-Metadata"
KIND = {"FTR": "feature", "SHR": "short", "TLR": "trailer", "TSR": "teaser", "TST": "test", "ADV": "advertisement",
        "PSA": "psa", "POL": "policy", "RTG": "rating", "XSN": "transitional"}


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S+00:00")


def write_cpl(path, name, kind, pic, snd, fps, w, h, issuer, creator, territory="US", facility="", audio="51",
              title=None):
    now = iso(datetime.datetime.now(datetime.timezone.utc))
    cpl_id, n = uuid.uuid4(), pic.frames
    rate = "%d 1" % fps

    def asset(tag, tf, extra):
        return ("      <%s>\n        <Id>urn:uuid:%s</Id>\n        <EditRate>%s</EditRate>\n"
                "        <IntrinsicDuration>%d</IntrinsicDuration>\n        <EntryPoint>0</EntryPoint>\n"
                "        <Duration>%d</Duration>\n        <Hash>%s</Hash>\n%s      </%s>\n") % (
            tag, tf.asset_uuid, rate, tf.frames, tf.frames, tf.sha1, extra, tag)
    reel = asset("MainPicture", pic, "        <FrameRate>%s</FrameRate>\n        <ScreenAspectRatio>%d %d</ScreenAspectRatio>\n" % (rate, w, h))
    if snd:
        reel += asset("MainSound", snd, "")
    msc = {"51": "51/L,R,C,LFE,Ls,Rs", "STEREO": "51/L,R,-,-,-,-"}.get(audio, "51/-,-,-,-,-,-")
    meta = ("      <meta:CompositionMetadataAsset xmlns:meta=\"%s\">\n        <Id>urn:uuid:%s</Id>\n"
            "        <EditRate>%s</EditRate>\n        <IntrinsicDuration>%d</IntrinsicDuration>\n"
            "        <meta:FullContentTitleText>%s</meta:FullContentTitleText>\n"
            "        <meta:ReleaseTerritory>%s</meta:ReleaseTerritory>\n"
            "        <meta:VersionNumber status=\"final\">1</meta:VersionNumber>\n"
            "        <meta:Facility>%s</meta:Facility>\n"
            "        <meta:Luminance units=\"foot-lambert\">14</meta:Luminance>\n"
            "        <meta:MainSoundConfiguration>%s</meta:MainSoundConfiguration>\n"
            "        <meta:MainSoundSampleRate>48000 1</meta:MainSoundSampleRate>\n"
            "        <meta:MainPictureStoredArea><meta:Width>%d</meta:Width><meta:Height>%d</meta:Height></meta:MainPictureStoredArea>\n"
            "        <meta:MainPictureActiveArea><meta:Width>%d</meta:Width><meta:Height>%d</meta:Height></meta:MainPictureActiveArea>\n"
            "        <meta:ExtensionMetadataList>\n"
            "          <meta:ExtensionMetadata scope=\"http://isdcf.com/ns/cplmd/app\">\n"
            "            <meta:Name>Application</meta:Name>\n"
            "            <meta:PropertyList><meta:Property><meta:Name>DCP Constraints Profile</meta:Name>"
            "<meta:Value>SMPTE-RDD-52:2020-Bv2.1</meta:Value></meta:Property></meta:PropertyList>\n"
            "          </meta:ExtensionMetadata>\n        </meta:ExtensionMetadataList>\n"
            "      </meta:CompositionMetadataAsset>\n") % (
        NS_META, uuid.uuid4(), rate, n, esc(title or name), esc(territory), esc(facility or issuer), msc, w, h, w, h)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<CompositionPlaylist xmlns="%s">\n'
           '  <Id>urn:uuid:%s</Id>\n  <AnnotationText>%s</AnnotationText>\n  <IssueDate>%s</IssueDate>\n'
           '  <Issuer>%s</Issuer>\n  <Creator>%s</Creator>\n  <ContentTitleText>%s</ContentTitleText>\n'
           '  <ContentKind>%s</ContentKind>\n  <ContentVersion>\n    <Id>urn:uuid:%s</Id>\n'
           '    <LabelText>%s</LabelText>\n  </ContentVersion>\n  <RatingList/>\n  <ReelList>\n    <Reel>\n'
           '      <Id>urn:uuid:%s</Id>\n      <AssetList>\n%s%s      </AssetList>\n    </Reel>\n  </ReelList>\n'
           '</CompositionPlaylist>\n') % (
        NS_CPL, cpl_id, esc(name), now, esc(issuer), esc(creator), esc(name), KIND.get(kind, "short"), uuid.uuid4(),
        esc(name), uuid.uuid4(), reel.replace("      <", "        <"), meta)
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    return cpl_id


def write_pkl(path, name, assets, issuer, creator):
    """assets: [(uuid, file path, mime)]"""
    now = iso(datetime.datetime.now(datetime.timezone.utc))
    pkl_id = uuid.uuid4()
    rows = "".join(
        "    <Asset>\n      <Id>urn:uuid:%s</Id>\n      <AnnotationText>%s</AnnotationText>\n      <Hash>%s</Hash>\n"
        "      <Size>%d</Size>\n      <Type>%s</Type>\n      <OriginalFileName>%s</OriginalFileName>\n    </Asset>\n" % (
            a, esc(os.path.basename(p)), sha1_b64(p), os.path.getsize(p), t, esc(os.path.basename(p))) for a, p, t in assets)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<PackingList xmlns="%s">\n  <Id>urn:uuid:%s</Id>\n'
           '  <AnnotationText>%s</AnnotationText>\n  <IssueDate>%s</IssueDate>\n  <Issuer>%s</Issuer>\n'
           '  <Creator>%s</Creator>\n  <AssetList>\n%s  </AssetList>\n</PackingList>\n') % (
        NS_PKL, pkl_id, esc(name), now, esc(issuer), esc(creator), rows)
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)
    return pkl_id


def write_assetmap(folder, pkl, assets, issuer, creator):
    """assets: [(uuid, file path)] (pkl = (uuid, path) is flagged PackingList)."""
    now = iso(datetime.datetime.now(datetime.timezone.utc))

    def row(a, p, is_pkl=False):
        return ("    <Asset>\n      <Id>urn:uuid:%s</Id>\n%s      <ChunkList>\n        <Chunk>\n"
                "          <Path>%s</Path>\n          <VolumeIndex>1</VolumeIndex>\n          <Offset>0</Offset>\n"
                "          <Length>%d</Length>\n        </Chunk>\n      </ChunkList>\n    </Asset>\n") % (
            a, "      <PackingList>true</PackingList>\n" if is_pkl else "", esc(os.path.basename(p)), os.path.getsize(p))
    rows = row(pkl[0], pkl[1], True) + "".join(row(a, p) for a, p in assets)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<AssetMap xmlns="%s">\n  <Id>urn:uuid:%s</Id>\n'
           '  <Creator>%s</Creator>\n  <VolumeCount>1</VolumeCount>\n  <IssueDate>%s</IssueDate>\n'
           '  <Issuer>%s</Issuer>\n  <AssetList>\n%s  </AssetList>\n</AssetMap>\n') % (
        NS_AM, uuid.uuid4(), esc(creator), now, esc(issuer), rows)
    with open(os.path.join(folder, "ASSETMAP.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    with open(os.path.join(folder, "VOLINDEX.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<VolumeIndex xmlns="%s">\n  <Index>1</Index>\n</VolumeIndex>\n' % NS_AM)


def finish_package(folder, name, kind, pic, snd, fps, w, h, issuer="Radical Deepscale", creator="Frax JXL DCP Render 1.2.0",
                   **meta):
    cpl_path = os.path.join(folder, "CPL_%s.xml" % name)
    cpl_id = write_cpl(cpl_path, name, kind, pic, snd, fps, w, h, issuer, creator, **meta)
    assets = [(cpl_id, cpl_path, "text/xml")] + [(t.asset_uuid, t.path, "application/mxf") for t in (pic, snd) if t]
    pkl_path = os.path.join(folder, "PKL_%s.xml" % name)
    pkl_id = write_pkl(pkl_path, name, assets, issuer, creator)
    write_assetmap(folder, (pkl_id, pkl_path), [(a, p) for a, p, _ in assets], issuer, creator)
    return cpl_path
