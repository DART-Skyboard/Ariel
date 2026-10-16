# SPDX-License-Identifier: GPL-3.0-or-later AND BSD-3-Clause
# JPEG XL Modular mode, vectorised with numpy.
# Bitstream layout per libjxl (© the JPEG XL Project Authors, BSD-3-Clause): the MA tree + histograms and the
# global modular header live in LfGlobal; channels no larger than a group are coded there too, the rest are cut
# into LfGroup tiles (channels downsampled ≥ 8×) and PassGroup tiles (dec_modular.cc DecodeGroup).  Predictors,
# properties, edge rules and the tree-node token order follow context_predict.h / dec_ma.cc; the Squeeze
# transform follows transform/enc_squeeze.cc + squeeze.cc.
import numpy as np

from .bitwriter import BITS, BO, VAL, BitWriter, pack_signed
from .entropy import (CodeTable, PrefixCode, best_uint_config, hybrid_uint, hybrid_uint_000, pack_symbols,
                      write_histograms)

# ── predictors (all of JPEG XL's except Weighted, which needs sequential state) ─────────────────────────────
PRED_ZERO, PRED_W, PRED_N, PRED_AVG0, PRED_SELECT, PRED_GRADIENT = 0, 1, 2, 3, 4, 5
PRED_NE, PRED_NW, PRED_WW, PRED_AVG1, PRED_AVG2, PRED_AVG3, PRED_AVG4 = 7, 8, 9, 10, 11, 12, 13
CANDIDATES_BY_EFFORT = {
    1: [PRED_GRADIENT], 2: [PRED_GRADIENT], 3: [PRED_GRADIENT, PRED_W, PRED_N],
    4: [PRED_GRADIENT, PRED_W, PRED_N, PRED_AVG0, PRED_SELECT],
}
ALL_PREDICTORS = [PRED_GRADIENT, PRED_W, PRED_N, PRED_AVG0, PRED_SELECT, PRED_NE, PRED_NW, PRED_AVG1, PRED_AVG2,
                  PRED_AVG3, PRED_AVG4, PRED_ZERO]
import os
_DEBUG = bool(os.environ.get('FRAX_JXL_DEBUG'))
NUM_QUANT_TABLES = 17          # kNumQuantTables: part of the stream-id numbering of PassGroups


def _tdiv(s, d):
    """C integer division (truncates toward zero)."""
    q = np.abs(s) // d
    return np.where(s < 0, -q, q)


def neighbours(c):
    """W, N, NW, NE, NN, WW, NEE with libjxl's edge rules, for a whole channel at once (int64)."""
    c = c.astype(np.int64)
    h, w = c.shape
    W = np.empty_like(c)
    W[:, 1:] = c[:, :-1]
    W[1:, 0] = c[:-1, 0]
    W[0, 0] = 0
    N = np.empty_like(c)
    N[1:, :] = c[:-1, :]
    N[0, :] = W[0, :]
    NW = W.copy()
    if h > 1 and w > 1:
        NW[1:, 1:] = c[:-1, :-1]
    NE = N.copy()
    if h > 1 and w > 1:
        NE[1:, :-1] = c[:-1, 1:]
    NN = N.copy()
    if h > 2:
        NN[2:, :] = c[:-2, :]
    WW = W.copy()
    if w > 2:
        WW[:, 2:] = c[:, :-2]
    NEE = NE.copy()
    if h > 1 and w > 2:
        NEE[1:, :-2] = c[:-1, 2:]
    return W, N, NW, NE, NN, WW, NEE


def predict(c, pred, nb=None):
    W, N, NW, NE, NN, WW, NEE = nb or neighbours(c)
    if pred == PRED_ZERO:
        return np.zeros_like(W)
    if pred == PRED_W:
        return W
    if pred == PRED_N:
        return N
    if pred == PRED_AVG0:
        return _tdiv(W + N, 2)
    if pred == PRED_SELECT:
        p = W + N - NW
        return np.where(np.abs(p - W) < np.abs(p - N), W, N)
    if pred == PRED_GRADIENT:
        m, M = np.minimum(N, W), np.maximum(N, W)
        g = N + W - NW
        return np.where(NW > M, m, np.where(NW < m, M, g))
    if pred == PRED_NE:
        return NE
    if pred == PRED_NW:
        return NW
    if pred == PRED_WW:
        return WW
    if pred == PRED_AVG1:
        return _tdiv(W + NW, 2)
    if pred == PRED_AVG2:
        return _tdiv(NW + N, 2)
    if pred == PRED_AVG3:
        return _tdiv(N + NE, 2)
    if pred == PRED_AVG4:
        return _tdiv(6 * N - 2 * NN + 7 * W + WW + NEE + 3 * NE + 8, 16)
    raise ValueError(pred)


