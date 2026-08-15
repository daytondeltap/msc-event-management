/* MSC v22: startup rescue for large saved boards. Runs synchronously before app-bind. */
(() => {
  'use strict';

  // v21's async loading shell could become permanent if an enhancement stalled.
  // v22 never requires async enhancement code to make the base app usable.
  window.MSC_FAST_BOOT = Object.assign(window.MSC_FAST_BOOT || {}, {
    ready: true,
    disabled: true,
    version: 22
  });

  let issueVersion = '';
  let issueCache = new Map();

  function rebuildIssueCache() {
    const key = `${state.version || 0}|${state.events?.length || 0}`;
    if (key === issueVersion) return;
    issueVersion = key;
    issueCache = new Map();

    const conflicts = new Set();
    const byVenue = new Map();
    for (const e of state.events || []) {
      if (!e?.id || !e.venue || !e.start) continue;
      const venue = String(e.venue).trim().toLowerCase();
      if (!venue) continue;
      const start = +new Date(e.start);
      if (!Number.isFinite(start)) continue;
      const rawEnd = +new Date(e.end || e.start);
      const end = Number.isFinite(rawEnd) ? Math.max(start, rawEnd) : start;
      if (!byVenue.has(venue)) byVenue.set(venue, []);
      byVenue.get(venue).push({ id: e.id, start, end });
    }

    for (const list of byVenue.values()) {
      list.sort((a, b) => a.start - b.start || a.end - b.end);
      const active = [];
      for (const item of list) {
        for (let i = active.length - 1; i >= 0; i--) {
          if (active[i].end <= item.start) active.splice(i, 1);
        }
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

  // Replace the quadratic base conflict check before the first Plan render.
  issues = function(e) {
    rebuildIssueCache();
    return issueCache.get(e?.id) || [];
  };

  function renderActiveView() {
    const count = state.events?.length || 0;
    document.body?.classList.toggle('v22-large-board', count >= 20);
    try {
      if (view === 'home') home();
      else if (view === 'plan') plan();
      else if (view === 'events') events();
      else if (view === 'board') statusBoard();
      else if (view === 'calendar') calendar();
      else if (view === 'venues') venues();
      else if (view === 'budget') budget();
      try { presenceUI?.(); } catch {}
      try { accountUI?.(); } catch {}
    } catch (err) {
      console.error('MSC startup render failed', err);
      const root = document.getElementById('planView');
      if (root && view === 'plan') {
        root.innerHTML = `<div class="empty-board"><strong>Planner recovery mode</strong><p>The board data loaded, but a planner enhancement failed. Use another tab while MSC finishes recovery.</p></div>`;
      }
    }
  }

  // Most importantly: do not render every hidden workspace on startup.
  render = renderActiveView;

  // Remove any stale v21 shell left by an older cached entry file.
  const clearStaleShell = () => {
    const shell = document.querySelector('.v21-fast-boot');
    if (!shell) return;
    try { renderActiveView(); } catch (err) { console.error(err); }
  };
  requestAnimationFrame(clearStaleShell);
  setTimeout(clearStaleShell, 700);
  setTimeout(clearStaleShell, 2200);

  window.addEventListener('msc:enhancements-ready', () => {
    window.MSC_FAST_BOOT.ready = true;
    clearStaleShell();
  });
})();
