/* v35: verified-account board isolation and Realtime authorization gate. */
(() => {
  'use strict';

  const PERSIST_ENDPOINT = `${SB_URL}/functions/v1/persistent-board`;
  const accessState = window.MSC_BOARD_ACCESS = window.MSC_BOARD_ACCESS || {
    status: room ? 'pending' : 'local',
    boardId: room || '',
    userId: null,
    role: '',
    owner: false,
    shareEnabled: false,
    generation: 0
  };
  let authGeneration = 0;
  let identityId = '';
  const rawConnectRoom = connectRoom;

  function setAccess(status, extra = {}) {
    Object.assign(accessState, {
      status,
      boardId: room || extra.boardId || '',
      userId: authUser?.id || null,
      role: '',
      owner: false,
      shareEnabled: false,
      ...extra
    });
    document.documentElement.dataset.boardAccess = status;
    window.dispatchEvent(new CustomEvent('msc:boardaccess', { detail: { ...accessState } }));
  }

  async function disconnectRealtime() {
    if (channel && supabase) {
      try { await supabase.removeChannel(channel); } catch {}
    }
    channel = null;
    connected = false;
    peers = {};
    remoteCursors = {};
    remoteActivities = {};
    snapshotRequested = false;
    try { presenceUI(); drawRemoteCursors(); } catch {}
  }

  function blankBoardState(label = 'Checking access…') {
    return {
      events: [], annualBudget: 100000, budgetLedger: [], zoom: 1, version: 1,
      boardTitle: label, persistentBoard: false, collaborationEnabled: false,
      contacts: [], connections: [], emailSettings: { autoApprovalEmails: false },
      planSettings: {}, updatedAt: Date.now()
    };
  }

  function renderLockedBoard(label = 'Checking access…') {
    if (!room) return;
    remoteApplying = true;
    state = blankBoardState(label);
    normalize();
    zoom = 1;
    selectedEventId = null;
    try { render(); setView('plan', false); } catch (err) { console.warn('Board lock render skipped', err); }
    remoteApplying = false;
    const saveText = document.getElementById('saveText');
    if (saveText) saveText.textContent = label;
  }

  function closeBoardOverlays() {
    document.querySelectorAll('.drawer.open,.modal.open,.v25-settings.open').forEach(el => {
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function resetToLocalWorkspace() {
    room = '';
    connected = false;
    peers = {};
    remoteCursors = {};
    remoteActivities = {};
    selectedEventId = null;
    state = loadState();
    normalize();
    zoom = state.zoom || 1;
    closeBoardOverlays();
    const url = new URL(location.href);
    url.searchParams.delete('board');
    history.replaceState({}, '', url);
    try { render(); setView('plan', false); } catch (err) { console.warn('Local workspace reset skipped', err); }
  }

  async function prepareAccountBoundary(reason = 'account-change') {
    authGeneration += 1;
    window.MSC_STORAGE_SCOPE?.beginTransition?.();
    await disconnectRealtime();
    if (room) resetToLocalWorkspace();
    setAccess('transition', { boardId: '', reason });
    try { window.MSC_V10?.refresh?.(); } catch {}
  }

  async function currentAccessToken() {
    if (!supabase) return '';
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || '';
    } catch { return ''; }
  }

  async function boardRequest(boardId, user) {
    const headers = { 'Content-Type': 'application/json' };
    const token = user ? await currentAccessToken() : '';
    if (user && !token) {
      const err = new Error('session_unavailable');
      err.status = 401;
      throw err;
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!user) {
      const ownerKey = window.MSC_STORAGE_SCOPE?.guestOwnerKey?.(boardId) || '';
      if (ownerKey) headers['x-board-owner'] = ownerKey;
    }
    const res = await fetch(`${PERSIST_ENDPOINT}?board=${encodeURIComponent(boardId)}`, { headers, cache: 'no-store' });
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

  function applyAuthorizedSnapshot(boardId, data) {
    const next = {
      ...(data.snapshot || {}),
      persistentBoard: true,
      collaborationEnabled: !!data.shareEnabled,
      boardTitle: data.title || data.snapshot?.boardTitle || 'Untitled board'
    };
    remoteApplying = true;
    state = next;
    normalize();
    zoom = state.zoom || 1;
    localStorage.setItem(`${STORAGE}:room:${boardId}`, JSON.stringify(state));
    try { render(); setView(view && view !== 'boards' ? view : 'plan', false); } catch (err) { console.warn('Authorized board render skipped', err); }
    remoteApplying = false;
  }

  function applyGuestOfflineCache(boardId) {
    try {
      const cached = JSON.parse(localStorage.getItem(`${STORAGE}:room:${boardId}`) || 'null');
      if (!cached?.events) return false;
      remoteApplying = true;
      state = { ...cached, persistentBoard: true };
      normalize();
      zoom = state.zoom || 1;
      render();
      setView('plan', false);
      remoteApplying = false;
      setAccess('allowed-offline', { boardId, owner: true, role: 'owner', offline: true });
      const saveText = document.getElementById('saveText');
      if (saveText) saveText.textContent = 'Offline · browser-owned board';
      return true;
    } catch { return false; }
  }

  async function denyCurrentBoard(boardId, message = 'This board belongs to another account') {
    if (room !== boardId) return false;
    await disconnectRealtime();
    setAccess('denied', { boardId, reason: message });
    resetToLocalWorkspace();
    toast(message);
    setTimeout(async () => {
      try {
        const ok = await window.MSC_FEATURES?.loadWorkspace?.();
        if (ok && window.MSC_FEATURES?.workspaceReady) setView('boards', false);
      } catch {}
    }, 0);
    return false;
  }

  async function authorizeCurrentBoard(user = authUser, reason = 'auth') {
    if (!room) { setAccess('local', { boardId: '' }); return true; }
    const boardId = room;
    const generation = ++authGeneration;
    accessState.generation = generation;
    setAccess('checking', { boardId, reason, userId: user?.id || null });
    await disconnectRealtime();
    renderLockedBoard('Checking board access…');

    try {
      const data = await boardRequest(boardId, user);
      if (generation !== authGeneration || room !== boardId) return false;
      if (!data?.found || !data?.snapshot || !Array.isArray(data.snapshot.events)) {
        return denyCurrentBoard(boardId, 'Board not found for this account');
      }
      setAccess('allowed', {
        boardId,
        userId: user?.id || null,
        role: data.role || (data.owner ? 'owner' : 'guest'),
        owner: !!data.owner,
        shareEnabled: !!data.shareEnabled
      });
      applyAuthorizedSnapshot(boardId, data);
      try { await window.MSC_V10?.rememberCurrent?.(); } catch {}
      try { window.MSC_V10?.refresh?.(); } catch {}
      await connectRoom();
      return true;
    } catch (err) {
      if (generation !== authGeneration || room !== boardId) return false;
      const status = Number(err?.status || 0);
      if (status === 400 || status === 403 || status === 404) {
        return denyCurrentBoard(boardId, status === 403 ? 'This private board is not available to this account' : 'Board not found for this account');
      }
      if (!user && window.MSC_STORAGE_SCOPE?.hasGuestOwnerKey?.(boardId) && applyGuestOfflineCache(boardId)) {
        toast('Board opened from this browser · online sync unavailable');
        return true;
      }
      setAccess('unavailable', { boardId, reason: 'verification_failed' });
      renderLockedBoard('Board access unavailable');
      toast('Could not verify board access — private data stays locked');
      return false;
    }
  }

  async function handleIdentity(user, event = 'AUTH') {
    const nextId = user?.id || '';
    const changed = identityId !== nextId;
    identityId = nextId;
    window.MSC_STORAGE_SCOPE?.setIdentity?.(user || null);
    setAuthUser(user || null);
    if (!room) {
      setAccess('local', { boardId: '', userId: user?.id || null, event });
      if (changed) {
        try { await window.MSC_V10?.refresh?.(); } catch {}
      }
      return true;
    }
    return authorizeCurrentBoard(user || null, event);
  }

  async function verifyAndHandle(event, session) {
    const generation = ++authGeneration;
    if (!session) {
      if (generation !== authGeneration) return;
      await handleIdentity(null, event);
      return;
    }
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) throw error || new Error('invalid_user');
      if (generation !== authGeneration) return;
      await handleIdentity(data.user, event);
    } catch (err) {
      console.warn('Authenticated identity could not be verified', err);
      window.MSC_STORAGE_SCOPE?.beginTransition?.();
      await disconnectRealtime();
      setAuthUser(null);
      if (room) {
        setAccess('unavailable', { boardId: room, reason: 'identity_unverified' });
        renderLockedBoard('Account verification required');
      }
    }
  }

  function wrapSignOutBoundary() {
    const original = supabase?.auth?.signOut;
    if (typeof original !== 'function' || original.__mscIsolationV35) return;
    const bound = original.bind(supabase.auth);
    const wrapped = async options => {
      await prepareAccountBoundary('signout');
      return bound(options);
    };
    wrapped.__mscIsolationV35 = true;
    try { supabase.auth.signOut = wrapped; } catch (err) { console.warn('Could not wrap sign-out boundary', err); }
  }

  connectRoom = async function() {
    if (!room || !supabase) return;
    const access = window.MSC_BOARD_ACCESS;
    if (!access || !['allowed','allowed-offline'].includes(access.status) || access.boardId !== room || access.status === 'allowed-offline') {
      connected = false;
      return;
    }
    return rawConnectRoom();
  };
  reconnectRoom = async function() { if (room) return connectRoom(); };

  initSupabase = async function() {
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.111.0');
      supabase = mod.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      wrapGoogleOAuthRedirect();
      wrapSignOutBoundary();
      const { data } = await supabase.auth.getSession();
      await verifyAndHandle('INITIAL_SESSION', data?.session || null);
      if (data?.session) restoreOAuthReturn();
      supabase.auth.onAuthStateChange((event, session) => {
        setTimeout(() => verifyAndHandle(event, session), 0);
      });
    } catch (err) {
      console.error(err);
      window.MSC_STORAGE_SCOPE?.beginTransition?.();
      if (room) {
        setAccess('unavailable', { boardId: room, reason: 'online_services_unavailable' });
        renderLockedBoard('Board access unavailable');
        toast('Online services unavailable — private board data stays locked');
      } else {
        window.MSC_STORAGE_SCOPE?.setIdentity?.(null);
        setAuthUser(null);
        toast('Online services unavailable — local mode still works');
      }
    }
  };

  signOut = async function() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) { console.error(error); toast('Could not sign out'); return; }
    toast('Signed out');
  };

  window.MSC_AUTH = Object.assign(window.MSC_AUTH || {}, {
    authorizeCurrentBoard,
    handleIdentity,
    prepareAccountSwitch: () => prepareAccountBoundary('switch-account'),
    prepareAccountBoundary,
    disconnectRealtime,
    access: accessState
  });

  setAccess(room ? 'pending' : 'local', { boardId: room || '' });
})();
