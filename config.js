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
  };

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
