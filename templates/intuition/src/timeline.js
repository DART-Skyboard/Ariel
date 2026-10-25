// Timeline: duration + fps + keyframe tracks over numeric generator params (mix, speed, particles, ...).
(function (global) {
  'use strict';
  var EASE = {
    linear: function (t) { return t; },
    in: function (t) { return t * t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    inout: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  };
  function Timeline(o) {
    o = o || {}; this.fps = o.fps === 60 ? 60 : o.fps === 24 ? 24 : 30;
    this.duration = Math.min(60, Math.max(0.1, +o.duration || 5)); this.tracks = {};
  }
  Timeline.prototype.frameCount = function () { return Math.max(1, Math.round(this.duration * this.fps)); };
  Timeline.prototype.timeOf = function (frame) { return frame / this.fps; };
  Timeline.prototype.setKey = function (param, t, v, ease) {
    if (!(t >= 0)) throw new Error('key time must be >= 0'); if (typeof v !== 'number' || !isFinite(v)) throw new Error('key value must be a number');
    var tr = this.tracks[param] || (this.tracks[param] = []);
    for (var i = 0; i < tr.length; i++) if (tr[i].t === t) { tr[i].v = v; tr[i].ease = ease || tr[i].ease; return; }
    tr.push({ t: t, v: v, ease: EASE[ease] ? ease : 'linear' }); tr.sort(function (a, b) { return a.t - b.t; });
  };
  Timeline.prototype.removeKey = function (param, t) {
    var tr = this.tracks[param]; if (!tr) return false; var n = tr.length; this.tracks[param] = tr.filter(function (k) { return k.t !== t; });
    if (!this.tracks[param].length) delete this.tracks[param]; return n !== (this.tracks[param] || []).length;
  };
  Timeline.prototype.value = function (param, t) {
    var tr = this.tracks[param]; if (!tr || !tr.length) return undefined;
    if (t <= tr[0].t) return tr[0].v; if (t >= tr[tr.length - 1].t) return tr[tr.length - 1].v;
    for (var i = 0; i < tr.length - 1; i++) if (t >= tr[i].t && t <= tr[i + 1].t) {
      var a = tr[i], b = tr[i + 1], u = (t - a.t) / (b.t - a.t); return a.v + (b.v - a.v) * (EASE[b.ease] || EASE.linear)(u);
    }
  };
  // Base params with every keyed param evaluated at time t.
  Timeline.prototype.paramsAt = function (base, t) {
    var out = Object.assign({}, base); Object.keys(this.tracks).forEach(function (k) { out[k] = this.value(k, t); }, this); return out;
  };
  global.Timeline = Timeline;
  if (typeof module !== 'undefined') module.exports = Timeline;
})(typeof window !== 'undefined' ? window : globalThis);
