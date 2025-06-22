// spotify-player.js
// — Requires your backend endpoint `/auth/spotify-token` → { access_token: "…" }

const tokenEndpoint = '/auth/spotify-token';
let spotifyPlayer, deviceId, userToken;

// 1) Capture and patch AudioContext for analyser injection
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

// 2) Load SDK and initialize player
window.onSpotifyWebPlaybackSDKReady = () => {
  fetch(tokenEndpoint)
    .then(r => r.json())
    .then(({ access_token }) => {
      userToken = access_token;
      spotifyPlayer = new Spotify.Player({
        name: 'Maze Visualizer Player',
        getOAuthToken: cb => cb(userToken),
        volume: 0.5
      });

      // Ready
      spotifyPlayer.addListener('ready', ({ device_id }) => {
        deviceId = device_id;
        document.getElementById('spotify-player-container').textContent =
          'Ready on device: ' + deviceId;
        fetchPlaylists();
      });

      // Errors
      ['initialization_error','authentication_error','account_error','playback_error']
        .forEach(e =>
          spotifyPlayer.addListener(e, ({ message }) =>
            console.error(e, message)
          )
        );

      spotifyPlayer.connect();
    })
    .catch(err => console.error('Token error', err));
};

// 3) UI Tab Switching (same as before)
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

// 4) Playback control buttons
document.getElementById('btn-spotify-connect').onclick = () => {
  if (!deviceId) return alert('SDK not ready yet');
  // transfer playback
  fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + userToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ device_ids: [ deviceId ] })
  });
};

document.getElementById('btn-play').onclick = () => {
  spotifyPlayer.togglePlay();
};
document.getElementById('btn-next').onclick = () => {
  spotifyPlayer.nextTrack();
};
document.getElementById('btn-prev').onclick = () => {
  spotifyPlayer.previousTrack();
};

// 5) Volume
document.getElementById('spotify-volume').oninput = e => {
  spotifyPlayer.setVolume(parseFloat(e.target.value));
};

// 6) Fetch and display user playlists
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
      sel.onchange = () => {
        if (sel.value) fetchTracks(sel.value);
      };
    })
    .catch(err => console.error('Playlists error', err));
}

// 7) Fetch tracks for chosen playlist
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
        li.textContent = track.name + ' — ' + track.artists.map(a=>a.name).join(', ');
        li.onclick = () => playURI(track.uri);
        ul.appendChild(li);
      });
    })
    .catch(err => console.error('Tracks error', err));
}

// 8) Play a single track URI
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