# MA-tree properties we can evaluate for a whole channel at once (8 depends on the previous pixel's property
# row and 15 on the weighted predictor, so the encoder never splits on those).
DYNAMIC_PROPS = (4, 5, 9, 10, 11, 12, 13, 14, 6, 7, 2, 3)


def prop_values(p, c, nb):
    W, N, NW, NE, NN, WW, NEE = nb
    if p == 2:
        return np.broadcast_to(np.arange(c.shape[0])[:, None], c.shape)
    if p == 3:
        return np.broadcast_to(np.arange(c.shape[1])[None, :], c.shape)
    return {4: lambda: np.abs(N), 5: lambda: np.abs(W), 6: lambda: N, 7: lambda: W, 9: lambda: W + N - NW,
            10: lambda: W - NW, 11: lambda: NW - N, 12: lambda: N - NE, 13: lambda: N - NN,
            14: lambda: W - WW}[p]()


def wrap32(r):
    """The decoder adds residual + prediction in 32-bit pixels, so residuals wrap like int32."""
    return ((r + (1 << 31)) & 0xFFFFFFFF) - (1 << 31)


# ── MA tree ───────────────────────────────────────────────────────────────────────────────────────────────
class Leaf:
    __slots__ = ("pred", "offset", "mul", "key")

    def __init__(self, pred, offset=0, mul=1, key=None):
        self.pred, self.offset, self.mul, self.key = int(pred), int(offset), int(mul), key


class Split:
    """property > val → gt (first child, as the decoder reads it), else le."""
    __slots__ = ("prop", "val", "gt", "le")

    def __init__(self, prop, val, gt, le):
        self.prop, self.val, self.gt, self.le = int(prop), int(val), gt, le


def static_split(prop, items):
    """items: [(value, subtree)] sorted by value → balanced tree splitting on a static property; runs of equal
    subtrees are merged."""
    runs = []
    for v, t in items:
        if runs and runs[-1][2] is t:
            runs[-1][1] = v
        else:
            runs.append([v, v, t])

    def build(rs):
        if len(rs) == 1:
            return rs[0][2]
        m = len(rs) // 2
        return Split(prop, rs[m - 1][1], build(rs[m:]), build(rs[:m]))
    return build(runs)


def serialise_tree(root):
    """BFS like dec_ma.cc → (tokens [(ctx, value)], leaves in decode order)."""
    toks, leaves, q = [], [], [root]
    while q:
        n = q.pop(0)
        if isinstance(n, Leaf):
            m, mul_log = n.mul, 0
            while m % 2 == 0 and m > 1:
                m //= 2
                mul_log += 1
            toks += [(1, 0), (2, n.pred), (3, int(pack_signed(np.array([n.offset]))[0])), (4, mul_log), (5, m - 1)]
            leaves.append(n)
        else:
            toks += [(1, n.prop + 1), (0, int(pack_signed(np.array([n.val]))[0]))]
            q += [n.gt, n.le]
    return toks, leaves


def descend_static(node, chan, stream):
    while isinstance(node, Split) and node.prop in (0, 1):
        v = chan if node.prop == 0 else stream
        node = node.gt if v > node.val else node.le
    return node


def leaf_index_map(node, c, nb, leaf_ids, chan, stream):
    """Leaf (decode-order index) for every pixel of channel c."""
    node = descend_static(node, chan, stream)
    if isinstance(node, Leaf):
        return np.full(c.shape, leaf_ids[id(node)], np.int64)
    out = np.empty(c.shape, np.int64)
    stack = [(node, np.ones(c.shape, bool))]
    cache = {}
    while stack:
        n, m = stack.pop()
        n = descend_static(n, chan, stream)
        if isinstance(n, Leaf):
            out[m] = leaf_ids[id(n)]
            continue
        if n.prop not in cache:
            cache[n.prop] = prop_values(n.prop, c, nb)
        gt = cache[n.prop] > n.val
        stack.append((n.gt, m & gt))
        stack.append((n.le, m & ~gt))
    return out


