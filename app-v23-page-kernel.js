/* MSC v23 page kernel: deterministic startup + large-board virtual rendering. */
(() => {
  'use strict';

  const V23 = window.MSC_V23 = window.MSC_V23 || {};
  const LARGE_PLAN = 30;
  const EVENT_PAGE = 100;
  const STATUS_PAGE = 50;
  const BUDGET_PAGE = 100;
  const CARD_W = 360;
  const CARD_H = 178;
  const OVERSCAN = 720;

  let delegatePlan = typeof plan === 'function' ? plan : null;
  let inlineEditId = '';
  let virtualFrame = 0;
  let lastWindowKey = '';
  let eventPage = 0;
  let statusPage = 0;
  let budgetPage = 0;
  let issueKey = '';
  let issueCache = new Map();

  window.MSC_FAST_BOOT = Object.assign(window.MSC_FAST_BOOT || {}, {
    ready: true,
    disabled: true,
    version: 23
  });

  function eventCount() { return state.events?.length || 0; }
  function largePlan() { const pref=localStorage.getItem('mscPerfModeV20')||'auto'; return pref==='always' || (pref!=='off' && eventCount() >= 20); }
  function safe(fn) { try { return fn?.(); } catch (err) { console.error(err); } }

  function rebuildIssues() {
    const key = `${state.version || 0}|${eventCount()}`;
    if (key === issueKey) return;
    issueKey = key;
    issueCache = new Map();

    const conflicts = new Set();
    const venues = new Map();
    for (const e of state.events || []) {
      if (!e?.id || !e.venue || !e.start) continue;
      const venue = String(e.venue).trim().toLowerCase();
      if (!venue) continue;
      const start = +new Date(e.start);
      if (!Number.isFinite(start)) continue;
      const rawEnd = +new Date(e.end || e.start);
      const end = Number.isFinite(rawEnd) ? Math.max(start, rawEnd) : start;
      if (!venues.has(venue)) venues.set(venue, []);
      venues.get(venue).push({ id:e.id, start, end });
    }
    for (const list of venues.values()) {
      list.sort((a,b) => a.start - b.start || a.end - b.end);
      const active = [];
      for (const item of list) {
        for (let i=active.length-1;i>=0;i--) if (active[i].end <= item.start) active.splice(i,1);
        if (active.length) {
          conflicts.add(item.id);
          for (const other of active) conflicts.add(other.id);
        }
        active.push(item);
      }
    }
    const today = new Date(new Date().toDateString());
    for (const e of state.events || []) {
      const out = [];
      if (e.deadline && e.status !== 'Completed' && new Date(e.deadline) < today) out.push('Deadline passed');
      if (e.approvalRequired && e.approvalStatus !== 'Approved') out.push(`Approval: ${e.approvalStatus}`);
      if (+e.budgetActual > +e.budgetPlanned && +e.budgetPlanned) out.push('Over budget');
      if (conflicts.has(e.id)) out.push('Venue conflict');
      issueCache.set(e.id, out);
    }
  }

  issues = function(e) {
    rebuildIssues();
    return issueCache.get(e?.id) || [];
  };

  function ensureWorld() {
    let maxX = 4600, maxY = 3200;
    for (const e of state.events || []) {
      maxX = Math.max(maxX, (+e.position?.x || 0) + CARD_W + 520);
      maxY = Math.max(maxY, (+e.position?.y || 0) + CARD_H + 520);
    }
    WORLD.width = Math.max(4600, Math.ceil(maxX / 200) * 200);
    WORLD.height = Math.max(3200, Math.ceil(maxY / 200) * 200);
  }

  function roleOptions(value='') {
    if (window.MSC_V8?.roleOptions) return window.MSC_V8.roleOptions(value);
    const roles = [...new Set((state.contacts || []).map(c => c.role).filter(Boolean))].sort();
    return ['<option value="">No role selected</option>', ...roles.map(r => `<option value="${esc(r)}" ${r===value?'selected':''}>${esc(r)}</option>`)].join('');
  }

  function cardMarkup(e) {
    const warnings = issues(e);
    const remote = typeof peersForEvent === 'function' ? peersForEvent(e.id) : [];
    const p = remote[0];
    const editing = inlineEditId === e.id;
    const editor = editing ? `<form class="inline-editor v23-inline-editor" data-v23-inline-form="${e.id}">
      <div class="inline-editor-grid">
        <label class="full">Event name<input name="name" value="${esc(e.name||'')}"></label>
        <label>Status<select name="status">${STATUSES.map(s=>`<option ${s===e.status?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Approval<select name="approvalStatus">${APPROVALS.map(s=>`<option ${s===e.approvalStatus?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Lead<input name="lead" value="${esc(e.lead||'')}"></label>
        <label>Venue<input name="venue" value="${esc(e.venue||'')}"></label>
        <label>Start<input name="start" type="datetime-local" value="${esc(toLocal(e.start))}"></label>
        <label>Deadline<input name="deadline" type="date" value="${esc(e.deadline||'')}"></label>
        <label class="full">Approval role<select name="approvalRole">${roleOptions(e.approvalRole||'')}</select></label>
      </div>
      <div class="inline-editor-actions">
        <button type="button" class="button secondary" data-v23-more="${e.id}">More details</button>
        <span class="spacer"></span>
        <button type="button" class="button secondary" data-v23-cancel="${e.id}">Cancel</button>
        <button class="button primary" type="submit">Save</button>
      </div>
    </form>` : '';
    return `<article class="event-block ${selectedEventId===e.id?'selected':''} ${remote.length?'remote-selected':''} ${editing?'inline-editing':''}" data-event-block="${e.id}" style="--x:${+e.position?.x||0}px;--y:${+e.position?.y||0}px;${p?`--peer-color:${peerColor(p.clientId)};`:''}">
      ${typeof peerBadges === 'function' ? peerBadges(e.id) : ''}
      <div class="block-shell">
        <div class="block-handle" data-drag-block="${e.id}"><span>⠿ move</span><span class="block-actions"><span>${esc(e.status)}</span><button type="button" class="block-icon-action" data-v23-edit="${e.id}" title="Edit on canvas">✎</button><button type="button" class="block-icon-action" data-link-from="${e.id}" title="Add connection">＋</button></span></div>
        <div class="block-body" data-select-event="${e.id}">
          <div class="block-title">${esc(e.name||'Untitled event')}</div>
          <div class="block-meta"><span>${fmtDate(e.start)} ${fmtTime(e.start)}</span>${e.venue?`<span>⌖ ${esc(e.venue)}</span>`:''}${e.approvalRole?`<span>↗ ${esc(e.approvalRole)}</span>`:''}</div>
          <div class="block-footer"><span class="block-lead">${esc(e.lead||'Unassigned')}</span><span class="block-badges"><span class="approval-mini ${approvalClass(e.approvalStatus)}">${esc(e.approvalStatus)}</span><span class="block-warning">${warnings.length?`⚠ ${warnings.length}`:'✓'}</span></span></div>
        </div>${editor}
      </div>
    </article>`;
  }

  function imported(e) {
    const s = String(e?.source || '').toLowerCase();
    return ['imported','pdf','ics','ical','calendar'].includes(s);
  }

  function chunkMarkup() {
    if (state.planSettings?.monthChunksEnabled === false) return '';
    const groups = new Map();
    for (const e of state.events || []) {
      if (!imported(e) || !e.start || !Number.isFinite(+e.position?.x) || !Number.isFinite(+e.position?.y)) continue;
      const d = new Date(e.start); if (Number.isNaN(+d)) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!groups.has(key)) groups.set(key,{label:d.toLocaleDateString(undefined,{month:'long',year:'numeric'}),events:[]});
      groups.get(key).events.push(e);
    }
    return [...groups.values()].map(g => {
      const minX=Math.min(...g.events.map(e=>+e.position.x)), minY=Math.min(...g.events.map(e=>+e.position.y));
      const maxX=Math.max(...g.events.map(e=>+e.position.x+CARD_W)), maxY=Math.max(...g.events.map(e=>+e.position.y+CARD_H));
      return `<section class="v20-month-chunk" style="--chunk-x:${Math.max(18,minX-30)}px;--chunk-y:${Math.max(18,minY-62)}px;--chunk-w:${maxX-minX+60}px;--chunk-h:${maxY-minY+92}px"><div class="v20-month-chunk-title"><strong>${esc(g.label)}</strong><span>${g.events.length} events</span></div></section>`;
    }).join('');
  }

  function worldBounds(viewport) {
    const z = Math.max(.01, zoom || 1);
    const width = viewport.clientWidth || innerWidth || 1200;
    const height = viewport.clientHeight || innerHeight || 800;
    return {
      left: viewport.scrollLeft / z - OVERSCAN,
      top: viewport.scrollTop / z - OVERSCAN,
      right: (viewport.scrollLeft + width) / z + OVERSCAN,
      bottom: (viewport.scrollTop + height) / z + OVERSCAN
    };
  }

  function eventsForWindow(viewport) {
    const all = visible();
    if (!largePlan()) return all;
    const b = worldBounds(viewport);
    const inside = all.filter(e => {
      const x=+e.position?.x||0,y=+e.position?.y||0;
      return x+CARD_W>=b.left && x<=b.right && y+CARD_H>=b.top && y<=b.bottom;
    });
    if (inside.length <= 160) return inside;
    const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
    return inside.sort((a,b2)=>Math.hypot((+a.position.x||0)-cx,(+a.position.y||0)-cy)-Math.hypot((+b2.position.x||0)-cx,(+b2.position.y||0)-cy)).slice(0,160);
  }

  function refreshVirtual(force=false) {
    const viewport=document.getElementById('plannerViewport'),world=document.getElementById('plannerWorld');
    if (!viewport || !world) return;
    if (drag?.type === 'block') return;
    const z=Math.max(.01,zoom||1), key=`${Math.round(viewport.scrollLeft/(220*z))}|${Math.round(viewport.scrollTop/(220*z))}|${state.version||0}|${search||''}|${inlineEditId}`;
    if (!force && key===lastWindowKey) return;
    lastWindowKey=key;
    const ev=eventsForWindow(viewport);
    if(force){const chunks=world.querySelector('.v20-month-chunk-layer');if(chunks)chunks.innerHTML=chunkMarkup();}
    let cards=world.querySelector('#v23PlanCards');
    if(!cards){cards=document.createElement('div');cards.id='v23PlanCards';cards.style.display='contents';world.appendChild(cards);}
    cards.innerHTML=ev.map(cardMarkup).join('') || (visible().length ? '' : '<div class="empty-board"><strong>Empty board</strong><p>Double-click the canvas or press Block to add an event.</p></div>');
    const svg=world.querySelector('.connections');
    if(svg){
      try{svg.innerHTML=typeof connections==='function'?connections(ev):'';}catch(err){console.warn('Connection paint skipped',err);svg.innerHTML='';}
    }
    const badge=document.querySelector('[data-v23-render-count]');if(badge)badge.textContent=`${ev.length} / ${visible().length} visible`;
    safe(()=>drawRemoteCursors());safe(()=>applyRemoteActivityDecorations?.());
  }

  function scheduleVirtual(force=false) {
    if (virtualFrame) cancelAnimationFrame(virtualFrame);
    virtualFrame=requestAnimationFrame(()=>{virtualFrame=0;refreshVirtual(force);});
  }

  function virtualPlan() {
    window.MSC_V8?.ensureState?.();
    ensureWorld();
    const old=document.getElementById('plannerViewport');
    const oldLeft=old?.scrollLeft||0,oldTop=old?.scrollTop||0;
    const sw=Math.max(1,Math.round(WORLD.width*zoom)),sh=Math.max(1,Math.round(WORLD.height*zoom));
    const root=document.getElementById('planView');if(!root)return;
    root.innerHTML=`<div class="plan-shell v23-virtual-plan"><div class="plan-toolbar"><div class="toolbar-group"><button class="button secondary" data-plan-action="add">＋ Block</button><button class="button secondary" data-plan-action="center">Center</button><button class="button secondary" data-plan-action="fit">Fit</button><span class="toolbar-hint">drag canvas · Space + drag · double-click to add · Ctrl/Cmd + wheel zoom</span></div><div class="toolbar-group"><span class="v23-render-count" data-v23-render-count>virtualizing…</span><button class="button secondary" data-plan-action="minus">−</button><span class="zoom-label">${Math.round(zoom*100)}%</span><button class="button secondary" data-plan-action="plus">＋</button></div></div><div class="planner-viewport v8-stable-pan" id="plannerViewport"><div class="planner-scale-stage" style="width:${sw}px;height:${sh}px"><div class="planner-world" id="plannerWorld" style="transform:scale(${zoom});width:${WORLD.width}px;height:${WORLD.height}px"><div class="v20-month-chunk-layer">${chunkMarkup()}</div><svg class="connections"></svg><div id="v23PlanCards" style="display:contents"></div></div></div></div></div>`;
    const viewport=document.getElementById('plannerViewport');
    viewport.scrollLeft=oldLeft;viewport.scrollTop=oldTop;
    viewport.addEventListener('scroll',()=>scheduleVirtual(false),{passive:true});
    lastWindowKey='';
    scheduleVirtual(true);
  }
  virtualPlan.__mscV23 = true;

  function renderLargeEvents() {
    const list=visible();
    const pages=Math.max(1,Math.ceil(list.length/EVENT_PAGE));eventPage=Math.max(0,Math.min(eventPage,pages-1));const start=eventPage*EVENT_PAGE,part=list.slice(start,start+EVENT_PAGE);
    document.getElementById('eventsView').innerHTML=`<div class="events-shell"><div class="panel"><div class="panel-header"><div><h2>All events</h2><p>${list.length.toLocaleString()} events · showing ${start+1}–${Math.min(list.length,start+EVENT_PAGE)}</p></div><div class="panel-actions"><button class="button secondary" data-view="plan">Open Plan</button></div></div>${table(part)}<div class="v23-page-controls"><button class="button secondary compact" data-v23-event-page="-1" ${eventPage===0?'disabled':''}>← Previous</button><span>Page ${eventPage+1} of ${pages}</span><button class="button secondary compact" data-v23-event-page="1" ${eventPage>=pages-1?'disabled':''}>Next →</button></div></div></div>`;
  }

  function renderLargeStatus() {
    const list=visible(),groups=new Map(STATUSES.map(s=>[s,[]]));for(const e of list)(groups.get(e.status)||groups.get(STATUSES[0])).push(e);
    const pages=Math.max(1,...[...groups.values()].map(g=>Math.ceil(g.length/STATUS_PAGE)));statusPage=Math.max(0,Math.min(statusPage,pages-1));const start=statusPage*STATUS_PAGE;
    document.getElementById('boardView').innerHTML=`<div class="v23-status-pager v23-page-controls"><button class="button secondary compact" data-v23-status-page="-1" ${statusPage===0?'disabled':''}>← Previous</button><span>Status page ${statusPage+1} of ${pages} · up to ${STATUS_PAGE} cards per column</span><button class="button secondary compact" data-v23-status-page="1" ${statusPage>=pages-1?'disabled':''}>Next →</button></div><div class="board-grid">${STATUSES.map(st=>{const all=groups.get(st),part=all.slice(start,start+STATUS_PAGE);return `<section class="board-col" data-status-drop="${esc(st)}"><div class="board-col-head">${esc(st)} · ${all.length}${all.length>part.length?` · showing ${part.length}`:''}</div><div class="board-col-body">${part.map(e=>`<article class="board-card" draggable="true" data-board-drag="${esc(e.id)}" data-open-event="${esc(e.id)}"><strong>${esc(e.name)}</strong><small>${fmtDate(e.start)} · ${esc(e.lead||'Unassigned')}</small><div class="board-card-meta">${approvalLabel(e.approvalStatus)}<span style="color:#666;font-size:.62rem">${esc(e.venue||'')}</span></div></article>`).join('')}</div></section>`}).join('')}</div>`;
  }

  function renderLargeBudget() {
    const list=visible(),planned=list.reduce((n,e)=>n+(+e.budgetPlanned||0),0),actual=list.reduce((n,e)=>n+(+e.budgetActual||0),0),pages=Math.max(1,Math.ceil(list.length/BUDGET_PAGE));budgetPage=Math.max(0,Math.min(budgetPage,pages-1));const start=budgetPage*BUDGET_PAGE,part=list.slice(start,start+BUDGET_PAGE);
    document.getElementById('budgetView').innerHTML=`<div class="budget-shell"><div class="metrics">${metric('Council budget',money(state.annualBudget),'Annual')}${metric('Planned',money(planned),'Across events')}${metric('Spent',money(actual),'Actual')}${metric('Remaining',money(Math.max(0,state.annualBudget-actual)),'After actual spending')}</div><div class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Event budgets</h2><p>${list.length.toLocaleString()} events · showing ${start+1}–${Math.min(list.length,start+BUDGET_PAGE)}</p></div></div>${table(part)}<div class="v23-page-controls"><button class="button secondary compact" data-v23-budget-page="-1" ${budgetPage===0?'disabled':''}>← Previous</button><span>Page ${budgetPage+1} of ${pages}</span><button class="button secondary compact" data-v23-budget-page="1" ${budgetPage>=pages-1?'disabled':''}>Next →</button></div></div></div>`;
  }

  function renderActive() {
    document.body?.classList.toggle('v23-large-board',eventCount()>=LARGE_PLAN);
    if(view==='boards' && window.MSC_V10?.renderBoards) return window.MSC_V10.renderBoards();
    if(view==='contacts' && window.MSC_V8?.contactsView) return window.MSC_V8.contactsView();
    if(view==='home') return home();
    if(view==='plan') return virtualPlan();
    if(view==='events') {
      if(visible().length>EVENT_PAGE) return renderLargeEvents();
      return events();
    }
    if(view==='board') return visible().length>250?renderLargeStatus():statusBoard();
    if(view==='calendar') return calendar();
    if(view==='venues') return venues();
    if(view==='budget') return visible().length>BUDGET_PAGE?renderLargeBudget():budget();
  }
  renderActive.__mscV23 = true;

  const originalSetView = setView;
  setView = function(v,announce=true){
    const before=view;
    const result=originalSetView(v,announce);
    if(v!==before || !document.getElementById(`${v}View`)?.innerHTML) renderActive();
    window.dispatchEvent(new CustomEvent('msc:viewchange',{detail:{view:v}}));
    return result;
  };
  setView.__mscV23 = true;

  function reassert(capturePlan=false) {
    if(capturePlan && typeof plan==='function' && plan!==virtualPlan && !plan.__mscV23) delegatePlan=plan;
    plan=virtualPlan;
    render=renderActive;
    window.MSC_FAST_BOOT.ready=true;
    if(view==='plan') scheduleVirtual(true);
  }

  V23.reassert=reassert;
  V23.refreshPlan=()=>scheduleVirtual(true);
  V23.renderActive=renderActive;
  V23.setDelegatePlan=fn=>{if(typeof fn==='function'&&fn!==virtualPlan)delegatePlan=fn;};

  document.addEventListener('click',e=>{
    const edit=e.target.closest?.('[data-v23-edit]');if(edit){e.preventDefault();e.stopPropagation();inlineEditId=inlineEditId===edit.dataset.v23Edit?'':edit.dataset.v23Edit;scheduleVirtual(true);return;}
    const cancel=e.target.closest?.('[data-v23-cancel]');if(cancel){e.preventDefault();inlineEditId='';scheduleVirtual(true);return;}
    const more=e.target.closest?.('[data-v23-more]');if(more){e.preventDefault();const ev=state.events.find(x=>x.id===more.dataset.v23More);if(ev)openEvent(ev);return;}
    const pager=e.target.closest?.('[data-v23-event-page]');if(pager){e.preventDefault();eventPage+=+pager.dataset.v23EventPage;renderLargeEvents();return;}
    const sp=e.target.closest?.('[data-v23-status-page]');if(sp){e.preventDefault();statusPage+=+sp.dataset.v23StatusPage;renderLargeStatus();return;}
    const bp=e.target.closest?.('[data-v23-budget-page]');if(bp){e.preventDefault();budgetPage+=+bp.dataset.v23BudgetPage;renderLargeBudget();return;}
  },true);

  document.addEventListener('submit',e=>{
    const form=e.target.closest?.('[data-v23-inline-form]');if(!form)return;
    e.preventDefault();e.stopImmediatePropagation();
    const ev=state.events.find(x=>x.id===form.dataset.v23InlineForm);if(!ev)return;
    const fd=new FormData(form);
    ev.name=String(fd.get('name')||'').trim()||ev.name;
    ev.status=String(fd.get('status')||ev.status);
    ev.approvalStatus=String(fd.get('approvalStatus')||ev.approvalStatus);
    ev.lead=String(fd.get('lead')||'').trim();ev.venue=String(fd.get('venue')||'').trim();ev.deadline=String(fd.get('deadline')||'');ev.approvalRole=String(fd.get('approvalRole')||'');
    const start=String(fd.get('start')||'');ev.start=start?new Date(start).toISOString():'';
    window.MSC_V8?.syncLegacyDependencies?.();inlineEditId='';save();scheduleVirtual(true);toast('Event updated');
  },true);

  window.addEventListener('resize',()=>scheduleVirtual(true));
  reassert();
})();
