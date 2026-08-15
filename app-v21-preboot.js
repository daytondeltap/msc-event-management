/* MSC v22-compatible preboot rescue: never trap a large board behind an async loading shell. */
(() => {
  'use strict';

  window.MSC_FAST_BOOT = Object.assign(window.MSC_FAST_BOOT || {}, {
    ready: true,
    disabled: true,
    version: 22
  });

  let issueVersion = '';
  let issueCache = new Map();

  function rebuildIssues() {
    const key = `${state.version || 0}|${state.events?.length || 0}`;
    if (key === issueVersion) return;
    issueVersion = key;
    issueCache = new Map();

    const conflicts = new Set();
    const venues = new Map();
    for (const e of state.events || []) {
      if (!e?.id || !e.venue || !e.start) continue;
      const venue = String(e.venue).trim().toLowerCase();
      if (!venue) continue;
      const start = +new Date(e.start);
      if (!Number.isFinite(start)) continue;
      const rawEnd = +new Date(e.end || e.start);
      const end = Number.isFinite(rawEnd) ? Math.max(start, rawEnd) : start;
      if (!venues.has(venue)) venues.set(venue, []);
      venues.get(venue).push({ id: e.id, start, end });
    }

    for (const list of venues.values()) {
      list.sort((a, b) => a.start - b.start || a.end - b.end);
      const active = [];
      for (const current of list) {
        for (let i = active.length - 1; i >= 0; i--) {
          if (active[i].end <= current.start) active.splice(i, 1);
        }
        if (active.length) {
          conflicts.add(current.id);
          for (const other of active) conflicts.add(other.id);
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
      if (conflicts.has(e.id)) out.push('Venue conflict');
      issueCache.set(e.id, out);
    }
  }

  // Replace the quadratic legacy venue-conflict scan before the first render.
  issues = function(e) {
    rebuildIssues();
    return issueCache.get(e?.id) || [];
  };

  function renderActive() {
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
        root.innerHTML = '<div class="empty-board"><strong>Planner recovery mode</strong><p>Your board data is loaded. MSC will keep the workspace usable even if an optional enhancement fails.</p></div>';
      }
    }
  }

  // Never render all hidden views during initial boot.
  render = renderActive;

  // Recover anyone who still has a stale cached v21 shell in the DOM.
  const rescue = () => {
    if (!document.querySelector('.v21-fast-boot')) return;
    window.MSC_FAST_BOOT.ready = true;
    renderActive();
  };
  requestAnimationFrame(rescue);
  setTimeout(rescue, 500);
  setTimeout(rescue, 1500);
  setTimeout(rescue, 3500);

  window.addEventListener('msc:enhancements-ready', rescue);
})();
