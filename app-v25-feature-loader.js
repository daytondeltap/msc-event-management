/* MSC v25: lazy loader for server-backed Boards/Share and OSM only. */
(() => {
  'use strict';
  const F=window.MSC_FEATURES=window.MSC_FEATURES||{};
  const loaded=new Set();let workspacePromise=null,mapsPromise=null;
  function load(src,timeout=6000){if(loaded.has(src))return Promise.resolve();return new Promise((resolve,reject)=>{let done=false;const s=document.createElement('script'),timer=setTimeout(()=>finish(false,new Error(`timeout:${src}`)),timeout);function finish(ok,v){if(done)return;done=true;clearTimeout(timer);ok?(loaded.add(src),resolve()):(s.remove(),reject(v))}s.onload=()=>finish(true);s.onerror=()=>finish(false,new Error(`load:${src}`));s.src=src;s.async=false;document.body.appendChild(s)})}
  async function guarded(src){const Real=window.MutationObserver;if(!Real)return load(src);class Guarded{constructor(cb){this.inner=new Real(cb)}observe(target,opts){if(target===document.body&&opts?.subtree)return;this.inner.observe(target,opts)}disconnect(){this.inner.disconnect()}takeRecords(){return this.inner.takeRecords()}}window.MutationObserver=Guarded;try{return await load(src)}finally{window.MutationObserver=Real}}
  function reassert(){try{window.MSC_V24_PAGE?.reassert?.()}catch(err){console.warn('MSC v25 page reassert failed',err)}}
  function ensureBoardsLauncher(){if(document.querySelector('[data-view="boards"]'))return;const nav=document.querySelector('.nav-list'),first=nav?.querySelector('[data-view="home"]');if(!nav)return;const b=document.createElement('button');b.className='nav-item';b.dataset.view='boards';b.innerHTML='<span>▦</span><b>Boards</b>';first?first.insertAdjacentElement('afterend',b):nav.appendChild(b)}
  function patchBoardButtons(){document.querySelectorAll('[data-board-rename]').forEach(b=>{b.dataset.v11Rename=b.dataset.boardRename;b.removeAttribute('data-board-rename')})}
  function closeMobileMore(){const sheet=document.getElementById('mobileMoreSheet');sheet?.classList.remove('open');sheet?.setAttribute('aria-hidden','true');document.body.classList.remove('mobile-more-open')}
  async function loadWorkspace(){
    if(F.workspaceReady)return true;
    if(workspacePromise)return workspacePromise;
    workspacePromise=(async()=>{
      try{
        await load('app-v9-persistence.js');reassert();
        await load('app-v10-boards.js');const boardSetView=setView;window.MSC_V10=window.MSC_V10||{};window.MSC_V10.renderBoards=()=>boardSetView('boards',false);reassert();
        await guarded('app-v11-sharing-fixed.js');reassert();
        F.workspaceReady=true;patchBoardButtons();
        const root=document.getElementById('boardsView');if(root&&!root.dataset.v25Observed){root.dataset.v25Observed='1';new MutationObserver(patchBoardButtons).observe(root,{childList:true,subtree:true})}
        if(room){try{await window.MSC_V10?.renderBoards?.();patchBoardButtons()}catch{}}
        return true;
      }catch(err){
        console.error('MSC Boards/Share failed',err);toast('Boards/Share could not finish loading');return false;
      }finally{
        if(!F.workspaceReady)workspacePromise=null;
      }
    })();
    return workspacePromise;
  }
  async function loadMaps(){
    if(F.mapsReady)return true;
    if(mapsPromise)return mapsPromise;
    mapsPromise=(async()=>{
      try{
        if(!document.querySelector('link[data-msc-leaflet-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';l.dataset.mscLeafletCss='1';document.head.appendChild(l)}
        await load('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',8000);await load('app-osm.js');reassert();await load('app-v8-osm-search.js');reassert();
        F.mapsReady=true;if(view==='venues')try{venues()}catch{}return true;
      }catch(err){
        console.warn('OpenStreetMap unavailable',err);toast('Map service unavailable — the rest of MSC still works');return false;
      }finally{
        if(!F.mapsReady)mapsPromise=null;
      }
    })();
    return mapsPromise;
  }
  F.loadWorkspace=loadWorkspace;F.loadMaps=loadMaps;window.MSC_LOAD_MAPS=loadMaps;ensureBoardsLauncher();
  document.addEventListener('click',async e=>{
    const boards=e.target.closest?.('[data-view="boards"]');
    if(boards&&!F.workspaceReady){e.preventDefault();e.stopImmediatePropagation();const ok=await loadWorkspace();if(ok&&F.workspaceReady){setView('boards');patchBoardButtons();closeMobileMore()}return}
    if(e.target.closest?.('#shareButton')&&!F.workspaceReady){e.preventDefault();e.stopImmediatePropagation();const ok=await loadWorkspace();if(ok&&F.workspaceReady)document.getElementById('shareButton')?.click();return}
    if(e.target.closest?.('[data-view="venues"]')&&!F.mapsReady)setTimeout(loadMaps,0)
  },true);
  window.addEventListener('msc:viewchange',e=>{if(e.detail?.view==='venues'&&!F.mapsReady)loadMaps()});
  if(room)setTimeout(loadWorkspace,350);
})();
