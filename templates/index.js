// index.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ONLY load .env locally; in production (Render) you set env-vars in the dashboard
if (process.env.NODE_ENV !== 'production') dotenv.config();

// Derive __dirname under ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// 1) Serve all static assets (CSS, JS, images) from public/
app.use(express.static(path.join(__dirname, 'public')));

// 2) Your Spotify Client Credentials flow endpoint
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
      const errText = await response.text();
      return res.status(response.status).send(errText);
    }
    const json = await response.json();
    return res.json({
      access_token: json.access_token,
      expires_in: json.expires_in
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
});

// 3) Serve your main HTML from templates/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// 4) Fallback for any other SPA routes (if you ever add client-side routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Auth & Visualizer server listening on port ${port}`);
});