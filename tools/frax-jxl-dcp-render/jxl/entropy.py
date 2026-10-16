# SPDX-License-Identifier: GPL-3.0-or-later AND BSD-3-Clause
# Entropy coding for JPEG XL with prefix (Huffman) codes, as read by libjxl's dec_ans.cc / dec_huffman.cc:
# hybrid-uint tokens (config 0-0-0), length-limited canonical Huffman codes, Brotli-style code serialisation,
# and fully vectorised symbol → bit packing in numpy.
import heapq

import numpy as np

MAX_LEN = 15
CODE_LENGTH_ORDER = (1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15)
# static code for the code-length-code lengths (value → (nbits, bits)), from the decoder's 4-bit table
CL_STATIC = {0: (2, 0), 1: (4, 7), 2: (3, 3), 3: (2, 2), 4: (2, 1), 5: (4, 15)}


def hybrid_uint_000(values):
    """values (uint64 array) → token, nbits, extra bits.  token = 0 for 0, else floor(log2 v) + 1."""
    v = values.astype(np.uint64)
    nz = v > 0
    n = np.zeros(v.shape, np.int64)
    if nz.any():
        n[nz] = np.floor(np.log2(v[nz].astype(np.float64))).astype(np.int64)
        # guard float rounding for large values
        big = nz & (v >= np.uint64(1 << 52))
        if big.any():
            n[big] = np.array([int(x).bit_length() - 1 for x in v[big]], np.int64)
        lo = nz & ((np.uint64(1) << n.astype(np.uint64)) > v)
        n[lo] -= 1
    token = np.where(nz, n + 1, 0)
    nbits = np.where(nz, n, 0)
    extra = np.where(nz, v - (np.uint64(1) << nbits.astype(np.uint64)), 0).astype(np.uint64)
    return token.astype(np.int64), nbits.astype(np.int64), extra


def hybrid_uint(values, cfg):
    """HybridUintConfig(split_exponent, msb_in_token, lsb_in_token).Encode, vectorised → token, nbits, bits."""
    se, msb, lsb = cfg
    if cfg == (0, 0, 0):
        return hybrid_uint_000(values)
    v = np.asarray(values).astype(np.uint64)
    split = 1 << se
    small = v < split
    vv = np.where(small, np.uint64(1), v)
    n = np.floor(np.log2(vv.astype(np.float64))).astype(np.int64)
    big = vv >= np.uint64(1 << 52)
    if big.any():
        n[big] = np.array([int(x).bit_length() - 1 for x in vv[big]], np.int64)
    n[(np.uint64(1) << n.astype(np.uint64)) > vv] -= 1
    m = vv - (np.uint64(1) << n.astype(np.uint64))
    sh = np.maximum(n - msb, 0).astype(np.uint64)
    tok = split + ((n - se) << (msb + lsb)) + ((m >> sh).astype(np.int64) << lsb) + (m & np.uint64((1 << lsb) - 1)).astype(np.int64)
    nbits = n - msb - lsb
    bits = (vv >> np.uint64(lsb)) & ((np.uint64(1) << np.maximum(nbits, 0).astype(np.uint64)) - np.uint64(1))
    tok = np.where(small, v.astype(np.int64), tok)
    nbits = np.where(small, 0, nbits)
    bits = np.where(small, np.uint64(0), bits)
    return tok.astype(np.int64), nbits.astype(np.int64), bits.astype(np.uint64)


UINT_CONFIGS = [(0, 0, 0), (4, 0, 0), (4, 1, 0), (4, 2, 0), (4, 1, 1), (3, 1, 1), (5, 2, 0), (6, 2, 1), (2, 0, 0)]


def best_uint_config(values, cands=UINT_CONFIGS):
    """Pick the hybrid-uint split that minimises (token entropy + raw bits) for these values."""
    if values.size == 0:
        return (0, 0, 0)
    best, bc = (0, 0, 0), None
    for cfg in cands:
        t, nb, _ = hybrid_uint(values, cfg)
        h = np.bincount(t).astype(np.float64)
        n = h.sum()
        hn = h[h > 0]
        cost = float((hn * np.log2(n / hn)).sum() + nb.sum() + 6 * hn.size)
        if bc is None or cost < bc:
            best, bc = cfg, cost
    return best


def write_uint_config(bw, cfg, log_alpha=15):
    se, msb, lsb = cfg
    bw.write((log_alpha + 1 - 1).bit_length() if log_alpha else 0, se)     # CeilLog2(log_alpha + 1) bits
    if se != log_alpha:
        bw.write((se + 1 - 1).bit_length() if se else 0, msb)              # CeilLog2(se + 1)
        bw.write((se - msb + 1 - 1).bit_length() if se - msb else 0, lsb)  # CeilLog2(se - msb + 1)


