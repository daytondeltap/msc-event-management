window.MSC_CONFIG = window.MSC_CONFIG || {
  // Optional: commit a browser-restricted Google Maps JavaScript API key here.
  // You can also enter one from Venues > Configure Google Maps and it will stay in localStorage.
  googleMapsApiKey: ""
};

// v7 progressive enhancement layer. Kept separate from the core app so the planner,
// calendar imports and local mode still work even if an integration fails to load.
(() => {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'features-v7.css';
  document.head.appendChild(css);

  window.addEventListener('DOMContentLoaded', () => {
    const script = document.createElement('script');
    script.src = 'app-polish.js';
    script.defer = true;
    document.body.appendChild(script);
  }, { once: true });
})();