# ── tree learning (lossless) ──────────────────────────────────────────────────────────────────────────────
def _entropy_bits(hist):
    """hist: [..., tokens] → bits to code those tokens with their own optimal code."""
    hist = np.asarray(hist, np.float64)
    n = hist.sum(-1, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        e = np.where(hist > 0, hist * np.log2(np.maximum(n, 1) / np.maximum(hist, 1)), 0.0)
    return e.sum(-1)


def learn_subtree(res, props, effort, key_prefix):
    """Greedy context tree for one channel: res = residuals (1-D), props = {p: 1-D values}.  Splits are kept when
    they save more than the cost of an extra histogram."""
    tok = hybrid_uint_000(pack_signed(res))[0]
    T = int(tok.max()) + 1 if tok.size else 1
    max_depth = {1: 0, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7}.get(effort, 3)
    nq = 8 if effort <= 5 else 16
    props_try = DYNAMIC_PROPS[:6] if effort <= 5 else DYNAMIC_PROPS[:10]
    leaf_cost = 40 * 8                                   # ≈ one histogram + tree tokens
    min_samples = 1024
    counter = [0]

    def make_leaf():
        counter[0] += 1
        return Leaf(PRED_GRADIENT, key=(key_prefix, counter[0]))

    def grow(idx, depth):
        if depth >= max_depth or idx.size < 2 * min_samples:
            return make_leaf()
        t = tok[idx]
        base = _entropy_bits(np.bincount(t, minlength=T)[None])[0]
        best = None
        for p in props_try:
            v = props[p][idx]
            qs = np.unique(np.quantile(v, np.linspace(0, 1, nq + 1)[1:-1]).astype(np.int64))
            if qs.size == 0:
                continue
            b = np.searchsorted(qs, v, side="left")      # bucket b: qs[b-1] < v <= qs[b]
            h2 = np.bincount(b * T + t, minlength=(qs.size + 1) * T).reshape(qs.size + 1, T)
            cum = np.cumsum(h2, 0)[:-1]                  # samples with v <= qs[k]
            tot = h2.sum(0)
            le, gt = cum, tot[None] - cum
            ok = (le.sum(1) >= min_samples) & (gt.sum(1) >= min_samples)
            if not ok.any():
                continue
            cost = np.where(ok, _entropy_bits(le) + _entropy_bits(gt), np.inf)
            k = int(np.argmin(cost))
            gain = base - cost[k]
            if gain > leaf_cost and (best is None or gain > best[0]):
                best = (gain, p, int(qs[k]))
        if best is None:
            return make_leaf()
        _, p, sv = best
        sel = props[p][idx] > sv
        return Split(p, sv, grow(idx[sel], depth + 1), grow(idx[~sel], depth + 1))

    return grow(np.arange(res.size), 0)


def _leaves(node):
    if isinstance(node, Leaf):
        return [node]
    return _leaves(node.gt) + _leaves(node.le)


# ── colour transform + squeeze ────────────────────────────────────────────────────────────────────────────
def ycocg(r, g, b):
    r, g, b = r.astype(np.int64), g.astype(np.int64), b.astype(np.int64)
    co = r - b
    tmp = b + (co >> 1)
    cg = g - tmp
    y = tmp + (cg >> 1)
    return y, co, cg


class Chan:
    __slots__ = ("a", "hs", "vs", "comp", "resid")

    def __init__(self, a, hs=0, vs=0, comp=0, resid=False):
        self.a, self.hs, self.vs, self.comp, self.resid = a, hs, vs, comp, resid


def _avg(x, y):
    return (x + y + (x > y)) >> 1


def smooth_tendency(B, a, n):
    d1 = _tdiv(4 * B - 3 * n - a + 6, 12)
    d1 = np.where(d1 - (d1 & 1) > 2 * (B - a), 2 * (B - a) + 1, d1)
    d1 = np.where(d1 + (d1 & 1) > 2 * (a - n), 2 * (a - n), d1)
    d2 = _tdiv(4 * B - 3 * n - a - 6, 12)
    d2 = np.where(d2 + (d2 & 1) < 2 * (B - a), 2 * (B - a) - 1, d2)
    d2 = np.where(d2 - (d2 & 1) < 2 * (a - n), 2 * (a - n), d2)
    return np.where((B >= a) & (a >= n), d1, np.where((B <= a) & (a <= n), d2, 0))


def fwd_hsqueeze(x):
    """FwdHSqueeze for a whole channel → (averages, residuals)."""
    x = x.astype(np.int64)
    h, w = x.shape
    wo = (w + 1) // 2
    nr = w - wo
    A, B = x[:, 0:2 * nr:2], x[:, 1:2 * nr:2]
    avg = _avg(A, B)
    nxt = np.empty_like(avg)
    left = np.empty_like(avg)
    if nr:
        nxt[:, :-1] = avg[:, 1:]
        nxt[:, -1] = x[:, 2 * nr] if (w & 1) else avg[:, -1]
        left[:, 0] = avg[:, 0]
        left[:, 1:] = x[:, 1:2 * nr - 2:2]
    res = (A - B) - smooth_tendency(left, avg, nxt)
    out = np.empty((h, wo), np.int64)
    out[:, :nr] = avg
    if w & 1:
        out[:, -1] = x[:, -1]
    return out, res


def fwd_vsqueeze(x):
    a, r = fwd_hsqueeze(np.ascontiguousarray(x.T))
    return np.ascontiguousarray(a.T), np.ascontiguousarray(r.T)


def default_squeeze(chans, nb_meta=0):
    """DefaultSqueezeParameters + FwdSqueeze (in the decoder's channel order)."""
    h, w = chans[nb_meta].a.shape
    steps = []
    nb = len(chans) - nb_meta
    if nb > 2 and chans[nb_meta + 1].a.shape == chans[nb_meta].a.shape:
        steps += [(True, False, nb_meta + 1, 2), (False, False, nb_meta + 1, 2)]
    if not w > h and h > 8:
        steps.append((False, True, nb_meta, nb))
        h = (h + 1) // 2
    while w > 8 or h > 8:
        if w > 8:
            steps.append((True, True, nb_meta, nb))
            w = (w + 1) // 2
        if h > 8:
            steps.append((False, True, nb_meta, nb))
            h = (h + 1) // 2
    for horiz, inplace, b, n in steps:
        offset = b + n if inplace else len(chans)
        for c in range(b, b + n):
            ch = chans[c]
            avg, res = (fwd_hsqueeze if horiz else fwd_vsqueeze)(ch.a)
            hs, vs = (ch.hs + 1, ch.vs) if horiz else (ch.hs, ch.vs + 1)
            chans[c] = Chan(avg, hs, vs, ch.comp, ch.resid)
            chans.insert(offset + c - b, Chan(res, hs, vs, ch.comp, True))
    return chans


# ── frame layout: which channel pieces go into which stream ───────────────────────────────────────────────
class Layout:
    def __init__(self, w, h, group_shift):
        self.w, self.h = w, h
        self.gdim = 128 << group_shift
        self.gx, self.gy = -(-w // self.gdim), -(-h // self.gdim)
        self.dcdim = self.gdim * 8
        self.dgx, self.dgy = -(-w // self.dcdim), -(-h // self.dcdim)
        self.num_groups, self.num_dc = self.gx * self.gy, self.dgx * self.dgy
        self.single = self.num_groups == 1

    def lf_id(self, i):
        return 1 + self.num_dc + i

    def ac_id(self, g):
        return 1 + 3 * self.num_dc + NUM_QUANT_TABLES + g

    def streams(self, chans):
        """→ global [(ci, array)], lf [(sid, [(ci, array)])], ac [(sid, [(ci, array)])]."""
        gdim = self.gdim
        beginc = len(chans)
        for i, c in enumerate(chans):
            if c.a.shape[1] > gdim or c.a.shape[0] > gdim:
                beginc = i
                break
        glob = [(i, c.a) for i, c in enumerate(chans[:beginc]) if c.a.size]

        def cut(x0, y0, dim, lo, hi):
            out = []
            for i in range(beginc, len(chans)):
                c = chans[i]
                s = min(c.hs, c.vs)
                if s < lo or s > hi:
                    continue
                cx, cy = x0 >> c.hs, y0 >> c.vs
                cw, chh = dim >> c.hs, dim >> c.vs
                hh, ww = c.a.shape
                cw = cw if cx + cw <= ww else max(0, ww - cx)
                chh = chh if cy + chh <= hh else max(0, hh - cy)
                if cw == 0 or chh == 0:
                    continue
                out.append((i, c.a[cy:cy + chh, cx:cx + cw]))
            return out
        lf = [(self.lf_id(j * self.dgx + i), cut(i * self.dcdim, j * self.dcdim, self.dcdim, 3, 1000))
              for j in range(self.dgy) for i in range(self.dgx)]
        ac = [(self.ac_id(j * self.gx + i), cut(i * gdim, j * gdim, gdim, 0, 2))
              for j in range(self.gy) for i in range(self.gx)]
        return glob, lf, ac


# ── quantisation for lossy (squeeze residuals) ────────────────────────────────────────────────────────────
def quant_step(chan, quality, bits, comp_is_alpha):
    """Step for a squeeze residual channel: coarser for fine detail and for chroma; alpha stays lossless.
    Quality follows libjxl's scale (90 ≈ distance 1, visually lossless; 100 = lossless)."""
    if quality >= 100 or comp_is_alpha or not chan.resid:
        return 1
    d = 0.5 + (100.0 - quality) * 0.5
    scale = float(1 << max(0, bits - 8)) if bits <= 16 else 1.0
    level = chan.hs + chan.vs                             # 1 = finest detail
    band = 2.9 * (0.62 ** (level - 1))
    comp = 1.0 if chan.comp == 0 else 3.0
    return max(1, int(round(d * scale * band * comp)))


def _quantise(a, q):
    if q <= 1:
        return a
    return _tdiv(a + np.sign(a) * (q // 2), q) * q        # round half away from zero, kept as multiples of q


# ── LZ77 run-length coding of zero residuals (copies at distance 1, like libjxl's fast-lossless RLE) ────────
LZ77_MIN_SYMBOL, LZ77_MIN_LENGTH = 224, 3


def _zero_runs(v):
    z = np.concatenate([[False], v == 0, [False]])
    d = np.diff(z.astype(np.int8))
    return np.flatnonzero(d == 1), np.flatnonzero(d == -1)


def lz77_worth(v):
    s, e = _zero_runs(v)
    return bool(((e - s) >= LZ77_MIN_LENGTH + 1 + 4).any())


def lz77_layout(v, cl, dist_cl):
    """values + clusters → (value, kind, cluster): kind 0 literal, 1 LZ77 length, 2 LZ77 distance.  Long zero runs
    become one literal 0 followed by a copy of the rest from distance 1 (the decoder's special distance 1 is the
    previous symbol)."""
    s, e = _zero_runs(v)
    L = e - s - 1                                         # symbols to copy after the literal
    keep = L >= LZ77_MIN_LENGTH + 4
    s, L = s[keep], L[keep]
    if dist_cl is None or s.size == 0:
        return v, np.zeros(v.size, np.int8), cl
    drop = np.zeros(v.size + 1, np.int64)
    np.add.at(drop, s + 1, 1)
    np.add.at(drop, s + 1 + L, -1)
    pos = np.flatnonzero(np.cumsum(drop)[:-1] == 0)
    key = np.concatenate([pos * 2, (s + 1) * 2, (s + 1) * 2 + 1])
    order = np.argsort(key, kind="stable")
    V = np.concatenate([v[pos], (L - LZ77_MIN_LENGTH).astype(np.uint64), np.ones(s.size, np.uint64)])[order]
    K = np.concatenate([np.zeros(pos.size, np.int8), np.ones(s.size, np.int8), np.full(s.size, 2, np.int8)])[order]
    C = np.concatenate([cl[pos], cl[s + 1], np.full(s.size, dist_cl, np.int64)])[order]
    return V, K, C


def tokenise(V, K, C, configs):
    """Per-cluster hybrid-uint configs for literals; LZ77 lengths use config 000 offset by min_symbol."""
    t = np.zeros(V.size, np.int64)
    nb = np.zeros(V.size, np.int64)
    ex = np.zeros(V.size, np.uint64)
    for c in np.unique(C):
        for kind in (0, 1, 2):
            m = (C == c) & (K == kind)
            if not m.any():
                continue
            cfg = (0, 0, 0) if kind == 1 else configs[c]
            tt, nn, ee = hybrid_uint(V[m], cfg)
            t[m] = tt + (LZ77_MIN_SYMBOL if kind == 1 else 0)
            nb[m], ex[m] = nn, ee
    return t, nb, ex, C


# ── frame encoding ────────────────────────────────────────────────────────────────────────────────────────
def prepare_channels(planes, o):
    planes = [np.asarray(p, dtype=np.int64) for p in planes]
    ncol = 1 if o.grey else 3
    if ncol == 3 and not (getattr(o, "float_samples", False) and o.bits > 24):   # no RCT on 32-bit patterns
        y, co, cg = ycocg(planes[0], planes[1], planes[2])
        chans = [Chan(y, comp=0), Chan(co, comp=1), Chan(cg, comp=2)]
        rct = True
    else:
        chans = [Chan(p, comp=0) for p in planes[:ncol]]
        rct = False
    for p in planes[ncol:]:
        chans.append(Chan(p, comp=3))
    return chans, rct


def choose_predictor(chan, effort):
    if effort <= 2:
        return PRED_GRADIENT
    cands = CANDIDATES_BY_EFFORT.get(effort, ALL_PREDICTORS)
    h, w = chan.shape
    sample = chan if (effort >= 7 or h * w <= 512 * 512) else chan[: max(4, h // 4)]
    nb = neighbours(sample)
    best, bc = PRED_GRADIENT, None
    for p in cands:
        r = sample - predict(sample, p, nb)
        t = hybrid_uint_000(pack_signed(r.ravel()))
        c = float(_entropy_bits(np.bincount(t[0])[None])[0] + t[1].sum())
        if bc is None or c < bc:
            best, bc = p, c
    return best


def write_global_header(bw, transforms):
    """GroupHeader: use global tree, default WP, transform list [('rct', type) | ('squeeze',)]."""
    bw.write(1, 1)
    bw.write(1, 1)
    bw.u32(len(transforms), (VAL(0), VAL(1), BO(4, 2), BO(8, 18)))
    for t in transforms:
        if t[0] == "rct":
            bw.u32(0, (VAL(0), VAL(1), VAL(2), VAL(3)))
            bw.u32(0, (BITS(3), BO(6, 8), BO(10, 72), BO(13, 1096)))
            bw.u32(t[1], (VAL(6), BITS(2), BO(4, 2), BO(6, 10)))
        else:                                            # squeeze with the default script
            bw.u32(2, (VAL(0), VAL(1), VAL(2), VAL(3)))
            bw.u32(0, (VAL(0), BO(4, 1), BO(6, 9), BO(8, 41)))


def encode_frame_sections(planes, o, fo):
    """→ (list of section bytes in TOC order, Layout)."""
    effort = max(1, min(9, int(fo.effort)))
    lossy = not fo.lossless and fo.quality < 100 and not getattr(o, "float_samples", False)   # float: lossless
    chans, rct = prepare_channels(planes, o)
    transforms = [("rct", 6)] if rct else []
    squeeze = lossy or fo.progressive
    if squeeze:
        chans = default_squeeze(chans)
        transforms.append(("squeeze",))
    h, w = planes[0].shape
    L = Layout(w, h, fo.group_shift)
    glob, lf, ac = L.streams(chans)
    focus = [tuple(r) for r in (getattr(fo, "focus", None) or [])]
    fq = getattr(fo, "focus_quality", 0) or 0

    if squeeze:
        tree, specs = _squeeze_tree(chans, glob, lf, ac, L, o, fo, focus, fq, effort)
    else:
        tree, specs = _lossless_tree(chans, glob, ac, effort), None

    toks, leaves = serialise_tree(tree)
    leaf_ids = {id(n): i for i, n in enumerate(leaves)}
    keys = {}
    for n in leaves:
        keys.setdefault(n.key, len(keys))
    ctx_map = np.array([keys[n.key] for n in leaves], np.int64)

    # ── residual tokens for every stream ──
    def stream_values(sid, items):
        vals, cls = [], []
        for li, (ci, a) in enumerate(items):
            a = a.astype(np.int64)
            if specs is not None:
                a = _quantise(a, specs[(sid, li)][1])
            nb = neighbours(a)
            lid = leaf_index_map(tree, a, nb, leaf_ids, li, sid)
            ks = np.unique(lid)
            if ks.size == 1:
                n = leaves[ks[0]]
                r = (a - n.offset - predict(a, n.pred, nb)) // n.mul
            else:
                r = np.empty(a.shape, np.int64)
                preds = {}
                for k in ks:
                    n = leaves[k]
                    m = lid == k
                    if n.pred not in preds:
                        preds[n.pred] = predict(a, n.pred, nb)
                    r[m] = (a[m] - n.offset - preds[n.pred][m]) // n.mul
            vals.append(pack_signed(wrap32(r).ravel()))
            cls.append(ctx_map[lid.ravel()])
        return np.concatenate(vals), np.concatenate(cls)

    all_streams = [(0, glob)] + list(lf) + list(ac)
    raw = [stream_values(sid, items) if items else None for sid, items in all_streams]
    ncl = len(keys)
    use_lz = any(r is not None and lz77_worth(r[0]) for r in raw)
    dist_cl = ncl if use_lz else None
    lay = [None if r is None else lz77_layout(r[0], r[1], dist_cl) for r in raw]
    ncl_all = ncl + (1 if use_lz else 0)
    # hybrid-uint config per cluster, chosen on (a sample of) its literal values
    configs = [(0, 0, 0)] * ncl_all
    if effort >= 2:
        samp = [[] for _ in range(ncl)]
        for x in lay:
            if x is None:
                continue
            V, K, C = x
            lit = K == 0
            for c in np.unique(C[lit]):
                samp[c].append(V[lit & (C == c)][:200_000])
        for c in range(ncl):
            if samp[c]:
                configs[c] = best_uint_config(np.concatenate(samp[c])[:400_000])
    toks_by_stream = [None if x is None else tokenise(*x, configs) for x in lay]
    T = 1
    for st in toks_by_stream:
        if st is not None and st[0].size:
            T = max(T, int(st[0].max()) + 1)
    hist = np.zeros(ncl_all * T, np.int64)
    for st in toks_by_stream:
        if st is not None:
            hist += np.bincount(st[3] * T + st[0], minlength=ncl_all * T)
    hist = hist.reshape(ncl_all, T)
    codes = [PrefixCode(hh) for hh in hist]
    table = CodeTable(codes)
    if _DEBUG:
        ent = float(_entropy_bits(hist).sum()) / 8
        pre = float(sum((hh * np.asarray(c.lens + [0] * (hh.size - len(c.lens)))[:hh.size]).sum() for hh, c in zip(hist, codes))) / 8
        ext = float(sum(st[1].sum() for st in toks_by_stream if st is not None)) / 8
        print("  [jxl] symbols %d  ideal %.0f B  prefix %.0f B  raw bits %.0f B  clusters %d" % (
            int(hist.sum()), ent, pre, ext, ncl_all))
    if use_lz:
        ctx_map = np.concatenate([ctx_map, [dist_cl]])

    def emit(bw, st):
        if st is not None:
            wds, n = pack_symbols(st[0], st[1], st[2], table, st[3])
            bw.append_segment(wds, n)

    # ── LfGlobal ──
    g = BitWriter()
    g.write(1, 1)                                        # default LF dequantisation
    g.write(1, 1)                                        # global MA tree present
    tv = np.array([v for _, v in toks], np.uint64)
    tt, tnb, tex = hybrid_uint_000(tv)
    tcode = PrefixCode(np.bincount(tt))
    write_histograms(g, [0] * 6, [tcode])                # all six tree contexts share one code
    wds, n = pack_symbols(tt, tnb, tex, CodeTable([tcode]), np.zeros(tt.size, np.int64))
    g.append_segment(wds, n)
    write_histograms(g, [int(x) for x in ctx_map], codes, lz77=LZ77_MIN_SYMBOL if use_lz else None, configs=configs)
    write_global_header(g, transforms)
    emit(g, toks_by_stream[0])

    def group_stream(st):
        bw = BitWriter()
        if st is not None:
            write_global_header(bw, [])
            emit(bw, st)
        return bw

    lf_bws = [group_stream(st) for st in toks_by_stream[1:1 + len(lf)]]
    ac_bws = [group_stream(st) for st in toks_by_stream[1 + len(lf):]]
    if L.single:                                         # one section: LfGlobal, LfGroup, HfGlobal, group
        for bw in lf_bws + ac_bws:
            g.append_writer(bw)
        g.zero_pad_to_byte()
        return [g.tobytes()], L
    g.zero_pad_to_byte()
    sections = [g.tobytes()]
    for bw in lf_bws:
        bw.zero_pad_to_byte()
        sections.append(bw.tobytes())
    sections.append(b"")                                 # HfGlobal: empty for modular
    for bw in ac_bws:
        bw.zero_pad_to_byte()
        sections.append(bw.tobytes())
    return sections, L


def _lossless_tree(chans, glob, ac, effort):
    """One subtree per channel (static split on the channel index), learned from a sample of its pixels."""
    subs = []
    for ci in range(len(chans)):
        pieces = [a for i, a in glob if i == ci] + [a for _, items in ac for i, a in items if i == ci]
        pieces = [p.astype(np.int64) for p in pieces if p.size]
        if not pieces:
            subs.append(Leaf(PRED_GRADIENT, key=("c", ci)))
            continue
        full = max(pieces, key=lambda p: p.size)
        pred = choose_predictor(full, effort)
        if effort < 3:
            subs.append(Leaf(pred, key=("c", ci)))
            continue
        budget = 600_000 if effort <= 6 else 3_000_000
        step = max(1, (sum(p.size for p in pieces) + budget - 1) // budget)
        chosen = pieces[::step]
        res, props = [], {p: [] for p in DYNAMIC_PROPS}
        for p in chosen:
            nb = neighbours(p)
            res.append((p - predict(p, pred, nb)).ravel())
            for k in DYNAMIC_PROPS:
                props[k].append(np.ascontiguousarray(prop_values(k, p, nb)).ravel())
        res = np.concatenate(res)
        props = {k: np.concatenate(v) for k, v in props.items()}
        sub = learn_subtree(res, props, effort, ("c", ci))
        for lf_ in _leaves(sub):
            lf_.pred = pred
        if effort >= 7 and not isinstance(sub, Leaf):
            _refine_leaf_predictors(sub, chosen)
        subs.append(sub)
    return static_split(0, list(enumerate(subs)))


def _refine_leaf_predictors(sub, pieces):
    """Effort ≥ 7: pick the best predictor separately for every context."""
    cands = ALL_PREDICTORS
    leaves = _leaves(sub)
    ids = {id(n): i for i, n in enumerate(leaves)}
    cost = np.zeros((len(leaves), len(cands)))
    for p in pieces:
        nb = neighbours(p)
        lid = leaf_index_map(sub, p, nb, ids, 0, 0).ravel()
        for j, pr in enumerate(cands):
            r = (p - predict(p, pr, nb)).ravel()
            v = np.log2(pack_signed(r).astype(np.float64) + 1.0) * 1.1 + 1
            cost[:, j] += np.bincount(lid, weights=v, minlength=len(leaves))
    for i, n in enumerate(leaves):
        n.pred = cands[int(np.argmin(cost[i]))]


def _squeeze_tree(chans, glob, lf, ac, L, o, fo, focus, fq, effort):
    """Lossy / progressive: leaves keyed per (stream, local channel) with the quantisation step as multiplier.
    Residual bands use the zero predictor; the tiny low-pass channels use the gradient predictor, losslessly."""
    specs = {}
    gd = L.gdim

    def in_focus(sid):
        g = sid - L.ac_id(0)
        if not focus or g < 0:
            return False
        gx0, gy0 = (g % L.gx) * gd, (g // L.gx) * gd
        return any(x < gx0 + gd and gx0 < x + rw and y < gy0 + gd and gy0 < y + rh for x, y, rw, rh in focus)

    subtrees, cache = [], {}
    for sid, items in [(0, glob)] + list(lf) + list(ac):
        if not items:
            continue
        qual = max(fo.quality, fq) if in_focus(sid) else fo.quality
        if fo.lossless:
            qual = 100
        per = []
        for li, (ci, a) in enumerate(items):
            c = chans[ci]
            q = quant_step(c, qual, o.bits, c.comp == 3)
            pred = PRED_ZERO if c.resid else PRED_GRADIENT
            key = (c.comp, c.hs + c.vs if c.resid else -1)
            specs[(sid, li)] = (pred, q)
            lk = (pred, q, key)
            if lk not in cache:
                cache[lk] = Leaf(pred, 0, q, key=key)
            per.append((li, cache[lk]))
        sig = tuple(id(n) for _, n in per)
        if sig not in cache:
            cache[sig] = static_split(0, per)
        subtrees.append((sid, cache[sig]))
    if not subtrees:
        return Leaf(PRED_GRADIENT, key="x"), specs
    return static_split(1, subtrees), specs
