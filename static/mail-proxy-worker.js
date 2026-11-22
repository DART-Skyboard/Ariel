/**
 * DART Mail Proxy Worker
 * Talks to the existing GoDaddy / Microsoft mailbox via IMAP.
 * Credentials come from environment variables — never hard-code them.
 *
 * Required secrets (set in Cloudflare Workers dashboard or wrangler):
 *   IMAP_HOST     (e.g. imap.secureserver.net or outlook.office365.com)
 *   IMAP_PORT     (usually 993)
 *   IMAP_USER     (justin@dartmeadow.com)
 *   IMAP_PASS     (set as secret)
 *
 * Endpoints:
 *   GET  /mail/messages
 *   POST /mail/delete    { ids: [...] }
 *   POST /mail/archive   { ids: [...] }
 *   POST /mail/restore   { ids: [...] }
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/mail')) {
      return new Response('Not found', { status: 404 });
    }

    // Simple CORS for the custom UI
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Placeholder implementation.
    // Real IMAP requires a TCP connection which Cloudflare Workers cannot do natively.
    // Options:
    //   1. Use Microsoft Graph API instead (preferred) with an app registration.
    //   2. Run this proxy on a small Node server / VPS that can open IMAP sockets.
    //   3. Use a service that bridges Workers to IMAP.
    //
    // For now this returns a clear message so the UI can be tested.

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

    if (url.pathname === '/mail/messages' && request.method === 'GET') {
      return Response.json({
        note: 'IMAP proxy ready. Supply IMAP_USER / IMAP_PASS as secrets and run on a host that supports TCP, or switch to Microsoft Graph.',
        messages: []
      }, { headers: cors });
    }

    if (['/mail/delete', '/mail/archive', '/mail/restore'].includes(url.pathname) && request.method === 'POST') {
      return Response.json({
        ok: true,
        action: url.pathname.split('/').pop(),
        ids: body.ids || [],
        note: 'Action received. Real mailbox update requires Graph or an IMAP-capable host.'
      }, { headers: cors });
    }

    return new Response('Method not allowed', { status: 405, headers: cors });
  }
};
