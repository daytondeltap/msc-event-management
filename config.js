window.MSC_CONFIG = window.MSC_CONFIG || {};
window.MSC_CONFIG.aeroTracks = window.MSC_CONFIG.aeroTracks || { lease:"", lotus:"", mii:"" };

/* MSC v24 safe boot: styles only. Optional JavaScript is lazy-loaded by app-v24-feature-loader.js. */
(() => {
  'use strict';
  const BUILD='20260816-0748-v24';
  window.MSC_BOOT_STATE={phase:'core-ready',safeMode:true,errors:[],build:BUILD};
  const addStyle=href=>{const base=href.split('?')[0];if([...document.styleSheets].some(s=>s.href&&s.href.includes(base)))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)};
  [
    'features-v7.css','features-osm.css','features-v8.css','features-v9.css','features-v10.css','features-v11.css','features-v12.css','features-v13.css',
    `features-v14.css?v=${BUILD}`,`features-v15.css?v=${BUILD}`,`features-v16.css?v=${BUILD}`,`features-v17.css?v=${BUILD}`,`features-v18.css?v=${BUILD}`,`features-v19.css?v=${BUILD}`,`features-v20.css?v=${BUILD}`,`features-v21.css?v=${BUILD}`,`features-v23.css?v=${BUILD}`
  ].forEach(addStyle);

  // Apply the saved appearance without loading the old UI enhancement stack.
  try {
    const pref=localStorage.getItem('mscAppearanceV13')||'dark';
    const resolved=pref==='aero'?'aero':pref==='light'?'light':pref==='system'&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
    document.documentElement.dataset.theme=resolved;
    document.documentElement.style.colorScheme=resolved==='light'?'light':'dark';
    window.addEventListener('DOMContentLoaded',()=>document.body?.setAttribute('data-theme',resolved),{once:true});
  } catch {}
})();
