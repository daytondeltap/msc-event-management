/* MSC v20: large-calendar performance + month chunks */
(() => {
  'use strict';

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const DEFAULTS = { monthChunks: true, autoArrangeImports: true, chunkScope: 'all', largeBoardOptimizations: true };
  const CARD_W = 360, CARD_H = 178, CHUNK_W = 1760, CHUNK_X_GAP = 120, CHUNK_Y_GAP = 110;
  const CHUNK_PAD_X = 70, CHUNK_TOP = 96, EVENT_X_STEP = 400, EVENT_Y_STEP = 220, EVENTS_PER_ROW = 4;

  let visibleCache = { key: '', value: [] };
  let issueCache = { key: '', map: new Map() };
  let renderStamp = { view: '', at: 0 };
  let connectionRaf = 0, lastConnectionDraw = 0, applyingLayout = false;
  let knownEventIds = new Set((state.events || []).map(e => e.id));

  function ensureSettings() {
    state.planSettings = state.planSettings && typeof state.planSettings === 'object' ? state.planSettings : {};
    for (const [k, v] of Object.entries(DEFAULTS)) if (state.planSettings[k] == null) state.planSettings[k] = v;
    if (!['all', 'imported'].includes(state.planSettings.chunkScope)) state.planSettings.chunkScope = 'all';
    return state.planSettings;
  }

  function invalidateCaches() { visibleCache.key = ''; issueCache.key = ''; }

  const baseVisible = visible;
  visible = function() {
    if (!ensureSettings().largeBoardOptimizations) return baseVisible();
    const key = `${state.version || 0}|${state.events?.length || 0}|${search}`;
    if (visibleCache.key === key) return visibleCache.value;
    const needle = search.trim().toLowerCase();
    const value = (state.events || []).filter(e => !needle || [e.name,e.objective,e.lead,e.venue,e.venueAddress,e.status,e.approvalStatus,...(e.supporting||[]),...(e.materials||[]),...(e.dependencies||[])].join(' ').toLowerCase().includes(needle));
    visibleCache = { key, value };
    return value;
  };

  const baseIssues = issues;
  issues = function(e) {
    if (!ensureSettings().largeBoardOptimizations) return baseIssues(e);
    const today = new Date().toDateString();
    const key = `${state.version || 0}|${state.events?.length || 0}|${today}`;
    if (issueCache.key !== key) {
      const map = new Map((state.events || []).map(ev => [ev.id, []]));
      const midnight = new Date(today);
      for (const ev of state.events || []) {
        const out = map.get(ev.id);
        if (ev.deadline && ev.status !== 'Completed' && new Date(ev.deadline) < midnight) out.push('Deadline passed');
        if (ev.approvalRequired && ev.approvalStatus !== 'Approved') out.push(`Approval: ${ev.approvalStatus}`);
        if (+ev.budgetActual > +ev.budgetPlanned && +ev.budgetPlanned) out.push('Over budget');
      }
      const venues = new Map();
      for (const ev of state.events || []) {
        const venue = String(ev.venue || '').trim().toLowerCase();
        if (!venue || !ev.start) continue;
        if (!venues.has(venue)) venues.set(venue, []);
        venues.get(venue).push(ev);
      }
      for (const group of venues.values()) {
        group.sort((a,b)=>+new Date(a.start)-+new Date(b.start));
        for (let i=0;i<group.length;i++) {
          const a=group[i], as=+new Date(a.start), ae=+new Date(a.end||a.start);
          for (let j=i+1;j<group.length;j++) {
            const b=group[j], bs=+new Date(b.start); if (bs>=ae) break;
            const be=+new Date(b.end||b.start);
            if (as<be && bs<ae) {
              const aa=map.get(a.id), bb=map.get(b.id);
              if (!aa.includes('Venue conflict')) aa.push('Venue conflict');
              if (!bb.includes('Venue conflict')) bb.push('Venue conflict');
            }
          }
        }
      }
      issueCache = { key, map };
    }
    return issueCache.map.get(e.id) || [];
  };

  calendar = function() {
    const now=new Date(), y=now.getFullYear(), m=now.getMonth(), first=new Date(y,m,1), start=(first.getDay()+6)%7, days=new Date(y,m+1,0).getDate();
    const byDay=new Map();
    for (const ev of visible()) {
      if (!ev.start) continue;
      const d=new Date(ev.start); if (d.getFullYear()!==y || d.getMonth()!==m) continue;
      if (!byDay.has(d.getDate())) byDay.set(d.getDate(),[]); byDay.get(d.getDate()).push(ev);
    }
    const cells=[]; for(let i=0;i<start;i++)cells.push(''); for(let d=1;d<=days;d++)cells.push(d);
    q('#calendarView').innerHTML=`<div class="calendar-shell"><div class="panel"><div class="panel-header"><div><h2>${now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><p>Current month · optimized for large calendars</p></div></div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="cal-head">${x}</div>`).join('')}${cells.map(d=>d?`<div class="cal-day"><span class="cal-num">${d}</span>${(byDay.get(d)||[]).map(e=>`<button class="cal-event" data-open-event="${e.id}">${esc(e.name)}</button>`).join('')}</div>`:'<div class="cal-day"></div>').join('')}</div></div></div>`;
  };

  const isImported = e => !!e?.source && e.source !== 'local';
  function monthInfo(e) {
    if (!e.start) return { key:'undated', label:'Undated', order:Number.MAX_SAFE_INTEGER };
    const d=new Date(e.start); if (Number.isNaN(+d)) return { key:'undated', label:'Undated', order:Number.MAX_SAFE_INTEGER };
    return { key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:d.toLocaleDateString(undefined,{month:'long',year:'numeric'}), order:d.getFullYear()*12+d.getMonth() };
  }
  function chunkEvents(source=state.events||[]) {
    const s=ensureSettings(), events=s.chunkScope==='imported'?source.filter(isImported):source.slice(), groups=new Map();
    for (const ev of events) { const info=monthInfo(ev); if(!groups.has(info.key)) groups.set(info.key,{...info,events:[]}); groups.get(info.key).events.push(ev); }
    const result=[...groups.values()].sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label));
    for(const group of result) group.events.sort((a,b)=>(+new Date(a.start||0)-+new Date(b.start||0))||String(a.name||'').localeCompare(String(b.name||'')));
    return result;
  }

  function applyMonthLayout() {
    const s=ensureSettings(); if(!s.monthChunks||applyingLayout)return false;
    const groups=chunkEvents(); if(!groups.length)return false;
    applyingLayout=true;
    try {
      let y=170;
      for(let i=0;i<groups.length;i+=2){
        const pair=groups.slice(i,i+2), heights=pair.map(g=>CHUNK_TOP+Math.max(1,Math.ceil(g.events.length/EVENTS_PER_ROW))*EVENT_Y_STEP+54), rowHeight=Math.max(...heights);
        pair.forEach((group,colIndex)=>{
          const x=170+colIndex*(CHUNK_W+CHUNK_X_GAP);
          group.events.forEach((ev,idx)=>{
            ev.position=ev.position||{x:0,y:0};
            ev.position.x=x+CHUNK_PAD_X+(idx%EVENTS_PER_ROW)*EVENT_X_STEP;
            ev.position.y=y+CHUNK_TOP+Math.floor(idx/EVENTS_PER_ROW)*EVENT_Y_STEP;
          });
        });
        y+=rowHeight+CHUNK_Y_GAP;
      }
      const maxY=(state.events||[]).reduce((m,e)=>Math.max(m,(+e.position?.y||0)+CARD_H+260),3200);
      WORLD.height=Math.max(3200,Math.ceil(maxY/200)*200);
      state.planSettings.lastMonthSortAt=Date.now(); invalidateCaches(); return true;
    } finally { applyingLayout=false; }
  }

  function chunkBounds(group) {
    if(!group.events.length)return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const e of group.events){const x=+e.position?.x||0,y=+e.position?.y||0;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+CARD_W);maxY=Math.max(maxY,y+CARD_H);}
    return {x:minX-42,y:minY-68,w:maxX-minX+84,h:maxY-minY+112};
  }
  function drawChunks(){
    const world=q('#plannerWorld'); if(!world)return; qa('.v20-month-chunk',world).forEach(el=>el.remove()); if(!ensureSettings().monthChunks)return;
    const frag=document.createDocumentFragment();
    for(const group of chunkEvents(visible())){const b=chunkBounds(group);if(!b)continue;const box=document.createElement('div');box.className='v20-month-chunk';box.style.cssText=`left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;box.innerHTML=`<div class="v20-month-chunk-title"><strong>${esc(group.label)}</strong><span>${group.events.length} event${group.events.length===1?'':'s'}</span></div>`;frag.appendChild(box);}
    world.insertBefore(frag,world.firstChild);
  }

  const basePlan=plan;
  plan=function(){ensureSettings();basePlan();requestAnimationFrame(drawChunks);};

  const baseUpdateConnectionSvg=typeof updateConnectionSvg==='function'?updateConnectionSvg:null;
  if(baseUpdateConnectionSvg){
    updateConnectionSvg=function(){
      if(view!=='plan')return;const count=state.events?.length||0;if(!ensureSettings().largeBoardOptimizations||count<=20)return baseUpdateConnectionSvg();
      const minGap=count>100?80:count>60?55:34,now=performance.now();
      if(now-lastConnectionDraw>=minGap){lastConnectionDraw=now;return baseUpdateConnectionSvg();}
      if(!connectionRaf)connectionRaf=requestAnimationFrame(()=>{connectionRaf=0;lastConnectionDraw=performance.now();baseUpdateConnectionSvg();});
    };
  }

  const baseCleanState=cleanState;
  cleanState=function(){ensureSettings();return{...baseCleanState(),planSettings:{...state.planSettings}};};
  const baseSave=save;
  save=function(sync=true){
    ensureSettings();const newImported=(state.events||[]).filter(e=>!knownEventIds.has(e.id)&&isImported(e));
    if(newImported.length&&state.planSettings.monthChunks&&state.planSettings.autoArrangeImports)applyMonthLayout();
    knownEventIds=new Set((state.events||[]).map(e=>e.id));invalidateCaches();return baseSave(sync);
  };

  const legacyFullRender=render, baseSetView=setView;
  function renderActive(force=false){
    const now=performance.now();if(!force&&renderStamp.view===view&&now-renderStamp.at<24)return;renderStamp={view,at:now};
    if(view==='home')home();else if(view==='plan')plan();else if(view==='events')events();else if(view==='board')statusBoard();else if(view==='calendar')calendar();else if(view==='venues')venues();else if(view==='budget')budget();
    else if(view==='boards'){baseSetView('boards',false);return;}else if(view==='contacts'){legacyFullRender();return;}else legacyFullRender();
    if(typeof presenceUI==='function')presenceUI();if(typeof accountUI==='function')accountUI();
  }
  render=function(){renderActive(true);};
  setView=function(v,announce=true){const old=view;baseSetView(v,announce);if(v==='boards')return;if(old!==view||!q(`#${view}View`)?.children.length)renderActive(false);};

  function settingsMarkup(){const s=ensureSettings();return `<section id="v20PlanSettings" class="v13-setting-section v20-plan-settings"><div class="v13-setting-heading"><div><span class="v13-setting-icon">▦</span><span><h3>Plan organization</h3><p>Month groups and large-calendar performance.</p></span></div></div><label class="v20-setting-row"><span><strong>Month chunks</strong><small>Draw a labeled box around events that happen in the same month.</small></span><input type="checkbox" id="v20MonthChunks" ${s.monthChunks?'checked':''}></label><label class="v20-setting-row"><span><strong>Auto-sort calendar imports</strong><small>After importing ICS, JSON or PDF calendars, place events into their month chunks once.</small></span><input type="checkbox" id="v20AutoArrange" ${s.autoArrangeImports?'checked':''}></label><label class="field"><span>Events shown in chunks</span><select id="v20ChunkScope"><option value="all" ${s.chunkScope==='all'?'selected':''}>All dated events</option><option value="imported" ${s.chunkScope==='imported'?'selected':''}>Imported calendar events only</option></select></label><label class="v20-setting-row"><span><strong>Large-calendar optimization</strong><small>Cache event filters/conflicts, render only the open page, and throttle connection routes while dragging.</small></span><input type="checkbox" id="v20PerfToggle" ${s.largeBoardOptimizations?'checked':''}></label><div class="v20-settings-actions"><button type="button" class="button secondary" id="v20SortPlanNow">Re-sort Plan now</button><span>${state.events?.length||0} events on this board</span></div></section>`;}
  function injectSettings(){const body=q('#v13SettingsBody');if(!body||q('#v20PlanSettings',body))return;const wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();body.appendChild(wrap.firstElementChild);}

  document.addEventListener('change',e=>{
    ensureSettings();
    if(e.target.id==='v20MonthChunks'){state.planSettings.monthChunks=e.target.checked;save();if(view==='plan')plan();}
    else if(e.target.id==='v20AutoArrange'){state.planSettings.autoArrangeImports=e.target.checked;save();}
    else if(e.target.id==='v20ChunkScope'){state.planSettings.chunkScope=e.target.value==='imported'?'imported':'all';save();if(view==='plan')plan();}
    else if(e.target.id==='v20PerfToggle'){state.planSettings.largeBoardOptimizations=e.target.checked;invalidateCaches();save();}
  },true);
  document.addEventListener('click',e=>{
    if(e.target.closest('#settingsButton'))queueMicrotask(injectSettings);
    if(e.target.closest('#v20SortPlanNow')){if(!ensureSettings().monthChunks)return toast('Enable Month chunks first');if(applyMonthLayout()){save();if(view==='plan')plan();toast('Plan sorted into month chunks');}}
  },true);

  const settingsRoot=q('#v13SettingsBody');if(settingsRoot)new MutationObserver(injectSettings).observe(settingsRoot,{childList:true});
  ensureSettings();injectSettings();window.MSC_V20={applyMonthLayout,drawChunks,invalidateCaches};
})();
