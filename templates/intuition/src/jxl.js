// SPDX-License-Identifier: GPL-3.0-or-later AND BSD-3-Clause
// Intuition JXL: a browser port of the Frax JXL encoder from the Frax JPEG XL + DCP Render Blender extension
// (DART-Skyboard/frax-jxl-dcp-render, GPL-3.0-or-later, Radical Deepscale LLC). It writes standard JPEG XL
// (ISO/IEC 18181) codestreams, so any viewer opens the files. Header and frame layouts follow libjxl
// (Copyright the JPEG XL Project Authors, BSD-3-Clause), as in the original.
//
// What is ported: Modular mode with the YCoCg colour transform, the clamped-gradient predictor, a learned-free
// per-channel MA tree, hybrid-uint tokens with Huffman (prefix) codes, 8-bit RGB / RGBA (straight alpha), tiles
// ("groups"), and animation (one codestream, exact frame timing, loop forever). Stills are lossless. For
// animations an optional `step` > 1 turns on near-lossless coding (closed-loop quantisation of the colour
// residuals, alpha stays exact) so 2K / 4K clips stay a sensible size.
// Not ported (and not needed here): lossy squeeze, focus areas, progressive passes, HDR / float, LZ77, containers.
(function (global) {
  'use strict';

  // ---------- bit writer (LSB first, like libjxl's BitWriter) ----------
  function BitWriter() { this.buf = new Uint8Array(4096); this.pos = 0; this.acc = 0; this.n = 0; }
  BitWriter.prototype._byte = function (b) {
    if (this.pos === this.buf.length) { var nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    this.buf[this.pos++] = b;
  };
  // put: n <= 24 bits, v < 2^n
  BitWriter.prototype.put = function (v, n) {
    this.acc |= v << this.n; this.n += n;
    while (this.n >= 8) { this._byte(this.acc & 255); this.acc >>>= 8; this.n -= 8; }
  };
  BitWriter.prototype.write = function (n, v) {
    if (v < 0 || v >= Math.pow(2, n)) throw new Error('value ' + v + ' does not fit in ' + n + ' bits');
    while (n > 24) { this.put(v % 16777216, 24); v = Math.floor(v / 16777216); n -= 24; }
    if (n) this.put(v, n);
  };
  BitWriter.prototype.bool = function (b) { this.put(b ? 1 : 0, 1); };
  BitWriter.prototype.pad = function () { if (this.n) { this._byte(this.acc & 255); this.acc = 0; this.n = 0; } };
  BitWriter.prototype.bytes = function () { this.pad(); return this.buf.subarray(0, this.pos); };
  // U32 with four distributions: ['val',v] | ['bits',n] | ['bo',n,offset]
  BitWriter.prototype.u32 = function (value, d) {
    var i;
    for (i = 0; i < 4; i++) if (d[i][0] === 'val' && value === d[i][1]) { this.write(2, i); return; }
    for (i = 0; i < 4; i++) {
      if (d[i][0] === 'bits' && value >= 0 && value < Math.pow(2, d[i][1])) { this.write(2, i); this.write(d[i][1], value); return; }
      if (d[i][0] === 'bo' && value >= d[i][2] && value < d[i][2] + Math.pow(2, d[i][1])) { this.write(2, i); this.write(d[i][1], value - d[i][2]); return; }
    }
    throw new Error('value ' + value + ' not representable in U32');
  };
  BitWriter.prototype.u64 = function (value) {
    if (value === 0) this.write(2, 0);
    else throw new Error('u64 > 0 not needed');
  };
  var VAL = function (v) { return ['val', v]; }, BITS = function (n) { return ['bits', n]; }, BO = function (n, o) { return ['bo', n, o]; };
  var bitLen = function (v) { return v ? 32 - Math.clz32(v) : 0; };

  // ---------- prefix (Huffman) codes ----------
  var CODE_LENGTH_ORDER = [1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  var CL_STATIC = { 0: [2, 0], 1: [4, 7], 2: [3, 3], 3: [2, 2], 4: [2, 1], 5: [4, 15] };

  function huffmanLengths(freqs, maxLen) {
    var syms = [], lens = [], i, s;
    for (i = 0; i < freqs.length; i++) { lens.push(0); if (freqs[i] > 0) syms.push(i); }
    if (syms.length <= 1) return lens;
    var heap = syms.map(function (sy, k) { return { f: freqs[sy], id: k, s: [sy] }; }), cnt = syms.length, depth = {};
    syms.forEach(function (sy) { depth[sy] = 0; });
    while (heap.length > 1) {
      heap.sort(function (a, b) { return a.f - b.f || a.id - b.id; });
      var a = heap.shift(), b = heap.shift(), m = a.s.concat(b.s);
      m.forEach(function (sy) { depth[sy]++; });
      cnt++; heap.push({ f: a.f + b.f, id: cnt, s: m });
    }
    var L = {}, mx = 0; syms.forEach(function (sy) { L[sy] = depth[sy]; if (L[sy] > mx) mx = L[sy]; });
    if (mx > maxLen) {
      syms.forEach(function (sy) { L[sy] = Math.min(L[sy], maxLen); });
      var kraft = 0, target = Math.pow(2, maxLen), order, changed;
      syms.forEach(function (sy) { kraft += Math.pow(2, maxLen - L[sy]); });
      order = syms.slice().sort(function (x, y) { return (freqs[x] - freqs[y]) || (L[y] - L[x]); });
      while (kraft > target) {
        for (i = 0; i < order.length; i++) {
          s = order[i];
          if (L[s] < maxLen) { kraft -= Math.pow(2, maxLen - L[s] - 1); L[s]++; if (kraft <= target) break; }
        }
      }
      order = syms.slice().sort(function (x, y) { return (freqs[y] - freqs[x]) || (L[x] - L[y]); });
      changed = true;
      while (kraft < target && changed) {
        changed = false;
        for (i = 0; i < order.length; i++) {
          s = order[i];
          if (L[s] > 1 && kraft + Math.pow(2, maxLen - L[s]) <= target) { kraft += Math.pow(2, maxLen - L[s]); L[s]--; changed = true; if (kraft === target) break; }
        }
      }
    }
    syms.forEach(function (sy) { lens[sy] = L[sy]; });
    return lens;
  }
  function bitReverse(v, n) { var r = 0; for (var i = 0; i < n; i++) { r = (r << 1) | (v & 1); v >>= 1; } return r; }
  function canonicalCodes(lens) {
    var maxLen = 0, i; lens.forEach(function (l) { if (l > maxLen) maxLen = l; });
    var blCount = [], nextCode = [], code = 0, codes = [];
    for (i = 0; i < maxLen + 2; i++) { blCount.push(0); nextCode.push(0); }
    lens.forEach(function (l) { if (l) blCount[l]++; });
    for (var b = 1; b <= maxLen; b++) { code = (code + blCount[b - 1]) << 1; nextCode[b] = code; }
    for (i = 0; i < lens.length; i++) { var l = lens[i]; codes.push(0); if (l) { codes[i] = bitReverse(nextCode[l], l); nextCode[l]++; } }
    return codes;
  }
  function PrefixCode(freqs) {
    freqs = Array.prototype.slice.call(freqs); var used = [], i;
    for (i = 0; i < freqs.length; i++) if (freqs[i] > 0) used.push(i);
    if (!used.length) { freqs[0] = 1; used = [0]; }
    this.used = used; this.alphabet = used[used.length - 1] + 1;
    if (used.length === 1) { this.lens = []; for (i = 0; i < this.alphabet; i++) this.lens.push(0); }
    else if (used.length === 2) { this.lens = []; for (i = 0; i < this.alphabet; i++) this.lens.push(0); used.forEach(function (s, k, arr) { this.lens[s] = 1; }, this); }
    else this.lens = huffmanLengths(freqs.slice(0, this.alphabet), 15);
    this.codes = canonicalCodes(this.lens);
  }
  PrefixCode.prototype.writeAlphabetSize = function (bw) {
    var v = this.alphabet - 1;
    if (v === 0) bw.write(1, 0);
    else { bw.write(1, 1); var n = bitLen(v) - 1; bw.write(4, n); bw.write(n, v - Math.pow(2, n)); }
  };
  PrefixCode.prototype.write = function (bw) {
    if (this.alphabet === 1) return;
    var i;
    if (this.used.length <= 2) {
      bw.write(2, 1); bw.write(2, this.used.length - 1);
      var maxBits = bitLen(this.alphabet - 1);
      this.used.forEach(function (s) { bw.write(maxBits, s); });
      return;
    }
    var seq = this.lens.slice(); while (seq.length && seq[seq.length - 1] === 0) seq.pop();
    var clFreq = []; for (i = 0; i < 18; i++) clFreq.push(0);
    seq.forEach(function (l) { clFreq[l]++; });
    var clUsed = []; for (i = 0; i < 18; i++) if (clFreq[i]) clUsed.push(i);
    var clLens, single = false;
    if (clUsed.length === 1) { clLens = []; for (i = 0; i < 18; i++) clLens.push(0); clLens[clUsed[0]] = 1; single = true; }
    else clLens = huffmanLengths(clFreq, 5);
    var clCodes = canonicalCodes(clLens);
    bw.write(2, 0);                                       // HSKIP = 0
    var space = 32;
    for (i = 0; i < CODE_LENGTH_ORDER.length; i++) {
      var v = clLens[CODE_LENGTH_ORDER[i]], st = CL_STATIC[v];
      bw.write(st[0], st[1]);
      if (v) space -= 32 >> v;
      if (space <= 0 && !single) break;
    }
    if (single) return;
    space = 32768;
    for (i = 0; i < seq.length; i++) {
      var l = seq[i];
      bw.write(clLens[l], clCodes[l]);
      if (l) space -= 32768 >> l;
      if (space <= 0) break;
    }
  };

  // Histograms (DecodeHistograms with prefix codes, LZ77 off, hybrid-uint 0-0-0 everywhere)
  function writeContextMap(bw, map) {
    var n = 0; map.forEach(function (e) { if (e + 1 > n) n = e + 1; });
    if (n > 8) throw new Error('too many contexts');
    var bits = bitLen(n - 1);
    bw.write(1, 1); bw.write(2, bits);
    map.forEach(function (e) { bw.write(bits, e); });
  }
  function writeHistograms(bw, ctxMap, codes, lz) {
    if (lz) { bw.write(1, 1); bw.write(2, 0); bw.write(2, 0); bw.write(4, 0); }   // LZ77: min symbol 224, min length 3, length config 0-0-0
    else bw.write(1, 0);                                  // LZ77 off
    if (ctxMap.length > 1) writeContextMap(bw, ctxMap);
    bw.write(1, 1);                                       // prefix codes
    codes.forEach(function () { bw.write(4, 0); });       // HybridUintConfig(0,0,0): log_alpha 15 -> 4 bits of 0
    codes.forEach(function (c) { c.writeAlphabetSize(bw); });
    codes.forEach(function (c) { c.write(bw); });
  }
  function tokenOf(v) { return v ? 32 - Math.clz32(v) : 0; }   // hybrid-uint 0-0-0
  function packSigned(v) { return v >= 0 ? v * 2 : -v * 2 - 1; }

  // ---------- MA tree (static split on the channel index) ----------
  function Leaf(pred, mul, key) { this.leaf = true; this.pred = pred; this.mul = mul; this.key = key; }
  function Split(prop, val, gt, le) { this.leaf = false; this.prop = prop; this.val = val; this.gt = gt; this.le = le; }
  function staticSplit(prop, items) {
    var runs = [];
    items.forEach(function (it) { if (runs.length && runs[runs.length - 1][2] === it[1]) runs[runs.length - 1][1] = it[0]; else runs.push([it[0], it[0], it[1]]); });
    function build(rs) {
      if (rs.length === 1) return rs[0][2];
      var m = rs.length >> 1;
      return new Split(prop, rs[m - 1][1], build(rs.slice(m)), build(rs.slice(0, m)));
    }
    return build(runs);
  }
  function serialiseTree(root) {
    var toks = [], leaves = [], q = [root];
    while (q.length) {
      var n = q.shift();
      if (n.leaf) {
        var m = n.mul, ml = 0; while (m % 2 === 0 && m > 1) { m /= 2; ml++; }
        toks.push([1, 0], [2, n.pred], [3, 0], [4, ml], [5, m - 1]); leaves.push(n);
      } else { toks.push([1, n.prop + 1], [0, packSigned(n.val)]); q.push(n.gt, n.le); }
    }
    return { toks: toks, leaves: leaves };
  }
  function leafFor(tree, chan) {
    var n = tree; while (!n.leaf) n = chan > n.val ? n.gt : n.le; return n;
  }

  // ---------- headers ----------
  var SIZE_D = [BO(9, 1), BO(13, 1), BO(18, 1), BO(30, 1)];
  function imageHeader(bw, o) {
    var animated = !!o.animated, nEc = o.alpha ? 1 : 0;
    bw.write(16, 0x0AFF);
    var small = o.width % 8 === 0 && o.height % 8 === 0 && o.width <= 256 && o.height <= 256;
    bw.bool(small);
    if (small) bw.write(5, o.height / 8 - 1); else bw.u32(o.height, SIZE_D);
    bw.write(3, 0);
    if (small) bw.write(5, o.width / 8 - 1); else bw.u32(o.width, SIZE_D);
    bw.bool(false);                                       // ImageMetadata all_default
    bw.bool(animated);                                    // extra_fields
    if (animated) {
      bw.write(3, 0); bw.bool(false); bw.bool(false); bw.bool(true);
      bw.u32(o.tpsNum, [VAL(100), VAL(1000), BO(10, 1), BO(30, 1)]);
      bw.u32(o.tpsDen, [VAL(1), VAL(1001), BO(8, 1), BO(10, 1)]);
      bw.u32(o.loops || 0, [VAL(0), BITS(3), BITS(16), BITS(32)]);
      bw.bool(false);                                     // have_timecodes
    }
    bw.bool(false); bw.u32(8, [VAL(8), VAL(10), VAL(12), BO(6, 1)]);   // 8-bit integer samples
    bw.bool(true);                                        // modular_16_bit_buffer_sufficient
    bw.u32(nEc, [VAL(0), VAL(1), BO(4, 2), BO(12, 1)]);
    if (nEc) bw.bool(true);                               // alpha: all_default (8-bit, straight)
    bw.bool(false);                                       // xyb_encoded = false
    bw.bool(true);                                        // colour encoding: sRGB default
    if (animated) bw.bool(true);                          // tone mapping default
    bw.u64(0);
    bw.bool(true);                                        // default CustomTransformData
    bw.pad();
  }
  function frameHeader(bw, o, isLast, duration, groupShift) {
    var nEc = o.alpha ? 1 : 0, i;
    bw.bool(false);
    bw.u32(0, [VAL(0), VAL(1), VAL(2), VAL(3)]);          // regular frame
    bw.bool(true);                                        // modular
    bw.u64(0);
    bw.bool(false);
    bw.u32(1, [VAL(1), VAL(2), VAL(4), VAL(8)]);
    for (i = 0; i < nEc; i++) bw.u32(1, [VAL(1), VAL(2), VAL(4), VAL(8)]);
    bw.write(2, groupShift);
    bw.u32(1, [VAL(1), VAL(2), VAL(3), BO(3, 4)]);        // passes
    bw.bool(false);                                       // full-canvas frame
    for (i = 0; i <= nEc; i++) bw.u32(0, [VAL(0), VAL(1), VAL(2), BO(2, 3)]);   // blend mode: replace
    if (o.animated) bw.u32(duration, [VAL(0), VAL(1), BITS(8), BITS(32)]);
    bw.bool(isLast);
    if (!isLast) bw.u32(0, [VAL(0), VAL(1), VAL(2), VAL(3)]);   // save_as_reference
    bw.u32(0, [VAL(0), BITS(4), BO(5, 16), BO(10, 48)]);  // no name
    bw.bool(false); bw.bool(false); bw.write(2, 0); bw.u64(0);   // loop filter: none
    bw.u64(0);
  }
  function globalHeader(bw, rct) {
    bw.write(1, 1); bw.write(1, 1);
    if (rct) {
      bw.u32(1, [VAL(0), VAL(1), BO(4, 2), BO(8, 18)]);
      bw.u32(0, [VAL(0), VAL(1), VAL(2), VAL(3)]);        // transform: RCT
      bw.u32(0, [BITS(3), BO(6, 8), BO(10, 72), BO(13, 1096)]);
      bw.u32(6, [VAL(6), BITS(2), BO(4, 2), BO(6, 10)]);  // YCoCg
    } else bw.u32(0, [VAL(0), VAL(1), BO(4, 2), BO(8, 18)]);
  }

  // ---------- one frame -> sections ----------
  var TOK = 256, LZ_SYM = 224, LZ_MIN = 3, LZ_RUN = 7;   // LZ77 length tokens live at 224+ ; runs of >= 8 zeros are worth copying
  function Encoder(o) {
    this.o = { width: o.width | 0, height: o.height | 0, alpha: !!o.alpha, animated: !!o.animated, fps: o.fps || 30,
      step: Math.max(1, Math.min(16, o.step | 0 || 1)), groupShift: o.groupShift == null ? 2 : o.groupShift, loops: 0 };
    if (this.o.width < 1 || this.o.height < 1) throw new Error('bad size');
    this.o.tpsNum = this.o.fps; this.o.tpsDen = 1;
    this.nch = this.o.alpha ? 4 : 3;
    var n = this.o.width * this.o.height;
    this.planes = []; this.res = [];
    for (var c = 0; c < this.nch; c++) { this.planes.push(new Int16Array(n)); this.res.push(new Uint16Array(n)); }
    var gd = 128 << this.o.groupShift; this.scratch = new Int32Array(Math.min(gd, this.o.width) * Math.min(gd, this.o.height));
    var hw = new BitWriter(); imageHeader(hw, this.o);
    this.parts = [hw.bytes().slice()]; this.pending = null; this.frames = 0;
  }

  Encoder.prototype._planes = function (rgba) {
    var o = this.o, n = o.width * o.height, Y = this.planes[0], Co = this.planes[1], Cg = this.planes[2], A = this.planes[3];
    if (rgba.length < n * 4) throw new Error('pixel buffer too small');
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      if (o.alpha) { var a = rgba[j + 3]; A[i] = a; if (a === 0) { r = 0; g = 0; b = 0; } }   // colour under clear pixels is never seen
      var co = r - b, tmp = b + (co >> 1), cg = g - tmp;
      Y[i] = tmp + (cg >> 1); Co[i] = co; Cg[i] = cg;
    }
  };

  // residuals for one rectangle of one channel (closed loop, clamped-gradient predictor, edge rules of libjxl)
  Encoder.prototype._residuals = function (c, x0, y0, rw, rh, q) {
    var P = this.planes[c], R = this.res[c], w = this.o.width, rec = this.scratch, half = q >> 1;
    for (var y = 0; y < rh; y++) {
      var row = (y0 + y) * w + x0, ri = y * rw;
      for (var x = 0; x < rw; x++) {
        var idx = ri + x, pred;
        if (y === 0) pred = x === 0 ? 0 : rec[idx - 1];
        else if (x === 0) pred = rec[idx - rw];
        else {
          var W = rec[idx - 1], N = rec[idx - rw], NW = rec[idx - rw - 1], mn = W < N ? W : N, mxv = W < N ? N : W;
          pred = NW > mxv ? mn : NW < mn ? mxv : N + W - NW;
        }
        var a = P[row + x], d = a - pred, r;
        if (q === 1) { r = d; rec[idx] = a; }
        else { r = d >= 0 ? ((d + half) / q) | 0 : -(((-d + half) / q) | 0); rec[idx] = pred + r * q; }
        var pk = r >= 0 ? r * 2 : -r * 2 - 1;
        R[row + x] = pk;
      }
    }
  };
  // Gather one stream (the same rectangle of every channel, channel after channel) into a flat array.
  Encoder.prototype._flat = function (r) {
    var nch = this.nch, w = this.o.width, rw = r[2], rh = r[3], seg = rw * rh, n = seg * nch;
    if (!this.flat || this.flat.length < n) this.flat = new Uint16Array(n);
    var F = this.flat, at = 0;
    for (var c = 0; c < nch; c++) {
      var R = this.res[c];
      for (var y = 0; y < rh; y++) { var row = (r[1] + y) * w + r[0]; F.set(R.subarray(row, row + rw), at); at += rw; }
    }
    return n;
  };
  function hasRun(F, n) {                                  // any run of at least LZ_RUN + 1 zeros?
    var run = 0;
    for (var i = 0; i < n; i++) { if (F[i] === 0) { if (++run > LZ_RUN) return true; } else run = 0; }
    return false;
  }
  // Count symbols (hist given) or write them (bw given). Long zero runs become: literal 0, LZ77 length, distance 1.
  function codeStream(F, n, seg, clusterOf, lz, distCl, hist, bw, lens, vals) {
    var i = 0;
    function lit(pos, v) {
      var c = clusterOf[(pos / seg) | 0], t = v ? 32 - Math.clz32(v) : 0;
      if (hist) hist[c * TOK + t]++;
      else { var k = c * TOK + t; if (lens[k]) bw.put(vals[k], lens[k]); if (t > 1) bw.put(v - (1 << (t - 1)), t - 1); }
    }
    while (i < n) {
      if (lz && F[i] === 0) {
        var e = i + 1; while (e < n && F[e] === 0) e++;
        var L = e - i - 1;
        if (L >= LZ_RUN) {
          lit(i, 0);
          var c2 = clusterOf[((i + 1) / seg) | 0], lv = L - LZ_MIN, lt = (lv ? 32 - Math.clz32(lv) : 0), k2 = c2 * TOK + LZ_SYM + lt;
          if (hist) { hist[k2]++; hist[distCl * TOK + 1]++; }
          else {
            if (lens[k2]) bw.put(vals[k2], lens[k2]); if (lt > 1) bw.put(lv - (1 << (lt - 1)), lt - 1);
            var kd = distCl * TOK + 1; if (lens[kd]) bw.put(vals[kd], lens[kd]);
          }
          i = e; continue;
        }
      }
      lit(i, F[i]); i++;
    }
  }

  Encoder.prototype._sections = function (rgba) {
    var o = this.o, nch = this.nch, w = o.width, h = o.height, gd = 128 << o.groupShift, i, c;
    this._planes(rgba);
    var gx = Math.ceil(w / gd), gy = Math.ceil(h / gd), single = gx * gy === 1, dcd = gd * 8, ndc = Math.ceil(w / dcd) * Math.ceil(h / dcd);
    // one leaf per channel, colour residuals scaled by `step`, alpha exact; tree splits on the channel index
    var leavesIn = [], key;
    for (c = 0; c < nch; c++) leavesIn.push([c, new Leaf(5, c < 3 ? o.step : 1, c)]);
    var tree = staticSplit(0, leavesIn), ser = serialiseTree(tree), keyIdx = {}, ctxMap = [], nCl = 0;
    ser.leaves.forEach(function (l) { if (keyIdx[l.key] == null) keyIdx[l.key] = nCl++; ctxMap.push(keyIdx[l.key]); });
    var clusterOf = [], quant = [];
    for (c = 0; c < nch; c++) { var lf = leafFor(tree, c); clusterOf.push(keyIdx[lf.key]); quant.push(lf.mul); }
    // pass 1: residuals for every tile, then the symbol histograms
    var rects = [];
    if (single) rects.push([0, 0, w, h]);
    else for (var yy = 0; yy < gy; yy++) for (var xx = 0; xx < gx; xx++) rects.push([xx * gd, yy * gd, Math.min(gd, w - xx * gd), Math.min(gd, h - yy * gd)]);
    rects.forEach(function (r) { for (var ch = 0; ch < nch; ch++) this._residuals(ch, r[0], r[1], r[2], r[3], quant[ch]); }, this);
    var lz = false, self = this;
    for (i = 0; i < rects.length && !lz; i++) { var nf = this._flat(rects[i]); lz = hasRun(this.flat, nf); }
    var hist = new Float64Array((nCl + 1) * TOK), distCl = nCl;
    rects.forEach(function (r) { var n = self._flat(r); codeStream(self.flat, n, r[2] * r[3], clusterOf, lz, distCl, hist); });
    var codes = [], nAll = lz ? nCl + 1 : nCl, lens = new Int32Array(nAll * TOK), vals = new Int32Array(nAll * TOK);
    for (i = 0; i < nAll; i++) {
      var pc = new PrefixCode(Array.prototype.slice.call(hist.subarray(i * TOK, (i + 1) * TOK))); codes.push(pc);
      for (var s = 0; s < pc.alphabet; s++) { lens[i * TOK + s] = pc.lens[s]; vals[i * TOK + s] = pc.codes[s]; }
    }
    // LfGlobal
    var g = new BitWriter(); g.write(1, 1); g.write(1, 1);
    var tcnt = new Float64Array(TOK); ser.toks.forEach(function (t) { tcnt[tokenOf(t[1])]++; });
    var tcode = new PrefixCode(Array.prototype.slice.call(tcnt));
    writeHistograms(g, [0, 0, 0, 0, 0, 0], [tcode]);
    ser.toks.forEach(function (t) { var tk = tokenOf(t[1]); if (tcode.lens[tk]) g.put(tcode.codes[tk], tcode.lens[tk]); if (tk > 1) g.put(t[1] - (1 << (tk - 1)), tk - 1); });
    writeHistograms(g, lz ? ctxMap.concat([distCl]) : ctxMap, codes, lz);
    globalHeader(g, true);
    if (single) {
      var n1 = this._flat(rects[0]); codeStream(this.flat, n1, w * h, clusterOf, lz, distCl, null, g, lens, vals);
      return { sections: [g.bytes().slice()] };
    }
    var sections = [g.bytes().slice()];
    for (i = 0; i < ndc; i++) sections.push(new Uint8Array(0));
    sections.push(new Uint8Array(0));                      // HfGlobal
    rects.forEach(function (r) {
      var bw = new BitWriter(); globalHeader(bw, false);
      var n = self._flat(r); codeStream(self.flat, n, r[2] * r[3], clusterOf, lz, distCl, null, bw, lens, vals);
      sections.push(bw.bytes().slice());
    });
    return { sections: sections };
  };

  Encoder.prototype._flush = function (isLast) {
    var p = this.pending; if (!p) return;
    var bw = new BitWriter(); frameHeader(bw, this.o, isLast, 1, this.o.groupShift);
    bw.bool(false);                                        // TOC: natural order
    bw.pad();
    p.sections.forEach(function (s) { bw.u32(s.length, [BITS(10), BO(14, 1024), BO(22, 17408), BO(30, 4211712)]); });
    bw.pad();
    this.parts.push(bw.bytes().slice()); p.sections.forEach(function (s) { this.parts.push(s); }, this);
    this.pending = null;
  };
  // rgba: Uint8ClampedArray / Uint8Array of width*height*4 (straight alpha). The buffer is read immediately.
  Encoder.prototype.addFrame = function (rgba) {
    if (!this.o.animated && this.frames) throw new Error('a still has exactly one frame');
    var s = this._sections(rgba); this._flush(false); this.pending = s; this.frames++;
  };
  Encoder.prototype.finish = function () {
    if (!this.pending) throw new Error('no frames'); this._flush(true);
    var total = 0; this.parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), at = 0; this.parts.forEach(function (p) { out.set(p, at); at += p.length; });
    this.parts = []; return out;
  };
  // Same as finish() but returns the pieces (for new Blob(parts)) so a very large file is never copied into one array.
  Encoder.prototype.finishPartsList = function () {
    if (!this.pending) throw new Error('no frames'); this._flush(true);
    var parts = this.parts; this.parts = []; return parts;
  };
  // size so far in bytes (pending frame not counted); lets the UI guard against runaway animations
  Encoder.prototype.bytesSoFar = function () { var t = 0; this.parts.forEach(function (p) { t += p.length; }); return t; };

  function encodeStill(rgba, width, height, opts) {
    opts = opts || {}; var e = new Encoder({ width: width, height: height, alpha: opts.alpha !== false, animated: false, groupShift: opts.groupShift });
    e.addFrame(rgba); return e.finish();
  }

  global.IntuitionJxl = { Encoder: Encoder, encodeStill: encodeStill, _internals: { BitWriter: BitWriter, PrefixCode: PrefixCode, huffmanLengths: huffmanLengths } };
  if (typeof module !== 'undefined') module.exports = global.IntuitionJxl;
})(typeof window !== 'undefined' ? window : globalThis);
