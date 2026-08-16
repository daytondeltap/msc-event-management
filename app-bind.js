function bind(){
  document.addEventListener('click',e=>{
    let t=e.target.closest('[data-view]');if(t){setView(t.dataset.view);return;}
    t=e.target.closest('[data-select-event]');if(t){selectEvent(t.dataset.selectEvent);return;}
    t=e.target.closest('[data-open-event]');if(t){const ev=state.events.find(x=>x.id===t.dataset.openEvent);if(ev)openEvent(ev);return;}
    if(e.target.closest('[data-close-drawer]')){closeDrawer();return;}if(e.target.closest('[data-close-share]')){$('#shareModal').classList.remove('open');return;}if(e.target.closest('[data-close-account]')){$('#accountModal').classList.remove('open');return;}if(e.target.closest('[data-close-maps]')){$('#mapsSetupModal').classList.remove('open');return;}if(e.target.closest('[data-close-import]')){const m=$('#importModal');m?.classList.remove('open');m?.setAttribute('aria-hidden','true');return;}
    const a=e.target.closest('[data-plan-action]');if(a){const act=a.dataset.planAction;if(act==='add')openEvent(null,{x:1100+Math.random()*700,y:720+Math.random()*550});if(act==='center'){const p=$('#plannerViewport');p.scrollLeft=1050;p.scrollTop=650}if(act==='fit'){zoom=.68;save(false);plan()}if(act==='plus'){const p=$('#plannerViewport'),r=p.getBoundingClientRect();zoomAt(p,r.left+r.width/2,r.top+r.height/2,.1)}if(act==='minus'){const p=$('#plannerViewport'),r=p.getBoundingClientRect();zoomAt(p,r.left+r.width/2,r.top+r.height/2,-.1)}return;}
    if(e.target.id==='configureMapsButton'||e.target.id==='configureMapsEmpty'||e.target.id==='configureMapsRetry'){const input=$('#mapsApiKeyInput');if(input){input.value=getMapsKey?.()||'';$('#mapsSetupModal')?.classList.add('open');}else if(window.MSC_LOAD_MAPS){window.MSC_LOAD_MAPS();}return;}
    if(e.target.id==='fitVenueMap'){if(window.MSC_LOAD_MAPS)window.MSC_LOAD_MAPS();else initVenueMap?.();return;}
    if(!e.target.closest('#presencePopover')&&!e.target.closest('#presenceButton'))$('#presencePopover').classList.remove('open');
  });

  $('#eventForm').elements.status.innerHTML=STATUSES.map(s=>`<option>${s}</option>`).join('');
  $('#eventForm').addEventListener('submit',e=>{e.preventDefault();const x=collect(),i=state.events.findIndex(v=>v.id===x.id);if(i>=0)state.events[i]=x;else state.events.push(x);selectedEventId=x.id;save();render();setView(view,false);closeDrawer();toast('Event saved');});
  $('#deleteEventButton').onclick=()=>{if(!draft)return;state.events=state.events.filter(e=>e.id!==draft.id);selectedEventId=null;save();render();setView(view,false);closeDrawer();updatePresence({selectedEventId:null,action:'idle'});toast('Event deleted');};
  $('#newEventButton').onclick=()=>openEvent();
  $('#globalSearch').oninput=e=>{search=e.target.value.toLowerCase();render();setView(view,false);};
  $('#clearSearchButton').onclick=()=>{$('#globalSearch').value='';search='';render();setView(view,false);};
  $('#shareButton').onclick=()=>{presenceUI();$('#displayName').value=displayName;$('#shareModal').classList.add('open');};
  $('#presenceButton').onclick=()=>$('#presencePopover').classList.toggle('open');
  $('#accountButton').onclick=()=>{$('#accountModal').classList.add('open');accountUI();};
  $('#signInGoogleButton').onclick=signInGoogle;$('#signOutButton').onclick=signOut;
  $('#newSharedBoard').onclick=createShared;$('#leaveSharedBoard').onclick=leaveShared;
  $('#copyShareLink').onclick=async()=>{if(!room)return toast('Create a shared board first');await navigator.clipboard.writeText(location.href);toast('Share link copied');};
  $('#displayName').onchange=async e=>{displayName=e.target.value.trim()||displayName;localStorage.mscDisplayName=displayName;await updatePresence();presenceUI();};
  const saveMapsKey=$('#saveMapsKey');if(saveMapsKey)saveMapsKey.onclick=()=>{const input=$('#mapsApiKeyInput'),k=input?.value.trim()||'';if(k)localStorage.mscGoogleMapsKey=k;else localStorage.removeItem('mscGoogleMapsKey');mapsPromise=null;$('#mapsSetupModal')?.classList.remove('open');venues();toast('Maps setting saved');};
  const clearMapsKey=$('#clearMapsKey');if(clearMapsKey)clearMapsKey.onclick=()=>{localStorage.removeItem('mscGoogleMapsKey');mapsPromise=null;const input=$('#mapsApiKeyInput');if(input)input.value='';$('#mapsSetupModal')?.classList.remove('open');venues();toast('Maps key cleared');};
  $('#exportButton').onclick=exportJSON;$('#importButton').onclick=()=>{const m=$('#importModal');m?.classList.add('open');m?.setAttribute('aria-hidden','false');};
  $('#calendarFile').onchange=e=>e.target.files[0]&&loadImport(e.target.files[0]);$('#dropZone').ondragover=e=>e.preventDefault();$('#dropZone').ondrop=e=>{e.preventDefault();e.dataTransfer.files[0]&&loadImport(e.dataTransfer.files[0]);};
  $('#confirmImportButton').onclick=()=>{const add=$$('[data-import-index]:checked').map(x=>imports[+x.dataset.importIndex]);state.events.push(...add);save();render();setView(view,false);$('#importModal').classList.remove('open');toast(`${add.length} event${add.length===1?'':'s'} imported`);};

  document.addEventListener('pointerdown',e=>{
    const h=e.target.closest('[data-drag-block]');if(h){if(e.target.closest('button,input,select,textarea,a,[role=button]'))return;const ev=state.events.find(x=>x.id===h.dataset.dragBlock);if(ev){beginBlockDrag(ev,e);h.setPointerCapture?.(e.pointerId);e.preventDefault();}return;}
    const p=e.target.closest('#plannerViewport');if(p&&!e.target.closest('.event-block')&&(e.button===0||e.button===1||spaceDown)){drag={type:'pan',p,startX:e.clientX,startY:e.clientY,left:p.scrollLeft,top:p.scrollTop};p.classList.add('panning');p.setPointerCapture?.(e.pointerId);e.preventDefault();}
  });
  document.addEventListener('pointermove',e=>{
    if(drag?.type==='block'){
      const x=Math.max(0,Math.round((drag.x+(e.clientX-drag.startX)/zoom)/4)*4),y=Math.max(0,Math.round((drag.y+(e.clientY-drag.startY)/zoom)/4)*4);scheduleLocalMove(x,y);
      const now=performance.now();if(now-lastMoveSent>32){lastMoveSent=now;broadcast('block-move',{from:tabId,eventId:drag.event.id,x,y,t:Date.now()});}
      return;
    }
    if(drag?.type==='pan'){drag.p.scrollLeft=drag.left-(e.clientX-drag.startX);drag.p.scrollTop=drag.top-(e.clientY-drag.startY);return;}
    if(room&&view==='plan'){
      const p=$('#plannerViewport');if(!p)return;const r=p.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x>=0&&y>=0&&x<=r.width&&y<=r.height){const now=performance.now();if(now-lastCursorSent>42){lastCursorSent=now;broadcast('cursor',{from:tabId,name:displayName,avatar:avatarUrl,x,y,t:Date.now()});}}
    }
  });
  document.addEventListener('pointerup',()=>{if(drag?.type==='block')endBlockDrag();else if(drag?.type==='pan'){drag.p.classList.remove('panning');drag=null;}});
  document.addEventListener('dblclick',e=>{const block=e.target.closest('[data-event-block]');if(block){const ev=state.events.find(x=>x.id===block.dataset.eventBlock);if(ev)openEvent(ev);return;}const p=e.target.closest('#plannerViewport');if(!p)return;const r=p.getBoundingClientRect(),x=(p.scrollLeft+e.clientX-r.left)/zoom,y=(p.scrollTop+e.clientY-r.top)/zoom;openEvent(null,{x,y});});
  document.addEventListener('wheel',e=>{const p=e.target.closest('#plannerViewport');if(!p)return;if(e.ctrlKey||e.metaKey){e.preventDefault();zoomAt(p,e.clientX,e.clientY,e.deltaY<0?.08:-.08);}else if(e.shiftKey){e.preventDefault();p.scrollLeft+=e.deltaY;}},{passive:false});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){spaceDown=true;if(view==='plan')e.preventDefault();}if((e.key==='Delete'||e.key==='Backspace')&&selectedEventId&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){const ev=state.events.find(x=>x.id===selectedEventId);if(ev&&confirm(`Delete ${ev.name}?`)){state.events=state.events.filter(x=>x.id!==selectedEventId);selectedEventId=null;save();render();setView(view,false);}}});
  document.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false;});
  document.addEventListener('dragstart',e=>{const c=e.target.closest('[data-board-drag]');if(c)boardDrag=c.dataset.boardDrag;});
  document.addEventListener('dragover',e=>{if(e.target.closest('[data-status-drop]'))e.preventDefault();});
  document.addEventListener('drop',e=>{const c=e.target.closest('[data-status-drop]');if(c&&boardDrag){const ev=state.events.find(x=>x.id===boardDrag);if(ev){ev.status=c.dataset.statusDrop;save();render();setView('board',false);}boardDrag='';}});
  window.addEventListener('resize',drawRemoteCursors);
}

normalize();
bind();
render();
setView('plan',false);
initSupabase();
