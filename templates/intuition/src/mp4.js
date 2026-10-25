// Intuition MP4: a tiny MP4 (ISO BMFF) muxer for H.264 video from the browser's WebCodecs VideoEncoder.
// One video track, constant frame rate, no B-frames, "fast start" layout (moov before mdat) so the file streams.
// Usage: Mp4.mux({ width, height, fps, avcC: Uint8Array, samples: [{ data: Uint8Array (length-prefixed NALs), key: bool }] })
//        -> Uint8Array[] (parts; wrap in new Blob(parts, {type:'video/mp4'}))
(function (global) {
  'use strict';
  function u32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
  function u16(v) { return [(v >>> 8) & 255, v & 255]; }
  function str(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }
  function cat(list) { var n = 0, i; list.forEach(function (x) { n += x.length; }); var o = new Uint8Array(n), at = 0; list.forEach(function (x) { o.set(x, at); at += x.length; }); return o; }
  function box(type, payload) { // payload: array of (Array|Uint8Array)
    var body = cat(payload.map(function (p) { return p instanceof Uint8Array ? p : Uint8Array.from(p); }));
    return cat([Uint8Array.from(u32(8 + body.length).concat(str(type))), body]);
  }
  function fullbox(type, version, flags, payload) { return box(type, [[version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]].concat(payload)); }
  var MATRIX = [].concat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000));

  function mux(o) {
    var w = o.width, h = o.height, fps = o.fps, S = o.samples, n = S.length;
    if (!n) throw new Error('no frames to mux');
    if (!o.avcC || !o.avcC.length) throw new Error('missing avcC');
    var movieMs = Math.round(n * 1000 / fps), sizes = [], keys = [], i, mdatBytes = 0;
    for (i = 0; i < n; i++) { sizes.push(S[i].data.length); mdatBytes += S[i].data.length; if (S[i].key) keys.push(i + 1); }
    if (!keys.length || keys[0] !== 1) keys.unshift(1);

    function moov(dataOffset) {
      var mvhd = fullbox('mvhd', 0, 0, [u32(0), u32(0), u32(1000), u32(movieMs), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MATRIX, new Array(24).fill(0), u32(2)]);
      var tkhd = fullbox('tkhd', 0, 3, [u32(0), u32(0), u32(1), u32(0), u32(movieMs), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(w << 16), u32(h << 16)]);
      var mdhd = fullbox('mdhd', 0, 0, [u32(0), u32(0), u32(fps), u32(n), u16(0x55c4), u16(0)]);
      var hdlr = fullbox('hdlr', 0, 0, [u32(0), str('vide'), u32(0), u32(0), u32(0), str('Intuition\0')]);
      var vmhd = fullbox('vmhd', 0, 1, [u16(0), u16(0), u16(0), u16(0)]);
      var dinf = box('dinf', [fullbox('dref', 0, 0, [u32(1), fullbox('url ', 0, 1, [])])]);
      var avc1 = box('avc1', [new Array(6).fill(0), u16(1), u16(0), u16(0), u32(0), u32(0), u32(0), u16(w), u16(h), u32(0x00480000), u32(0x00480000), u32(0), u16(1),
        new Array(32).fill(0), u16(0x0018), u16(0xffff), box('avcC', [o.avcC])]);
      var stsd = fullbox('stsd', 0, 0, [u32(1), avc1]);
      var stts = fullbox('stts', 0, 0, [u32(1), u32(n), u32(1)]);
      var stss = fullbox('stss', 0, 0, [u32(keys.length)].concat(keys.map(u32)));
      var stsc = fullbox('stsc', 0, 0, [u32(1), u32(1), u32(n), u32(1)]);
      var stsz = fullbox('stsz', 0, 0, [u32(0), u32(n)].concat(sizes.map(u32)));
      var stco = fullbox('stco', 0, 0, [u32(1), u32(dataOffset)]);
      var stbl = box('stbl', [stsd, stts, stss, stsc, stsz, stco]);
      var minf = box('minf', [vmhd, dinf, stbl]);
      return box('moov', [mvhd, box('trak', [tkhd, box('mdia', [mdhd, hdlr, minf])])]);
    }
    var ftyp = box('ftyp', [str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41')]);
    var big = mdatBytes + 8 > 0xFFFFFFFF, mdatHead = big ? 16 : 8;
    var moovLen = moov(0).length, offset = ftyp.length + moovLen + mdatHead;
    var moovBox = moov(offset), head;
    if (offset > 0xFFFFFFFF) throw new Error('file too large for a 32-bit MP4');
    head = big ? Uint8Array.from(u32(1).concat(str('mdat'), u32(0), u32(mdatBytes + 16))) : Uint8Array.from(u32(mdatBytes + 8).concat(str('mdat')));
    return [ftyp, moovBox, head].concat(S.map(function (s) { return s.data; }));
  }

  // Build an avcC record from an Annex-B SPS/PPS pair (used by tests and as a fallback when the encoder gives none).
  function avcCFrom(sps, pps) {
    return Uint8Array.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1].concat(u16(sps.length), Array.from(sps), [1], u16(pps.length), Array.from(pps)));
  }

  global.Mp4 = { mux: mux, avcCFrom: avcCFrom };
  if (typeof module !== 'undefined') module.exports = global.Mp4;
})(typeof window !== 'undefined' ? window : globalThis);
