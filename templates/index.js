import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());  // allow your frontend to call this

// Spotify Client Credentials flow endpoint
app.get('/auth/spotify-token', async (req, res) => {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    return res.status(500).json({ error: 'Missing credentials' });
  }

  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).send(err);
    }
    const json = await response.json();
    // return only what the client needs
    return res.json({ access_token: json.access_token, expires_in: json.expires_in });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
});

// Bind to Render’s port or default 10000
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Auth server listening on ${port}`));