def huffman_lengths(freqs, max_len=MAX_LEN):
    """Length-limited Huffman code lengths (complete code) for the symbols with freq > 0."""
    freqs = [int(f) for f in freqs]
    syms = [i for i, f in enumerate(freqs) if f > 0]
    lens = [0] * len(freqs)
    if len(syms) == 0:
        return lens
    if len(syms) == 1:
        lens[syms[0]] = 0
        return lens
    # standard Huffman
    heap = [(freqs[s], i, [s]) for i, s in enumerate(syms)]
    heapq.heapify(heap)
    cnt = len(syms)
    depth = {s: 0 for s in syms}
    while len(heap) > 1:
        f1, _, a = heapq.heappop(heap)
        f2, _, b = heapq.heappop(heap)
        for s in a + b:
            depth[s] += 1
        cnt += 1
        heapq.heappush(heap, (f1 + f2, cnt, a + b))
    # limit lengths (simple redistribution keeping Kraft equality)
    L = {s: depth[s] for s in syms}
    if max(L.values()) > max_len:
        for s in syms:
            L[s] = min(L[s], max_len)
        kraft = sum(2 ** (max_len - L[s]) for s in syms)
        target = 2 ** max_len
        order = sorted(syms, key=lambda s: (freqs[s], -L[s]))
        while kraft > target:                       # lengthen the rarest symbols
            for s in order:
                if L[s] < max_len:
                    kraft -= 2 ** (max_len - L[s] - 1)
                    L[s] += 1
                    if kraft <= target:
                        break
        order = sorted(syms, key=lambda s: (-freqs[s], L[s]))
        changed = True
        while kraft < target and changed:           # shorten the most frequent while there is room
            changed = False
            for s in order:
                if L[s] > 1 and kraft + 2 ** (max_len - L[s]) <= target:
                    kraft += 2 ** (max_len - L[s])
                    L[s] -= 1
                    changed = True
                    if kraft == target:
                        break
    for s in syms:
        lens[s] = L[s]
    return lens


def bit_reverse(v, n):
    r = 0
    for _ in range(n):
        r = (r << 1) | (v & 1)
        v >>= 1
    return r


def canonical_codes(lens):
    """Canonical codes (bit-reversed for LSB-first writing), like libjxl's ComputeCanonicalCode."""
    max_len = max(lens) if lens else 0
    bl_count = [0] * (max_len + 2)
    for l in lens:
        if l:
            bl_count[l] += 1
    code = 0
    next_code = [0] * (max_len + 2)
    for b in range(1, max_len + 1):
        code = (code + bl_count[b - 1]) << 1
        next_code[b] = code
    codes = [0] * len(lens)
    for s, l in enumerate(lens):
        if l:
            codes[s] = bit_reverse(next_code[l], l)
            next_code[l] += 1
    return codes


class PrefixCode:
    """A prefix code for one histogram (cluster): code lengths, codes, and how to write it into the stream."""

    def __init__(self, freqs):
        freqs = list(freqs)
        used = [i for i, f in enumerate(freqs) if f > 0]
        if not used:
            freqs[0] = 1
            used = [0]
        self.alphabet = max(used) + 1
        self.used = used
        if len(used) == 1:
            self.lens = [0] * self.alphabet
        elif len(used) == 2:
            self.lens = [0] * self.alphabet
            for s in used:
                self.lens[s] = 1
        else:
            self.lens = huffman_lengths(freqs[:self.alphabet])
        self.codes = canonical_codes(self.lens)

    def write_alphabet_size(self, bw):
        v = self.alphabet - 1                            # VarLenUint16
        if v == 0:
            bw.write(1, 0)
        else:
            bw.write(1, 1)
            n = v.bit_length() - 1
            bw.write(4, n)
            bw.write(n, v - (1 << n))

    def write(self, bw):
        """Serialise (only called when alphabet > 1)."""
        if self.alphabet == 1:
            return
        if len(self.used) <= 2:                         # simple code: 1 or 2 symbols
            bw.write(2, 1)
            bw.write(2, len(self.used) - 1)
            max_bits = (self.alphabet - 1).bit_length()
            for s in self.used:
                bw.write(max_bits, s)
            return
        # complex code: code lengths coded with a code-length code
        seq = self.lens[:]                               # stop after the last non-zero length
        while seq and seq[-1] == 0:
            seq.pop()
        cl_freq = [0] * 18
        for l in seq:
            cl_freq[l] += 1
        cl_used = [i for i in range(18) if cl_freq[i]]
        if len(cl_used) == 1:
            cl_lens = [0] * 18
            cl_lens[cl_used[0]] = 1
            single = True
        else:
            cl_lens = huffman_lengths(cl_freq, max_len=5)
            single = False
        cl_codes = canonical_codes(cl_lens)
        bw.write(2, 0)                                   # HSKIP = 0
        space = 32
        written = 0
        for idx in CODE_LENGTH_ORDER:
            v = cl_lens[idx]
            nb, bits = CL_STATIC[v]
            bw.write(nb, bits)
            written += 1
            if v:
                space -= 32 >> v
            if space <= 0 and not single:
                break
        # symbol code lengths
        if single:
            return                                       # one code-length symbol: 0 bits per symbol
        space = 32768
        for l in seq:
            bw.write(cl_lens[l], cl_codes[l])
            if l:
                space -= 32768 >> l
            if space <= 0:
                break


