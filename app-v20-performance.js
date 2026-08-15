/* MSC v20: large-calendar performance + month chunks */
(() => {
  'use strict';

  const V20 = window.MSC_V20 = window.MSC_V20 || {};
  const $q = (s, r = document) => r.querySelector(s);
  const $qa = (s, r = document) => [...r.querySelectorAll(s)];
  const BASE_WORLD = { width: 4600, height: 3200 };
  const CARD_W = 360;
  const CARD_H = 178;
  const PERF_KEY = 'mscLargeBoardPerformanceV20';
  const DEFAULT_PLAN_SETTINGS = {
    monthChunksEnabled: true,
    autoArrangeImports: true,
    chunkCardsPerRow: 3
  };

  let visibleMemoKey = '';
  let visibleMemoValue = [];
  let issueMemoKey = '';
  let issueMemo = new Map();
  let connectionTimer = 0;
  let lastConnectionPaint = 0;
  let settingsObserver = null;
  let settingsQueued = false;

  function ensurePlanSettings() {
    state.planSettings = state.planSettings && typeof state.planSettings === 'object' ? state.planSettings : {};
    for (const [k, v] of Object.entries(DEFAULT_PLAN_SETTINGS)) {
      if (state.planSettings[k] === undefined) state.planSettings[k] = v;
    }
    state.planSettings.chunkCardsPerRow = clamp(Number(state.planSettings.chunkCardsPerRow) || 3, 2, 5);
    return state.planSettings;
  }

  function perfPreference() {
    const value = localStorage.getItem(PERF_KEY) || 'auto';
    return ['auto', 'always', 'off'].includes(value) ? value : 'auto';
  }

  function perfActive() {
    const p = perfPreference();
    return p === 'always' || (p === 'auto' && (state.events?.length || 0) >= 20);
  }

  function syncPerfClass() {
    document.body?.classList.toggle('v20-large-board', perfActive());
    if (document.body) document.body.dataset.eventCount = String(state.events?.length || 0);
  }

  function cacheKey() {
    return `${state.version || 0}|${state.events?.length || 0}|${search || ''}`;
  }

  const originalVisible = typeof visible === 'function' ? visible : null;
  if (originalVisible) {
    visible = function() {
      const key = cacheKey();
      if (key === visibleMemoKey) return visibleMemoValue;
      visibleMemoKey = key;
      visibleMemoValue = originalVisible();
      return visibleMemoValue;
    };
  }

  function rebuildIssues() {
    const key = `${state.version || 0}|${state.events?.length || 0}`;
    if (key === issueMemoKey) return;
    issueMemoKey = key;
    issueMemo = new Map();
    const conflictIds = new Set();
    const venues = new Map();

    for (const e of state.events || []) {
      if (!e.venue || !e.start) continue;
      const k = String(e.venue).trim().toLowerCase();
      if (!k) continue;
      const start = +new Date(e.start);
      if (!Number.isFinite(start)) continue;
      const end = +new Date(e.end || e.start);
      const item = { id: e.id, start, end: Number.isFinite(end) ? Math.max(start, end) : start };
      (venues.get(k) || venues.set(k, []).get(k)).push(item);
    }

    for (const list of venues.values()) {
      list.sort((a, b) => a.start - b.start || a.end - b.end);
      const active = [];
      for (const current of list) {
        for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= current.start) active.splice(i, 1);
        if (active.length) {
          conflictIds.add(current.id);
          active.forEach(a => conflictIds.add(a.id));
        }
        active.push(current);
      }
    }

    const today = new Date(new Date().toDateString());
    for (const e of state.events || []) {
      const out = [];
      if (e.deadline && e.status !== 'Completed' && new Date(e.deadline) < today) out.push('Deadline passed');
      if (e.approvalRequired && e.approvalStatus !== 'Approved') out.push(`Approval: ${e.approvalStatus}`);
      if (+e.budgetActual > +e.budgetPlanned && +e.budgetPlanned) out.push('Over budget');
      if (conflictIds.has(e.id)) out.push('Venue conflict');
      issueMemo.set(e.id, out);
    }
  }

  if (typeof issues === 'function') {
    issues = function(e) {
      rebuildIssues();
      return issueMemo.get(e.id) || [];
    };
  }

  function importedEvent(e) {
    const source = String(e?.source || '').toLowerCase();
    return source === 'imported' || source === 'pdf' || source === 'ics' || source === 'ical' || source === 'calendar';
  }

  function monthInfo(e) {
    if (!e?.start) return { key: 'unscheduled', label: 'Unscheduled', order: Number.MAX_SAFE_INTEGER };
    const d = new Date(e.start);
    if (Number.isNaN(+d)) return { key: 'unscheduled', label: 'Unscheduled', order: Number.MAX_SAFE_INTEGER };
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      order: d.getFullYear() * 12 + d.getMonth()
    };
  }

  function importedGroups() {
    const groups = new Map();
    for (const e of state.events || []) {
      if (!importedEvent(e)) continue;
      const info = monthInfo(e);
      if (!groups.has(info.key)) groups.set(info.key, { ...info, events: [] });
      groups.get(info.key).events.push(e);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }

  function expandWorldToEvents(extraY = 0) {
    let maxX = BASE_WORLD.width - 500;
    let maxY = BASE_WORLD.height - 420;
    for (const e of state.events || []) {
      maxX = Math.max(maxX, (+e.position?.x || 0) + CARD_W);
      maxY = Math.max(maxY, (+e.position?.y || 0) + CARD_H);
    }
    WORLD.width = Math.max(BASE_WORLD.width, Math.ceil((maxX + 520) / 200) * 200);
    WORLD.height = Math.max(BASE_WORLD.height, Math.ceil((maxY + 480 + extraY) / 200) * 200);
  }

  function arrangeImportedByMonth({ persist = true, notify = true } = {}) {
    const settings = ensurePlanSettings();
    const groups = importedGroups();
    if (!groups.length) {
      if (notify) toast('No imported calendar events to arrange');
      return false;
    }

    const cols = settings.chunkCardsPerRow;
    const cardGapX = 28;
    const cardGapY = 28;
    const paddingX = 34;
    const paddingBottom = 34;
    const headerH = 62;
    const chunkW = paddingX * 2 + cols * CARD_W + (cols - 1) * cardGapX;
    const chunkGapX = 64;
    const chunkGapY = 70;
    const left = 130;
    const top = 145;
    const rightLimit = Math.max(BASE_WORLD.width, WORLD.width) - 130;

    let x = left;
    let y = top;
    let rowH = 0;
    let maxBottom = top;

    for (const group of groups) {
      group.events.sort((a, b) => (+new Date(a.start || 0) - +new Date(b.start || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
      const rows = Math.max(1, Math.ceil(group.events.length / cols));
      const chunkH = headerH + rows * CARD_H + Math.max(0, rows - 1) * cardGapY + paddingBottom;
      if (x !== left && x + chunkW > rightLimit) {
        x = left;
        y += rowH + chunkGapY;
        rowH = 0;
      }

      group.events.forEach((e, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        e.position = {
          x: x + paddingX + col * (CARD_W + cardGapX),
          y: y + headerH + row * (CARD_H + cardGapY)
        };
        e.planMonthChunk = group.key;
      });

      rowH = Math.max(rowH, chunkH);
      maxBottom = Math.max(maxBottom, y + chunkH);
      x += chunkW + chunkGapX;
    }

    WORLD.height = Math.max(BASE_WORLD.height, Math.ceil((maxBottom + 320) / 200) * 200);
    expandWorldToEvents();
    if (persist) save(true);
    if (view === 'plan' && persist) plan();
    if (notify) toast(`${groups.length} month chunk${groups.length === 1 ? '' : 's'} arranged`);
    return true;
  }
  V20.arrangeImportedByMonth = arrangeImportedByMonth;

  function monthChunkMarkup() {
    const settings = ensurePlanSettings();
    if (!settings.monthChunksEnabled) return '';
    const groups = importedGroups();
    if (!groups.length) return '';
    return groups.map(group => {
      const placed = group.events.filter(e => Number.isFinite(+e.position?.x) && Number.isFinite(+e.position?.y));
      if (!placed.length) return '';
      const minX = Math.min(...placed.map(e => +e.position.x));
      const minY = Math.min(...placed.map(e => +e.position.y));
      const maxX = Math.max(...placed.map(e => +e.position.x + CARD_W));
      const maxY = Math.max(...placed.map(e => +e.position.y + CARD_H));
      const x = Math.max(18, minX - 30);
      const y = Math.max(18, minY - 62);
      const w = maxX - minX + 60;
      const h = maxY - minY + 92;
      return `<section class="v20-month-chunk" data-v20-month-chunk="${esc(group.key)}" style="--chunk-x:${x}px;--chunk-y:${y}px;--chunk-w:${w}px;--chunk-h:${h}px"><div class="v20-month-chunk-title"><strong>${esc(group.label)}</strong><span>${group.events.length} event${group.events.length === 1 ? '' : 's'}</span></div></section>`;
    }).join('');
  }

  function renderMonthChunks() {
    const world = $q('#plannerWorld');
    if (!world) return;
    world.querySelector('.v20-month-chunk-layer')?.remove();
    const html = monthChunkMarkup();
    if (!html) return;
    const layer = document.createElement('div');
    layer.className = 'v20-month-chunk-layer';
    layer.innerHTML = html;
    world.insertBefore(layer, world.firstChild);
  }

  const rawPlan = typeof plan === 'function' ? plan : null;
  if (rawPlan) {
    plan = function(...args) {
      if (view !== 'plan') return;
      ensurePlanSettings();
      expandWorldToEvents();
      syncPerfClass();
      const result = rawPlan(...args);
      requestAnimationFrame(renderMonthChunks);
      return result;
    };
  }

  const fastCalendar = function() {
    if (view !== 'calendar') return;
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1), start = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const byDay = Array.from({ length: days + 1 }, () => []);
    for (const e of visible()) {
      if (!e.start) continue;
      const d = new Date(e.start);
      if (d.getFullYear() === y && d.getMonth() === m) byDay[d.getDate()].push(e);
    }
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(0);
    for (let d = 1; d <= days; d++) cells.push(d);
    $q('#calendarView').innerHTML = `<div class="calendar-shell"><div class="panel"><div class="panel-header"><div><h2>${now.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><p>Current month · ${visible().length} total events</p></div></div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="cal-head">${x}</div>`).join('')}${cells.map(d=>d?`<div class="cal-day"><span class="cal-num">${d}</span>${byDay[d].map(e=>`<button class="cal-event" data-open-event="${e.id}">${esc(e.name)}</button>`).join('')}</div>`:`<div class="cal-day"></div>`).join('')}</div></div></div>`;
  };

  const fastStatusBoard = function() {
    if (view !== 'board') return;
    const groups = new Map(STATUSES.map(s => [s, []]));
    for (const e of visible()) (groups.get(e.status) || groups.get(STATUSES[0])).push(e);
    $q('#boardView').innerHTML = `<div class="board-grid">${STATUSES.map(s=>`<section class="board-col" data-status-drop="${s}"><div class="board-col-head">${s} · ${groups.get(s).length}</div><div class="board-col-body">${groups.get(s).map(e=>`<article class="board-card" draggable="true" data-board-drag="${e.id}" data-open-event="${e.id}"><strong>${esc(e.name)}</strong><small>${fmtDate(e.start)} · ${esc(e.lead||'Unassigned')}</small><div class="board-card-meta">${approvalLabel(e.approvalStatus)}<span style="color:#666;font-size:.62rem">${esc(e.venue||'')}</span></div></article>`).join('')}</div></section>`).join('')}</div>`;
  };

  const rawHome = typeof home === 'function' ? home : null;
  const rawEvents = typeof events === 'function' ? events : null;
  const rawVenues = typeof venues === 'function' ? venues : null;
  const rawBudget = typeof budget === 'function' ? budget : null;
  if (rawHome) home = (...args) => view === 'home' ? rawHome(...args) : undefined;
  if (rawEvents) events = (...args) => view === 'events' ? rawEvents(...args) : undefined;
  calendar = fastCalendar;
  statusBoard = fastStatusBoard;
  if (rawVenues) venues = (...args) => view === 'venues' ? rawVenues(...args) : undefined;
  if (rawBudget) budget = (...args) => view === 'budget' ? rawBudget(...args) : undefined;

  const legacyWrappedRender = typeof render === 'function' ? render : null;
  if (legacyWrappedRender) {
    render = function() {
      syncPerfClass();
      if (view === 'boards' || view === 'contacts') return legacyWrappedRender();
      if (view === 'home') home();
      else if (view === 'plan') plan();
      else if (view === 'events') events();
      else if (view === 'board') statusBoard();
      else if (view === 'calendar') calendar();
      else if (view === 'venues') venues();
      else if (view === 'budget') budget();
      presenceUI?.();
      accountUI?.();
    };
  }

  const previousSetView = typeof setView === 'function' ? setView : null;
  if (previousSetView) {
    setView = function(v, announce = true) {
      const before = view;
      previousSetView(v, announce);
      if (v === before) return;
      if (v === 'home') home();
      else if (v === 'plan') plan();
      else if (v === 'events') events();
      else if (v === 'board') statusBoard();
      else if (v === 'calendar') calendar();
      else if (v === 'venues') venues();
      else if (v === 'budget') budget();
      else if (v === 'contacts') render();
    };
  }

  const rawUpdateConnections = typeof updateConnectionSvg === 'function' ? updateConnectionSvg : null;
  if (rawUpdateConnections) {
    updateConnectionSvg = function(force = false) {
      if (!perfActive() || force) {
        lastConnectionPaint = performance.now();
        return rawUpdateConnections();
      }
      const now = performance.now();
      const interval = (state.events?.length || 0) >= 100 ? 80 : 48;
      const wait = interval - (now - lastConnectionPaint);
      if (wait <= 0) {
        lastConnectionPaint = now;
        return rawUpdateConnections();
      }
      if (connectionTimer) return;
      connectionTimer = setTimeout(() => {
        connectionTimer = 0;
        lastConnectionPaint = performance.now();
        rawUpdateConnections();
      }, wait);
    };
  }

  const rawEndBlockDrag = typeof endBlockDrag === 'function' ? endBlockDrag : null;
  if (rawEndBlockDrag) {
    endBlockDrag = function(...args) {
      const result = rawEndBlockDrag(...args);
      updateConnectionSvg?.(true);
      requestAnimationFrame(renderMonthChunks);
      return result;
    };
  }

  const previousCleanState = typeof cleanState === 'function' ? cleanState : null;
  if (previousCleanState) {
    cleanState = function() {
      ensurePlanSettings();
      return { ...previousCleanState(), planSettings: { ...state.planSettings } };
    };
  }

  function installImportHandler() {
    const button = $q('#confirmImportButton');
    if (!button || button.dataset.v20Import === '1') return;
    button.dataset.v20Import = '1';
    button.onclick = e => {
      e.preventDefault();
      const add = $qa('[data-import-index]:checked').map(x => imports[+x.dataset.importIndex]).filter(Boolean);
      if (!add.length) return toast('Choose at least one event to import');
      state.events.push(...add);
      const settings = ensurePlanSettings();
      if (settings.autoArrangeImports) arrangeImportedByMonth({ persist: false, notify: false });
      save(true);
      render();
      setView(view, false);
      $q('#importModal')?.classList.remove('open');
      toast(`${add.length} event${add.length === 1 ? '' : 's'} imported${settings.autoArrangeImports ? ' · sorted by month' : ''}`);
    };
  }

  function settingsMarkup() {
    const s = ensurePlanSettings();
    const perf = perfPreference();
    return `<section id="v20PlanSettings" class="v13-setting-section v20-plan-settings">
      <div class="v13-setting-heading"><div><span class="v13-setting-icon">▦</span><span><h3>Large calendars & Plan</h3><p>Month grouping and performance controls for large schedules.</p></span></div></div>
      <div class="v20-settings-grid">
        <label class="v20-setting-row"><span><strong>Large-board optimization</strong><small>Reduces hidden rendering and connection redraw work.</small></span><select id="v20PerfMode"><option value="auto" ${perf==='auto'?'selected':''}>Auto · 20+ events</option><option value="always" ${perf==='always'?'selected':''}>Always on</option><option value="off" ${perf==='off'?'selected':''}>Off</option></select></label>
        <label class="v20-setting-row"><span><strong>Month chunk boxes</strong><small>Visually group imported calendar events by month.</small></span><input id="v20MonthChunks" type="checkbox" ${s.monthChunksEnabled?'checked':''}></label>
        <label class="v20-setting-row"><span><strong>Auto-sort calendar imports</strong><small>Place imported events into month chunks immediately.</small></span><input id="v20AutoArrange" type="checkbox" ${s.autoArrangeImports?'checked':''}></label>
        <label class="v20-setting-row"><span><strong>Events per chunk row</strong><small>Controls how compact each month is on Plan.</small></span><select id="v20ChunkCols">${[2,3,4,5].map(n=>`<option value="${n}" ${s.chunkCardsPerRow===n?'selected':''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="v20-settings-actions"><span>${state.events?.length || 0} events on this board</span><button type="button" class="button secondary" id="v20ResortMonths">Re-sort imported events</button></div>
    </section>`;
  }

  function renderSettingsSection() {
    const body = $q('#v13SettingsBody');
    if (!body) return;
    const s = ensurePlanSettings();
    const sig = JSON.stringify({perf:perfPreference(),chunks:s.monthChunksEnabled,auto:s.autoArrangeImports,cols:s.chunkCardsPerRow,count:state.events?.length||0});
    const old = $q('#v20PlanSettings', body);
    if (old?.dataset.v20Sig === sig) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = settingsMarkup();
    const fresh = wrap.firstElementChild;
    fresh.dataset.v20Sig = sig;
    if (old) old.replaceWith(fresh); else body.appendChild(fresh);
  }

  function queueSettings() {
    if (settingsQueued) return;
    settingsQueued = true;
    queueMicrotask(() => { settingsQueued = false; renderSettingsSection(); });
  }

  document.addEventListener('change', e => {
    ensurePlanSettings();
    if (e.target.id === 'v20PerfMode') {
      localStorage.setItem(PERF_KEY, e.target.value);
      syncPerfClass();
      toast('Performance setting updated');
    } else if (e.target.id === 'v20MonthChunks') {
      state.planSettings.monthChunksEnabled = e.target.checked;
      save(true);
      if (view === 'plan') plan();
    } else if (e.target.id === 'v20AutoArrange') {
      state.planSettings.autoArrangeImports = e.target.checked;
      save(true);
    } else if (e.target.id === 'v20ChunkCols') {
      state.planSettings.chunkCardsPerRow = clamp(Number(e.target.value) || 3, 2, 5);
      save(true);
    }
  }, true);

  document.addEventListener('click', e => {
    if (e.target.closest('#v20ResortMonths')) {
      e.preventDefault();
      arrangeImportedByMonth();
      renderSettingsSection();
    }
  }, true);

  function patchNodeEditor() {
    $qa('.connection-popover').forEach(el => el.remove());
    const bar = $q('.v9-node-toolbar');
    if (!bar) return;
    const row = $q('.v9-node-toolbar-row', bar);
    if (row) row.classList.add('v20-node-toolbar-row');
    if (row && !$q('[data-v20-node-auto]', row)) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v20NodeAuto = '1'; b.textContent = 'Auto route';
      const reverse = $q('[data-v9-node-reverse]', row);
      row.insertBefore(b, reverse || null);
    }
    const hint = $q('.v9-node-toolbar-head small', bar);
    if (hint) hint.textContent = 'Drag the node to route · Auto route resets placement';
  }
  document.addEventListener('click', e => {
    const auto = e.target.closest?.('[data-v20-node-auto]');
    if (!auto) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const bar = auto.closest('[data-connection-toolbar]');
    const c = state.connections?.find(x => x.id === bar?.dataset.connectionToolbar);
    if (!c) return;
    c.nodeMode = 'auto'; delete c.node; save(true); updateConnectionSvg?.(true);
    bar.remove(); toast('Connection routing reset');
  }, true);
  const nodeObserver = new MutationObserver(() => queueMicrotask(patchNodeEditor));
  nodeObserver.observe(document.body, { childList: true, subtree: true });
  patchNodeEditor();

  const settingsRoot = $q('#v13Settings');
  if (settingsRoot) {
    settingsObserver = new MutationObserver(queueSettings);
    settingsObserver.observe(settingsRoot, { childList: true, subtree: true });
  }

  ensurePlanSettings();
  expandWorldToEvents();
  syncPerfClass();
  installImportHandler();
  renderSettingsSection();
  if (view === 'plan') requestAnimationFrame(renderMonthChunks);
})();
