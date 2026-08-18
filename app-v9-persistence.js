/* MSC v28 persistent collaborative boards: durable queue + revision conflicts */
(() => {
  'use strict';

  const ENDPOINT = `${SB_URL}/functions/v1/persistent-board`;
  let saveTimer = 0;
  let retryTimer = 0;
  let saving = false;
  let dirty = false;
  let loadedRoom = '';
  let lastCloudSave = 0;
  let lastCheckpointAt = 0;
  let boardAccessDenied = false;
  let boardExistsOnline = false;
  let conflictPaused = false;
  let cloudRevision = 0;
  let lastSyncedSnapshot = null;

  function snapshotForCloud(){
    const base=cleanState();
    return {...base,persistentBoard:true,updatedAt:Date.now()};
  }
  function setCloudStatus(text,tone=''){
    const el=document.getElementById('persistentBoardStatus');
    if(el){el.textContent=text;el.dataset.tone=tone;}
    const saveText=document.getElementById('saveText');
    if(saveText&&tone==='warn')saveText.textContent=text;
  }
  async function accessToken(){
    try{const {data}=await supabase?.auth?.getSession?.()||{};return data?.session?.access_token||'';}catch{return '';}
  }
  function ownerKey(){return safeStorageGet(localStorage,`mscBoardOwnerKey:${room}`,'');}
  async function cloudRequest(method,snapshot=null,extra={}){
    if(!room)throw new Error('No shared board');
    const headers={'Content-Type':'application/json'};
    const token=await accessToken();if(token)headers.Authorization=`Bearer ${token}`;
    const key=ownerKey();if(key)headers['x-board-owner']=key;
    const opts={method,headers,cache:'no-store'};
    const url=`${ENDPOINT}?board=${encodeURIComponent(room)}`;
    if(method==='POST'||method==='DELETE')opts.body=JSON.stringify({boardId:room,...(key?{ownerKey:key}:{}),...(snapshot?{snapshot}:{}),...extra});
    const res=await fetch(url,opts);
    let data={};try{data=await res.json();}catch{}
    if(!res.ok){const err=new Error(data.error||`Cloud board request failed (${res.status})`);err.status=res.status;err.data=data;throw err;}
    return data;
  }
  function acceptRevision(data){
    const n=Number(data?.revision);if(Number.isFinite(n)&&n>0)cloudRevision=n;
  }
  function markConflict(err,localSnapshot){
    conflictPaused=true;dirty=false;
    window.MSC_CLOUD_CONFLICT={at:Date.now(),boardId:room,localSnapshot,current:err?.data?.snapshot||null,revision:Number(err?.data?.revision)||cloudRevision||0};
    window.MSC_DURABILITY?.mirror?.(`${storageKey()}:conflict:${Date.now()}`,JSON.stringify(localSnapshot));
    setCloudStatus('Save conflict — recovery copy kept','warn');
    toast('Another edit reached the server first. Your version was preserved in history; reload before continuing.');
  }
  async function persistNow(force=false){
    if(!room||!state.persistentBoard||boardAccessDenied||conflictPaused)return false;
    if(force)dirty=true;
    if(saving)return false;
    if(!dirty)return true;
    saving=true;
    let ok=true;
    try{
      while(dirty&&!boardAccessDenied&&!conflictPaused){
        dirty=false;
        const snapshot=snapshotForCloud();
        setCloudStatus('Saving online…');
        try{
          const checkpoint=Date.now()-lastCheckpointAt>=60000;
          const data=await cloudRequest('POST',snapshot,{baseRevision:cloudRevision||undefined,...(checkpoint?{checkpoint:true,label:'Autosave'}:{})});
          boardExistsOnline=true;boardAccessDenied=false;acceptRevision(data);lastSyncedSnapshot=snapshot;lastCloudSave=Date.now();if(checkpoint)lastCheckpointAt=lastCloudSave;setCloudStatus('Saved online','ok');
        }catch(err){
          ok=false;console.error('Persistent board save failed',err);
          if(err?.status===409){markConflict(err,snapshot);break;}
          if(err?.status===403){boardAccessDenied=true;dirty=false;setCloudStatus('Board access denied','warn');break;}
          if(err?.status===428){conflictPaused=true;dirty=false;setCloudStatus('Reload required before saving','warn');toast('This board needs to be reloaded before cloud saving can continue.');break;}
          dirty=true;setCloudStatus(navigator.onLine===false?'Offline — changes queued':'Online save failed — retrying','warn');
          clearTimeout(retryTimer);retryTimer=setTimeout(()=>persistNow(),Math.min(15000,3500+Math.random()*2500));break;
        }
      }
    }finally{
      saving=false;
      if(dirty&&!retryTimer&&!conflictPaused)saveTimer=setTimeout(()=>persistNow(),250);
    }
    return ok&&!dirty&&!conflictPaused;
  }
  function schedulePersist(){
    if(!room||!state.persistentBoard||remoteApplying||boardAccessDenied||conflictPaused)return;
    dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistNow(),650);
  }

  async function loadPersistentBoard(force=false){
    if(!room)return false;
    if(!force&&loadedRoom===room&&boardExistsOnline&&!boardAccessDenied&&!conflictPaused)return true;
    loadedRoom=room;
    try{
      const data=await cloudRequest('GET');
      if(!data.found||!data.snapshot?.events){boardExistsOnline=false;boardAccessDenied=false;return false;}
      boardExistsOnline=true;boardAccessDenied=false;conflictPaused=false;acceptRevision(data);lastSyncedSnapshot=data.snapshot;
      const next={...data.snapshot,persistentBoard:true,collaborationEnabled:!!data.shareEnabled,boardTitle:data.title||data.snapshot.boardTitle||''};
      if(typeof applyRemoteState==='function')applyRemoteState(next);
      else{const previous=remoteApplying;remoteApplying=true;try{state={...state,...next};normalize();zoom=state.zoom||zoom;persistLocalState();render();setView(view,false);}finally{remoteApplying=previous;}}
      renderPersistenceControl();setCloudStatus('Loaded saved board','ok');return true;
    }catch(err){
      if(err?.status===403){boardAccessDenied=true;boardExistsOnline=true;}
      console.warn('Persistent board load unavailable',err);return false;
    }
  }

  async function enablePersistence(){
    state.persistentBoard=true;baseSave(false);renderPersistenceControl();dirty=true;
    const ok=await persistNow();
    if(!ok&&!conflictPaused){state.persistentBoard=false;baseSave(false);renderPersistenceControl();toast('Could not enable online board saving');}
    else if(ok)toast('Board will stay available online');
  }
  async function disablePersistence(){
    if(!room)return;setCloudStatus('Removing saved cloud copy…');
    try{await cloudRequest('DELETE');state.persistentBoard=false;dirty=false;baseSave(false);renderPersistenceControl();toast('Board is live-only again');}
    catch(err){console.error(err);setCloudStatus('Could not remove the saved copy','warn');const box=document.getElementById('persistentBoardToggle');if(box)box.checked=true;}
  }

  function renderPersistenceControl(){
    const share=document.querySelector('.share-card'),anchor=document.getElementById('shareState');if(!share||!anchor)return;
    let wrap=document.getElementById('persistentBoardControl');if(!wrap){wrap=document.createElement('div');wrap.id='persistentBoardControl';wrap.className='persistent-board-control';anchor.insertAdjacentElement('afterend',wrap);}
    if(!room){wrap.hidden=true;return;}wrap.hidden=false;
    const enabled=!!state.persistentBoard;
    wrap.innerHTML=`<label class="persistent-board-switch"><span class="persistent-board-copy"><strong>Always available online</strong><small>${enabled?'Saved automatically':'Online autosave is off'}</small></span><input type="checkbox" id="persistentBoardToggle" ${enabled?'checked':''}><span class="persistent-switch-ui" aria-hidden="true"></span></label><div class="persistent-board-foot"><span class="persistent-board-lock">Board storage</span><span id="persistentBoardStatus" data-tone="${conflictPaused?'warn':enabled?'ok':''}">${conflictPaused?'Conflict preserved — reload':enabled?(lastCloudSave?'Saved online':'Online persistence enabled'):'Not saved online'}</span></div>`;
  }

  const baseCleanState=cleanState;
  cleanState=function(){return{...baseCleanState(),persistentBoard:!!state.persistentBoard};};
  const baseSave=save;
  save=function(sync=true){const result=baseSave(sync);schedulePersist();renderPersistenceControl();return result;};
  const basePresenceUI=presenceUI;
  presenceUI=function(){basePresenceUI();renderPersistenceControl();};
  const baseConnectRoom=connectRoom;
  connectRoom=async function(){if(room){const found=await loadPersistentBoard();if(boardAccessDenied||!found){connected=false;presenceUI();return;}}return baseConnectRoom();};
  const baseCreateShared=createShared;
  createShared=function(){baseCreateShared();state.persistentBoard=false;baseSave(false);loadedRoom='';boardExistsOnline=false;boardAccessDenied=false;conflictPaused=false;cloudRevision=0;lastSyncedSnapshot=null;renderPersistenceControl();};

  window.MSC_CLOUD={
    getRevision:()=>cloudRevision,
    setRevision:n=>{const v=Number(n);if(Number.isFinite(v)&&v>0)cloudRevision=v;},
    getLastSynced:()=>lastSyncedSnapshot,
    flush:()=>persistNow(true),
    markDirty:schedulePersist,
    hasConflict:()=>conflictPaused,
    reload:()=>loadPersistentBoard(true)
  };

  document.addEventListener('change',e=>{if(e.target.id!=='persistentBoardToggle')return;if(e.target.checked)enablePersistence();else disablePersistence();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&room&&state.persistentBoard&&!conflictPaused){dirty=true;persistNow();}});
  window.addEventListener('online',()=>{if(dirty&&!conflictPaused){clearTimeout(retryTimer);retryTimer=0;persistNow();}});
  window.addEventListener('pagehide',()=>{if(room&&state.persistentBoard&&!conflictPaused){dirty=true;persistNow();}});

  renderPersistenceControl();
  if(room){loadPersistentBoard(true).then(found=>{if(found&&supabase&&(!channel||!connected))connectRoom();else if(found&&connected)broadcast('state',{from:tabId,state:cleanState()});});}
})();