def pack_bits(values, lengths):
    """Concatenate variable-length LSB-first codes → (uint64 words, nbits).  values < 2**58 each."""
    lengths = np.asarray(lengths, np.int64)
    n = int(lengths.sum())
    if n == 0:
        return np.zeros(1, np.uint64), 0
    values = np.asarray(values, np.uint64)
    pos = np.cumsum(lengths) - lengths
    words = np.zeros(n // 64 + 2, np.uint64)
    wi, off = pos >> 6, (pos & 63).astype(np.uint64)
    np.add.at(words, wi, values << off)                    # codes never overlap, so add == or
    spill = (pos & 63) + lengths > 64
    if spill.any():
        np.add.at(words, wi[spill] + 1, values[spill] >> (np.uint64(64) - off[spill]))
    return words, n


class CodeTable:
    """All clusters' prefix codes as 2-D lookup tables [cluster, token] for vectorised packing."""

    def __init__(self, codes):
        a = max(max(c.alphabet for c in codes), 1)
        self.lens = np.zeros((len(codes), a + 64), np.int64)
        self.vals = np.zeros((len(codes), a + 64), np.uint64)
        for i, c in enumerate(codes):
            self.lens[i, :c.alphabet] = c.lens
            self.vals[i, :c.alphabet] = c.codes


def pack_symbols(tokens, nbits, extra, table, cluster):
    """tokens + hybrid-uint extra bits, each with its cluster → packed (words, nbits)."""
    if tokens.size == 0:
        return np.zeros(1, np.uint64), 0
    clen = table.lens[cluster, tokens]
    val = table.vals[cluster, tokens] | (extra.astype(np.uint64) << clen.astype(np.uint64))
    out_w, out_n = [], 0
    step = 1 << 21                                       # chunk to bound memory on very large frames
    if tokens.size <= step:
        return pack_bits(val, clen + nbits)
    from .bitwriter import BitWriter
    bw = BitWriter()
    for i in range(0, tokens.size, step):
        w, n = pack_bits(val[i:i + step], clen[i:i + step] + nbits[i:i + step])
        bw.append_segment(w, n)
    data = bw.tobytes()
    words = np.frombuffer(data + b"\0" * (-len(data) % 8), dtype="<u8").astype(np.uint64)
    return words, bw.nbits


def write_histograms(bw, ctx_map, codes, lz77=None, configs=None):
    """DecodeHistograms (dec_ans.cc) with prefix codes: LZ77 params, context map (the last context is LZ77's
    distance context when enabled), hybrid-uint 000 configs, alphabet sizes, then each cluster's code."""
    if lz77 is None:
        bw.write(1, 0)                                   # LZ77 off
    else:
        bw.write(1, 1)
        bw.write(2, 0)                                   # min_symbol = 224 (Val)
        bw.write(2, 0)                                   # min_length = 3 (Val)
        bw.write(4, 0)                                   # length HybridUintConfig(0,0,0): log_alpha 8 → 4 bits
    if len(ctx_map) > 1:
        write_context_map(bw, ctx_map)
    bw.write(1, 1)                                       # prefix codes
    for i, _ in enumerate(codes):
        write_uint_config(bw, configs[i] if configs else (0, 0, 0))
    for c in codes:
        c.write_alphabet_size(bw)
    for c in codes:
        c.write(bw)


def write_context_map(bw, ctx_map):
    n = max(ctx_map) + 1
    if n <= 8:
        bits = (n - 1).bit_length()
        bw.write(1, 1)                                   # simple
        bw.write(2, bits)
        for e in ctx_map:
            bw.write(bits, e)
        return
    bw.write(1, 0)                                       # entropy-coded context map
    bw.write(1, 0)                                       # no move-to-front
    v = np.asarray(ctx_map, np.uint64)
    tok, nb, ex = hybrid_uint_000(v)
    code = PrefixCode(np.bincount(tok))
    write_histograms(bw, [0], [code])
    w, n = pack_symbols(tok, nb, ex, CodeTable([code]), np.zeros(tok.size, np.int64))
    bw.append_segment(w, n)
