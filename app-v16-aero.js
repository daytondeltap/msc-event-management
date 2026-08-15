/* MSC v16: deterministic Aero wallpaper + safe soundtrack controls */
(() => {
  'use strict';

  const WALLPAPER_ID = 'mscAeroWallpaperLayer';
  const AUDIO_MODAL_ID = 'v16AudioModal';
  const AUDIO_DB = 'msc-aero-audio-v14';
  const AUDIO_STORE = 'tracks';
  const trackDefs = [
    ['lease', 'LEASE', 'Takeshi Abo · nostalgia edit'],
    ['lotus', 'Lotus Waters', 'remake'],
    ['mii', 'Mii Maker', 'Nintendo Wii U · Editing Mii']
  ];
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];

  function isAero() {
    return document.documentElement.dataset.theme === 'aero';
  }

  function ensureWallpaper() {
    let layer = q(`#${WALLPAPER_ID}`);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = WALLPAPER_ID;
      layer.className = 'msc-aero-wallpaper';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<div class="msc-aero-wallpaper-tint"></div>';
      document.body.insertBefore(layer, document.body.firstChild);
    }
    const absolute = new URL('assets/asadal.jpg?v=20260815-v16', document.baseURI).href;
    layer.style.backgroundImage = `url("${absolute}")`;
    return layer;
  }

  function syncWallpaper() {
    const layer = ensureWallpaper();
    layer.classList.toggle('show', isAero());
    document.body.classList.toggle('msc-aero-active', isAero());
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(AUDIO_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(AUDIO_STORE)) {
          request.result.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function audioStates() {
    const db = await openDb();
    const result = {};
    await Promise.all(trackDefs.map(([id]) => new Promise(resolve => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const request = tx.objectStore(AUDIO_STORE).get(id);
      request.onsuccess = () => { result[id] = request.result || null; resolve(); };
      request.onerror = () => { result[id] = null; resolve(); };
    })));
    db.close();
    return result;
  }

  function ensureAudioModal() {
    let modal = q(`#${AUDIO_MODAL_ID}`);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = AUDIO_MODAL_ID;
    modal.className = 'v16-audio-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="v16-audio-backdrop" data-v16-audio-close></div>
      <section class="v16-audio-card" role="dialog" aria-modal="true" aria-labelledby="v16AudioTitle">
        <header class="v16-audio-titlebar">
          <div class="v16-audio-title-orb">♫</div>
          <div><div class="eyebrow">Frutiger Aero</div><h2 id="v16AudioTitle">Soundtrack</h2><p>Choose the three matching files once. They stay on this browser.</p></div>
          <button type="button" class="v16-audio-close" data-v16-audio-close aria-label="Close">×</button>
        </header>
        <div class="v16-audio-body">
          <div id="v16AudioSlots" class="v16-audio-slots"></div>
          <div class="v16-audio-note"><b>Local only</b><span>Music is stored in IndexedDB and never becomes part of a board or collaboration snapshot.</span></div>
        </div>
        <footer class="v16-audio-actions">
          <button type="button" class="button secondary" data-v16-audio-close>Done</button>
          <button type="button" class="button primary" data-v16-choose-files>Choose the 3 audio files</button>
        </footer>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-v16-audio-close]')) closeAudioManager();
      if (event.target.closest('[data-v16-choose-files]')) chooseFiles();
    });
    return modal;
  }

  async function renderAudioSlots() {
    const host = q('#v16AudioSlots');
    if (!host) return;
    const states = await audioStates().catch(() => ({}));
    host.innerHTML = trackDefs.map(([id, title, subtitle], index) => {
      const saved = states[id];
      const icon = index === 0 ? '♪' : index === 1 ? '◉' : '◎';
      return `<article class="v16-audio-slot ${saved ? 'loaded' : ''}">
        <span class="v16-audio-icon">${icon}</span>
        <div><strong>${title}</strong><small>${saved?.name ? `Loaded · ${saved.name}` : subtitle}</small></div>
        <b>${saved ? 'Loaded' : 'Not loaded'}</b>
      </article>`;
    }).join('');
  }

  function openAudioManager() {
    const modal = ensureAudioModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    renderAudioSlots();
  }

  function closeAudioManager() {
    const modal = q(`#${AUDIO_MODAL_ID}`);
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function chooseFiles() {
    const input = q('#aeroTrackFiles');
    if (!input) {
      if (typeof toast === 'function') toast('Soundtrack player is still loading');
      return;
    }
    const refresh = () => setTimeout(renderAudioSlots, 500);
    input.addEventListener('change', refresh, { once: true });
    input.click();
  }

  function convertControl(node) {
    if (!node || node.dataset.v16AudioManager === '1') return;
    if (node.hasAttribute('data-aero-load')) {
      // Clone removes the v14 direct click listener attached to the original player button.
      const clone = node.cloneNode(true);
      clone.removeAttribute('data-aero-load');
      clone.removeAttribute('data-v14-load-audio');
      clone.dataset.v16AudioManager = '1';
      clone.textContent = 'Soundtrack';
      clone.title = 'Manage Frutiger Aero soundtrack';
      node.replaceWith(clone);
      return;
    }
    node.removeAttribute('data-v14-load-audio');
    node.dataset.v16AudioManager = '1';
    if (/load/i.test(node.textContent || '')) node.textContent = 'Manage soundtrack';
  }

  function rewireAudioControls() {
    qa('[data-aero-load], [data-v14-load-audio]').forEach(convertControl);
    // Remove the older v15 dialog from the reachable UI. v16 owns this flow completely.
    const old = q('#v15AudioModal');
    if (old) {
      old.classList.remove('open');
      old.setAttribute('aria-hidden', 'true');
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-v16-audio-manager="1"]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    openAudioManager();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && q(`#${AUDIO_MODAL_ID}`)?.classList.contains('open')) {
      event.preventDefault();
      closeAudioManager();
    }
  }, true);

  const observer = new MutationObserver(() => {
    syncWallpaper();
    rewireAudioControls();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  observer.observe(document.body, { childList: true, subtree: true });

  ensureWallpaper();
  ensureAudioModal();
  syncWallpaper();
  rewireAudioControls();
})();
