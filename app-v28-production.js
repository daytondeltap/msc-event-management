/* MSC v28 production hardening: recovery, stale-state protection, crash containment */
(() => {
  'use strict';
  const BUILD='20260818-production-v28';
  const DB_NAME='msc-production-recovery-v28';
  const STORE='snapshots';
  const MAX_BACKUP_BYTES=1_850_000;
  let backupTimer=0, lastStorageWarning=0, dbPromise=null;

  window.MSC_PRODUCTION={build:BUILD,startedAt:Date.now(),errors:[],storageHealthy:true};

  const safeGet=(k)=>{try{return localStorage.getItem(k)}catch{return null}};
  const safeSet=(k,v)=>{try{localStorage.setItem(k,v);window.MSC_PRODUCTION.storageHealthy=true;return true}catch(err){window.MSC_PRODUCTION.storageHealthy=false;console.warn('MSC local storage write failed',err);return false}};

  function recordError(kind,err){
    const item={kind,message:String(err?.message||err||'Unknown error').slice(0,500),time:Date.now()};
    window.MSC_PRODUCTION.errors.push(item);
    if(window.MSC_PRODUCTION.errors.length>30)window.MSC_PRODUCTION.errors.shift();
    try{sessionStorage.setItem('mscLastRuntimeError',JSON.stringify(item))}catch{}
  }
  window.addEventListener('error',e=>recordError('error',e.error||e.message));
  window.addEventListener('unhandledrejection',e=>recordError('promise',e.reason));

  function openDB(){
    if(!('indexedDB' in window))return Promise.resolve(null);
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(resolve=>{
      try{
        const r=indexedDB.open(DB_NAME,1);
        r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'key'})};
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null);
      }catch{resolve(null)}
    });
    return dbPromise;
  }
  async function writeRecovery(){
    if(typeof state==='undefined'||typeof storageKey!=='function')return;
    let json='';try{json=JSON.stringify(state)}catch{return}
    if(json.length>MAX_BACKUP_BYTES)return;
    const db=await openDB();if(!db)return;
    try{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({key:storageKey(),state:JSON.parse(json),updatedAt:Number(state.updatedAt||Date.now())});
    }catch{}
  }
  function queueRecovery(){clearTimeout(backupTimer);backupTimer=setTimeout(writeRecovery,450)}
  async function readRecovery(key){
    const db=await openDB();if(!db)return null;
    return new Promise(resolve=>{try{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)}catch{resolve(null)}})
  }

  // Make core save resilient to quota/private-mode failures while preserving live sync.
  if(typeof save==='function'){
    const coreSave=save;
    save=function(sync=true){
      try{state.updatedAt=Date.now()}catch{}
      try{coreSave(sync)}catch(err){
        recordError('save',err);
        if(Date.now()-lastStorageWarning>8000){lastStorageWarning=Date.now();try{toast('Local storage is unavailable — keeping a recovery copy where possible')}catch{}}
        try{if(sync&&typeof broadcast==='function'&&!remoteApplying)broadcast('state',{from:tabId,state:cleanState()})}catch{}
      }
      queueRecovery();
    };
  }

  // Reject older whole-board snapshots. This prevents a delayed cloud/realtime copy from replacing newer local edits.
  if(typeof applyRemoteState==='function'){
    const originalApply=applyRemoteState;
    applyRemoteState=function(next){
      if(!next||typeof next!=='object')return;
      const incoming=Number(next.updatedAt||0), current=Number(state?.updatedAt||0);
      if(incoming&&current&&incoming+250<current){
        console.warn('MSC ignored stale remote snapshot',{incoming,current});
        queueRecovery();
        try{setTimeout(()=>save(false),0)}catch{}
        return;
      }
      try{originalApply(next)}catch(err){
        recordError('remote-apply',err);
        try{
          remoteApplying=true;state={...state,...next};normalize();zoom=state.zoom||zoom;
          safeSet(storageKey(),JSON.stringify(state));render();setView(view,false);
        }catch(inner){recordError('remote-recovery',inner)}finally{remoteApplying=false}
      }
      queueRecovery();
    };
  }

  // Restore only when IndexedDB clearly has a newer complete snapshot than browser storage.
  setTimeout(async()=>{
    try{
      if(typeof storageKey!=='function'||typeof state==='undefined')return;
      const rec=await readRecovery(storageKey());if(!rec?.state?.events)return;
      const localTime=Number(state.updatedAt||0), recTime=Number(rec.updatedAt||rec.state.updatedAt||0);
      if(recTime>localTime+1500){
        state={...state,...rec.state};normalize();zoom=state.zoom||zoom;
        safeSet(storageKey(),JSON.stringify(state));render();setView(view,false);
        try{toast('Recovered your newest local workspace copy')}catch{}
      }
    }catch(err){recordError('recovery-load',err)}
  },1200);

  async function flushCloud(){
    try{
      if(!room||!state?.persistentBoard||typeof SB_URL==='undefined')return;
      const headers={'Content-Type':'application/json'};
      try{const {data}=await supabase?.auth?.getSession?.()||{};const token=data?.session?.access_token;if(token)headers.Authorization=`Bearer ${token}`}catch{}
      const ownerKey=safeGet(`mscBoardOwnerKey:${room}`)||'';if(ownerKey)headers['x-board-owner']=ownerKey;
      const snap=typeof cleanState==='function'?cleanState():state;
      await fetch(`${SB_URL}/functions/v1/persistent-board?board=${encodeURIComponent(room)}`,{method:'POST',headers,body:JSON.stringify({boardId:room,...(ownerKey?{ownerKey}:{}),snapshot:snap}),cache:'no-store',keepalive:true});
    }catch(err){recordError('cloud-flush',err)}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){queueRecovery();flushCloud()}});
  window.addEventListener('pagehide',()=>{queueRecovery();flushCloud()});

  // Detect failed resource loads without breaking the workspace.
  document.addEventListener('error',e=>{const t=e.target;if(t?.tagName==='SCRIPT'||t?.tagName==='LINK'||t?.tagName==='IMG')recordError('resource',new Error(t.src||t.href||'resource failed'))},true);

  // Mark production mode for CSS and diagnostics.
  document.documentElement.dataset.production='v28';
  try{window.MSC_BOOT_STATE={...(window.MSC_BOOT_STATE||{}),phase:'production-ready',safeMode:false,build:BUILD}}catch{}
  queueRecovery();
})();
