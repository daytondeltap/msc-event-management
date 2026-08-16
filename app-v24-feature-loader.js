/* MSC v24: lazy-load non-core features only when they are opened. */
(() => {
  'use strict';
  const F = window.MSC_FEATURES = window.MSC_FEATURES || {};
  const renderers = window.MSC_FEATURE_RENDERERS = window.MSC_FEATURE_RENDERERS || {};
  const loaded = new Set();
  let workspacePromise=null, uiPromise=null, mapsPromise=null, settingsCorePromise=null;

  function addStyle(href){const base=href.split('?')[0];if([...document.styleSheets].some(s=>s.href&&s.href.includes(base)))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
  function load(src, timeout=5000){
    if(loaded.has(src))return Promise.resolve();
    return new Promise((resolve,reject)=>{let done=false;const s=document.createElement('script'),timer=setTimeout(()=>finish(false,new Error(`timeout:${src}`)),timeout);function finish(ok,v){if(done)return;done=true;clearTimeout(timer);ok?(loaded.add(src),resolve()):reject(v)}s.onload=()=>finish(true);s.onerror=()=>finish(false,new Error(`load:${src}`));s.src=src;s.async=false;document.body.appendChild(s)});
  }
  async function guardedLoad(src){
    const Real=window.MutationObserver;
    if(!Real)return load(src);
    class GuardedObserver{
      constructor(cb){this.inner=new Real(cb)}
      observe(target,opts){if(target===document.body&&opts?.subtree)return;this.inner.observe(target,opts)}
      disconnect(){this.inner.disconnect()}
      takeRecords(){return this.inner.takeRecords()}
    }
    window.MutationObserver=GuardedObserver;
    try{return await load(src)}finally{window.MutationObserver=Real}
  }
  const reassert=()=>{try{window.MSC_V24_PAGE?.reassert?.()}catch(err){console.warn('v24 reassert failed',err)}};

  function ensureLaunchers(){
    const nav=document.querySelector('.nav-list');
    if(nav&&!document.querySelector('[data-view="boards"]')){const b=document.createElement('button');b.className='nav-item';b.dataset.view='boards';b.innerHTML='<span>▦</span><b>Boards</b>';nav.querySelector('[data-view="home"]')?.insertAdjacentElement('afterend',b)}
    if(nav&&!document.querySelector('[data-view="contacts"]')){const b=document.createElement('button');b.className='nav-item';b.dataset.view='contacts';b.innerHTML='<span>＠</span><b>Contacts</b>';nav.appendChild(b)}
    const bottom=document.querySelector('.sidebar-bottom');
    if(bottom&&!document.getElementById('settingsButton')){const b=document.createElement('button');b.className='nav-item settings-nav-item';b.id='settingsButton';b.type='button';b.innerHTML='<span>⚙</span><b>Options</b>';bottom.insertBefore(b,bottom.querySelector('.save-indicator'))}
  }

  async function loadSettingsCore(){
    if(window.MSC_OPTIONS)return;
    if(settingsCorePromise)return settingsCorePromise;
    settingsCorePromise=(async()=>{try{await load('app-v13-settings.js');reassert()}catch(err){console.error('Settings core failed',err);toast('Options could not load')}})();
    return settingsCorePromise;
  }

  async function loadWorkspace(){
    if(F.workspaceReady)return;
    if(workspacePromise)return workspacePromise;
    workspacePromise=(async()=>{
      try{
        await load('app-v9-persistence.js');reassert();
        await load('app-v10-boards.js');
        const workspaceSetView=setView;
        renderers.boards=()=>workspaceSetView('boards',false);
        reassert();
        await guardedLoad('app-v11-sharing-fixed.js');reassert();
        F.workspaceReady=true;
        const root=document.getElementById('boardsView');
        if(root&&!root.dataset.v24Observed){root.dataset.v24Observed='1';new MutationObserver(()=>patchBoardButtons()).observe(root,{childList:true,subtree:true})}
        patchBoardButtons();
      }catch(err){console.error('Workspace features failed',err);toast('Boards/Share could not finish loading')}
    })();return workspacePromise;
  }

  function patchBoardButtons(){document.querySelectorAll('[data-board-rename]').forEach(b=>{b.dataset.v11Rename=b.dataset.boardRename;b.removeAttribute('data-board-rename')})}

  async function loadUI(){
    if(F.uiReady)return;
    if(uiPromise)return uiPromise;
    uiPromise=(async()=>{
      try{
        await loadSettingsCore();
        await load('app-v8-contacts.js');reassert();
        await load('app-v17-aero-contacts.js');reassert();
        await guardedLoad('app-v18-bugfix.js');reassert();
        await guardedLoad('app-v19-email-presets.js');reassert();
        renderers.contacts=()=>window.MSC_V8?.contactsView?.();
        F.uiReady=true;
      }catch(err){console.error('Contacts/options features failed',err);toast('Contacts/Options could not finish loading')}
    })();return uiPromise;
  }

  async function loadMaps(){
    if(F.mapsReady)return;
    if(mapsPromise)return mapsPromise;
    mapsPromise=(async()=>{try{addStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');await load('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',7000);await load('app-osm.js');await load('app-v8-osm-search.js');F.mapsReady=true;reassert();if(view==='venues')try{venues()}catch{}}catch(err){console.warn('Maps unavailable',err);toast('Map service is unavailable; the rest of MSC still works')}})();return mapsPromise;
  }
  F.loadWorkspace=loadWorkspace;F.loadUI=loadUI;F.loadMaps=loadMaps;F.loadSettingsCore=loadSettingsCore;
  window.MSC_LOAD_MAPS=loadMaps;

  document.addEventListener('click',async e=>{
    const boards=e.target.closest?.('[data-view="boards"]');
    if(boards&&!F.workspaceReady){e.preventDefault();e.stopImmediatePropagation();await loadWorkspace();setView('boards');patchBoardButtons();return}
    const contacts=e.target.closest?.('[data-view="contacts"]');
    if(contacts&&!F.uiReady){e.preventDefault();e.stopImmediatePropagation();await loadUI();setView('contacts');return}
    if(e.target.closest?.('#settingsButton')&&!F.uiReady){e.preventDefault();e.stopImmediatePropagation();await loadUI();window.MSC_OPTIONS?.open?.();window.dispatchEvent(new Event('msc:settings-open'));return}
    if(e.target.closest?.('#shareButton')&&!F.workspaceReady){e.preventDefault();e.stopImmediatePropagation();await loadWorkspace();document.getElementById('shareButton')?.click();return}
    if(e.target.closest?.('[data-view="venues"]')&&!F.mapsReady){setTimeout(loadMaps,0)}
  },true);

  window.addEventListener('msc:viewchange',e=>{if(e.detail?.view==='boards')patchBoardButtons();if(e.detail?.view==='venues')loadMaps()});
  ensureLaunchers();
  // Settings/onboarding is small and safe; load it after the core has been responsive for a moment.
  setTimeout(()=>{if(!document.hidden)loadSettingsCore()},1200);
})();
