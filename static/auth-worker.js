/* ================================================================
   DART AUTH WORKER  ·  Cloudflare Worker  v1.0
   ================================================================
   DEPLOY STEPS:
     1. Go to dash.cloudflare.com → Workers & Pages → Create Worker
     2. Paste this entire file
     3. In Settings → Variables, add these secrets:
          GH_CLIENT_ID     = (your GitHub OAuth App Client ID)
          GH_CLIENT_SECRET = (your GitHub OAuth App Client Secret)
     4. Add a custom route:  auth.radicaldeepscale.com/*
        (requires Cloudflare managing your DNS for radicaldeepscale.com)

   GITHUB OAUTH APP SETUP:
     github.com/settings/developers → OAuth Apps → New OAuth App
       Homepage:     https://radicaldeepscale.com
       Callback URL: https://radicaldeepscale.com/oauth-callback.html
       (add second callback): https://dartmeadow.com/oauth-callback.html

   ENDPOINTS:
     POST /oauth/token   { code: "..." }  →  { access_token: "..." }
     GET  /health                         →  { ok: true }
   ================================================================ */

const ALLOWED_ORIGINS = [
  'https://radicaldeepscale.com',
  'https://www.radicaldeepscale.com',
  'https://dartmeadow.com',
  'https://www.dartmeadow.com',
  'https://dart-skyboard.github.io',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin' : allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age'      : '86400',
    };

    /* Pre-flight */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    /* Health check */
    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ ok: true, ts: Date.now() }, 200, cors);
    }

    /* Token exchange */
    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      if (!allowed) return json({ error: 'Origin not permitted' }, 403, cors);

      let code;
      try {
        ({ code } = await request.json());
      } catch {
        return json({ error: 'Invalid JSON body' }, 400, cors);
      }
      if (!code) return json({ error: 'Missing code' }, 400, cors);

      /* Exchange with GitHub */
      const ghRes = await fetch('https://github.com/login/oauth/access_token', {
        method : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept'      : 'application/json',
        },
        body: JSON.stringify({
          client_id    : env.GH_CLIENT_ID,
          client_secret: env.GH_CLIENT_SECRET,
          code,
        }),
      });

      if (!ghRes.ok) {
        return json({ error: `GitHub returned ${ghRes.status}` }, 502, cors);
      }

      const ghData = await ghRes.json();

      if (ghData.error) {
        return json({ error: ghData.error_description || ghData.error }, 400, cors);
      }

      /* Return only access_token — never expose other fields to client */
      return json({ access_token: ghData.access_token }, 200, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
  }
};

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
