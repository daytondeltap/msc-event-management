/* MSC v26: Frutiger Aero wallpaper/player polish without legacy render wrappers. */
(() => {
  'use strict';

  const q = (s, r = document) => r.querySelector(s);
  const TRACKS = [
    { id: 'lease', title: 'LEASE', subtitle: 'Takeshi Abo · nostalgia edit' },
    { id: 'lotus', title: 'Lotus Waters', subtitle: 'remake' },
    { id: 'mii', title: 'Mii Maker', subtitle: 'Nintendo Wii U · Editing Mii' }
  ];
  const TRACK_KEY = 'mscAeroTrackV26';
  const VOLUME_KEY = 'mscAeroVolumeV26';

  let index = Number(localStorage.getItem(TRACK_KEY) || 0) || 0;
  let audio = null;

  const isAero = () => document.documentElement.dataset.theme === 'aero';
  const trackUrl = id => {
    const value = window.MSC_CONFIG?.aeroTracks?.[id];
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  };
  const message = text => {
    try { if (typeof toast === 'function') toast(text); } catch {}
  };

  function currentTrack() {
    return TRACKS[(index + TRACKS.length) % TRACKS.length];
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = Number(localStorage.getItem(VOLUME_KEY) || 0.55);
    audio.addEventListener('ended', () => step(1, true));
    audio.addEventListener('play', syncPlayer);
    audio.addEventListener('pause', syncPlayer);
    return audio;
  }

  function ensurePlayer() {
    let player = q('#v26AeroPlayer');
    if (player) return player;

    player = document.createElement('div');
    player.id = 'v26AeroPlayer';
    player.className = 'v17-aero-player v26-aero-player';
    player.setAttribute('aria-label', 'Frutiger Aero soundtrack player');
    player.innerHTML = `
      <div class="v17-player-orb">♫</div>
      <div class="v17-player-copy">
        <strong id="v26TrackTitle">Frutiger soundtrack</strong>
        <small id="v26TrackSubtitle">Server soundtrack</small>
      </div>
      <div class="v17-player-controls">
        <button type="button" data-v26-prev aria-label="Previous track">◀</button>
        <button type="button" class="play" data-v26-play aria-label="Play or pause">▶</button>
        <button type="button" data-v26-next aria-label="Next track">▶|</button>
      </div>
      <label class="v17-player-volume" aria-label="Soundtrack volume">
        <span>🔊</span>
        <input id="v26AudioVolume" type="range" min="0" max="1" step="0.02"
          value="${localStorage.getItem(VOLUME_KEY) || '0.55'}">
      </label>`;

    document.body.appendChild(player);
    q('#v26AudioVolume', player)?.addEventListener('input', event => {
      const value = Number(event.target.value);
      ensureAudio().volume = value;
      localStorage.setItem(VOLUME_KEY, String(value));
    });
    return player;
  }

  function syncPlayer() {
    const player = ensurePlayer();
    const def = currentTrack();
    const url = trackUrl(def.id);
    q('#v26TrackTitle', player).textContent = def.title;
    q('#v26TrackSubtitle', player).textContent =
      url ? `${def.subtitle} · server soundtrack` : `${def.subtitle} · not configured`;
    const play = q('[data-v26-play]', player);
    if (play) play.textContent = audio && !audio.paused ? '❚❚' : '▶';

    player.classList.toggle('show', isAero());
    q('#v25AudioPlayer')?.classList.remove('show');
    if (!isAero() && audio && !audio.paused) audio.pause();
  }

  async function loadCurrent(autoplay = false) {
    ensurePlayer();
    const def = currentTrack();
    const url = trackUrl(def.id);
    const media = ensureAudio();

    if (!url) {
      media.removeAttribute('src');
      media.load();
      syncPlayer();
      return false;
    }

    if (media.src !== url) media.src = url;
    syncPlayer();
    if (autoplay) {
      try { await media.play(); } catch {}
    }
    return true;
  }

  function step(delta, autoplay = true) {
    index = (index + delta + TRACKS.length) % TRACKS.length;
    localStorage.setItem(TRACK_KEY, String(index));
    loadCurrent(autoplay);
  }

  function toggle() {
    const media = ensureAudio();
    if (!media.src) {
      loadCurrent(true).then(ok => {
        if (!ok) message('No server soundtrack is configured for this track yet');
      });
      return;
    }
    if (media.paused) {
      media.play().catch(() => message('Press play again to start audio'));
    } else {
      media.pause();
    }
  }

  // Register before v25 so its old audio button cannot create the simplified player.
  document.addEventListener('click', event => {
    if (event.target.closest('[data-v25-audio-toggle]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ensurePlayer();
      syncPlayer();
      return;
    }
    if (event.target.closest('[data-v26-prev]')) {
      event.preventDefault();
      step(-1, true);
      return;
    }
    if (event.target.closest('[data-v26-next]')) {
      event.preventDefault();
      step(1, true);
      return;
    }
    if (event.target.closest('[data-v26-play]')) {
      event.preventDefault();
      toggle();
    }
  }, true);

  new MutationObserver(syncPlayer).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  window.addEventListener('DOMContentLoaded', () => {
    ensurePlayer();
    loadCurrent(false);
    syncPlayer();
  }, { once: true });
})();
