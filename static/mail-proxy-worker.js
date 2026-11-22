/**
 * DART Mail Proxy — Microsoft Graph edition
 * Credentials via secrets only.
 *
 * Required secrets:
 *   f6fa7320-6098-4258-a6e0-dd01d975e4bc
 *   8c887fd1-9ef7-4de7-88ba-6eff9992c843
 *   GRAPH_CLIENT_SECRET
 *   MAILBOX_USER   (justin@dartmeadow.com)
 *
 * Endpoints match the custom UI:
 *   GET  /mail/messages
 *   POST /mail/delete
 *   POST /mail/archive
 *   POST /mail/restore
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function getToken(env) {
  const body = new URLSearchParams({
    client_id: env.8c887fd1-9ef7-4de7-88ba-6eff9992c843,
    client_secret: env.GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await fetch(`https://login.microsoftonline.com/${env.f6fa7320-6098-4258-a6e0-dd01d975e4bc}/oauth2/v2.0/token`, {
    method: 'POST',
    body
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token failed');
  return data.access_token;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!url.pathname.startsWith('/mail')) return new Response('Not found', { status: 404 });

    try {
      const token = await getToken(env);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const user = env.MAILBOX_USER || 'justin@dartmeadow.com';

      if (url.pathname === '/mail/messages' && request.method === 'GET') {
        const r = await fetch(`${GRAPH}/users/${user}/messages?$top=50&$select=id,subject,from,receivedDateTime,isRead`, { headers });
        const data = await r.json();
        const messages = (data.value || []).map(m => ({
          id: m.id,
          from: m.from?.emailAddress?.name || m.from?.emailAddress?.address,
          subject: m.subject,
          date: m.receivedDateTime
        }));
        return Response.json(messages, { headers: cors });
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ids = body.ids || [];
        const action = url.pathname.split('/').pop();

        for (const id of ids) {
          if (action === 'delete') {
            await fetch(`${GRAPH}/users/${user}/messages/${id}`, { method: 'DELETE', headers });
          } else if (action === 'archive') {
            await fetch(`${GRAPH}/users/${user}/messages/${id}/move`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ destinationId: 'archive' })
            });
          } else if (action === 'restore') {
            await fetch(`${GRAPH}/users/${user}/messages/${id}/move`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ destinationId: 'inbox' })
            });
          }
        }
        return Response.json({ ok: true, action, count: ids.length }, { headers: cors });
      }
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: cors });
    }

    return new Response('Method not allowed', { status: 405, headers: cors });
  }
};
