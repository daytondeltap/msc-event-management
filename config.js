window.MSC_CONFIG = window.MSC_CONFIG || {};
window.MSC_CONFIG.aeroTracks = window.MSC_CONFIG.aeroTracks || { lease:"", lotus:"", mii:"" };

/* v33 production safe boot: storage sanitation, resilient styles, adaptive navigation, stability, budget, and production QoL. */
(() => {
  'use strict';
  const BUILD='20260823-prod-v33';
  window.MSC_BOOT_STATE={phase:'core-ready',safeMode:true,errors:[],build:BUILD};

  // Branding only. Internal MSC_* runtime names intentionally stay unchanged.
  document.title='generic event manager';
  const ensureMeta=(selector,attrs)=>{
    let el=document.head.querySelector(selector);
    if(!el){el=document.createElement('meta');document.head.appendChild(el)}
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
  };
  ensureMeta('meta[name="application-name"]',{name:'application-name',content:'generic event manager'});
  ensureMeta('meta[property="og:title"]',{property:'og:title',content:'generic event manager'});
  ensureMeta('meta[name="twitter:title"]',{name:'twitter:title',content:'generic event manager'});
  if(!document.head.querySelector('link[data-gem-favicon]')){
    const icon=document.createElement('link');
    icon.rel='icon';icon.type='image/svg+xml';icon.dataset.gemFavicon='1';
    icon.href=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><text x="32" y="42" text-anchor="middle" fill="white" font-family="Comic Sans MS, Comic Sans, cursive" font-size="30" font-weight="700">:)</text></svg>')}`;
    document.head.appendChild(icon);
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const brand=document.querySelector('.brand');
    if(brand){
      brand.setAttribute('aria-label','generic event manager plan');
      const mark=brand.querySelector('.brand-mark');if(mark)mark.textContent=':)';
      const strong=brand.querySelector('.brand-copy strong');if(strong)strong.textContent='generic event';
      const small=brand.querySelector('.brand-copy small');if(small)small.textContent='manager';
    }
    const eyebrow=document.getElementById('viewEyebrow');if(eyebrow)eyebrow.textContent='generic event manager';
  },{once:true});

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
    `features-v14.css?v=${BUILD}`,`features-v15.css?v=${BUILD}`,`features-v16.css?v=${BUILD}`,`features-v17.css?v=${BUILD}`,`features-v18.css?v=${BUILD}`,`features-v19.css?v=${BUILD}`,`features-v20.css?v=${BUILD}`,`features-v21.css?v=${BUILD}`,`features-v23.css?v=${BUILD}`,`features-v25.css?v=${BUILD}`,`features-v28-production.css?v=${BUILD}`,`features-v29-device.css?v=${BUILD}`,`features-v30-brand.css?v=${BUILD}`,`features-v31-stability.css?v=${BUILD}`,`features-v32-qol.css?v=${BUILD}`,`features-v33-prod.css?v=${BUILD}`
  ].forEach(addStyle);

  // Apply the saved appearance without loading the old UI enhancement stack.
  try {
    const pref=localStorage.getItem('mscAppearanceV13')||'dark';
    const resolved=pref==='aero'?'aero':pref==='light'?'light':pref==='system'&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
    document.documentElement.dataset.theme=resolved;
    document.documentElement.style.colorScheme=resolved==='light'?'light':'dark';
    window.addEventListener('DOMContentLoaded',()=>document.body?.setAttribute('data-theme',resolved),{once:true});
  } catch {}

  // Core scripts are synchronous and appear after config.js in index.html, so DOMContentLoaded is the earliest safe point
  // to attach production guards without waiting on images or external resources.
  const startProductionModules=()=>{
    const loadScript=(src,marker)=>new Promise(resolve=>{
      if(document.querySelector(`script[${marker}]`)){resolve();return}
      const s=document.createElement('script');s.src=src;s.setAttribute(marker,'1');s.async=false;
      s.onload=()=>resolve();s.onerror=()=>{console.error(`Production module failed to load: ${src}`);resolve()};document.body.appendChild(s);
    });
    loadScript(`app-v28-production.js?v=${BUILD}`,'data-msc-production')
      .then(()=>loadScript(`app-v29-device-nav.js?v=${BUILD}`,'data-msc-device-nav'))
      .then(()=>loadScript(`app-v32-budget-qol.js?v=${BUILD}`,'data-msc-qol'))
      .then(()=>loadScript(`app-v33-prod-qol.js?v=${BUILD}`,'data-msc-prod-qol'))
      .then(()=>{
        window.MSC_BOOT_STATE={...(window.MSC_BOOT_STATE||{}),phase:'production-ready',safeMode:false,build:BUILD};
      });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startProductionModules,{once:true});
  else queueMicrotask(startProductionModules);
})();
