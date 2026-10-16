# SPDX-License-Identifier: GPL-3.0-or-later
# Frax JPEG XL Render — encoder/decoder engine.
# libjxl 0.13 (BSD-3-Clause, © the JPEG XL Project Authors) compiled to a standalone WebAssembly module
# (frax-jxl-wasi.wasm) and run through wasmtime, so one binary works on every platform Blender runs on.
# The C bridge is the same one Frax Studio uses in the browser (tools/frax-jxl/jxw.c in the Ariel repo).
import ctypes
import os
import threading

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
WASM_PATH = os.path.join(_HERE, "frax-jxl-wasi.wasm")

# libjxl frame-setting ids (jxl/encode.h)
ID = dict(EFFORT=0, DECODING_SPEED=1, RESAMPLING=2, EC_RESAMPLING=3, PHOTON_NOISE=5, NOISE=6, DOTS=7, PATCHES=8, EPF=9,
          GABORISH=10, MODULAR=11, KEEP_INVISIBLE=12, GROUP_ORDER=13, CENTER_X=14, CENTER_Y=15, RESPONSIVE=16,
          PROGRESSIVE_AC=17, QPROGRESSIVE_AC=18, PROGRESSIVE_DC=19, CH_COLORS_GLOBAL=20, CH_COLORS_GROUP=21,
          PALETTE_COLORS=22, LOSSY_PALETTE=23, COLOR_TRANSFORM=24, MODULAR_COLOR_SPACE=25, MODULAR_GROUP_SIZE=26,
          MODULAR_PREDICTOR=27, MA_TREE_PCT=28, NB_PREV_CH=29, JPEG_RECON_CFL=30, BROTLI_EFFORT=32,
          JPEG_COMPRESS_BOXES=33, BUFFERING=34, JPEG_KEEP_EXIF=35, JPEG_KEEP_XMP=36, JPEG_KEEP_JUMBF=37,
          FULL_IMAGE_HEURISTICS=38, DISABLE_PERCEPTUAL=39)
FLOAT_IDS = {ID["PHOTON_NOISE"], ID["CH_COLORS_GLOBAL"], ID["CH_COLORS_GROUP"], ID["MA_TREE_PCT"]}


def available():
    """True when the optional libjxl (WebAssembly) engine can run: wasmtime installed and the module present."""
    try:
        import wasmtime  # noqa: F401
    except Exception:                                    # noqa: BLE001
        return False
    return os.path.exists(WASM_PATH)


def quality_to_distance(q):
    """libjxl's JxlEncoderDistanceFromQuality."""
    q = float(q)
    if q >= 100:
        return 0.0
    if q >= 30:
        return 0.1 + (100 - q) * 0.09
    return 53.0 / 3000.0 * q * q - 23.0 / 20.0 * q + 25.0


class JXLError(RuntimeError):
    pass


