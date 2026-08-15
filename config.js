window.MSC_CONFIG = window.MSC_CONFIG || {};

// Progressive enhancement layers. Core planner/calendar/local mode remain usable if a CDN fails.
(() => {
  const addStyle = (href) => {
    if ([...document.styleSheets].some(s => s.href && s.href.includes(href))) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === new URL(src, location.href).href);
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
  addStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');

  const boot = async () => {
    try { await loadScript('app-polish.js'); } catch (err) { console.warn('MSC polish layer unavailable', err); }
    try {
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      await loadScript('app-osm.js');
    } catch (err) {
      console.warn('OpenStreetMap layer unavailable', err);
    }
    try { await loadScript('app-v8-plan.js'); } catch (err) { console.warn('MSC v8 plan layer unavailable', err); }
    try { await loadScript('app-v8-contacts.js'); } catch (err) { console.warn('MSC v8 contacts layer unavailable', err); }
    try { await loadScript('app-v8-osm-search.js'); } catch (err) { console.warn('MSC v8 OSM search layer unavailable', err); }
    try { await loadScript('app-v8-pdf.js'); } catch (err) { console.warn('MSC v8 PDF import layer unavailable', err); }
    try { await loadScript('app-v9-plan.js'); } catch (err) { console.warn('MSC v9 graph layer unavailable', err); }
    try { await loadScript('app-v9-persistence.js'); } catch (err) { console.warn('MSC v9 persistent collaboration unavailable', err); }
    try { await loadScript('app-v10-boards.js'); } catch (err) { console.warn('MSC v10 boards workspace unavailable', err); }
    try { await loadScript('app-v11-sharing-fixed.js'); } catch (err) { console.warn('MSC v11 sharing layer unavailable', err); }
  };

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
