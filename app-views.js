function peersForEvent(eventId) {
  return Object.values(peers).filter(p=>p.clientId!==tabId && p.selectedEventId===eventId);
}
function peerBadges(eventId) {
  const people=peersForEvent(eventId).slice(0,3);
  if (!people.length) return '';
  return `<div class="collab-badges">${people.map(p=>{const color=peerColor(p.clientId), action=p.action==='moving'?'moving':p.action==='editing'?'editing':'selected';return `<span class="collab-badge" style="--peer-color:${color}"><span class="collab-badge-avatar">${p.avatar?`<img src="${esc(p.avatar)}" alt="">`:esc((p.name||'?').slice(0,1).toUpperCase())}</span>${esc(p.name||'Member')} ${action}</span>`}).join('')}</div>`;
}
function planBlock(e) {
  const i=issues(e), remote=peersForEvent(e.id), p=remote[0];
  const remoteStyle=p?`--peer-color:${peerColor(p.clientId)}`:'';
  return `<article class="event-block ${selectedEventId===e.id?'selected':''} ${remote.length?'remote-selected':''}" data-event-block="${e.id}" style="--x:${e.position.x}px;--y:${e.position.y}px;${remoteStyle}">${peerBadges(e.id)}<div class="block-shell"><div class="block-handle" data-drag-block="${e.id}"><span>⠿ move</span><span>${esc(e.status)}</span></div><div class="block-body" data-select-event="${e.id}"><div class="block-title">${esc(e.name||'Untitled event')}</div><div class="block-meta"><span>${fmtDate(e.start)} ${fmtTime(e.start)}</span>${e.venue?`<span>⌖ ${esc(e.venue)}</span>`:''}</div><div class="block-footer"><span class="block-lead">${esc(e.lead||'Unassigned')}</span><span class="block-badges"><span class="approval-mini ${approvalClass(e.approvalStatus)}">${esc(e.approvalStatus)}</span><span class="block-warning">${i.length?`⚠ ${i.length}`:'✓'}</span></span></div></div></div></article>`;
}
function connections(ev) {
  const byName=new Map(ev.map(e=>[e.name.toLowerCase(),e]));
  return ev.flatMap(e=>e.dependencies.map(d=>{const src=byName.get(String(d).toLowerCase());if(!src||src.id===e.id)return'';const x1=src.position.x+360,y1=src.position.y+88,x2=e.position.x,y2=e.position.y+88,mid=(x1+x2)/2;return `<path class="connection-line" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}"/>`})).join('');
}
function plan() {
  const ev=visible();
  $('#planView').innerHTML=`<div class="plan-shell"><div class="plan-toolbar"><div class="toolbar-group"><button class="button secondary" data-plan-action="add">＋ Block</button><button class="button secondary" data-plan-action="center">Center</button><button class="button secondary" data-plan-action="fit">Fit</button><span class="toolbar-hint">drag canvas · Space + drag · double-click to add · Ctrl/Cmd + wheel zoom</span></div><div class="toolbar-group"><button class="button secondary" data-plan-action="minus">−</button><span class="zoom-label">${Math.round(zoom*100)}%</span><button class="button secondary" data-plan-action="plus">＋</button></div></div><div class="planner-viewport" id="plannerViewport"><div class="planner-world" id="plannerWorld" style="transform:scale(${zoom})"><svg class="connections">${connections(ev)}</svg>${ev.map(planBlock).join('')}${ev.length?'':`<div class="empty-board"><strong>Empty shared board</strong><p>Double-click anywhere or press “Block” to start planning.</p></div>`}</div></div></div>`;
  requestAnimationFrame(()=>{drawRemoteCursors(); applyRemoteActivityDecorations();});
}
function events() { $('#eventsView').innerHTML=`<div class="events-shell"><div class="panel"><div class="panel-header"><div><h2>All events</h2><p>Full records with approval state visible.</p></div><div class="panel-actions"><button class="button secondary" data-view="plan">Open Plan</button></div></div>${table(visible())}</div></div>`; }
function statusBoard() {
  $('#boardView').innerHTML=`<div class="board-grid">${STATUSES.map(s=>`<section class="board-col" data-status-drop="${s}"><div class="board-col-head">${s} · ${visible().filter(e=>e.status===s).length}</div><div class="board-col-body">${visible().filter(e=>e.status===s).map(e=>`<article class="board-card" draggable="true" data-board-drag="${e.id}" data-open-event="${e.id}"><strong>${esc(e.name)}</strong><small>${fmtDate(e.start)} · ${esc(e.lead||'Unassigned')}</small><div class="board-card-meta">${approvalLabel(e.approvalStatus)}<span style="color:#666;font-size:.62rem">${esc(e.venue||'')}</span></div></article>`).join('')}</div></section>`).join('')}</div>`;
}
function calendar() {
  const now=new Date(), y=now.getFullYear(), m=now.getMonth(), first=new Date(y,m,1), start=(first.getDay()+6)%7, days=new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<start;i++)cells.push(''); for(let d=1;d<=days;d++)cells.push(d);
  $('#calendarView').innerHTML=`<div class="calendar-shell"><div class="panel"><div class="panel-header"><div><h2>${now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><p>Current month</p></div></div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="cal-head">${x}</div>`).join('')}${cells.map(d=>d?`<div class="cal-day"><span class="cal-num">${d}</span>${visible().filter(e=>e.start&&new Date(e.start).getFullYear()===y&&new Date(e.start).getMonth()===m&&new Date(e.start).getDate()===d).map(e=>`<button class="cal-event" data-open-event="${e.id}">${esc(e.name)}</button>`).join('')}</div>`:`<div class="cal-day"></div>`).join('')}</div></div></div>`;
}
function venueGroups() {
  const groups={}; visible().forEach(e=>{if(e.venue){(groups[e.venue]??=[]).push(e)}}); return groups;
}
function venues() {
  const groups=venueGroups(), mapKey=getMapsKey();
  $('#venuesView').innerHTML=`<div class="venue-shell"><div class="venue-layout"><div class="panel venue-list"><div class="panel-header"><div><h2>Venue usage</h2><p>Google Maps + automatic conflicts.</p></div><button class="button secondary" id="configureMapsButton">${mapKey?'Maps settings':'Configure Google Maps'}</button></div>${Object.keys(groups).length?Object.entries(groups).map(([v,ev])=>`<div class="venue-row"><strong>${esc(v)}</strong><small>${ev.length} event${ev.length===1?'':'s'}${ev.some((a,i)=>ev.slice(i+1).some(b=>overlap(a,b)))?' · ⚠ conflict':''}${ev[0].venueAddress?` · ${esc(ev[0].venueAddress)}`:''}</small></div>`).join(''):'<div class="empty-state">No venues assigned yet.</div>'}</div><div class="panel venue-map-wrap"><div class="map-toolbar"><button class="button secondary" id="fitVenueMap" ${mapKey?'':'disabled'}>Fit venues</button></div><div id="venueMap" class="venue-map"></div>${mapKey?'':`<div class="map-placeholder"><div class="inner"><h3>Google Maps is ready to connect</h3><p>Add a browser-restricted Maps JavaScript API key to plot venue addresses. The event drawer now has a separate “Map address” field so indoor venue names can stay human-friendly.</p><button class="button primary" id="configureMapsEmpty">Configure Google Maps</button></div></div>`}</div></div></div>`;
  if (mapKey) requestAnimationFrame(initVenueMap);
}
function budget() {
  const p=visible().reduce((s,e)=>s+(+e.budgetPlanned||0),0),a=visible().reduce((s,e)=>s+(+e.budgetActual||0),0);
  $('#budgetView').innerHTML=`<div class="budget-shell"><div class="metrics">${metric('Council budget',money(state.annualBudget),'Annual')}${metric('Planned',money(p),'Across events')}${metric('Spent',money(a),'Actual')}${metric('Remaining',money(Math.max(0,state.annualBudget-a)),'After actual spending')}</div><div class="panel" style="margin-top:16px">${table(visible())}</div></div>`;
}

function openEvent(e=null,pos=null) {
  const x=e?{...e}:{...fresh('',pos)}; draft=x; selectedEventId=x.id;
  const f=$('#eventForm'); f.reset();
  for(const [k,raw] of Object.entries(x)){
    if(!f.elements[k]) continue; let v=raw;
    if(['supporting','materials','dependencies'].includes(k))v=(v||[]).join(', ');
    if(['start','end'].includes(k))v=toLocal(v);
    f.elements[k].value=String(v??'');
  }
  f.elements.approvalRequired.value=String(!!x.approvalRequired);
  $('#drawerTitle').textContent=e?e.name:'New event'; $('#deleteEventButton').style.visibility=e?'visible':'hidden';
  $('#eventDrawer').classList.add('open'); $('#eventDrawer').setAttribute('aria-hidden','false');
  updatePresence({selectedEventId:x.id,action:'editing'}); broadcast('activity',{from:tabId,eventId:x.id,action:'editing',name:displayName,avatar:avatarUrl,t:Date.now()});
  updateDrawerActivity(); setTimeout(()=>f.elements.name.focus(),40);
}
function closeDrawer() {
  $('#eventDrawer').classList.remove('open'); draft=null; updatePresence({selectedEventId,action:'selected'}); broadcast('activity',{from:tabId,eventId:selectedEventId,action:'selected',name:displayName,avatar:avatarUrl,t:Date.now()});
}
function collect() {
  const f=new FormData($('#eventForm')),x={...draft}; for(const [k,v] of f.entries())x[k]=v;
  x.supporting=split(x.supporting); x.materials=split(x.materials); x.dependencies=split(x.dependencies); x.budgetPlanned=+x.budgetPlanned||0; x.budgetActual=+x.budgetActual||0; x.approvalRequired=x.approvalRequired==='true';
  x.start=x.start?new Date(x.start).toISOString():''; x.end=x.end?new Date(x.end).toISOString():''; return x;
}
function updateDrawerActivity(){ if(!draft)return;const p=peersForEvent(draft.id);$('#drawerActivity').textContent=p.length?`${p.map(x=>x.name).join(', ')} ${p.length===1?'is':'are'} also working on this event.`:'Everything important, without crowding the board.'; }
