/* MSC v24: deterministic page navigation. No legacy wrapper chain owns render/setView. */
(() => {
  'use strict';
  const V24 = window.MSC_V24_PAGE = window.MSC_V24_PAGE || {};

  const titleFor = v => meta[v] || ({
    boards:['Boards','Create, reopen and recover complete MSC workspaces.'],
    contacts:['Contacts','People, roles and email automations for this board.']
  }[v]);

  function renderActive() {
    try {
      const feature = window.MSC_FEATURE_RENDERERS?.[view];
      if (feature) return feature();
      if (view === 'contacts') return window.MSC_V8?.contactsView?.();
      return window.MSC_V23?.renderActive?.();
    } catch (err) {
      console.error('MSC v24 active-view render failed', err);
      const id = `${view}View`;
      const root = document.getElementById(id) || document.getElementById('planView');
      if (root) root.innerHTML = '<div class="empty-state"><strong>Recovery mode</strong><p>This view failed to render, but the rest of MSC is still available.</p></div>';
    }
  }

  function safeSetView(v, announce = true) {
    const info = titleFor(v);
    const target = document.getElementById(`${v}View`);
    if (!info || !target) return false;
    view = v;
    $$('.nav-item[data-view],.brand[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === v));
    $$('.view').forEach(x => x.classList.toggle('active', x === target));
    const h = $('#viewTitle'), p = $('#viewSubtitle');
    if (h) h.textContent = info[0];
    if (p) p.textContent = info[1];
    renderActive();
    if (v === 'plan') requestAnimationFrame(() => { try { centerIfNeeded?.(); } catch {} });
    if (v === 'venues') window.MSC_LOAD_MAPS?.();
    if (announce) { try { updatePresence?.({view:v}); } catch {} }
    try { drawRemoteCursors?.(); } catch {}
    try { presenceUI?.(); } catch {}
    window.dispatchEvent(new CustomEvent('msc:viewchange', { detail:{view:v} }));
    return true;
  }
  safeSetView.__mscV24 = true;

  function reassert() {
    try { window.MSC_V23?.reassert?.(false); } catch {}
    render = renderActive;
    setView = safeSetView;
  }

  V24.renderActive = renderActive;
  V24.setView = safeSetView;
  V24.reassert = reassert;
  reassert();
})();
