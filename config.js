window.MSC_CONFIG = window.MSC_CONFIG || {};
window.MSC_CONFIG.aeroTracks = window.MSC_CONFIG.aeroTracks || { lease:"", lotus:"", mii:"" };

/* MSC v23 phased enhancement loader. First paint never waits for optional modules. */
(() => {
  'use strict';
  const BUILD='20260815-2336-v23';
  const state=window.MSC_BOOT_STATE=window.MSC_BOOT_STATE||{phase:'core',errors:[],maps:false};

  function addStyle(href){
    const base=href.split('?')[0];
    if([...document.styleSheets].some(s=>s.href&&s.href.includes(base)))return;
    const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);
  }
  [
    'features-v7.css','features-osm.css','features-v8.css','features-v9.css','features-v10.css','features-v11.css','features-v12.css','features-v13.css',
    `features-v14.css?v=${BUILD}`,`features-v15.css?v=${BUILD}`,`features-v16.css?v=${BUILD}`,`features-v17.css?v=${BUILD}`,`features-v18.css?v=${BUILD}`,`features-v19.css?v=${BUILD}`,`features-v20.css?v=${BUILD}`,`features-v21.css?v=${BUILD}`,`features-v23.css?v=${BUILD}`
  ].forEach(addStyle);

  function loadScript(src,timeout=3500){
    return new Promise((resolve,reject)=>{
      const absolute=new URL(src,location.href).href;
      const found=[...document.scripts].find(s=>s.src===absolute);
      if(found?.dataset.loaded==='1')return resolve();
      let done=false;
      const finish=(ok,error)=>{if(done)return;done=true;clearTimeout(timer);ok?resolve():reject(error)};
      const timer=setTimeout(()=>finish(false,new Error(`timeout:${src}`)),timeout);
      const s=found||document.createElement('script');
      s.addEventListener('load',()=>{s.dataset.loaded='1';finish(true)},{once:true});
      s.addEventListener('error',()=>finish(false,new Error(`load:${src}`)),{once:true});
      if(!found){s.src=src;s.async=false;s.dataset.mscDynamic='1';document.body.appendChild(s)}
      else if(!found.dataset.mscDynamic)finish(true);
    });
  }
  const pause=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  const idle=(timeout=120)=>new Promise(r=>('requestIdleCallback'in window?requestIdleCallback(()=>r(),{timeout}):setTimeout(r,16)));

  async function loadPhase(name,files,{capturePlan=false}={}){
    state.phase=name;
    for(const src of files){
      try{await loadScript(src);}
      catch(err){state.errors.push({src,message:String(err?.message||err)});console.warn(`MSC ${name} module skipped`,src,err)}
      await idle(80);
    }
    try{window.MSC_V23?.reassert?.(capturePlan)}catch(err){console.error('MSC v23 reassert failed',err)}
    await pause();
  }

  let mapsPromise=null;
  function loadMaps(){
    if(mapsPromise)return mapsPromise;
    mapsPromise=(async()=>{
      state.maps=true;addStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      try{await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',7000);await loadScript('app-osm.js',3500);await loadScript('app-v8-osm-search.js',3500);}
      catch(err){state.errors.push({src:'maps',message:String(err?.message||err)});console.warn('OpenStreetMap layer unavailable',err)}
    })();return mapsPromise;
  }
  window.MSC_LOAD_MAPS=loadMaps;
  window.addEventListener('msc:viewchange',e=>{if(e.detail?.view==='venues')loadMaps()});

  async function boot(){
    await pause();
    await loadPhase('planner',[
      'app-v12-connections.js',
      `app-v20-node-guard.js?v=${BUILD}`,
      'app-v8-plan.js',
      'app-v9-plan.js',
      `app-v20-performance.js?v=${BUILD}`,
      `app-v21-plan-guard.js?v=${BUILD}`,
      `app-v21-large-import.js?v=${BUILD}`
    ],{capturePlan:true});

    await loadPhase('workspace',[
      'app-v9-persistence.js',
      'app-v10-boards.js',
      'app-v11-sharing-fixed.js'
    ]);

    await loadPhase('ui',[
      'app-polish.js',
      'app-v8-contacts.js',
      'app-v13-settings.js',
      `app-v14-aero.js?v=${BUILD}`,
      `app-v15-aero.js?v=${BUILD}`,
      `app-v16-aero.js?v=${BUILD}`,
      `app-v17-aero-contacts.js?v=${BUILD}`,
      `app-v17-audio-cleanup.js?v=${BUILD}`,
      `app-v18-bugfix.js?v=${BUILD}`,
      `app-v19-email-presets.js?v=${BUILD}`,
      'app-v8-pdf.js'
    ]);

    state.phase='ready';
    window.MSC_FAST_BOOT=Object.assign(window.MSC_FAST_BOOT||{},{ready:true,disabled:true,version:23});
    window.dispatchEvent(new Event('msc:enhancements-ready'));
    try{window.MSC_V23?.reassert?.(false);render();}catch(err){console.error('Final v23 render failed',err)}
    setTimeout(()=>{if(view==='venues')loadMaps()},250);
  }

  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
