/* ================================================================
   DART ZERO-AUTH  ·  GitHub OAuth Module  v1.0
   Shared across radicaldeepscale.com · dartmeadow.com · autumn.html
   ================================================================
   SETUP:
     1. Create a GitHub OAuth App at github.com/settings/developers
        - Homepage URL: https://radicaldeepscale.com
        - Callback URL: https://radicaldeepscale.com/oauth-callback.html
          (add both domains as separate apps OR add multiple callback URLs)
     2. Replace GH_CLIENT_ID below with your OAuth App's Client ID
     3. Deploy auth-worker.js to Cloudflare Workers at auth.radicaldeepscale.com
        with env vars GH_CLIENT_ID and GH_CLIENT_SECRET
   ================================================================ */

const DART_AUTH = (() => {
  'use strict';

  /* ── Constants ──────────────────────────────────────────── */
  const GH_CLIENT_ID  = 'YOUR_GITHUB_CLIENT_ID';   // ← replace
  const PROXY_URL     = 'https://auth.radicaldeepscale.com/oauth/token';
  const ASH_REPO      = 'autumn-ash';
  const GH_SCOPES     = 'repo user:email read:user';
  const CALLBACK_PATH = '/oauth-callback.html';

  const DOMAIN_MAP = {
    'radicaldeepscale.com' : 'rds',
    'www.radicaldeepscale.com' : 'rds',
    'dartmeadow.com'       : 'dm',
    'www.dartmeadow.com'   : 'dm',
  };
  const TRUSTED_ORIGINS = [
    'https://radicaldeepscale.com',
    'https://www.radicaldeepscale.com',
    'https://dartmeadow.com',
    'https://www.dartmeadow.com',
    'https://dart-skyboard.github.io',
  ];

  /* ── Domain identification ──────────────────────────────── */
  const _host      = window.location.hostname;
  const _domainKey = (() => {
    if (_host.includes('autumn'))          return 'autumn';
    if (DOMAIN_MAP[_host])                 return DOMAIN_MAP[_host];
    return _host.replace(/[^a-z0-9]/g,'_');
  })();

  /* ── localStorage keys (namespaced per domain) ──────────── */
  const K = {
    token    : `dart_gh_token_${_domainKey}`,
    user     : `dart_gh_user_${_domainKey}`,
    avatar   : `dart_avatar_${_domainKey}`,
    firstAuth: `dart_first_auth_${_domainKey}`,
    consent  : `dart_consent_${_domainKey}`,
  };

  /* ── Internal state ─────────────────────────────────────── */
  let _token     = null;
  let _user      = null;
  let _callbacks = { login:[], logout:[], error:[], ready:[] };
  let _popupRef  = null;
  let _stateNonce = null;

  /* ── Storage helpers (with graceful degradation) ─────────── */
  const LS = {
    get  : k => { try { return localStorage.getItem(k); }  catch(e){ return null; } },
    set  : (k,v) => { try { localStorage.setItem(k, v); }  catch(e){} },
    del  : k => { try { localStorage.removeItem(k); }      catch(e){} },
  };

  /* ── Token store ────────────────────────────────────────── */
  function _getToken()   { return _token || LS.get(K.token); }
  function _storeToken(t){ _token = t; LS.set(K.token, t); }
  function _clearToken() { _token = null; LS.del(K.token); }

  /* ── User store ─────────────────────────────────────────── */
  function _getUser() {
    if (_user) return _user;
    try { const u = LS.get(K.user); return u ? JSON.parse(u) : null; } catch(e){ return null; }
  }
  function _storeUser(u) { _user = u; LS.set(K.user, JSON.stringify(u)); }
  function _clearUser()  { _user = null; LS.del(K.user); }

  /* ── OAuth popup flow ───────────────────────────────────── */
  function beginOAuth() {
    _stateNonce = _rand();
    sessionStorage.setItem('dart_oauth_state',  _stateNonce);
    sessionStorage.setItem('dart_oauth_origin', window.location.origin);

    const callbackUrl = window.location.origin + CALLBACK_PATH;
    const qs = new URLSearchParams({
      client_id    : GH_CLIENT_ID,
      redirect_uri : callbackUrl,
      scope        : GH_SCOPES,
      state        : _stateNonce,
    });
    const authUrl = `https://github.com/login/oauth/authorize?${qs}`;

    /* Open as popup, fall back to redirect if blocked */
    const W = 580, H = 680;
    const l = Math.round(screen.width  / 2 - W / 2);
    const t = Math.round(screen.height / 2 - H / 2);
    _popupRef = window.open(
      authUrl, 'dart_gh_oauth',
      `width=${W},height=${H},left=${l},top=${t},toolbar=0,menubar=0,location=0,scrollbars=1`
    );

    if (!_popupRef || _popupRef.closed) {
      /* Popup blocked — redirect same tab */
      sessionStorage.setItem('dart_oauth_return', window.location.href);
      window.location.href = authUrl;
      return;
    }

    /* Listen for postMessage from oauth-callback.html */
    const _msgHandler = evt => {
      if (!_isTrustedOrigin(evt.origin) && evt.origin !== window.location.origin) return;
      const d = evt.data || {};
      if (d.type !== 'dart_gh_code') return;
      window.removeEventListener('message', _msgHandler);
      if (d.state !== _stateNonce) { _emit('error', { msg: 'State mismatch — possible CSRF' }); return; }
      _exchangeCode(d.code);
    };
    window.addEventListener('message', _msgHandler);

    /* Fallback: poll in case popup can't postMessage (Safari) */
    const _poll = setInterval(() => {
      if (_popupRef && _popupRef.closed) {
        clearInterval(_poll);
        window.removeEventListener('message', _msgHandler);
        /* Check if code came through sessionStorage fallback */
        const code  = sessionStorage.getItem('dart_gh_pending_code');
        const state = sessionStorage.getItem('dart_gh_pending_state');
        if (code && state === _stateNonce) {
          sessionStorage.removeItem('dart_gh_pending_code');
          sessionStorage.removeItem('dart_gh_pending_state');
          _exchangeCode(code);
        }
      }
    }, 800);
  }

  /* ── Exchange code → token via Cloudflare Worker ─────────── */
  async function _exchangeCode(code) {
    _emit('exchanging', {});
    try {
      const resp = await fetch(PROXY_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ code, domain: _domainKey }),
      });
      if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.error)        throw new Error(json.error);
      if (!json.access_token) throw new Error('No access_token returned');
      await _finalizeLogin(json.access_token);
    } catch (err) {
      console.error('[DART_AUTH] Exchange failed:', err);
      _emit('error', { msg: err.message });
    }
  }

  /* ── Complete login: fetch user, setup autumn-ash ────────── */
  async function _finalizeLogin(tok) {
    _storeToken(tok);

    /* Fetch GitHub profile */
    const uResp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${tok}` }
    });
    if (!uResp.ok) { _clearToken(); throw new Error('GitHub user fetch failed'); }
    const user = await uResp.json();
    _storeUser(user);

    /* Fetch emails if needed */
    try {
      const eResp = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `token ${tok}` }
      });
      if (eResp.ok) {
        const emails = await eResp.json();
        const primary = emails.find(e => e.primary)?.email;
        if (primary) user._primaryEmail = primary;
        _storeUser(user);
      }
    } catch(e) {}

    /* Ensure autumn-ash private repo exists */
    await _ensureAshRepo(tok, user.login);

    /* Write domain connection record */
    await _writeDomainRecord(tok, user.login, { connected:true });

    /* Mark first-auth complete for this domain */
    LS.set(K.firstAuth, '1');

    _emit('login', { user });
  }

  /* ── autumn-ash repo bootstrap ──────────────────────────── */
  async function _ensureAshRepo(tok, login) {
    const check = await fetch(`https://api.github.com/repos/${login}/${ASH_REPO}`, {
      headers: { Authorization: `token ${tok}` }
    });
    if (check.status !== 404) return; /* already exists */

    await fetch('https://api.github.com/user/repos', {
      method : 'POST',
      headers: { Authorization: `token ${tok}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        name       : ASH_REPO,
        description: 'Autumn AI · cross-domain profile & preferences',
        private    : true,
        auto_init  : true,
      }),
    });
    await _sleep(1800); /* wait for GitHub to initialize main branch */
  }

  /* ── Read/write files in autumn-ash ────────────────────── */
  async function _ashRead(tok, login, path) {
    const r = await fetch(
      `https://api.github.com/repos/${login}/${ASH_REPO}/contents/${path}`,
      { headers: { Authorization: `token ${tok}` } }
    );
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`ashRead ${r.status}`);
    const j = await r.json();
    return {
      data: JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))))),
      sha : j.sha,
    };
  }

  async function _ashWrite(tok, login, path, data, sha = null) {
    const body = {
      message: `DART Auth: ${path}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
    };
    if (sha) body.sha = sha;
    const r = await fetch(
      `https://api.github.com/repos/${login}/${ASH_REPO}/contents/${path}`,
      {
        method : 'PUT',
        headers: { Authorization: `token ${tok}`, 'Content-Type': 'application/json' },
        body   : JSON.stringify(body),
      }
    );
    if (!r.ok) throw new Error(`ashWrite ${r.status}`);
    return r.json();
  }

  async function _writeDomainRecord(tok, login, extra = {}) {
    const path = `domains/${_domainKey}.json`;
    const { data, sha } = await _ashRead(tok, login, path);
    const now = new Date().toISOString();
    const record = Object.assign(data || {}, {
      domain        : window.location.hostname,
      connected     : true,
      firstConnected: (data||{}).firstConnected || now,
      lastLogin     : now,
    }, extra);
    await _ashWrite(tok, login, path, record, sha);
  }

  /* ── Cross-domain status ────────────────────────────────── */
  async function getCrossDomainStatus() {
    const tok  = _getToken();
    const user = _getUser();
    if (!tok || !user) return null;
    const result = {};
    const keys = { rds:'radicaldeepscale.com', dm:'dartmeadow.com', autumn:'autumn' };
    await Promise.all(Object.entries(keys).map(async ([k, label]) => {
      try {
        const { data } = await _ashRead(tok, user.login, `domains/${k}.json`);
        result[label] = data;
      } catch(e) { result[label] = null; }
    }));
    return result;
  }

  /* ── Disconnect from a specific domain ─────────────────── */
  async function disconnectDomain(domainKey) {
    const tok  = _getToken();
    const user = _getUser();
    if (!tok || !user) return;
    try {
      const path = `domains/${domainKey}.json`;
      const { data, sha } = await _ashRead(tok, user.login, path);
      if (data) await _ashWrite(tok, user.login, path,
        Object.assign(data, { connected:false, lastLogout: new Date().toISOString() }), sha);
    } catch(e) {}
    /* If disconnecting current domain, also clear local token */
    if (domainKey === _domainKey) logout();
  }

  /* ── Avatar management ──────────────────────────────────── */
  const _DEFAULTS = {
    rds    : 'https://raw.githubusercontent.com/DART-Skyboard/Ariel/main/static/avatars/default.png',
    dm     : 'https://raw.githubusercontent.com/DART-Skyboard/Ariel/main/static/avatars/default.png',
    autumn : 'https://raw.githubusercontent.com/DART-Skyboard/Ariel/main/static/avatars/default.png',
  };

  function getAvatar() {
    return LS.get(K.avatar) || _getUser()?.avatar_url || _DEFAULTS[_domainKey] || _DEFAULTS.rds;
  }

  function setAvatar(url) {
    LS.set(K.avatar, url);
    const tok  = _getToken();
    const user = _getUser();
    if (tok && user) {
      _ashRead(tok, user.login, `domains/${_domainKey}.json`)
        .then(({ data, sha }) =>
          _ashWrite(tok, user.login, `domains/${_domainKey}.json`,
            Object.assign(data||{}, { customAvatar: url }), sha))
        .catch(() => {});
    }
  }

  /* ── Logout ─────────────────────────────────────────────── */
  function logout() {
    const user = _getUser();
    const tok  = _getToken();
    /* Write disconnect record in background */
    if (tok && user) {
      _writeDomainRecord(tok, user.login, { connected:false, lastLogout: new Date().toISOString() })
        .catch(() => {});
    }
    _clearToken();
    _clearUser();
    LS.del(K.avatar);
    _emit('logout', {});
  }

  /* ── Auto-restore session on page load ──────────────────── */
  async function init(opts = {}) {
    if (opts.onLogin)  on('login',  opts.onLogin);
    if (opts.onLogout) on('logout', opts.onLogout);
    if (opts.onError)  on('error',  opts.onError);

    /* Handle popup-blocked redirect flow */
    const url    = new URL(window.location.href);
    const code   = url.searchParams.get('code');
    const state  = url.searchParams.get('state');
    const stored = sessionStorage.getItem('dart_oauth_state');
    if (code && state && state === stored) {
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      history.replaceState({}, '', url.toString());
      await _exchangeCode(code);
      _emit('ready', {});
      return;
    }

    const tok = _getToken();
    if (!tok) { _emit('ready', {}); _emit('unauthenticated', {}); return; }

    /* Validate stored token */
    try {
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${tok}` }
      });
      if (!r.ok) throw new Error('Token invalid');
      const user = await r.json();
      _storeUser(user);
      _emit('login', { user });
    } catch(e) {
      _clearToken();
      _clearUser();
      _emit('unauthenticated', {});
    }
    _emit('ready', {});
  }

  /* ── Event emitter ──────────────────────────────────────── */
  function on(event, fn) {
    if (_callbacks[event]) _callbacks[event].push(fn);
    return DART_AUTH_PUBLIC;
  }
  function _emit(event, detail) {
    (_callbacks[event] || []).forEach(fn => { try { fn(detail); } catch(e){} });
    window.dispatchEvent(new CustomEvent(`dart_auth:${event}`, { detail }));
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function _rand() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function _isTrustedOrigin(o) { return TRUSTED_ORIGINS.includes(o); }
  function isLoggedIn()  { return !!_getToken(); }
  function currentUser() { return _getUser(); }
  function domainKey()   { return _domainKey; }

  const DART_AUTH_PUBLIC = { init, beginOAuth, logout, disconnectDomain,
    isLoggedIn, currentUser, getAvatar, setAvatar, getCrossDomainStatus,
    on, domainKey };
  return DART_AUTH_PUBLIC;
})();