class _Runtime:
    """One wasmtime instance. Not thread-safe: use one per thread (Encoder creates its own when asked)."""
    _module = None
    _engine = None
    _lock = threading.Lock()

    @classmethod
    def _load_module(cls, cache_dir=None):
        import wasmtime
        with cls._lock:
            if cls._module is None:
                cfg = wasmtime.Config()
                cfg.cranelift_opt_level = "speed"
                try:
                    cfg.wasm_simd = True
                except Exception:
                    pass
                cls._engine = wasmtime.Engine(cfg)
                mod = None
                cache = os.path.join(cache_dir, "frax-jxl-%s.cwasm" % getattr(wasmtime, "__version__", "wt48")) if cache_dir else None
                if cache and os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(WASM_PATH):
                    try:
                        mod = wasmtime.Module.deserialize_file(cls._engine, cache)   # skip the ~seconds of JIT compile
                    except Exception:
                        mod = None
                if mod is None:
                    mod = wasmtime.Module.from_file(cls._engine, WASM_PATH)
                    if cache:
                        try:
                            os.makedirs(cache_dir, exist_ok=True)
                            with open(cache, "wb") as f:
                                f.write(mod.serialize())
                        except Exception:
                            pass
                cls._module = mod
            return cls._engine, cls._module

    def __init__(self, cache_dir=None):
        import wasmtime
        engine, module = self._load_module(cache_dir)
        self.store = wasmtime.Store(engine)
        self.store.set_wasi(wasmtime.WasiConfig())
        linker = wasmtime.Linker(engine)
        linker.define_wasi()
        self.inst = linker.instantiate(self.store, module)
        ex = self.inst.exports(self.store)
        self.mem = ex["memory"]
        self._fn = {}
        self._ex = ex
        try:
            ex["_initialize"](self.store)
        except Exception:
            pass

    def __getattr__(self, name):          # rt.jxw_new(...) → exported function
        f = self._fn.get(name)
        if f is None:
            f = self._ex[name]
            self._fn[name] = f
        return lambda *a: f(self.store, *a)

    # memory helpers (re-read the base pointer every time: memory can grow)
    def _base(self):
        return ctypes.addressof(self.mem.data_ptr(self.store).contents)

    def put(self, data):
        buf = memoryview(data).cast("B")
        n = buf.nbytes
        p = self.malloc(max(1, n))
        if not p:
            raise JXLError("out of memory in the JPEG XL engine")
        src = (ctypes.c_char * n).from_buffer_copy(buf) if not isinstance(data, np.ndarray) else data.ctypes.data
        ctypes.memmove(self._base() + p, src, n)
        return p, n

    def get(self, ptr, n):
        return ctypes.string_at(self._base() + ptr, n)

    def cstr(self, s):
        b = s.encode("utf-8") + b"\0"
        p, _ = self.put(b)
        return p

    def string(self, ptr):
        if not ptr:
            return ""
        out = bytearray()
        base = self._base()
        while True:
            c = ctypes.string_at(base + ptr + len(out), 1)
            if c == b"\0" or len(out) > 512:
                break
            out += c
        return out.decode("utf-8", "replace")


