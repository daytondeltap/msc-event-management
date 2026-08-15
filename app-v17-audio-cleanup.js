/* MSC v17: remove legacy local-track controls; show server soundtrack status */
(() => {
  'use strict';
  const q = (s, r = document) => r.querySelector(s);
  const tracks = [
    ['lease', 'LEASE'],
    ['lotus', 'Lotus Waters'],
    ['mii', 'Mii Maker']
  ];
  function urlFor(id) {
    const value = window.MSC_CONFIG?.aeroTracks?.[id];
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }
  function clean() {
    q('#v14SoundtrackSettings')?.remove();
    q('#v15AudioModal')?.remove();
    q('#v16AudioModal')?.remove();
    const old = q('#aeroMusicPlayer');
    if (old) old.style.display = 'none';
    const body = q('#v13SettingsBody');
    if (!body || q('#v17ServerSoundtrackSettings', body)) return;
    const configured = tracks.filter(([id]) => urlFor(id)).length;
    const section = document.createElement('section');
    section.id = 'v17ServerSoundtrackSettings';
    section.className = 'v13-setting-section';
    section.innerHTML = `<div class="v13-setting-heading"><div><span class="v13-setting-icon">♫</span><span><h3>Frutiger soundtrack</h3><p>${configured ? `${configured}/3 tracks are served automatically.` : 'No licensed server soundtrack URLs are configured yet.'}</p></span></div></div><div class="v17-server-track-status">${tracks.map(([id,title]) => `<span><b>${title}</b><small>${urlFor(id) ? 'Server' : 'Not configured'}</small></span>`).join('')}</div>`;
    body.appendChild(section);
  }
  const observer = new MutationObserver(clean);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  clean();
})();
