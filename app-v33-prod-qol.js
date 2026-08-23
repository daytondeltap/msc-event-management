/* v33: production hardening, lightweight collaboration cursors, cleaner copy, and low-risk QoL. */
(() => {
  'use strict';

  const BUILD = '20260823-prod-v33';
  const cursorNodes = new Map();
  let cursorFrame = 0;
  let moreReturnFocus = null;
  let copyFrame = 0;

  const cleanText = (value, max = 120) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  const cleanName = value => cleanText(value, 40) || 'Member';
  const safeImageUrl = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      return url.protocol === 'https:' ? url.href.slice(0, 1500) : '';
    } catch { return ''; }
  };
  const safePeer = peer => {
    const p = peer && typeof peer === 'object' ? peer : {};
    return {
      ...p,
      name: cleanName(p.name),
      avatar: safeImageUrl(p.avatar),
      view: cleanText(p.view, 32),
      action: cleanText(p.action, 32),
      selectedEventId: cleanText(p.selectedEventId, 100) || null,
      clientId: cleanText(p.clientId, 100),
      email: undefined,
    };
  };

  // Do not broadcast signed-in email addresses through Realtime presence.
  if (typeof identityPayload === 'function') {
    const originalIdentityPayload = identityPayload;
    identityPayload = function(extra = {}) {
      const value = originalIdentityPayload(extra) || {};
      delete value.email;
      value.name = cleanName(value.name);
      value.avatar = safeImageUrl(value.avatar);
      value.view = cleanText(value.view, 32);
      value.action = cleanText(value.action, 32);
      if (value.selectedEventId != null) value.selectedEventId = cleanText(value.selectedEventId, 100) || null;
      return value;
    };
  }

  if (typeof setAuthUser === 'function') {
    const originalSetAuthUser = setAuthUser;
    setAuthUser = function(user) {
      originalSetAuthUser(user);
      try {
        displayName = cleanName(displayName);
        avatarUrl = safeImageUrl(avatarUrl);
      } catch {}
    };
  }

  if (typeof flattenPresence === 'function') {
    const originalFlattenPresence = flattenPresence;
    flattenPresence = function() {
      const raw = originalFlattenPresence() || {};
      return Object.fromEntries(Object.entries(raw).map(([id, peer]) => [cleanText(id, 100), safePeer(peer)]));
    };
  }

  if (typeof patchPeerActivity === 'function') {
    const originalPatchPeerActivity = patchPeerActivity;
    patchPeerActivity = function(payload) {
      const safe = safePeer(payload);
      if (!safe.clientId && payload?.from) safe.clientId = cleanText(payload.from, 100);
      safe.from = cleanText(payload?.from, 100);
      safe.eventId = cleanText(payload?.eventId, 100);
      originalPatchPeerActivity(safe);
    };
  }

  function removeCursor(id) {
    const node = cursorNodes.get(id);
    if (node) node.remove();
    cursorNodes.delete(id);
  }

  function clearCursors() {
    cursorNodes.forEach(node => node.remove());
    cursorNodes.clear();
    const layer = document.getElementById('cursorLayer');
    if (layer) layer.replaceChildren();
  }

  function renderRemoteCursors() {
    cursorFrame = 0;
    const layer = document.getElementById('cursorLayer');
    if (!layer) return;
    if (!room || view !== 'plan') { clearCursors(); return; }
    const viewport = document.getElementById('plannerViewport');
    if (!viewport) { clearCursors(); return; }

    const rect = viewport.getBoundingClientRect();
    const now = Date.now();
    const active = new Set();
    const entries = Object.entries(remoteCursors || {});

    for (const [rawId, rawCursor] of entries) {
      const id = cleanText(rawId, 100);
      const cursor = rawCursor && typeof rawCursor === 'object' ? rawCursor : {};
      if (!id || now - Number(cursor.t || 0) >= 4500) { removeCursor(id); continue; }

      const x = Math.max(0, Math.min(rect.width, Number(cursor.x) || 0));
      const y = Math.max(0, Math.min(rect.height, Number(cursor.y) || 0));
      active.add(id);

      let node = cursorNodes.get(id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'remote-cursor';
        node.dataset.cursorId = id;
        const dot = document.createElement('span');
        dot.className = 'cursor-dot';
        const label = document.createElement('span');
        label.className = 'cursor-label';
        node.append(dot, label);
        cursorNodes.set(id, node);
        layer.appendChild(node);
      } else if (node.parentNode !== layer) {
        layer.appendChild(node);
      }

      const label = node.querySelector('.cursor-label');
      if (label) label.textContent = cleanName(cursor.name);
      node.style.setProperty('--peer-color', peerColor(id));
      node.style.transform = `translate3d(${Math.round(rect.left + x)}px,${Math.round(rect.top + y)}px,0)`;
    }

    [...cursorNodes.keys()].forEach(id => { if (!active.has(id)) removeCursor(id); });
  }

  // Reuse cursor DOM nodes and collapse bursts into one animation-frame render.
  drawRemoteCursors = function() {
    if (cursorFrame) return;
    cursorFrame = requestAnimationFrame(renderRemoteCursors);
  };

  function getMoreButton() { return document.getElementById('mobileMoreButton'); }
  function getMoreSheet() { return document.getElementById('mobileMoreSheet'); }
  function moreIsOpen() { return !!getMoreSheet()?.classList.contains('open'); }

  function syncMoreA11y() {
    const button = getMoreButton();
    const sheet = getMoreSheet();
    if (!button || !sheet) return;
    button.setAttribute('aria-controls', 'mobileMoreSheet');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', String(sheet.classList.contains('open')));
  }

  function openMore() {
    try { window.MSC_BUDGET_QOL?.syncMobileMenu?.(); } catch {}
    const button = getMoreButton();
    const sheet = getMoreSheet();
    if (!button || !sheet || matchMedia('(min-width: 901px)').matches) return;
    moreReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-more-open');
    syncMoreA11y();
    requestAnimationFrame(() => sheet.querySelector('.mobile-more-item,[data-mobile-more-close]')?.focus?.());
  }

  function closeMore(restoreFocus = false) {
    const sheet = getMoreSheet();
    if (!sheet) return;
    const wasOpen = sheet.classList.contains('open');
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-more-open');
    syncMoreA11y();
    if (wasOpen && restoreFocus) {
      const target = moreReturnFocus?.isConnected ? moreReturnFocus : getMoreButton();
      requestAnimationFrame(() => target?.focus?.());
    }
  }

  // Own the More button in capture phase so it cannot double-toggle when older handlers also see the click.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#mobileMoreButton');
    if (button) {
      event.preventDefault();
      event.stopImmediatePropagation();
      moreIsOpen() ? closeMore(true) : openMore();
      return;
    }
    if (event.target.closest?.('[data-mobile-more-close]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMore(true);
      return;
    }
    if (event.target.closest?.('#mobileMoreSheet .mobile-more-item')) {
      setTimeout(() => closeMore(false), 0);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && moreIsOpen()) {
      event.preventDefault();
      event.stopPropagation();
      closeMore(true);
      return;
    }

    const searchInput = document.getElementById('globalSearch');
    if (event.key === 'Escape' && document.activeElement === searchInput) {
      event.preventDefault();
      if (searchInput.value) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        searchInput.blur();
      }
      return;
    }

    const tag = document.activeElement?.tagName || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement?.isContentEditable;
    const layerOpen = !!document.querySelector('.modal.open,.drawer.open,.v25-settings.open');

    if ((event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) && !layerOpen) {
      if (event.key === '/' && typing) return;
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select?.();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      try { save(); toast('Saved'); } catch {}
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && document.getElementById('eventDrawer')?.classList.contains('open')) {
      event.preventDefault();
      document.getElementById('eventForm')?.requestSubmit?.();
      return;
    }

    if (!typing && !layerOpen && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      try { openEvent(); } catch {}
    }
  }, true);

  const COPY = new Map([
    ['Everything important, without crowding the board.', 'Edit the event details.'],
    ['Share one link. Everyone sees pages, cursors, selections, edits and moves live.', 'Share this board for live editing.'],
    ['Use Google identity for collaboration presence and attribution.', 'Sign in to sync your name and boards.'],
    ['OpenStreetMap loads only when Venues is opened.', 'Search and pin venues with OpenStreetMap.'],
    ['Supports .ics / .ical, JSON and text-based PDF calendars.', 'Import .ics, .ical, JSON, or PDF calendars.'],
    ['Set the board budget, calculate costs, log spending and money received, and tie expenses back to events.', 'Set a budget, log money in or out, and assign spending to events.'],
    ["Add an expense or money received. Linked expenses automatically add to that event's actual spend.", 'Add money in or out. Link an expense to an event when needed.'],
    ['Use +, −, ×, ÷, parentheses and percentages.', 'Basic math, parentheses and percentages.'],
    ['Saved with this board and shared with collaborators.', 'Saved with this board.'],
    ['This is a local board. Create an empty shared board to collaborate online.', "Local board. Share it when you're ready."],
    ['Google sign-in gives collaborators a stable name/avatar. Guests can still use a shared room while Google OAuth is being configured.', 'Sign in for a consistent name and saved account boards. Guests can still join shared boards.'],
  ]);

  function applyCopy() {
    copyFrame = 0;
    try {
      Object.assign(meta, {
        home: ['Overview', 'See what needs attention.'],
        plan: ['Plan', 'Arrange events and connect the plan.'],
        events: ['Events', 'All events in one list.'],
        board: ['Status', "Track what's next for each event."],
        calendar: ['Calendar', 'See school dates and event timing.'],
        venues: ['Venues', 'Check venues, addresses and conflicts.'],
        budget: ['Budget', 'Set a budget and track money in and out.'],
      });
      const subtitle = document.getElementById('viewSubtitle');
      if (subtitle && meta[view]) subtitle.textContent = meta[view][1];
    } catch {}

    document.querySelectorAll('p,.share-note,.setup-note,.budget-submit-row small').forEach(node => {
      const next = COPY.get(node.textContent.trim());
      if (next) node.textContent = next;
    });

    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      link.setAttribute('rel', 'noopener noreferrer');
    });
    syncMoreA11y();
  }

  function queueCopy() {
    if (copyFrame) return;
    copyFrame = requestAnimationFrame(applyCopy);
  }

  if (typeof render === 'function') {
    const originalRender = render;
    render = function(...args) {
      const result = originalRender.apply(this, args);
      queueCopy();
      return result;
    };
  }

  if (typeof setView === 'function') {
    const originalSetView = setView;
    setView = function(...args) {
      const result = originalSetView.apply(this, args);
      queueCopy();
      syncMoreA11y();
      return result;
    };
  }

  // Network state stays informative without disabling local work.
  function updateNetworkState(announce = false) {
    const saveText = document.getElementById('saveText');
    document.documentElement.dataset.network = navigator.onLine ? 'online' : 'offline';
    if (!navigator.onLine && saveText) saveText.textContent = 'Saved locally · offline';
    if (announce) toast(navigator.onLine ? 'Back online' : 'Offline — changes still save on this device');
    if (navigator.onLine && room && typeof reconnectRoom === 'function') {
      setTimeout(() => { try { reconnectRoom(); } catch {} }, 0);
    }
  }
  window.addEventListener('online', () => updateNetworkState(true));
  window.addEventListener('offline', () => updateNetworkState(true));

  // Ensure the More control is corrected after lazy navigation items arrive.
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    new MutationObserver(() => {
      try { window.MSC_BUDGET_QOL?.syncMobileMenu?.(); } catch {}
      queueCopy();
      syncMoreA11y();
    }).observe(sidebar, { childList: true, subtree: true });
  }

  updateNetworkState(false);
  queueCopy();
  drawRemoteCursors();
  setTimeout(() => { queueCopy(); syncMoreA11y(); }, 200);
  setTimeout(() => { queueCopy(); syncMoreA11y(); }, 900);

  window.MSC_PROD_QOL = {
    build: BUILD,
    applyCopy,
    openMore,
    closeMore,
    renderCursors: renderRemoteCursors,
    sanitizePeer: safePeer,
  };
})();
