window.MSC_CONFIG = window.MSC_CONFIG || {};

// Progressive enhancement layers. Core planner/calendar/local mode remain usable if a CDN fails.
(() => {
  const BUILD = '20260815-1756-v16';
  const addStyle = (href) => {
    if ([...document.styleSheets].some(s => s.href && s.href.includes(href.split('?')[0]))) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const absolute = new URL(src, location.href).href;
    const existing = [...document.scripts].find(s => s.src === absolute);
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = reject;
    if (!existing) document.body.appendChild(script);
  });

  addStyle('features-v7.css');
  addStyle('features-osm.css');
  addStyle('features-v8.css');
  addStyle('features-v9.css');
  addStyle('features-v10.css');
  addStyle('features-v11.css');
  addStyle('features-v12.css');
  addStyle('features-v13.css');
  addStyle(`features-v14.css?v=${BUILD}`);
  addStyle(`features-v15.css?v=${BUILD}`);
  addStyle(`features-v16.css?v=${BUILD}`);
  addStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');

  const boot = async () => {
    try { await loadScript('app-polish.js'); } catch (err) { console.warn('MSC polish layer unavailable', err); }
    try {
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      await loadScript('app-osm.js');
    } catch (err) {
      console.warn('OpenStreetMap layer unavailable', err);
    }
    // This must load before v8/v9 so it can own connection clicks before legacy prompt/drag handlers.
    try { await loadScript('app-v12-connections.js'); } catch (err) { console.warn('MSC v12 connection controller unavailable', err); }
    try { await loadScript('app-v8-plan.js'); } catch (err) { console.warn('MSC v8 plan layer unavailable', err); }
    try { await loadScript('app-v8-contacts.js'); } catch (err) { console.warn('MSC v8 contacts layer unavailable', err); }
    try { await loadScript('app-v8-osm-search.js'); } catch (err) { console.warn('MSC v8 OSM search layer unavailable', err); }
    try { await loadScript('app-v8-pdf.js'); } catch (err) { console.warn('MSC v8 PDF import layer unavailable', err); }
    try { await loadScript('app-v9-plan.js'); } catch (err) { console.warn('MSC v9 graph layer unavailable', err); }
    try { await loadScript('app-v9-persistence.js'); } catch (err) { console.warn('MSC v9 persistent collaboration unavailable', err); }
    try { await loadScript('app-v10-boards.js'); } catch (err) { console.warn('MSC v10 boards workspace unavailable', err); }
    try { await loadScript('app-v11-sharing-fixed.js'); } catch (err) { console.warn('MSC v11 sharing layer unavailable', err); }
    try { await loadScript('app-v13-settings.js'); } catch (err) { console.warn('MSC v13 options/onboarding unavailable', err); }
    try { await loadScript(`app-v14-aero.js?v=${BUILD}`); } catch (err) { console.warn('MSC v14 Aero/live tutorial layer unavailable', err); }
    try { await loadScript(`app-v15-aero.js?v=${BUILD}`); } catch (err) { console.warn('MSC v15 Aero contrast/media fixes unavailable', err); }
    try { await loadScript(`app-v16-aero.js?v=${BUILD}`); } catch (err) { console.warn('MSC v16 deterministic Aero fixes unavailable', err); }
  };

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
