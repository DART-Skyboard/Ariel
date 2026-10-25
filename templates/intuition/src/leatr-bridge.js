// LEATR bridge: the studio's ONLY connection to the private Shell 64 / LEATR network.
// It talks to the read-only Shell 64 relay (POST <relay>/team). What crosses the wire:
//   out: the prompt text (<= 500 chars) and the client-held team object the relay gave us last time. Never pixels, never references.
//   in : { text, program, team } — a team plan and Ash program made of record KEYS. Never the private knowledge base itself.
// The plan then STEERS generation (seed, style, which of your references to use). If the relay is not configured or fails,
// a deterministic local plan is used so the studio always works offline.
(function (global) {
  'use strict';
  var MAX_TEXT = 500;
  function hash32(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  function localPlan(text) {
    var words = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
    return { source: 'local', text: 'Local plan (LEATR relay not used).', program: words.slice(0, 8).map(function (w) { return 'local:' + w; }).join(' '), team: null };
  }

  function validPlan(o) {
    return o && typeof o === 'object' && typeof o.text === 'string' && o.text.length <= 4000 && typeof o.program === 'string' && o.program.length <= 8000 &&
      (o.team === null || o.team === undefined || (typeof o.team === 'object' && !Array.isArray(o.team)));
  }

  // plan({ url, text, team, fetchImpl }) -> { source:'relay'|'local', text, program, team, error? }
  async function plan(o) {
    var text = String((o && o.text) || '').trim().slice(0, MAX_TEXT);
    if (!text) throw new Error('prompt text required');
    if (!o.url) return localPlan(text);
    var f = o.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) { var l0 = localPlan(text); l0.error = 'no fetch available'; return l0; }
    try {
      var url = String(o.url).replace(/\/+$/, '') + '/team';
      if (!/^https:\/\//.test(url) && !/^http:\/\/localhost(:\d+)?\//.test(url)) throw new Error('relay must be https');
      var res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, team: o.team || undefined }) });
      if (!res.ok) throw new Error('relay answered ' + res.status);
      var j = await res.json();
      if (!validPlan(j)) throw new Error('relay reply was not a valid plan');
      return { source: 'relay', text: j.text, program: j.program, team: j.team || null };
    } catch (e) {
      var l = localPlan(text); l.error = String(e && e.message || e).slice(0, 120); return l;
    }
  }

  // Turn a plan into generator params. Deterministic: the same plan + library always picks the same seed, style and references.
  function paramsFromPlan(p, lib, base) {
    base = base || {}; var key = (p.program || '') + '|' + (p.text || ''), h = hash32(key), styles = ['meadow', 'ridge', 'nebula'];
    var filled = lib ? lib.list().map(function (s) { return s.slot; }) : [];
    var picks = filled.map(function (slot) { return { slot: slot, k: hash32(key + ':' + slot) }; }).sort(function (a, b) { return a.k - b.k; }).slice(0, Math.min(3, filled.length));
    var out = Object.assign({}, base);
    out.seed = h | 0; out.style = base.style && base.lockStyle ? base.style : styles[h % styles.length];
    out.refs = picks.map(function (x, i) { return { slot: x.slot, weight: i === 0 ? 1 : 0.5 }; });
    out.mix = 0.3 + (hash32(key + 'mix') % 5) / 10;
    return out;
  }

  global.LeatrBridge = { plan: plan, paramsFromPlan: paramsFromPlan, localPlan: localPlan, validPlan: validPlan, MAX_TEXT: MAX_TEXT };
  if (typeof module !== 'undefined') module.exports = global.LeatrBridge;
})(typeof window !== 'undefined' ? window : globalThis);
