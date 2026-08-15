/* MSC v14: Aero media + real-UI tutorial screenshots */
(() => {
  'use strict';

  const H2C_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const AUDIO_DB = 'msc-aero-audio-v14';
  const AUDIO_STORE = 'tracks';
  const VOLUME_KEY = 'mscAeroVolumeV14';
  const LAST_TRACK_KEY = 'mscAeroLastTrackV14';
  const screenshotCache = new Map();
  let captureBusy = false;
  let player = null;
  let audio = null;
  let currentTrack = Number(localStorage.getItem(LAST_TRACK_KEY) || 0) || 0;
  let currentObjectUrl = '';
  let settingsObserver = null;

  const tracks = [
    { id: 'lease', title: 'LEASE', subtitle: 'Takeshi Abo · nostalgia edit', match: /lease|takeshi|paft/i },
    { id: 'lotus', title: 'Lotus Waters', subtitle: 'remake', match: /lotus|waters/i },
    { id: 'mii', title: 'Mii Maker', subtitle: 'Nintendo Wii U · Editing Mii', match: /mii|maker|wii\s*u/i }
  ];

  const q = (s, r = document) => r.querySelector(s);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function isAero() { return document.documentElement.dataset.theme === 'aero'; }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve, reject) => {
      const old = [...document.scripts].find(s => s.src === H2C_URL);
      if (old) {
        old.addEventListener('load', () => resolve(window.html2canvas), { once: true });
        old.addEventListener('error', reject, { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = H2C_URL;
      s.async = true;
      s.onload = () => resolve(window.html2canvas);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function tutorialKey() {
    const title = q('#v13TutorialTitle')?.textContent?.toLowerCase() || q('.v13-tutorial-top h2')?.textContent?.toLowerCase() || '';
    if (title.includes('boards')) return 'boards';
    if (title.includes('plan')) return 'plan';
    if (title.includes('event')) return 'events';
    if (title.includes('place') || title.includes('calendar') || title.includes('venue')) return 'venues';
    if (title.includes('share') || title.includes('collab')) return 'share';
    return 'settings';
  }

  const cursorAt = {
    boards: [78, 22],
    plan: [62, 55],
    events: [83, 18],
    venues: [58, 42],
    share: [79, 68],
    settings: [77, 29]
  };

  async function captureElement(el) {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale: Math.min(1.35, window.devicePixelRatio || 1),
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 1800,
      removeContainer: true
    });
    return canvas.toDataURL('image/jpeg', 0.84);
  }

  async function captureTutorialView(key) {
    if (screenshotCache.has(key)) return screenshotCache.get(key);
    const previousView = typeof view === 'string' ? view : 'plan';
    const shareWasOpen = q('#shareModal')?.classList.contains('open');
    const settingsWasOpen = q('#v13Settings')?.classList.contains('open');
    let target = null;

    try {
      if (key === 'share') {
        q('#shareButton')?.click();
        await delay(120);
        target = q('#shareModal .share-card') || q('.topbar');
      } else if (key === 'settings') {
        q('#settingsButton')?.click();
        await delay(120);
        target = q('#v13Settings .v13-settings-panel') || q('.sidebar');
      } else {
        const targetView = key === 'boards' ? 'boards' : key;
        if (typeof setView === 'function') setView(targetView, false);
        await nextFrame();
        await delay(key === 'venues' ? 180 : 75);
        target = q('.main-shell') || q('.app-shell');
      }
      if (!target) throw new Error('capture_target_missing');
      const url = await captureElement(target);
      screenshotCache.set(key, url);
      return url;
    } finally {
      if (!shareWasOpen) {
        const sm = q('#shareModal');
        sm?.classList.remove('open');
        sm?.setAttribute('aria-hidden', 'true');
      }
      if (!settingsWasOpen) {
        const st = q('#v13Settings');
        st?.classList.remove('open');
        st?.setAttribute('aria-hidden', 'true');
      }
      if (typeof setView === 'function' && previousView) setView(previousView, false);
    }
  }

  function tutorialCursor(key) {
    const [x, y] = cursorAt[key] || [68, 40];
    return `<div class="v14-tutorial-cursor remote-cursor" style="left:${x}%;top:${y}%"><div class="cursor-pointer"></div><span class="cursor-label">You</span></div>`;
  }

  async function upgradeTutorialVisual() {
    const overlay = q('#v13Tutorial');
    const visual = q('#v13Tutorial .v13-tutorial-visual');
    if (!overlay?.classList.contains('open') || !visual || captureBusy) return;
    const key = tutorialKey();
    if (visual.dataset.liveScreenshot === key) return;

    captureBusy = true;
    visual.dataset.liveScreenshot = key;
    visual.innerHTML = `<div class="v14-tutorial-loading"><span></span><strong>Capturing the live MSC interface…</strong><small>This tutorial image is generated from the website you are using.</small></div>`;
    try {
      const src = await captureTutorialView(key);
      if (!q('#v13Tutorial')?.classList.contains('open')) return;
      const liveVisual = q('#v13Tutorial .v13-tutorial-visual');
      if (!liveVisual || liveVisual.dataset.liveScreenshot !== key) return;
      liveVisual.innerHTML = `<div class="v14-live-shot"><img src="${src}" alt="Live screenshot of the MSC ${key} interface">${tutorialCursor(key)}<div class="v14-shot-badge"><span></span>Live UI capture</div></div>`;
    } catch (err) {
      console.warn('Live tutorial screenshot unavailable', err);
      const liveVisual = q('#v13Tutorial .v13-tutorial-visual');
      if (liveVisual) {
        liveVisual.removeAttribute('data-live-screenshot');
        liveVisual.innerHTML = `<div class="v14-tutorial-loading error"><strong>Live preview unavailable</strong><small>The tutorial still works; try this step again after the interface finishes loading.</small></div>`;
      }
    } finally {
      captureBusy = false;
    }
  }

  function watchTutorial() {
    const root = q('#v13Tutorial');
    if (!root) return;
    const obs = new MutationObserver(() => {
      if (root.classList.contains('open')) queueMicrotask(upgradeTutorialVisual);
    });
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if (root.classList.contains('open')) upgradeTutorialVisual();
  }

  function openAudioDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(AUDIO_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(AUDIO_STORE)) req.result.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveAudioTrack(id, file) {
    const db = await openAudioDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.objectStore(AUDIO_STORE).put({ id, blob: file, name: file.name, type: file.type || 'audio/mpeg', savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function getAudioTrack(id) {
    const db = await openAudioDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  }

  async function countAudioTracks() {
    const found = await Promise.all(tracks.map(t => getAudioTrack(t.id).catch(() => null)));
    return found.filter(Boolean).length;
  }

  function ensurePlayer() {
    if (player) return player;
    player = document.createElement('div');
    player.id = 'aeroMusicPlayer';
    player.className = 'aero-music-player';
    player.innerHTML = `<div class="aero-player-gloss"></div>
      <div class="aero-player-orb">♫</div>
      <div class="aero-player-copy"><strong id="aeroTrackTitle">Frutiger soundtrack</strong><small id="aeroTrackSub">Load your local tracks once</small></div>
      <div class="aero-player-controls">
        <button type="button" data-aero-prev title="Previous">◀</button>
        <button type="button" data-aero-play class="aero-play" title="Play / pause">▶</button>
        <button type="button" data-aero-next title="Next">▶|</button>
      </div>
      <label class="aero-volume" title="Volume"><span>🔊</span><input type="range" min="0" max="1" step="0.02" value="${localStorage.getItem(VOLUME_KEY) || '0.55'}"></label>
      <button type="button" class="aero-load" data-aero-load>Load tracks</button>
      <input type="file" id="aeroTrackFiles" accept="audio/*" multiple hidden>`;
    document.body.appendChild(player);

    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = Number(localStorage.getItem(VOLUME_KEY) || 0.55);
    audio.addEventListener('ended', () => playIndex(currentTrack + 1, true));
    audio.addEventListener('play', syncPlayer);
    audio.addEventListener('pause', syncPlayer);

    player.addEventListener('click', e => {
      if (e.target.closest('[data-aero-play]')) togglePlay();
      if (e.target.closest('[data-aero-prev]')) playIndex(currentTrack - 1, true);
      if (e.target.closest('[data-aero-next]')) playIndex(currentTrack + 1, true);
      if (e.target.closest('[data-aero-load]')) q('#aeroTrackFiles')?.click();
    });
    q('#aeroTrackFiles', player)?.addEventListener('change', e => importTracks([...e.target.files]));
    q('.aero-volume input', player)?.addEventListener('input', e => {
      const v = Number(e.target.value);
      if (audio) audio.volume = v;
      localStorage.setItem(VOLUME_KEY, String(v));
    });
    syncPlayer();
    return player;
  }

  function syncPlayer() {
    ensurePlayer();
    const t = tracks[(currentTrack + tracks.length) % tracks.length];
    q('#aeroTrackTitle', player).textContent = t.title;
    q('#aeroTrackSub', player).textContent = t.subtitle;
    q('[data-aero-play]', player).textContent = audio && !audio.paused ? '❚❚' : '▶';
    player.classList.toggle('show', isAero());
  }

  async function playIndex(index, autoPlay = false) {
    ensurePlayer();
    currentTrack = (index + tracks.length) % tracks.length;
    localStorage.setItem(LAST_TRACK_KEY, String(currentTrack));
    const t = tracks[currentTrack];
    const saved = await getAudioTrack(t.id).catch(() => null);
    if (!saved?.blob) {
      syncPlayer();
      if (typeof toast === 'function') toast('Load the Frutiger soundtrack files once in Options');
      return false;
    }
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(saved.blob);
    audio.src = currentObjectUrl;
    syncPlayer();
    if (autoPlay) {
      try { await audio.play(); } catch { /* browser may require an explicit click */ }
    }
    return true;
  }

  async function togglePlay() {
    ensurePlayer();
    if (!audio.src) {
      const ok = await playIndex(currentTrack, false);
      if (!ok) return;
    }
    if (audio.paused) {
      try { await audio.play(); } catch { if (typeof toast === 'function') toast('Press play again to start audio'); }
    } else audio.pause();
    syncPlayer();
  }

  async function importTracks(files) {
    if (!files.length) return;
    let saved = 0;
    for (const file of files) {
      const def = tracks.find(t => t.match.test(file.name));
      if (!def) continue;
      await saveAudioTrack(def.id, file);
      saved++;
    }
    if (saved) {
      if (typeof toast === 'function') toast(`${saved} Aero soundtrack track${saved === 1 ? '' : 's'} saved on this browser`);
      await playIndex(currentTrack, false);
    } else if (typeof toast === 'function') toast('Choose the LEASE, Lotus Waters and Mii Maker audio files');
    injectSoundtrackSettings();
  }

  async function injectSoundtrackSettings() {
    const body = q('#v13SettingsBody');
    if (!body || q('#v14SoundtrackSettings', body)) return;
    const count = await countAudioTracks().catch(() => 0);
    const section = document.createElement('section');
    section.id = 'v14SoundtrackSettings';
    section.className = 'v13-setting-section v14-soundtrack-settings';
    section.innerHTML = `<div class="v13-setting-heading"><div><span class="v13-setting-icon">♫</span><span><h3>Frutiger soundtrack</h3><p>Optional local music used only in Frutiger Aero mode.</p></span></div></div>
      <div class="v14-soundtrack-list">${tracks.map(t => `<div><span>${t.id === 'lease' ? '◉' : t.id === 'lotus' ? '◌' : '◎'}</span><p><strong>${t.title}</strong><small>${t.subtitle}</small></p></div>`).join('')}</div>
      <div class="v13-action-row"><button type="button" class="button secondary" data-v14-load-audio>${count ? `Replace tracks · ${count}/3 loaded` : 'Load the 3 tracks'}</button><button type="button" class="button secondary" data-v14-test-audio>Test player</button></div>
      <small class="v14-local-note">Audio stays in this browser's local storage and is not uploaded with shared boards.</small>`;
    body.appendChild(section);
  }

  function watchSettings() {
    settingsObserver = new MutationObserver(() => {
      if (q('#v13Settings')?.classList.contains('open')) injectSoundtrackSettings();
    });
    settingsObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  function themeChanged() {
    ensurePlayer();
    player.classList.toggle('show', isAero());
    if (!isAero() && audio && !audio.paused) audio.pause();
    if (isAero()) {
      document.body.classList.add('asadal-wallpaper-active');
    } else document.body.classList.remove('asadal-wallpaper-active');
    syncPlayer();
  }

  const themeObserver = new MutationObserver(themeChanged);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  document.addEventListener('click', e => {
    if (e.target.closest('[data-v14-load-audio]')) {
      ensurePlayer();
      q('#aeroTrackFiles')?.click();
    }
    if (e.target.closest('[data-v14-test-audio]')) {
      ensurePlayer();
      togglePlay();
    }
  }, true);

  ensurePlayer();
  watchTutorial();
  watchSettings();
  themeChanged();
})();
