/* MSC v8 plan graph + stable canvas */
(() => {
  'use strict';
  const V8 = window.MSC_V8 = window.MSC_V8 || {};
  let inlineEditId = '';
  let connectionPopover = null;
  const connColors = {neutral:'#666',blue:'#72a7ff',green:'#54d58a',yellow:'#f1c75b',red:'#ff7474'};

  function migrateLegacyDependencies(){
    const byName=new Map((state.events||[]).map(e=>[String(e.name||'').trim().toLowerCase(),e]));
    const seen=new Set();
    for(const target of state.events||[])for(const dep of target.dependencies||[]){
      const source=byName.get(String(dep).trim().toLowerCase());
      if(!source||source.id===target.id)continue;
      const k=`${source.id}>${target.id}`;if(seen.has(k))continue;seen.add(k);
      state.connections.push({id:uid(),from:source.id,to:target.id,label:'',style:'solid',tone:'neutral'});
    }
  }
  function ensureState(){
    state.contacts=Array.isArray(state.contacts)?state.contacts:[];
    state.emailSettings=state.emailSettings||{autoApprovalEmails:false};
    state.connections=Array.isArray(state.connections)?state.connections:[];
    if(!state.connections.length)migrateLegacyDependencies();
    state.events.forEach(e=>{if(e.approvalRole==null)e.approvalRole='';if(e.approvalEmailLastSentFor==null)e.approvalEmailLastSentFor='';});
    const ids=new Set(state.events.map(e=>e.id));
    state.connections=state.connections.filter(c=>ids.has(c.from)&&ids.has(c.to)&&c.from!==c.to);
  }
  function syncLegacyDependencies(){
    const byId=new Map(state.events.map(e=>[e.id,e]));state.events.forEach(e=>e.dependencies=[]);
    state.connections.forEach(c=>{const a=byId.get(c.from),b=byId.get(c.to);if(a&&b&&!b.dependencies.includes(a.name))b.dependencies.push(a.name);});
  }
  function reconcileIncomingConnections(ev){
    if(!ev)return;const wanted=new Set((ev.dependencies||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean));
    const old=state.connections.filter(c=>c.to===ev.id),keep=state.connections.filter(c=>c.to!==ev.id);
    wanted.forEach(name=>{const src=state.events.find(x=>x.id!==ev.id&&String(x.name||'').trim().toLowerCase()===name);if(!src)return;keep.push(old.find(c=>c.from===src.id)||{id:uid(),from:src.id,to:ev.id,label:'',style:'solid',tone:'neutral'});});
    state.connections=keep;syncLegacyDependencies();
  }
  V8.ensureState=ensureState;V8.syncLegacyDependencies=syncLegacyDependencies;V8.reconcileIncomingConnections=reconcileIncomingConnections;
  V8.roleOptions=(value='')=>['<option value="">No role selected</option>',...[...new Set(state.contacts.map(c=>c.role).filter(Boolean))].sort().map(r=>`<option value="${esc(r)}" ${r===value?'selected':''}>${esc(r)}</option>`)].join('');

  cleanState=function(){ensureState();return{events:state.events,annualBudget:state.annualBudget,zoom,contacts:state.contacts,connections:state.connections,emailSettings:state.emailSettings,version:(state.version||1)+1,updatedAt:Date.now()};};

  function geom(c){
    const a=state.events.find(e=>e.id===c.from),b=state.events.find(e=>e.id===c.to);if(!a||!b)return null;
    const w=inlineEditId===a.id?420:360,x1=a.position.x+w,y1=a.position.y+88,x2=b.position.x,y2=b.position.y+88;
    const bend=Math.max(90,Math.abs(x2-x1)*.48),dir=x2>=x1?1:-1,c1x=x1+bend*dir,c2x=x2-bend*dir;
    return{x1,y1,x2,y2,c1x,c2x,mx:(x1+3*c1x+3*c2x+x2)/8,my:(y1*4+y2*4)/8};
  }
  connections=function(ev){ensureState();const ids=new Set(ev.map(e=>e.id));return state.connections.filter(c=>ids.has(c.from)&&ids.has(c.to)).map(c=>{const g=geom(c);if(!g)return'';const color=connColors[c.tone]||connColors.neutral;return`<g data-connection-group="${c.id}" style="--connection-color:${color}"><path class="connection-line" data-style="${esc(c.style||'solid')}" stroke="${color}" d="M ${g.x1} ${g.y1} C ${g.c1x} ${g.y1}, ${g.c2x} ${g.y2}, ${g.x2} ${g.y2}"/><g class="connection-node" data-connection-node="${c.id}" transform="translate(${g.mx} ${g.my})"><circle class="node-ring" r="13"></circle><circle class="node-core" r="4.5"></circle></g>${c.label?`<text x="${g.mx+18}" y="${g.my-15}" class="connection-node-label">${esc(c.label)}</text>`:''}</g>`;}).join('');};

  function planBlockV8(e){
    const warnings=issues(e),remote=typeof peersForEvent==='function'?peersForEvent(e.id):[],p=remote[0],editing=inlineEditId===e.id;
    const editor=editing?`<form class="inline-editor" data-inline-editor="${e.id}"><div class="inline-editor-grid"><label class="full">Event name<input name="name" value="${esc(e.name||'')}"></label><label>Status<select name="status">${STATUSES.map(s=>`<option ${s===e.status?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Approval<select name="approvalStatus">${APPROVALS.map(s=>`<option ${s===e.approvalStatus?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Lead<input name="lead" value="${esc(e.lead||'')}"></label><label>Venue<input name="venue" value="${esc(e.venue||'')}"></label><label>Start<input name="start" type="datetime-local" value="${esc(toLocal(e.start))}"></label><label>Deadline<input name="deadline" type="date" value="${esc(e.deadline||'')}"></label><label class="full plan-quick-role">Approval role<select name="approvalRole">${V8.roleOptions(e.approvalRole||'')}</select></label></div><div class="inline-editor-actions"><button type="button" class="button secondary" data-inline-more="${e.id}">More details</button><button type="button" class="button secondary" data-inline-mail="${e.id}">Approval email</button><span class="spacer"></span><button type="button" class="button secondary" data-inline-cancel="${e.id}">Cancel</button><button class="button primary" type="submit">Save</button></div></form>`:'';
    return`<article class="event-block ${selectedEventId===e.id?'selected':''} ${remote.length?'remote-selected':''} ${editing?'inline-editing':''}" data-event-block="${e.id}" style="--x:${e.position.x}px;--y:${e.position.y}px;${p?`--peer-color:${peerColor(p.clientId)};`:''}">${typeof peerBadges==='function'?peerBadges(e.id):''}<div class="block-shell"><div class="block-handle" data-drag-block="${e.id}"><span>⠿ move</span><span class="block-actions"><span>${esc(e.status)}</span><button type="button" class="block-icon-action" data-inline-edit="${e.id}" title="Edit on canvas">✎</button><button type="button" class="block-icon-action" data-link-from="${e.id}" title="Add connection">＋</button></span></div><div class="block-body" data-select-event="${e.id}"><div class="block-title">${esc(e.name||'Untitled event')}</div><div class="block-meta"><span>${fmtDate(e.start)} ${fmtTime(e.start)}</span>${e.venue?`<span>⌖ ${esc(e.venue)}</span>`:''}${e.approvalRole?`<span>↗ ${esc(e.approvalRole)}</span>`:''}</div><div class="block-footer"><span class="block-lead">${esc(e.lead||'Unassigned')}</span><span class="block-badges"><span class="approval-mini ${approvalClass(e.approvalStatus)}">${esc(e.approvalStatus)}</span><span class="block-warning">${warnings.length?`⚠ ${warnings.length}`:'✓'}</span></span></div></div>${editor}</div></article>`;
  }

  plan=function(){
    ensureState();const ev=visible(),sw=Math.max(1,Math.round(WORLD.width*zoom)),sh=Math.max(1,Math.round(WORLD.height*zoom));
    $('#planView').innerHTML=`<div class="plan-shell"><div class="plan-toolbar"><div class="toolbar-group"><button class="button secondary" data-plan-action="add">＋ Block</button><button class="button secondary" data-plan-action="center">Center</button><button class="button secondary" data-plan-action="fit">Fit</button><span class="toolbar-hint">drag canvas · Space + drag · double-click to add · Ctrl/Cmd + wheel zoom</span></div><div class="toolbar-group"><button class="button secondary" data-plan-action="minus">−</button><span class="zoom-label">${Math.round(zoom*100)}%</span><button class="button secondary" data-plan-action="plus">＋</button></div></div><div class="planner-viewport v8-stable-pan" id="plannerViewport"><div class="planner-scale-stage" style="width:${sw}px;height:${sh}px"><div class="planner-world" id="plannerWorld" style="transform:scale(${zoom});width:${WORLD.width}px;height:${WORLD.height}px"><svg class="connections">${connections(ev)}</svg>${ev.map(planBlockV8).join('')}${ev.length?'':`<div class="empty-board"><strong>Empty shared board</strong><p>Double-click anywhere or press “Block” to start planning.</p></div>`}</div></div></div></div>`;
    requestAnimationFrame(()=>{if(typeof drawRemoteCursors==='function')drawRemoteCursors();if(typeof applyRemoteActivityDecorations==='function')applyRemoteActivityDecorations();});
    requestAnimationFrame(()=>requestAnimationFrame(cleanAndBindViewport));
  };

  function cleanAndBindViewport(){
    const current=document.getElementById('plannerViewport');if(!current||current.dataset.v8Clean==='1')return;const left=current.scrollLeft,top=current.scrollTop,clone=current.cloneNode(true);clone.dataset.v8Clean='1';current.replaceWith(clone);clone.scrollLeft=left;clone.scrollTop=top;
    clone.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();e.stopImmediatePropagation();const dx=e.shiftKey&&Math.abs(e.deltaX)<1?e.deltaY:e.deltaX,dy=e.shiftKey?0:e.deltaY;clone.scrollLeft+=dx;clone.scrollTop+=dy;},{passive:false,capture:true});
  }
  zoomAt=function(viewport,clientX,clientY,delta){
    const r=viewport.getBoundingClientRect(),old=zoom,next=clamp(old+delta,.45,1.75);if(next===old)return;const wx=(viewport.scrollLeft+clientX-r.left)/old,wy=(viewport.scrollTop+clientY-r.top)/old;zoom=next;state.zoom=zoom;const world=document.getElementById('plannerWorld'),stage=document.querySelector('.planner-scale-stage');if(world)world.style.transform=`scale(${zoom})`;if(stage){stage.style.width=`${WORLD.width*zoom}px`;stage.style.height=`${WORLD.height*zoom}px`;}viewport.scrollLeft=wx*zoom-(clientX-r.left);viewport.scrollTop=wy*zoom-(clientY-r.top);const z=document.querySelector('.zoom-label');if(z)z.textContent=`${Math.round(zoom*100)}%`;save(false);
  };

  function closePopover(){connectionPopover?.remove();connectionPopover=null;}
  function openPopover(id,x,y){closePopover();const c=state.connections.find(v=>v.id===id);if(!c)return;const a=state.events.find(e=>e.id===c.from),b=state.events.find(e=>e.id===c.to),others=state.events.filter(e=>e.id!==c.from&&e.id!==c.to);const p=document.createElement('div');p.className='connection-popover';p.style.left=`${Math.min(x+12,innerWidth-350)}px`;p.style.top=`${Math.min(y+12,innerHeight-370)}px`;p.innerHTML=`<div><h3>${esc(a?.name||'Event')} → ${esc(b?.name||'Event')}</h3><p>Configure this connection or branch another line from its source.</p></div><div class="connection-popover-grid"><label>Label<input data-conn-label value="${esc(c.label||'')}" placeholder="needs approval"></label><label>Line<select data-conn-style><option value="solid" ${c.style!=='dashed'?'selected':''}>Solid</option><option value="dashed" ${c.style==='dashed'?'selected':''}>Dashed</option></select></label><label>Tone<select data-conn-tone>${Object.keys(connColors).map(k=>`<option value="${k}" ${c.tone===k?'selected':''}>${k}</option>`).join('')}</select></label><label>Add branch<select data-conn-branch><option value="">Choose event…</option>${others.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label></div><div class="connection-popover-actions"><button class="button secondary" data-conn-save="${id}">Save</button><button class="button secondary" data-conn-add-branch="${id}">Add branch</button><button class="button secondary" data-conn-reverse="${id}">Reverse</button><button class="button danger ghost" data-conn-delete="${id}">Delete connection</button></div>`;document.body.appendChild(p);connectionPopover=p;
  }
  function redraw(){syncLegacyDependencies();save();plan();closePopover();}
  function startLinkFrom(id){const src=state.events.find(e=>e.id===id),choices=state.events.filter(e=>e.id!==id);if(!src||!choices.length)return toast('Add another event first');const answer=prompt(`Connect “${src.name}” to which event?\n\n${choices.map((e,i)=>`${i+1}. ${e.name}`).join('\n')}`);if(!answer)return;const target=choices[Number(answer.trim())-1]||choices.find(e=>e.name.toLowerCase()===answer.trim().toLowerCase());if(!target)return toast('No matching event found');if(state.connections.some(c=>c.from===id&&c.to===target.id))return toast('That connection already exists');state.connections.push({id:uid(),from:id,to:target.id,label:'',style:'solid',tone:'neutral'});redraw();toast('Connection added');}

  function saveInline(form){const ev=state.events.find(e=>e.id===form.dataset.inlineEditor);if(!ev)return;const fd=new FormData(form),before={approvalStatus:ev.approvalStatus,status:ev.status,approvalRole:ev.approvalRole};ev.name=String(fd.get('name')||'').trim()||ev.name;ev.status=fd.get('status')||ev.status;ev.approvalStatus=fd.get('approvalStatus')||ev.approvalStatus;ev.lead=String(fd.get('lead')||'').trim();ev.venue=String(fd.get('venue')||'').trim();ev.approvalRole=String(fd.get('approvalRole')||'');ev.deadline=String(fd.get('deadline')||'');const start=String(fd.get('start')||'');ev.start=start?new Date(start).toISOString():'';syncLegacyDependencies();save();inlineEditId='';render();setView('plan',false);window.MSC_V8?.maybeAutomateApprovalEmail?.(ev,before);toast('Event updated');}

  function ensureApprovalRoleField(){const form=document.getElementById('eventForm');if(!form||form.querySelector('[name="approvalRole"]'))return;const field=form.elements.approver?.closest('.field');if(!field)return;const wrap=document.createElement('label');wrap.className='field';wrap.innerHTML=`<span>Approval role</span><select name="approvalRole">${V8.roleOptions(draft?.approvalRole||'')}</select>`;field.parentElement.appendChild(wrap);if(draft)wrap.querySelector('select').value=draft.approvalRole||'';const actions=document.querySelector('.drawer-actions');if(actions&&!actions.querySelector('[data-drawer-approval-mail]')){const b=document.createElement('button');b.type='button';b.className='button secondary';b.dataset.drawerApprovalMail='1';b.textContent='Approval email';actions.insertBefore(b,actions.querySelector('.spacer'));}}
  const baseCollect=typeof collect==='function'?collect:null;if(baseCollect)collect=function(){const x=baseCollect(),f=document.getElementById('eventForm');x.approvalRole=f?.elements.approvalRole?.value||x.approvalRole||'';return x;};
  const baseOpen=typeof openEvent==='function'?openEvent:null;if(baseOpen)openEvent=function(e=null,pos=null){baseOpen(e,pos);requestAnimationFrame(ensureApprovalRoleField);};

  document.addEventListener('pointerdown',e=>{if(e.target.closest('.block-icon-action,.inline-editor,.connection-node,.connection-popover'))e.stopPropagation();},true);
  document.addEventListener('submit',e=>{const f=e.target.closest('[data-inline-editor]');if(f){e.preventDefault();e.stopImmediatePropagation();saveInline(f);}},true);
  document.addEventListener('click',e=>{
    const node=e.target.closest('[data-connection-node]');if(node){e.preventDefault();e.stopPropagation();openPopover(node.dataset.connectionNode,e.clientX,e.clientY);return;}if(connectionPopover&&!e.target.closest('.connection-popover'))closePopover();
    const edit=e.target.closest('[data-inline-edit]');if(edit){e.preventDefault();e.stopPropagation();inlineEditId=inlineEditId===edit.dataset.inlineEdit?'':edit.dataset.inlineEdit;selectEvent(edit.dataset.inlineEdit);plan();return;}const cancel=e.target.closest('[data-inline-cancel]');if(cancel){e.preventDefault();inlineEditId='';plan();return;}const more=e.target.closest('[data-inline-more]');if(more){e.preventDefault();const ev=state.events.find(x=>x.id===more.dataset.inlineMore);if(ev)openEvent(ev);return;}const link=e.target.closest('[data-link-from]');if(link){e.preventDefault();e.stopPropagation();startLinkFrom(link.dataset.linkFrom);return;}
    const saveBtn=e.target.closest('[data-conn-save]');if(saveBtn&&connectionPopover){const c=state.connections.find(x=>x.id===saveBtn.dataset.connSave);if(c){c.label=connectionPopover.querySelector('[data-conn-label]').value.trim();c.style=connectionPopover.querySelector('[data-conn-style]').value;c.tone=connectionPopover.querySelector('[data-conn-tone]').value;redraw();}return;}const del=e.target.closest('[data-conn-delete]');if(del){state.connections=state.connections.filter(c=>c.id!==del.dataset.connDelete);redraw();toast('Connection removed');return;}const rev=e.target.closest('[data-conn-reverse]');if(rev){const c=state.connections.find(x=>x.id===rev.dataset.connReverse);if(c){[c.from,c.to]=[c.to,c.from];redraw();}return;}const branch=e.target.closest('[data-conn-add-branch]');if(branch&&connectionPopover){const c=state.connections.find(x=>x.id===branch.dataset.connAddBranch),target=connectionPopover.querySelector('[data-conn-branch]').value;if(!c||!target)return toast('Choose an event for the branch');if(state.connections.some(x=>x.from===c.from&&x.to===target))return toast('That connection already exists');state.connections.push({id:uid(),from:c.from,to:target,label:'',style:c.style||'solid',tone:c.tone||'neutral'});redraw();toast('Branch added');return;}
  },true);

  const eventForm=document.getElementById('eventForm');if(eventForm)eventForm.addEventListener('submit',()=>{const id=eventForm.elements.id?.value,old=state.events.find(x=>x.id===id),before=old?{approvalStatus:old.approvalStatus,status:old.status,approvalRole:old.approvalRole}:{};setTimeout(()=>{const now=state.events.find(x=>x.id===id||x.id===selectedEventId);if(now){reconcileIncomingConnections(now);save();window.MSC_V8?.maybeAutomateApprovalEmail?.(now,before);}},0);},true);

  ensureState();render();setView(view,false);
})();
