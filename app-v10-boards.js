/* MSC v10 boards workspace: board library, autosave history, remembered collaboration */
(() => {
  'use strict';

  const V10 = window.MSC_V10 = window.MSC_V10 || {};
  const RECENTS_KEY = 'mscBoardRecentsV10';
  const OWNER_KEY_PREFIX = 'mscBoardOwnerKey:';
  const VERSION_TIME_PREFIX = 'mscBoardVersionAt:';
  const PERSIST_ENDPOINT = `${SB_URL}/functions/v1/persistent-board`;

  let cloudBoards = [];
  let libraryLoading = false;
  let historyBoardId = '';
  let checkpointTimer = 0;
  let autoUpgradeTimer = 0;

  meta.boards = ['Boards', 'Create, reopen and recover complete MSC workspaces.'];

  function ensureBoardsDom() {
    if (!document.querySelector('[data-view="boards"]')) {
      const nav = document.querySelector('.nav-list');
      const first = nav?.querySelector('[data-view="home"]');
      const b = document.createElement('button');
      b.className = 'nav-item';
      b.dataset.view = 'boards';
      b.innerHTML = '<span>▦</span><b>Boards</b>';
      if (first) first.insertAdjacentElement('afterend', b);
      else nav?.appendChild(b);
    }
    if (!document.getElementById('boardsView')) {
      const section = document.createElement('section');
      section.id = 'boardsView';
      section.className = 'view boards-view';
      document.querySelector('.main-shell')?.appendChild(section);
    }
    if (!document.getElementById('boardCreateModal')) {
      const modal = document.createElement('div');
      modal.id = 'boardCreateModal';
      modal.className = 'modal';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `<div class="modal-backdrop" data-close-board-create></div>
        <section class="modal-card board-create-card" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div><div class="eyebrow">New workspace</div><h2>Create board</h2><p>Events, plans, venues, contacts and history stay together.</p></div>
            <button class="icon-button" data-close-board-create>×</button>
          </div>
          <form id="boardCreateForm" class="board-create-form">
            <label class="field"><span>Board name</span><input name="title" maxlength="100" required placeholder="e.g. Semester 1 MSC Plan" autocomplete="off"></label>
            <div class="board-create-note"><span>↻</span><div><strong>Autosave + version history</strong><small>This board will be saved online automatically. Anyone you share it with can collaborate from the same board.</small></div></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-close-board-create>Cancel</button><button class="button primary" type="submit">Create board</button></div>
          </form>
        </section>`;
      document.body.appendChild(modal);
    }
    if (!document.getElementById('boardHistoryModal')) {
      const modal = document.createElement('div');
      modal.id = 'boardHistoryModal';
      modal.className = 'modal';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `<div class="modal-backdrop" data-close-board-history></div>
        <section class="modal-card board-history-card" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div><div class="eyebrow">Recovery</div><h2 id="boardHistoryTitle">Version history</h2><p>Autosave checkpoints for this board.</p></div>
            <button class="icon-button" data-close-board-history>×</button>
          </div>
          <div class="board-history-toolbar"><span id="boardHistorySummary">Loading…</span><button type="button" class="button secondary" id="saveBoardVersionNow">Save version now</button></div>
          <div id="boardHistoryList" class="board-history-list"></div>
        </section>`;
      document.body.appendChild(modal);
    }
  }

  function modalState(id, open) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('open', open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function loadRecents() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
      return Array.isArray(value) ? value.filter(x => x?.boardId) : [];
    } catch { return []; }
  }
  function storeRecents(items) {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, 60))); } catch {}
  }
  function rememberLocalBoard(boardId, title = '', extra = {}) {
    if (!boardId) return;
    const list = loadRecents().filter(x => x.boardId !== boardId);
    list.unshift({
      boardId,
      title: String(title || state?.boardTitle || 'Shared board').slice(0, 100),
      lastOpenedAt: new Date().toISOString(),
      updatedAt: extra.updatedAt || new Date().toISOString(),
      eventCount: Number.isFinite(extra.eventCount) ? extra.eventCount : (boardId === room ? (state.events?.length || 0) : 0),
      localOnly: true,
      ...extra
    });
    storeRecents(list);
  }
  function forgetLocalBoard(boardId) {
    storeRecents(loadRecents().filter(x => x.boardId !== boardId));
  }
  function ownerKey(boardId) { return localStorage.getItem(OWNER_KEY_PREFIX + boardId) || ''; }
  function setOwnerKey(boardId, key) { if (key) localStorage.setItem(OWNER_KEY_PREFIX + boardId, key); }
  function clearOwnerKey(boardId) { localStorage.removeItem(OWNER_KEY_PREFIX + boardId); }

  async function accessToken() {
    if (!supabase) return '';
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || '';
    } catch { return ''; }
  }

  async function persistentRequest(method, boardId, body = null, query = '') {
    const headers = { 'Content-Type': 'application/json' };
    const token = await accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const opts = { method, headers, cache: 'no-store' };
    if (body !== null) opts.body = JSON.stringify({ boardId, ...body });
    const url = `${PERSIST_ENDPOINT}?board=${encodeURIComponent(boardId)}${query}`;
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `Board request failed (${res.status})`);
    return data;
  }

  async function libraryInvoke(body = null) {
    if (!supabase || !authUser) throw new Error('Sign in required');
    const args = body ? { body } : undefined;
    const { data, error } = await supabase.functions.invoke('board-library', args);
    if (error) throw error;
    return data;
  }

  async function loadLibrary() {
    if (!authUser || libraryLoading) {
      if (!authUser) { cloudBoards = []; renderBoards(); }
      return;
    }
    libraryLoading = true;
    renderBoards();
    try {
      const data = await libraryInvoke({ action: 'list' });
      cloudBoards = Array.isArray(data?.boards) ? data.boards : [];
    } catch (err) {
      console.warn('Board library unavailable', err);
    } finally {
      libraryLoading = false;
      renderBoards();
    }
  }

  async function rememberCurrentInAccount() {
    if (!room || !authUser || !supabase) return;
    try {
      await libraryInvoke({ action: 'remember', boardId: room });
      await loadLibrary();
    } catch (err) {
      if (!String(err?.message || '').includes('board_not_found')) console.warn('Could not remember board in account', err);
    }
  }

  function mergedBoards() {
    const map = new Map();
    for (const x of loadRecents()) map.set(x.boardId, { ...x, source: 'local' });
    for (const x of cloudBoards) map.set(x.boardId, { ...(map.get(x.boardId) || {}), ...x, source: 'account', localOnly: false });
    if (room) {
      map.set(room, {
        ...(map.get(room) || {}),
        boardId: room,
        title: state.boardTitle || map.get(room)?.title || 'Current board',
        updatedAt: new Date().toISOString(),
        eventCount: state.events?.length || 0,
        role: map.get(room)?.role || (ownerKey(room) ? 'owner' : 'editor'),
        owner: map.get(room)?.owner || !!ownerKey(room),
        current: true
      });
    }
    return [...map.values()].sort((a, b) => {
      if (a.boardId === room) return -1;
      if (b.boardId === room) return 1;
      return +new Date(b.lastOpenedAt || b.updatedAt || 0) - +new Date(a.lastOpenedAt || a.updatedAt || 0);
    });
  }

  function relativeTime(value) {
    if (!value) return 'Not opened recently';
    const ms = Date.now() - +new Date(value);
    if (!Number.isFinite(ms)) return 'Recently';
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 30) return `${day}d ago`;
    return new Date(value).toLocaleDateString();
  }

  function boardCard(b) {
    const current = b.boardId === room;
    const role = b.owner || b.role === 'owner' ? 'Owner' : (b.source === 'account' ? 'Editor' : (ownerKey(b.boardId) ? 'Owner on this browser' : 'Saved shortcut'));
    const count = Number(b.eventCount || 0);
    const canCloudDelete = !!(b.owner || b.role === 'owner' || ownerKey(b.boardId));
    return `<article class="board-card ${current ? 'current' : ''}" data-board-card="${esc(b.boardId)}">
      <div class="board-card-top">
        <span class="board-icon">▦</span>
        <div class="board-title-wrap"><strong>${esc(b.title || 'Untitled board')}</strong><small>${current ? 'Open now' : `Opened ${relativeTime(b.lastOpenedAt || b.updatedAt)}`}</small></div>
        ${current ? '<span class="board-current-badge">Current</span>' : ''}
      </div>
      <div class="board-card-stats"><span><b>${count}</b> event${count === 1 ? '' : 's'}</span><span>${esc(role)}</span><span>↻ Autosave</span></div>
      <div class="board-card-actions">
        <button class="button primary compact" data-board-open="${esc(b.boardId)}">${current ? 'Open plan' : 'Open'}</button>
        <button class="button secondary compact" data-board-history="${esc(b.boardId)}">History</button>
        <button class="button secondary compact" data-board-rename="${esc(b.boardId)}">Rename</button>
        <button class="button secondary compact danger-soft" data-board-delete="${esc(b.boardId)}" data-cloud-delete="${canCloudDelete ? '1' : '0'}">${canCloudDelete ? 'Delete' : 'Remove'}</button>
      </div>
    </article>`;
  }

  function renderBoards() {
    ensureBoardsDom();
    const root = document.getElementById('boardsView');
    if (!root) return;
    const items = mergedBoards();
    root.innerHTML = `<div class="boards-shell">
      <div class="boards-hero">
        <div><div class="eyebrow">Workspaces</div><h2>Your boards</h2><p>Each board keeps its full plan, calendar, venues, contacts, connections and recovery history together.</p></div>
        <button class="button primary boards-new-button" id="createBoardButton">＋ New board</button>
      </div>
      <div class="boards-info-strip">
        <span><b>↻ Autosave</b><small>Edits save continuously.</small></span>
        <span><b>◷ Version history</b><small>Recover earlier checkpoints.</small></span>
        <span><b>◎ Remembered collaboration</b><small>${authUser ? 'Opened shared boards follow your Google account.' : 'Shared boards you open stay listed on this browser. Sign in to sync them across devices.'}</small></span>
      </div>
      ${libraryLoading ? '<div class="boards-loading"><span></span>Refreshing your boards…</div>' : ''}
      <div class="boards-grid">${items.length ? items.map(boardCard).join('') : `<button class="empty-board-create" id="emptyCreateBoard"><span>＋</span><strong>Create your first board</strong><small>Start with an empty autosaved MSC workspace.</small></button>`}</div>
    </div>`;
  }

  function emptyBoardState(title) {
    return {
      events: [],
      annualBudget: 100000,
      budgetLedger: [],
      zoom: 1,
      version: 1,
      boardTitle: title,
      persistentBoard: true,
      contacts: [],
      connections: [],
      emailSettings: { autoApprovalEmails: false },
      updatedAt: Date.now()
    };
  }

  async function createBoard(title) {
    const clean = String(title || '').trim().slice(0, 100) || 'Untitled board';
    const boardId = uid().replaceAll('-', '') + uid().replaceAll('-', '');
    const next = emptyBoardState(clean);
    let guestOwnerKey = '';
    const button = document.querySelector('#boardCreateForm button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Creating…'; }
    try {
      if (authUser && supabase) {
        await libraryInvoke({ action: 'create', boardId, title: clean, snapshot: next });
      } else {
        guestOwnerKey = uid().replaceAll('-', '') + uid().replaceAll('-', '');
        await persistentRequest('POST', boardId, { snapshot: next, title: clean, ownerKey: guestOwnerKey, checkpoint: true, label: 'Board created' });
        setOwnerKey(boardId, guestOwnerKey);
      }
      localStorage.setItem(`${STORAGE}:room:${boardId}`, JSON.stringify(next));
      rememberLocalBoard(boardId, clean, { eventCount: 0, role: 'owner', owner: true });
      modalState('boardCreateModal', false);
      const url = new URL(location.href);
      url.searchParams.set('board', boardId);
      location.assign(url.toString());
    } catch (err) {
      console.error(err);
      toast('Could not create the board');
      if (guestOwnerKey) clearOwnerKey(boardId);
    } finally {
      if (button && document.body.contains(button)) { button.disabled = false; button.textContent = 'Create board'; }
    }
  }

  async function ensureCurrentBoardAutosaves() {
    if (!room) return;
    const title = state.boardTitle || loadRecents().find(x => x.boardId === room)?.title || 'Shared board';
    state.boardTitle = title;
    rememberLocalBoard(room, title, { eventCount: state.events?.length || 0 });
    if (!state.persistentBoard) {
      state.persistentBoard = true;
      const key = ownerKey(room);
      try {
        await persistentRequest('POST', room, { snapshot: cleanState(), title, ...(key ? { ownerKey: key } : {}), checkpoint: true, label: 'Autosave enabled' });
        save(false);
      } catch (err) {
        console.warn('Could not enable persistent autosave for this board yet', err);
      }
    }
    if (authUser) rememberCurrentInAccount();
  }

  function openBoard(boardId) {
    if (!boardId) return;
    if (boardId === room) { setView('plan'); return; }
    if (room) save();
    const url = new URL(location.href);
    url.searchParams.set('board', boardId);
    location.assign(url.toString());
  }

  async function renameBoard(boardId) {
    const item = mergedBoards().find(x => x.boardId === boardId);
    const current = item?.title || (boardId === room ? state.boardTitle : '') || 'Untitled board';
    const next = prompt('Board name', current);
    if (next === null) return;
    const clean = next.trim().slice(0, 100);
    if (!clean || clean === current) return;
    try {
      if (authUser && item?.source === 'account') {
        await libraryInvoke({ action: 'rename', boardId, title: clean });
      } else {
        const data = await persistentRequest('GET', boardId);
        if (!data.found) throw new Error('Board not found');
        const snap = { ...(data.snapshot || {}), boardTitle: clean };
        await persistentRequest('POST', boardId, { snapshot: snap, title: clean });
      }
      if (boardId === room) { state.boardTitle = clean; save(); }
      const recent = loadRecents().map(x => x.boardId === boardId ? { ...x, title: clean } : x);
      storeRecents(recent);
      await loadLibrary();
      renderBoards();
      toast('Board renamed');
    } catch (err) {
      console.error(err);
      toast('Could not rename this board');
    }
  }

  async function deleteOrForgetBoard(boardId, cloudDelete) {
    const item = mergedBoards().find(x => x.boardId === boardId);
    const name = item?.title || 'this board';
    const message = cloudDelete ? `Delete “${name}” and its version history?` : `Remove “${name}” from your Boards list?`;
    if (!confirm(message)) return;
    try {
      if (cloudDelete) {
        if (authUser && (item?.owner || item?.role === 'owner')) {
          await libraryInvoke({ action: 'delete', boardId });
        } else {
          const key = ownerKey(boardId);
          if (!key) throw new Error('owner_required');
          await persistentRequest('DELETE', boardId, { ownerKey: key });
        }
        clearOwnerKey(boardId);
        localStorage.removeItem(`${STORAGE}:room:${boardId}`);
      } else if (authUser && item?.source === 'account') {
        await libraryInvoke({ action: 'forget', boardId });
      }
      forgetLocalBoard(boardId);
      if (boardId === room) {
        const url = new URL(location.href);
        url.searchParams.delete('board');
        location.assign(url.toString());
        return;
      }
      await loadLibrary();
      renderBoards();
      toast(cloudDelete ? 'Board deleted' : 'Board removed from your list');
    } catch (err) {
      console.error(err);
      toast(String(err?.message || '').includes('owner') ? 'Only the board owner can delete it' : 'Could not update this board');
    }
  }

  async function loadVersions(boardId) {
    historyBoardId = boardId;
    const item = mergedBoards().find(x => x.boardId === boardId);
    document.getElementById('boardHistoryTitle').textContent = `${item?.title || 'Board'} · history`;
    document.getElementById('boardHistoryList').innerHTML = '<div class="boards-loading"><span></span>Loading versions…</div>';
    modalState('boardHistoryModal', true);
    try {
      const data = await persistentRequest('GET', boardId, null, '&versions=1');
      const versions = Array.isArray(data.versions) ? data.versions : [];
      document.getElementById('boardHistorySummary').textContent = versions.length ? `${versions.length} saved checkpoint${versions.length === 1 ? '' : 's'}` : 'No checkpoints yet';
      document.getElementById('boardHistoryList').innerHTML = versions.length ? versions.map((v, i) => `<div class="history-row">
        <span class="history-line"><i></i></span>
        <div class="history-copy"><strong>${esc(v.label || 'Autosave')}</strong><small>${new Date(v.created_at).toLocaleString()}${i === 0 ? ' · latest' : ''}</small></div>
        <button type="button" class="button secondary compact" data-restore-version="${esc(v.id)}" data-board-id="${esc(boardId)}">Restore</button>
      </div>`).join('') : '<div class="empty-state">Version history starts as this board autosaves.</div>';
    } catch (err) {
      console.error(err);
      document.getElementById('boardHistoryList').innerHTML = '<div class="empty-state">Could not load version history.</div>';
    }
  }

  async function saveVersionNow(boardId = historyBoardId) {
    if (!boardId) return;
    try {
      let snapshot, title;
      if (boardId === room) {
        snapshot = cleanState();
        title = state.boardTitle || 'Untitled board';
      } else {
        const data = await persistentRequest('GET', boardId);
        if (!data.found) throw new Error('Board not found');
        snapshot = data.snapshot;
        title = data.title;
      }
      await persistentRequest('POST', boardId, { snapshot, title, checkpoint: true, label: 'Manual version' });
      localStorage.setItem(VERSION_TIME_PREFIX + boardId, String(Date.now()));
      toast('Version saved');
      await loadVersions(boardId);
    } catch (err) {
      console.error(err);
      toast('Could not save a version');
    }
  }

  async function restoreVersion(boardId, versionId) {
    if (!confirm('Restore this version? The current state will be saved as a recovery point first.')) return;
    try {
      const current = await persistentRequest('GET', boardId);
      if (!current.found) throw new Error('Board not found');
      await persistentRequest('POST', boardId, { snapshot: current.snapshot, title: current.title, checkpoint: true, label: 'Before restore' });
      const old = await persistentRequest('GET', boardId, null, `&version=${encodeURIComponent(versionId)}`);
      if (!old.found || !old.version?.snapshot) throw new Error('Version missing');
      const restored = { ...old.version.snapshot, persistentBoard: true, boardTitle: current.title || old.version.snapshot.boardTitle || 'Untitled board' };
      await persistentRequest('POST', boardId, { snapshot: restored, title: restored.boardTitle, checkpoint: true, label: 'Restored version' });
      modalState('boardHistoryModal', false);
      toast('Version restored');
      if (boardId === room) {
        localStorage.setItem(storageKey(), JSON.stringify(restored));
        location.reload();
      } else {
        await loadLibrary();
        renderBoards();
      }
    } catch (err) {
      console.error(err);
      toast('Could not restore that version');
    }
  }

  function scheduleCheckpoint() {
    if (!room || !state.persistentBoard || remoteApplying) return;
    clearTimeout(checkpointTimer);
    checkpointTimer = setTimeout(async () => {
      const last = +(localStorage.getItem(VERSION_TIME_PREFIX + room) || 0);
      if (Date.now() - last < 60000) return;
      try {
        await persistentRequest('POST', room, { snapshot: cleanState(), title: state.boardTitle || 'Untitled board', checkpoint: true, label: 'Autosave' });
        localStorage.setItem(VERSION_TIME_PREFIX + room, String(Date.now()));
      } catch (err) {
        console.warn('Version checkpoint failed', err);
      }
    }, 4500);
  }

  function boardContextPill() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;
    let pill = document.getElementById('boardContextPill');
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'boardContextPill';
      pill.className = 'board-context-pill';
      pill.type = 'button';
      pill.dataset.view = 'boards';
      const search = actions.querySelector('.search-box');
      if (search) search.insertAdjacentElement('beforebegin', pill);
      else actions.prepend(pill);
    }
    if (room) {
      pill.hidden = false;
      pill.innerHTML = `<span>▦</span><span><strong>${esc(state.boardTitle || 'Shared board')}</strong><small>Autosaved board</small></span>`;
    } else {
      pill.hidden = false;
      pill.innerHTML = '<span>▦</span><span><strong>Boards</strong><small>Create or open</small></span>';
    }
  }

  const baseCleanState = cleanState;
  cleanState = function() {
    return { ...baseCleanState(), boardTitle: state.boardTitle || '', persistentBoard: !!state.persistentBoard };
  };

  const baseSave = save;
  save = function(sync = true) {
    baseSave(sync);
    if (room) {
      rememberLocalBoard(room, state.boardTitle || 'Shared board', { eventCount: state.events?.length || 0 });
      scheduleCheckpoint();
    }
    boardContextPill();
  };

  const baseRender = render;
  render = function() {
    baseRender();
    renderBoards();
    boardContextPill();
  };

  const baseSetView = setView;
  setView = function(v, announce = true) {
    if (v === 'boards') {
      view = 'boards';
      $$('.nav-item[data-view],.brand[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === v));
      $$('.view').forEach(x => x.classList.toggle('active', x.id === 'boardsView'));
      $('#viewTitle').textContent = meta.boards[0];
      $('#viewSubtitle').textContent = meta.boards[1];
      renderBoards();
      if (announce) updatePresence({ view: 'boards' });
      drawRemoteCursors();
      presenceUI();
      return;
    }
    baseSetView(v, announce);
  };

  async function refreshCurrentFromServer() {
    if (!room) return;
    try {
      const data = await persistentRequest('GET', room);
      if (data.found && data.snapshot) {
        const remote = { ...data.snapshot, persistentBoard: true, boardTitle: data.title || data.snapshot.boardTitle || state.boardTitle };
        const localUpdated = +(state.updatedAt || 0), remoteUpdated = +(remote.updatedAt || 0);
        if (!state.events?.length || remoteUpdated > localUpdated) {
          remoteApplying = true;
          state = { ...state, ...remote };
          normalize();
          zoom = state.zoom || zoom;
          localStorage.setItem(storageKey(), JSON.stringify(state));
          render();
          setView(view, false);
          remoteApplying = false;
        }
        rememberLocalBoard(room, state.boardTitle || data.title || 'Shared board', { updatedAt: data.updatedAt || new Date().toISOString(), eventCount: state.events?.length || 0 });
      }
    } catch (err) {
      console.warn('Could not refresh persistent board state', err);
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#createBoardButton, #emptyCreateBoard')) { modalState('boardCreateModal', true); setTimeout(() => document.querySelector('#boardCreateForm input[name="title"]')?.focus(), 30); return; }
    if (event.target.closest('[data-close-board-create]')) { modalState('boardCreateModal', false); return; }
    if (event.target.closest('[data-close-board-history]')) { modalState('boardHistoryModal', false); return; }

    const open = event.target.closest('[data-board-open]');
    if (open) { openBoard(open.dataset.boardOpen); return; }
    const history = event.target.closest('[data-board-history]');
    if (history) { loadVersions(history.dataset.boardHistory); return; }
    const rename = event.target.closest('[data-board-rename]');
    if (rename) { renameBoard(rename.dataset.boardRename); return; }
    const remove = event.target.closest('[data-board-delete]');
    if (remove) { deleteOrForgetBoard(remove.dataset.boardDelete, remove.dataset.cloudDelete === '1'); return; }
    const restore = event.target.closest('[data-restore-version]');
    if (restore) { restoreVersion(restore.dataset.boardId, restore.dataset.restoreVersion); return; }
    if (event.target.closest('#saveBoardVersionNow')) { saveVersionNow(); return; }
  });

  document.addEventListener('submit', event => {
    if (event.target.id !== 'boardCreateForm') return;
    event.preventDefault();
    createBoard(new FormData(event.target).get('title'));
  });

  ensureBoardsDom();
  renderBoards();
  boardContextPill();
  if (room) {
    rememberLocalBoard(room, state.boardTitle || 'Shared board', { eventCount: state.events?.length || 0 });
    refreshCurrentFromServer().then(ensureCurrentBoardAutosaves);
  }
  if (authUser) loadLibrary();
  setTimeout(() => { if (authUser) loadLibrary(); if (room) rememberCurrentInAccount(); }, 1200);
  setTimeout(() => { if (room) ensureCurrentBoardAutosaves(); }, 2600);

  V10.render = renderBoards;
  V10.refresh = loadLibrary;
  V10.open = openBoard;
  V10.rememberCurrent = rememberCurrentInAccount;
})();
