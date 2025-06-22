// public/js/spotify-player.js

// 1) Patch AudioContext to capture the Spotify SDK’s context and insert an AnalyserNode
const NativeAC = window.AudioContext || window.webkitAudioContext;
let spotifyAudioContext = null;

window.AudioContext = function(...args) {
  const ctx = new NativeAC(...args);
  if (!spotifyAudioContext) {
    spotifyAudioContext = ctx;
    console.log('Captured Spotify AudioContext', ctx);
  }
  return ctx;
};

const origCreateMES = NativeAC.prototype.createMediaElementSource;
NativeAC.prototype.createMediaElementSource = function(el) {
  const source = origCreateMES.call(this, el);
  if (!this._spotifyAnalyser) {
    const analyser = this.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(this.destination);
    this._spotifyAnalyser = analyser;
    window.spotifyAnalyser = analyser;
    console.log('Inserted Spotify AnalyserNode', analyser);
  } else {
    source.connect(this._spotifyAnalyser);
  }
  return source;
};

// 2) Defer all DOM work until after the page is parsed
window.addEventListener('DOMContentLoaded', () => {
  const tokenEndpoint = 'https://ariel-spotify.onrender.com/auth/spotify-token';
  let userToken = null;
  let deviceId = null;
  let player = null;
  
  // 3) Initialize the Spotify Web Playback SDK when it loads
  window.onSpotifyWebPlaybackSDKReady = () => {
    fetch(tokenEndpoint)
      .then(r => {
        if (!r.ok) {
          return r.text().then(txt => {
            console.error('Token endpoint error →', txt);
            throw new Error(`Token fetch failed: ${r.status}`);
          });
        }
        return r.json();
      })
      .then(({ access_token }) => {
        userToken = access_token;
        player = new Spotify.Player({
          name: 'Maze Visualizer Player',
          getOAuthToken: cb => cb(userToken),
          volume: 0.5
        });
        
        // SDK Ready
        player.addListener('ready', ({ device_id }) => {
          deviceId = device_id;
          document.getElementById('spotify-player-container').textContent =
            'Ready on device: ' + deviceId;
          fetchPlaylists();
        });
        
        // Errors
        ['initialization_error', 'authentication_error', 'account_error', 'playback_error']
        .forEach(evt =>
          player.addListener(evt, ({ message }) =>
            console.error(evt, message)
          )
        );
        
        player.connect();
      })
      .catch(err => console.error('Could not get token', err));
  };
  
  // 4) Tab switcher (Demo / Upload / Spotify)
  document.querySelectorAll('.source-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const src = btn.dataset.source;
      document.querySelectorAll('[data-panel]').forEach(p => {
        p.style.display = p.dataset.panel === src ? '' : 'none';
      });
    });
  });
  
  // 5) Hidden <audio> for your upload/demo  
  const audioEl = document.getElementById('audio-player');
  if (audioEl) {
    audioEl.onplay = () => console.log('Audio element playing');
    audioEl.onpause = () => console.log('Audio element paused');
  }
  
  // 6) Spotify connect & playback controls
  document.getElementById('btn-spotify-connect').addEventListener('click', () => {
    if (!deviceId) return alert('Waiting for Spotify SDK…');
    fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ device_ids: [deviceId] })
    });
  });
  document.getElementById('btn-play').addEventListener('click', () => player.togglePlay());
  document.getElementById('btn-next').addEventListener('click', () => player.nextTrack());
  document.getElementById('btn-prev').addEventListener('click', () => player.previousTrack());
  
  // 7) Volume slider
  document.getElementById('spotify-volume').addEventListener('input', e => {
    player.setVolume(parseFloat(e.target.value));
  });
  
  // 8) Fetch & populate playlists
  function fetchPlaylists() {
    fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { Authorization: 'Bearer ' + userToken }
      })
      .then(r => r.json())
      .then(({ items }) => {
        const sel = document.getElementById('spotify-playlists');
        sel.innerHTML = '<option value="">Select playlist…</option>';
        items.forEach(pl => {
          const opt = document.createElement('option');
          opt.value = pl.id;
          opt.textContent = pl.name;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
          if (sel.value) fetchTracks(sel.value);
        });
      })
      .catch(err => console.error('Playlists error', err));
  }
  
  // 9) Fetch & list tracks in chosen playlist
  function fetchTracks(playlistId) {
    fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`, {
        headers: { Authorization: 'Bearer ' + userToken }
      })
      .then(r => r.json())
      .then(({ items }) => {
        const ul = document.getElementById('spotify-tracks');
        ul.innerHTML = '';
        items.forEach(({ track }) => {
          if (!track) return;
          const li = document.createElement('li');
          li.style.padding = '0.4rem';
          li.style.borderBottom = '1px solid #333';
          li.textContent = `${track.name} — ${track.artists.map(a=>a.name).join(', ')}`;
          li.addEventListener('click', () => playURI(track.uri));
          ul.appendChild(li);
        });
      })
      .catch(err => console.error('Tracks error', err));
  }
  
  // 10) Play any Spotify URI
  function playURI(uri) {
    if (!deviceId) return;
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris: [uri] })
    });
  }
});