def version(cache_dir=None):
    rt = _Runtime(cache_dir)
    v = rt.jxw_version()
    return "%d.%d.%d" % (v // 1000000, (v // 1000) % 1000, v % 1000)


class Encoder:
    """Streaming JPEG XL encoder: set it up once, add frames one at a time (animation), then finish().

    pixels for add_frame: numpy array (H, W, C) with C = 1 grey, 2 grey+alpha, 3 RGB, 4 RGBA,
    dtype uint8 / uint16 / float32 (float = 0..1 display values, or scene-linear for linear colour).
    """

    def __init__(self, width, height, bits=8, exp_bits=0, channels=3, alpha_bits=0, alpha_exp=0, premultiplied=False,
                 animated=False, tps_num=1000, tps_den=1, loops=0, original_profile=False, intensity_target=0.0,
                 orientation=1, color=0, intent=0, container=-1, level=0, boxes=(), cache_dir=None, jpeg_mode=False,
                 **_ignored):
        self.rt = rt = _Runtime(cache_dir)
        self.h = rt.jxw_new()
        if not self.h:
            raise JXLError("could not start the JPEG XL encoder")
        self._ptrs = []
        self.alpha = alpha_bits > 0
        self.frames = 0
        try:
            if not jpeg_mode:
                if not rt.jxw_basic(self.h, int(width), int(height), int(bits), int(exp_bits), int(channels), int(alpha_bits),
                                    int(alpha_exp), int(bool(premultiplied)), int(bool(animated)), int(tps_num), int(tps_den),
                                    int(loops), int(bool(original_profile)), float(intensity_target or 0.0), int(orientation or 1)):
                    self._fail("basic image info")
                if not rt.jxw_color(self.h, int(color), int(intent)):
                    self._fail("colour encoding")
            use_container = 1 if boxes else int(container)
            if not rt.jxw_container(self.h, use_container, int(level)):
                self._fail("container")
            if boxes:
                if not rt.jxw_use_boxes(self.h):
                    self._fail("metadata")
                for typ, data, compress in boxes:
                    p, n = rt.put(bytes(data))
                    t = rt.cstr((typ + "    ")[:4])
                    self._ptrs += [p, t]
                    if not rt.jxw_add_box(self.h, t, p, n, int(bool(compress))):
                        self._fail("metadata box " + typ)
                rt.jxw_close_boxes(self.h)
        except Exception:
            self.close()
            raise

    def _fail(self, what):
        raise JXLError("%s: %s" % (what, self.rt.string(self.rt.jxw_error(self.h))))

    def _settings(self, opts):
        rt, fs = self.rt, self.rt.jxw_settings(self.h)
        for k, v in (opts.get("ints") or {}).items():
            if v is not None and int(v) != -1:
                rt.jxw_set_int(fs, int(k), int(v))
        for k, v in (opts.get("floats") or {}).items():
            if v is not None and float(v) >= 0:
                rt.jxw_set_float(fs, int(k), float(v))
        if opts.get("lossless"):
            if not rt.jxw_lossless(fs, 1):
                self._fail("lossless")
        elif opts.get("distance") is not None:
            if not rt.jxw_distance(fs, float(opts["distance"])):
                self._fail("quality")
        if self.alpha and opts.get("alpha_distance") is not None:
            rt.jxw_alpha_distance(fs, float(opts["alpha_distance"]))
        return fs

    def add_frame(self, pixels, opts, duration=0, crop=None, blend=0, name=""):
        rt = self.rt
        a = np.ascontiguousarray(pixels)
        if a.ndim == 2:
            a = a[:, :, None]
        dtype = {np.dtype("uint8"): 0, np.dtype("uint16"): 1, np.dtype("float32"): 2, np.dtype("float16"): 3}.get(a.dtype)
        if dtype is None:
            a = a.astype(np.float32)
            dtype = 2
        fs = self._settings(opts)
        nm = rt.cstr(name) if name else 0
        if nm:
            self._ptrs.append(nm)
        c = crop
        if not rt.jxw_frame_header(self.h, fs, int(duration), 1 if c else 0, int(c[0]) if c else 0, int(c[1]) if c else 0,
                                   int(c[2]) if c else 0, int(c[3]) if c else 0, int(blend), 0, -1, nm):
            self._fail("frame header")
        p, n = rt.put(a)
        try:
            if not rt.jxw_add_frame(self.h, fs, p, n, dtype, int(a.shape[2])):
                self._fail("frame %d" % (self.frames + 1))
        finally:
            rt.free(p)
        self.frames += 1

    def add_jpeg(self, jpeg_bytes, opts, keep_metadata=True):
        fs = self._settings(dict(opts, lossless=False, distance=None))
        p, n = self.rt.put(bytes(jpeg_bytes))
        self._ptrs.append(p)
        if not self.rt.jxw_add_jpeg(self.h, fs, p, n, int(bool(keep_metadata))):
            self._fail("JPEG transcode")
        self.frames += 1

    def finish(self):
        rt = self.rt
        rt.jxw_close_input(self.h)
        n = rt.jxw_finish(self.h)
        if n < 0:
            self._fail("encode")
        out = rt.get(rt.jxw_out(self.h), n)
        self.close()
        return out

    def close(self):
        if getattr(self, "h", None):
            for p in self._ptrs:
                self.rt.free(p)
            self._ptrs = []
            self.rt.jxw_free(self.h)
            self.h = None


def decode(data, want16=False, max_frames=0, cache_dir=None):
    """→ dict(width, height, frames=[(ndarray HxWx4 uint8|uint16, duration_ticks)], has_alpha, bits, animated, tps, loops)"""
    rt = _Runtime(cache_dir)
    p, n = rt.put(bytes(data))
    r = rt.jxd_decode(p, n, int(bool(want16)), int(max_frames))
    rt.free(p)
    try:
        err = rt.string(rt.jxd_error(r))
        frames, w, h = rt.jxd_frames(r), rt.jxd_w(r), rt.jxd_h(r)
        if not frames:
            raise JXLError(err or "nothing decoded")
        bpp = 2 if want16 else 1
        per = w * h * 4 * bpp
        base = rt.jxd_pixels(r)
        out = []
        for i in range(frames):
            raw = rt.get(base + per * i, per)
            arr = np.frombuffer(raw, dtype=np.uint16 if want16 else np.uint8).reshape(h, w, 4).copy()
            out.append((arr, rt.jxd_duration(r, i)))
        tn, td = rt.jxd_tps_num(r), rt.jxd_tps_den(r)
        return dict(width=w, height=h, frames=out, has_alpha=bool(rt.jxd_alpha(r)), bits=rt.jxd_bits(r),
                    animated=bool(rt.jxd_animated(r)), tps=(tn / td) if td else 0, loops=rt.jxd_loops(r), warning=err or None)
    finally:
        rt.jxd_free(r)
