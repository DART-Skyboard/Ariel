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

// 4) Explicit routes for all template HTML files
app.get('/frax.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'frax.html')));
app.get('/arc-edge-vector.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arc-edge-vector.html')));
app.get('/ariel.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'ariel.html')));
app.get('/brpn.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'brpn.html')));
app.get('/brpnaudio.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'brpnaudio.html')));
app.get('/btu.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'btu.html')));
app.get('/arc-forge.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arc-forge.html')));
app.get('/arcedge.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arcedge.html')));
app.get('/arclake.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arclake.html')));
app.get('/arclake-atoms.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arclake-atoms.html')));
app.get('/arclake-latin.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arclake-latin.html')));
app.get('/ariel-npu.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'ariel-npu.html')));
app.get('/ashtreeide.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'ashtreeide.html')));
app.get('/autumn.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'autumn.html')));
app.get('/mn.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'mn.html')));
app.get('/mr.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'mr.html')));
app.get('/mp3wav.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'mp3wav.html')));
app.get('/leaudiovisualizer.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'leaudiovisualizer.html')));
app.get('/leatr.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'leatr.html')));
app.get('/leatr-cbs.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'leatr-cbs.html')));
app.get('/reflexpotentials.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'reflexpotentials.html')));
app.get('/arc-edge-measure.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arc-edge-measure.html')));
app.get('/arc-edge-mandelbrot.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arc-edge-mandelbrot.html')));
app.get('/octarig.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'octarig.html')));
app.get('/altitude.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'altitude.html')));
app.get('/arc-flow.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'arc-flow.html')));
app.get('/skinwalker.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'skinwalker.html')));
app.get('/toonforge.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'toonforge.html')));
app.get('/usdz-studio.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'usdz-studio.html')));
app.get('/AERIS10_RADAR.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'AERIS10_RADAR.html')));
app.get('/dartpotentials.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'dartpotentials.html')));
app.get('/easterisland.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'easterisland.html')));
app.get('/hypersonic.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'hypersonic.html')));
app.get('/LEATR.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'LEATR.html')));
app.get('/articrenwave.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'articrenwave.html')));
app.get('/tempest', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'tempest', 'index.html')));
app.get('/tempest/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'tempest', 'index.html')));
app.get('/colfurmine-leatr.html', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'tempest', 'index.html')));

// 5) Fallback for any other SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Auth & Visualizer server listening on port ${port}`);
});