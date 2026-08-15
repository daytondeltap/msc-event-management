/* MSC v12 connection input controller: blocks legacy prompt/drag collisions */
(() => {
  'use strict';

  let sourceId = '';
  let suppressUntil = 0;

  const eventById = id => state.events.find(e => e.id === id);

  function clearMode() {
    sourceId = '';
    document.body.classList.remove('msc-direct-connect');
    document.querySelector('.plan-shell')?.classList.remove('v12-connect-mode');
    document.querySelectorAll('[data-event-block]').forEach(el => {
      el.classList.remove('v12-connect-source', 'v12-connect-target');
    });
    document.getElementById('v12ConnectHint')?.remove();
  }

  function paintMode() {
    const shell = document.querySelector('.plan-shell');
    if (!shell) return;
    shell.classList.toggle('v12-connect-mode', !!sourceId);
    document.body.classList.toggle('msc-direct-connect', !!sourceId);
    document.querySelectorAll('[data-event-block]').forEach(el => {
      const id = el.dataset.eventBlock;
      el.classList.toggle('v12-connect-source', id === sourceId);
      el.classList.toggle('v12-connect-target', !!sourceId && id !== sourceId);
    });

    let hint = document.getElementById('v12ConnectHint');
    if (!sourceId) { hint?.remove(); return; }
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'v12ConnectHint';
      hint.className = 'v12-connect-hint';
      document.querySelector('.plan-toolbar')?.appendChild(hint);
    }
    const src = eventById(sourceId);
    hint.innerHTML = `<span class="v12-connect-dot"></span><strong>${esc(src?.name || 'Event')}</strong><span>Click another event to connect · Esc cancels</span>`;
  }

  function begin(id) {
    if (!id || !eventById(id)) return;
    if (state.events.length < 2) return toast('Add another event first');
    if (sourceId === id) return clearMode();
    sourceId = id;
    paintMode();
  }

  function finish(targetId) {
    const from = sourceId;
    if (!from) return;
    if (!targetId || targetId === from) return clearMode();
    if (state.connections?.some(c => c.from === from && c.to === targetId)) {
      clearMode();
      return toast('Those events are already connected');
    }
    state.connections = Array.isArray(state.connections) ? state.connections : [];
    state.connections.push({
      id: uid(), from, to: targetId, label: '', style: 'solid', tone: 'neutral', nodeMode: 'auto'
    });
    window.MSC_V8?.syncLegacyDependencies?.();
    clearMode();
    suppressUntil = performance.now() + 300;
    save();
    plan();
    toast('Connection added');
  }

  // Capture before v8/v9 listeners: the legacy v8 handler otherwise opens prompt().
  document.addEventListener('click', e => {
    const add = e.target.closest?.('[data-link-from]');
    if (add) {
      e.preventDefault();
      e.stopImmediatePropagation();
      begin(add.dataset.linkFrom);
      return;
    }

    const branch = e.target.closest?.('[data-v9-node-branch]');
    if (branch) {
      const toolbar = branch.closest('[data-connection-toolbar]');
      const connection = toolbar && state.connections?.find(c => c.id === toolbar.dataset.connectionToolbar);
      if (connection) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toolbar.remove();
        begin(connection.from);
        return;
      }
    }

    if (sourceId) {
      const block = e.target.closest?.('[data-event-block]');
      if (block) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(block.dataset.eventBlock);
        return;
      }
      if (!e.target.closest?.('#v12ConnectHint,.plan-toolbar')) clearMode();
      return;
    }

    // Eat the synthetic click that follows a target selection so older selection handlers cannot run.
    if (performance.now() < suppressUntil && e.target.closest?.('[data-event-block]')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // While choosing a target, event blocks are selection targets, never drag handles.
  document.addEventListener('pointerdown', e => {
    if (!sourceId || e.button !== 0) return;
    const block = e.target.closest?.('[data-event-block]');
    if (!block) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  document.addEventListener('dblclick', e => {
    if (!sourceId) return;
    if (e.target.closest?.('[data-event-block],#plannerViewport')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sourceId) {
      e.preventDefault();
      e.stopImmediatePropagation();
      clearMode();
    }
  }, true);

  // Plan rerenders after a real edit/connection; restore only selection decoration, never coordinates.
  const observer = new MutationObserver(() => {
    if (sourceId && document.querySelector('.plan-shell')) requestAnimationFrame(paintMode);
  });
  observer.observe(document.getElementById('planView') || document.body, { childList: true, subtree: true });

  window.MSC_CONNECTIONS = { begin, cancel: clearMode, get sourceId() { return sourceId; } };
})();
