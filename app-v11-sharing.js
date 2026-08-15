/* MSC v11 board sharing + rename repair */
(() => {
  'use strict';

  const RECENTS_KEY = 'mscBoardRecentsV10';
  const OWNER_KEY_PREFIX = 'mscBoardOwnerKey:';
  const PERSIST_ENDPOINT = `${SB_URL}/functions/v1/persistent-board`;

  let shareEnabled = false;
  let shareOwner = false;
  let shareRole = '';
  let shareLoading = false;
  let shareAccessDenied = false;
  let renameBoardId = '';
  let patching = false;

  function readRecents() {
    try {
      const x = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
      return Array.isArray(x) ? x : [];
    } catch { return []; }
  }
  function writeRecents(items) {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, 60))); } catch {}
  }
  function recentFor(id) { return readRecents().find(x => x.boardId === id); }
  function ownerKey(id) { return localStorage.getItem(OWNER_KEY_PREFIX + id) || ''; }
  function ensureGuestOwnerKey(id) {
    let key = ownerKey(id);
    if (!key) {
      key = uid().replaceAll('-', '') + uid().replaceAll('-', '');
      localStorage.setItem(OWNER_KEY_PREFIX + id, key);
    }
    return key;
  }
  async function token() {
    if (!supabase) return '';
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || '';
    } catch { return ''; }
  }
  async function boardRequest(method, boardId, body = null, extraQuery = '') {
    const headers = { 'Content-Type': 'application/json' };
    const accessToken = await token();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const key = ownerKey(boardId);
    if (key) headers['x-board-owner'] = key;
    const opts = { method, headers, cache: 'no-store' };
    if (body !== null) opts.body = JSON.stringify({ boardId, ...(key ? { ownerKey: key } : {}), ...body });
    const res = await fetch(`${PERSIST_ENDPOINT}?board=${encodeURIComponent(boardId)}${extraQuery}`, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data.error || `Board request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  function snapshotFor(id) {
    if (id === room) return { ...cleanState(), boardTitle: state.boardTitle || recentFor(id)?.title || 'Untitled board', persistentBoard: true };
    try {
      const raw = localStorage.getItem(`${STORAGE}:room:${id}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.events ? parsed : null;
    } catch { return null; }
  }
  async function ensureBoardOnServer(id) {
    try {
      const data = await boardRequest('GET', id);
      if (data.found) return data;
    } catch (err) {
      if (err.status === 403) throw err;
      console.warn('Board lookup before repair failed', err);
    }
    const snapshot = snapshotFor(id);
    if (!snapshot) throw new Error('board_not_found');
    if (!authUser) ensureGuestOwnerKey(id);
    const title = snapshot.boardTitle || recentFor(id)?.title || 'Untitled board';
    await boardRequest('POST', id, { snapshot: { ...snapshot, boardTitle: title, persistentBoard: true }, title, checkpoint: true, label: 'Board recovered' });
    return boardRequest('GET', id);
  }

  function modalState(id, open) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('open', open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function ensureRenameModal() {
    if (document.getElementById('boardRenameModal')) return;
    const modal = document.createElement('div');
    modal.id = 'boardRenameModal';
    modal.className = 'modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="modal-backdrop" data-close-board-rename></div>
      <section class="modal-card board-rename-card" role="dialog" aria-modal="true" aria-labelledby="boardRenameTitle">
        <div class="modal-header">
          <div><div class="eyebrow">Board</div><h2 id="boardRenameTitle">Rename board</h2><p>The new name updates everywhere, including collaborators and history.</p></div>
          <button class="icon-button" type="button" data-close-board-rename>×</button>
        </div>
        <form id="boardRenameForm" class="board-rename-form">
          <label class="field"><span>Board name</span><input name="title" maxlength="100" required autocomplete="off"></label>
          <div class="modal-actions"><button type="button" class="button secondary" data-close-board-rename>Cancel</button><button type="submit" class="button primary">Rename</button></div>
        </form>
      </section>`;
    document.body.appendChild(modal);
  }

  function patchBoardsUI() {
    if (patching) return;
    patching = true;
    try {
      const recents = new Map(readRecents().map(x => [x.boardId, x]));
      document.querySelectorAll('[data-board-card]').forEach(card => {
        const id = card.dataset.boardCard;
        const local = recents.get(id);
        const title = id === room ? (state.boardTitle || local?.title) : local?.title;
        if (title) {
          const label = card.querySelector('.board-title-wrap strong');
          if (label) label.textContent = title;
        }
      });
      document.querySelectorAll('[data-board-rename]').forEach(button => {
        button.dataset.v11BoardRename = button.dataset.boardRename;
        button.removeAttribute('data-board-rename');
      });
      const shareButton = document.getElementById('shareButton');
      if (shareButton) shareButton.innerHTML = '<span>↗</span> Share';
    } finally { patching = false; }
  }

  function rebuildShareModal() {
    const modal = document.getElementById('shareModal');
    const card = modal?.querySelector('.share-card');
    if (!modal || !card) return;
    card.innerHTML = `<div class="modal-header">
      <div><div class="eyebrow">Sharing</div><h2 id="shareModalTitle">Share board</h2><p id="shareModalSubtitle">Choose who can join this workspace.</p></div>
      <button class="icon-button" type="button" data-close-v11-share>×</button>
    </div>
    <div id="shareBoardBody"></div>`;
  }

  function shareLink() {
    if (!room) return '';
    const u = new URL(location.href);
    u.searchParams.set('board', room);
    return u.toString();
  }

  function renderSharePanel() {
    const body = document.getElementById('shareBoardBody');
    if (!body) return;
    const title = state.boardTitle || recentFor(room)?.title || 'Untitled board';
    const titleEl = document.getElementById('shareModalTitle');
    const subtitle = document.getElementById('shareModalSubtitle');

    if (!room) {
      if (titleEl) titleEl.textContent = 'Share a board';
      if (subtitle) subtitle.textContent = 'Collaboration belongs to a saved board, not a separate room.';
      body.innerHTML = `<div class="share-board-required">
        <div class="share-required-icon">▦</div>
        <strong>Open or create a board first</strong>
        <p>Your plan, events, venues, contacts and history need a board before sharing can be enabled.</p>
        <div class="share-required-actions"><button class="button secondary" type="button" data-share-browse-boards>Open Boards</button><button class="button primary" type="button" data-share-new-board>＋ New board</button></div>
      </div>`;
      return;
    }

    if (titleEl) titleEl.textContent = `Share ${title}`;
    if (subtitle) subtitle.textContent = 'Invite people to this existing board. People who join while signed in will remember it in Boards.';

    if (shareAccessDenied) {
      body.innerHTML = `<div class="share-board-required"><div class="share-required-icon">⊘</div><strong>This board is private</strong><p>You do not currently have access to this saved board.</p><div class="share-required-actions"><button class="button primary" type="button" data-share-browse-boards>Back to Boards</button></div></div>`;
      return;
    }

    const online = typeof connected !== 'undefined' && connected;
    const count = typeof peers !== 'undefined' ? Object.keys(peers || {}).length + 1 : 1;
    body.innerHTML = `<div class="share-board-summary">
      <div class="share-board-icon">▦</div><div><strong>${esc(title)}</strong><small>${shareLoading ? 'Checking sharing…' : `${online ? 'Live' : 'Saved'} · ${count} here now`}</small></div>
    </div>
    <div class="share-access-panel">
      <div class="share-access-copy"><strong>Anyone with the link can join</strong><small>${shareEnabled ? 'New people can open this board and collaborate.' : 'The board is private to its owner and remembered members.'}</small></div>
      <label class="share-toggle ${shareOwner ? '' : 'disabled'}"><input id="boardShareToggle" type="checkbox" ${shareEnabled ? 'checked' : ''} ${shareOwner && !shareLoading ? '' : 'disabled'}><span></span></label>
    </div>
    ${shareOwner ? `<div class="share-member-note">Turning link sharing off blocks new people. Signed-in collaborators who already joined keep access from their Boards tab.</div>` : `<div class="share-member-note">Only the board owner can change link sharing. Your access is ${esc(shareRole || 'member')}.</div>`}
    <div class="share-link-row v11-share-link-row"><input id="shareLink" readonly value="${shareEnabled ? esc(shareLink()) : ''}" placeholder="Enable link sharing to create a join link"><button class="button primary" id="copyShareLinkV11" type="button" ${shareEnabled ? '' : 'disabled'}>Copy link</button></div>
    <div class="share-name-row"><label class="field"><span>Your display name</span><input id="displayNameV11" maxlength="40" value="${esc(displayName)}" placeholder="Your name"></label></div>`;
  }

  async function refreshShareState({ repair = true } = {}) {
    if (!room) { shareEnabled = false; shareOwner = false; shareRole = ''; shareAccessDenied = false; renderSharePanel(); return; }
    shareLoading = true; renderSharePanel();
    try {
      const data = repair ? await ensureBoardOnServer(room) : await boardRequest('GET', room);
      if (!data?.found) throw new Error('board_not_found');
      shareEnabled = !!data.shareEnabled;
      shareOwner = !!data.owner;
      shareRole = data.role || (shareOwner ? 'owner' : 'member');
      shareAccessDenied = false;
      state.collaborationEnabled = shareEnabled;
      if (data.title && data.title !== state.boardTitle) state.boardTitle = data.title;
      try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch {}
      const recents = readRecents();
      const idx = recents.findIndex(x => x.boardId === room);
      if (idx >= 0) { recents[idx] = { ...recents[idx], title: state.boardTitle || recents[idx].title, shareEnabled, updatedAt: data.updatedAt || recents[idx].updatedAt }; writeRecents(recents); }
    } catch (err) {
      if (err.status === 403 || String(err.message).includes('board_private')) {
        shareAccessDenied = true;
        shareEnabled = false;
        if (channel && supabase) { try { await supabase.removeChannel(channel); } catch {} channel = null; connected = false; }
      } else console.warn('Share state unavailable', err);
    } finally {
      shareLoading = false;
      renderSharePanel();
      patchBoardsUI();
    }
  }

  async function setSharing(enabled) {
    if (!room || !shareOwner || shareLoading) return;
    shareLoading = true; renderSharePanel();
    try {
      const data = await boardRequest('POST', room, { action: 'sharing', shareEnabled: !!enabled });
      shareEnabled = !!data.shareEnabled;
      state.collaborationEnabled = shareEnabled;
      save(false);
      if (shareEnabled && supabase) reconnectRoom();
      toast(shareEnabled ? 'Link sharing enabled' : 'Link sharing disabled');
    } catch (err) {
      console.error(err);
      toast(String(err.message).includes('owner') ? 'Only the board owner can change sharing' : 'Could not change sharing');
    } finally { shareLoading = false; renderSharePanel(); }
  }

  function openShare() {
    rebuildShareModal();
    modalState('shareModal', true);
    renderSharePanel();
    if (room) refreshShareState();
  }

  function openRename(id) {
    ensureRenameModal();
    renameBoardId = id;
    const local = recentFor(id);
    let current = local?.title || 'Untitled board';
    if (id === room) current = state.boardTitle || current;
    const cardTitle = document.querySelector(`[data-board-card="${CSS.escape(id)}"] .board-title-wrap strong`)?.textContent?.trim();
    if (cardTitle) current = cardTitle;
    const input = document.querySelector('#boardRenameForm input[name="title"]');
    if (input) input.value = current;
    modalState('boardRenameModal', true);
    setTimeout(() => { input?.focus(); input?.select(); }, 30);
  }

  async function renameBoardFixed(id, title) {
    const clean = String(title || '').trim().slice(0, 100);
    if (!id || !clean) return;
    const submit = document.querySelector('#boardRenameForm button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Renaming…'; }
    try {
      await ensureBoardOnServer(id);
      await boardRequest('POST', id, { action: 'rename', title: clean });
      const recents = readRecents();
      const idx = recents.findIndex(x => x.boardId === id);
      if (idx >= 0) recents[idx] = { ...recents[idx], title: clean, updatedAt: new Date().toISOString() };
      else recents.unshift({ boardId: id, title: clean, updatedAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString() });
      writeRecents(recents);
      if (id === room) {
        state.boardTitle = clean;
        try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch {}
        save(false);
      } else {
        try {
          const key = `${STORAGE}:room:${id}`;
          const raw = localStorage.getItem(key);
          if (raw) { const snap = JSON.parse(raw); snap.boardTitle = clean; localStorage.setItem(key, JSON.stringify(snap)); }
        } catch {}
      }
      modalState('boardRenameModal', false);
      patchBoardsUI();
      const card = document.querySelector(`[data-board-card="${CSS.escape(id)}"] .board-title-wrap strong`);
      if (card) card.textContent = clean;
      const pill = document.querySelector('#boardContextPill strong');
      if (id === room && pill) pill.textContent = clean;
      toast('Board renamed');
    } catch (err) {
      console.error(err);
      toast(String(err.message).includes('private') ? 'This board is private' : 'Could not rename this board');
    } finally {
      if (submit && document.body.contains(submit)) { submit.disabled = false; submit.textContent = 'Rename'; }
    }
  }

  function goBoards(openCreate = false) {
    modalState('shareModal', false);
    setView('boards');
    if (openCreate) setTimeout(() => document.getElementById('createBoardButton')?.click(), 30);
  }

  ensureRenameModal();
  rebuildShareModal();
  patchBoardsUI();

  const shareButton = document.getElementById('shareButton');
  if (shareButton) shareButton.onclick = e => { e.preventDefault(); openShare(); };
  const obsoleteNew = document.getElementById('newSharedBoard');
  if (obsoleteNew) obsoleteNew.onclick = () => goBoards(true);

  const basePresenceUI = presenceUI;
  presenceUI = function() {
    basePresenceUI();
    document.getElementById('persistentBoardControl')?.remove();
    if (document.getElementById('shareBoardBody')) renderSharePanel();
  };

  const baseCleanState = cleanState;
  cleanState = function() { return { ...baseCleanState(), collaborationEnabled: !!state.collaborationEnabled, boardTitle: state.boardTitle || '' }; };

  const observer = new MutationObserver(() => {
    patchBoardsUI();
    document.getElementById('persistentBoardControl')?.remove();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', e => {
    const rename = e.target.closest?.('[data-v11-board-rename]');
    if (rename) { e.preventDefault(); e.stopPropagation(); openRename(rename.dataset.v11BoardRename); return; }
    if (e.target.closest?.('[data-close-board-rename]')) { modalState('boardRenameModal', false); return; }
    if (e.target.closest?.('[data-close-v11-share]')) { modalState('shareModal', false); return; }
    if (e.target.closest?.('[data-share-browse-boards]')) { goBoards(false); return; }
    if (e.target.closest?.('[data-share-new-board]')) { goBoards(true); return; }
    if (e.target.closest?.('#copyShareLinkV11')) {
      if (!shareEnabled) return toast('Enable link sharing first');
      navigator.clipboard.writeText(shareLink()).then(() => toast('Share link copied')).catch(() => toast('Could not copy the link'));
      return;
    }
  }, true);

  document.addEventListener('change', e => {
    if (e.target.id === 'boardShareToggle') { setSharing(e.target.checked); return; }
    if (e.target.id === 'displayNameV11') {
      displayName = e.target.value.trim() || displayName;
      localStorage.mscDisplayName = displayName;
      updatePresence();
      presenceUI();
    }
  }, true);

  document.addEventListener('submit', e => {
    if (e.target.id !== 'boardRenameForm') return;
    e.preventDefault();
    renameBoardFixed(renameBoardId, new FormData(e.target).get('title'));
  }, true);

  // Collaboration is now a property of a saved board. Keep the old helper from making hidden rooms.
  createShared = function() { goBoards(true); };

  if (room) {
    setTimeout(async () => {
      await refreshShareState();
      if (shareAccessDenied) {
        toast('This board is private');
        setView('boards');
      }
    }, 300);
  }
})();