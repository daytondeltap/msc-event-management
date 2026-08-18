window.MSC_CONFIG = window.MSC_CONFIG || {};
window.MSC_CONFIG.aeroTracks = window.MSC_CONFIG.aeroTracks || { lease:"", lotus:"", mii:"" };

/* MSC v29 production safe boot: storage sanitation, resilient styles, adaptive device navigation. */
(() => {
  'use strict';
  const BUILD='20260818-production-v29';
  window.MSC_BOOT_STATE={phase:'core-ready',safeMode:true,errors:[],build:BUILD};

  // Prevent malformed cached JSON from crashing app-core before the workspace can render.
  try {
    const raw=localStorage.getItem('mscGeocodeCache');
    if(raw){
      try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('invalid geocode cache')}
      catch{
        try{localStorage.setItem(`mscCorruptBackup:mscGeocodeCache:${Date.now()}`,raw.slice(0,250000))}catch{}
        try{localStorage.removeItem('mscGeocodeCache')}catch{}
      }
    }
  } catch {}

  const addStyle=href=>{const base=href.split('?')[0];if([...document.styleSheets].some(s=>s.href&&s.href.includes(base)))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)};
  [
    'features-v7.css','features-osm.css','features-v8.css','features-v9.css','features-v10.css','features-v11.css','features-v12.css','features-v13.css',
    `features-v14.css?v=${BUILD}`,`features-v15.css?v=${BUILD}`,`features-v16.css?v=${BUILD}`,`features-v17.css?v=${BUILD}`,`features-v18.css?v=${BUILD}`,`features-v19.css?v=${BUILD}`,`features-v20.css?v=${BUILD}`,`features-v21.css?v=${BUILD}`,`features-v23.css?v=${BUILD}`,`features-v25.css?v=${BUILD}`,`features-v28-production.css?v=${BUILD}`,`features-v29-device.css?v=${BUILD}`
  ].forEach(addStyle);

  // Apply the saved appearance without loading the old UI enhancement stack.
  try {
    const pref=localStorage.getItem('mscAppearanceV13')||'dark';
    const resolved=pref==='aero'?'aero':pref==='light'?'light':pref==='system'&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
    document.documentElement.dataset.theme=resolved;
    document.documentElement.style.colorScheme=resolved==='light'?'light':'dark';
    window.addEventListener('DOMContentLoaded',()=>document.body?.setAttribute('data-theme',resolved),{once:true});
  } catch {}

  // Production guards load only after the core stack has defined its globals.
  window.addEventListener('load',()=>{
    const loadScript=(src,marker)=>new Promise(resolve=>{
      if(document.querySelector(`script[${marker}]`)){resolve();return}
      const s=document.createElement('script');s.src=src;s.setAttribute(marker,'1');s.async=false;
      s.onload=()=>resolve();s.onerror=()=>{console.error(`MSC production module failed to load: ${src}`);resolve()};document.body.appendChild(s);
    });
    loadScript(`app-v28-production.js?v=${BUILD}`,'data-msc-production').then(()=>loadScript(`app-v29-device-nav.js?v=${BUILD}`,'data-msc-device-nav')).then(()=>{
      window.MSC_BOOT_STATE={...(window.MSC_BOOT_STATE||{}),phase:'production-ready',safeMode:false,build:BUILD};
    });
  },{once:true});
})();
