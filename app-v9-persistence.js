/* MSC v9 persistent collaborative boards */
(() => {
  'use strict';

  const ENDPOINT = `${SB_URL}/functions/v1/persistent-board`;
  let saveTimer = 0;
  let saving = false;
  let loadedRoom = '';
  let lastCloudSave = 0;

  function snapshotForCloud(){
    const base=cleanState();
    return {...base,persistentBoard:true,updatedAt:Date.now()};
  }
  function setCloudStatus(text,tone=''){
    const el=document.getElementById('persistentBoardStatus');
    if(el){el.textContent=text;el.dataset.tone=tone;}
  }
  async function cloudRequest(method,snapshot=null){
    if(!room)throw new Error('No shared board');
    const opts={method,headers:{'Content-Type':'application/json'},cache:'no-store'};
    let url=`${ENDPOINT}?board=${encodeURIComponent(room)}`;
    if(method==='POST'||method==='DELETE')opts.body=JSON.stringify({boardId:room,...(snapshot?{snapshot}:{})});
    const res=await fetch(url,opts);
    let data={};try{data=await res.json();}catch{}
    if(!res.ok)throw new Error(data.error||`Cloud board request failed (${res.status})`);
    return data;
  }

  async function persistNow(){
    if(!room||!state.persistentBoard||saving)return false;
    saving=true;setCloudStatus('Saving online…');
    try{
      await cloudRequest('POST',snapshotForCloud());
      lastCloudSave=Date.now();setCloudStatus('Saved online · anyone with the link can return anytime','ok');return true;
    }catch(err){console.error('Persistent board save failed',err);setCloudStatus('Online save failed · live collaboration still works','warn');return false;}
    finally{saving=false;}
  }
  function schedulePersist(){
    if(!room||!state.persistentBoard||remoteApplying)return;
    clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,650);
  }

  async function loadPersistentBoard(force=false){
    if(!room)return false;
    if(!force&&loadedRoom===room)return !!state.persistentBoard;
    loadedRoom=room;
    try{
      const data=await cloudRequest('GET');
      if(!data.found||!data.snapshot?.events)return false;
      const next={...data.snapshot,persistentBoard:true};
      if(typeof applyRemoteState==='function')applyRemoteState(next);
      else{remoteApplying=true;state={...state,...next};normalize();zoom=state.zoom||zoom;localStorage.setItem(storageKey(),JSON.stringify(state));render();setView(view,false);remoteApplying=false;}
      renderPersistenceControl();
      setCloudStatus('Loaded saved board · anyone with the link can return anytime','ok');
      return true;
    }catch(err){console.warn('Persistent board load unavailable',err);return false;}
  }

  async function enablePersistence(){
    state.persistentBoard=true;
    baseSave(false);
    renderPersistenceControl();
    const ok=await persistNow();
    if(!ok){state.persistentBoard=false;baseSave(false);renderPersistenceControl();toast('Could not enable online board saving');}
    else toast('Board will stay available from this link');
  }
  async function disablePersistence(){
    if(!room)return;
    setCloudStatus('Removing saved cloud copy…');
    try{
      await cloudRequest('DELETE');
      state.persistentBoard=false;baseSave(false);renderPersistenceControl();toast('Board is live-only again');
    }catch(err){console.error(err);setCloudStatus('Could not remove the saved copy','warn');const box=document.getElementById('persistentBoardToggle');if(box)box.checked=true;}
  }

  function renderPersistenceControl(){
    const share=document.querySelector('.share-card'),anchor=document.getElementById('shareState');
    if(!share||!anchor)return;
    let wrap=document.getElementById('persistentBoardControl');
    if(!wrap){wrap=document.createElement('div');wrap.id='persistentBoardControl';wrap.className='persistent-board-control';anchor.insertAdjacentElement('afterend',wrap);}
    if(!room){wrap.hidden=true;return;}
    wrap.hidden=false;
    const enabled=!!state.persistentBoard;
    wrap.innerHTML=`<label class="persistent-board-switch"><span class="persistent-board-copy"><strong>Always available from this link</strong><small>${enabled?'Saved online even when everyone leaves':'Live only · the board currently relies on someone being online or a local browser copy'}</small></span><input type="checkbox" id="persistentBoardToggle" ${enabled?'checked':''}><span class="persistent-switch-ui" aria-hidden="true"></span></label><div class="persistent-board-foot"><span class="persistent-board-lock">↗ Anyone with this secret link can edit</span><span id="persistentBoardStatus" data-tone="${enabled?'ok':''}">${enabled?(lastCloudSave?'Saved online':'Online persistence enabled'):'Not saved online'}</span></div>`;
  }

  const baseCleanState=cleanState;
  cleanState=function(){return{...baseCleanState(),persistentBoard:!!state.persistentBoard};};

  const baseSave=save;
  save=function(sync=true){baseSave(sync);schedulePersist();renderPersistenceControl();};

  const basePresenceUI=presenceUI;
  presenceUI=function(){basePresenceUI();renderPersistenceControl();};

  const baseConnectRoom=connectRoom;
  connectRoom=async function(){
    if(room)await loadPersistentBoard();
    return baseConnectRoom();
  };

  const baseCreateShared=createShared;
  createShared=function(){
    baseCreateShared();state.persistentBoard=false;baseSave(false);loadedRoom='';renderPersistenceControl();
  };

  document.addEventListener('change',e=>{
    if(e.target.id!=='persistentBoardToggle')return;
    if(e.target.checked)enablePersistence();else disablePersistence();
  });

  window.addEventListener('beforeunload',()=>{if(room&&state.persistentBoard&&Date.now()-lastCloudSave>900)schedulePersist();});

  renderPersistenceControl();
  if(room){
    loadPersistentBoard(true).then(found=>{
      if(found&&supabase&&(!channel||!connected))connectRoom();
      else if(found&&connected)broadcast('state',{from:tabId,state:cleanState()});
    });
  }
})();
