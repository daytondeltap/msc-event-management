/* v35: identity-scoped browser storage for boards, recents, checkpoints and guest credentials. */
(() => {
  'use strict';

  const rawGet = Storage.prototype.getItem;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  const BOARD_PREFIX = 'msc-event-management-v6:room:';
  const RECENTS_KEY = 'mscBoardRecentsV10';
  const VERSION_PREFIX = 'mscBoardVersionAt:';
  const OWNER_PREFIX = 'mscBoardOwnerKey:';
  let scope = 'pending';

  const cleanId = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
  const accountScope = user => user?.id ? `account:${cleanId(user.id)}` : 'guest';
  const boardFromUrl = () => {
    try { return new URL(location.href).searchParams.get('board') || ''; }
    catch { return ''; }
  };
  const accessAllowsBoardWrites = () => {
    if (!boardFromUrl()) return true;
    return window.MSC_BOARD_ACCESS?.status === 'allowed';
  };

  function mappedKey(key) {
    const value = String(key);
    if (value.startsWith(BOARD_PREFIX)) {
      const id = value.slice(BOARD_PREFIX.length);
      return `msc-event-management-v6:scope:${scope}:room:${id}`;
    }
    if (value === RECENTS_KEY) return `mscBoardRecentsV35:${scope}`;
    if (value.startsWith(VERSION_PREFIX)) return `mscBoardVersionAtV35:${scope}:${value.slice(VERSION_PREFIX.length)}`;
    return value;
  }

  function isOwnerKey(key) { return String(key).startsWith(OWNER_PREFIX); }

  Storage.prototype.getItem = function(key) {
    if (this !== window.localStorage) return rawGet.call(this, key);
    if (isOwnerKey(key)) return scope === 'guest' ? rawGet.call(this, key) : null;
    return rawGet.call(this, mappedKey(key));
  };

  Storage.prototype.setItem = function(key, value) {
    if (this !== window.localStorage) return rawSet.call(this, key, value);
    if (isOwnerKey(key)) {
      if (scope === 'guest') return rawSet.call(this, key, value);
      return;
    }
    if (String(key) === RECENTS_KEY && !accessAllowsBoardWrites()) return;
    return rawSet.call(this, mappedKey(key), value);
  };

  Storage.prototype.removeItem = function(key) {
    if (this !== window.localStorage) return rawRemove.call(this, key);
    if (isOwnerKey(key)) {
      if (scope === 'guest') return rawRemove.call(this, key);
      return;
    }
    return rawRemove.call(this, mappedKey(key));
  };

  const api = window.MSC_STORAGE_SCOPE = window.MSC_STORAGE_SCOPE || {};
  api.setIdentity = user => {
    scope = accountScope(user);
    api.scope = scope;
    document.documentElement.dataset.storageScope = scope.startsWith('account:') ? 'account' : scope;
    return scope;
  };
  api.beginTransition = () => {
    scope = 'pending';
    api.scope = scope;
    document.documentElement.dataset.storageScope = 'pending';
  };
  api.boardKey = boardId => `msc-event-management-v6:scope:${scope}:room:${String(boardId || '')}`;
  api.recentsKey = () => `mscBoardRecentsV35:${scope}`;
  api.hasGuestOwnerKey = boardId => !!rawGet.call(window.localStorage, `${OWNER_PREFIX}${String(boardId || '')}`);
  api.guestOwnerKey = boardId => rawGet.call(window.localStorage, `${OWNER_PREFIX}${String(boardId || '')}`) || '';
  api.rawGet = key => rawGet.call(window.localStorage, key);
  api.scope = scope;
  document.documentElement.dataset.storageScope = 'pending';
})();
