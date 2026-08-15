/* MSC v20 unified connection-node editor. Loaded before legacy v8/v9 node click handlers. */
(() => {
  'use strict';

  const q = (s, r = document) => r.querySelector(s);
  const TONES = ['neutral', 'blue', 'green', 'yellow', 'red'];
  const STYLES = ['solid', 'dashed'];
  let pointer = null;
  let suppressClickUntil = 0;
  let editor = null;

  function connection(id) {
    return (state.connections || []).find(c => c.id === id) || null;
  }

  function eventName(id) {
    return state.events.find(e => e.id === id)?.name || 'Event';
  }

  function closeEditor() {
    editor?.remove();
    editor = null;
    document.querySelectorAll('.connection-popover,.v9-node-toolbar').forEach(el => el.remove());
  }

  function clampEditor(el, x, y) {
    const r = el.getBoundingClientRect();
    const left = Math.max(12, Math.min(innerWidth - r.width - 12, x + 16));
    const top = Math.max(12, Math.min(innerHeight - r.height - 12, y + 16));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function openEditor(id, x, y) {
    const c = connection(id);
    if (!c) return;
    closeEditor();
    const el = document.createElement('div');
    el.id = 'v20NodeEditor';
    el.className = 'v20-node-editor';
    el.dataset.connectionId = id;
    el.innerHTML = `
      <div class="v20-node-editor-head">
        <div><strong>${esc(eventName(c.from))} → ${esc(eventName(c.to))}</strong><small>Connection settings</small></div>
        <button type="button" class="v20-node-close" data-v20-node-close aria-label="Close">×</button>
      </div>
      <div class="v20-node-editor-grid">
        <label class="full"><span>Label</span><input data-v20-node-label value="${esc(c.label || '')}" placeholder="e.g. Needs approval"></label>
        <label><span>Line</span><select data-v20-node-style>${STYLES.map(v => `<option value="${v}" ${v === (c.style || 'solid') ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label>
        <label><span>Color</span><select data-v20-node-tone>${TONES.map(v => `<option value="${v}" ${v === (c.tone || 'neutral') ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label>
      </div>
      <div class="v20-node-actions">
        <button type="button" class="button primary compact" data-v20-node-save>Save</button>
        <button type="button" class="button secondary compact" data-v20-node-branch>Branch</button>
        <button type="button" class="button secondary compact" data-v20-node-auto>Auto route</button>
        <button type="button" class="button secondary compact" data-v20-node-reverse>Reverse</button>
        <button type="button" class="button danger ghost compact" data-v20-node-delete>Delete</button>
      </div>`;
    document.body.appendChild(el);
    editor = el;
    requestAnimationFrame(() => {
      el.classList.add('show');
      clampEditor(el, x, y);
      q('[data-v20-node-label]', el)?.focus({ preventScroll: true });
    });
  }

  function saveEditor(c, el) {
    c.label = String(q('[data-v20-node-label]', el)?.value || '').trim();
    c.style = q('[data-v20-node-style]', el)?.value === 'dashed' ? 'dashed' : 'solid';
    const tone = q('[data-v20-node-tone]', el)?.value || 'neutral';
    c.tone = TONES.includes(tone) ? tone : 'neutral';
    window.MSC_V8?.syncLegacyDependencies?.();
    save();
    if (typeof updateConnectionSvg === 'function') updateConnectionSvg();
    else if (typeof plan === 'function') plan();
    toast('Connection updated');
  }

  function act(target) {
    const el = target.closest?.('#v20NodeEditor');
    if (!el) return false;
    const c = connection(el.dataset.connectionId);
    if (!c) { closeEditor(); return true; }
    if (target.closest('[data-v20-node-close]')) { closeEditor(); return true; }
    if (target.closest('[data-v20-node-save]')) { saveEditor(c, el); closeEditor(); return true; }
    if (target.closest('[data-v20-node-branch]')) {
      closeEditor();
      window.MSC_CONNECTIONS?.begin?.(c.from);
      return true;
    }
    if (target.closest('[data-v20-node-auto]')) {
      c.nodeMode = 'auto';
      delete c.node;
      save();
      if (typeof updateConnectionSvg === 'function') updateConnectionSvg();
      closeEditor();
      toast('Connection returned to auto routing');
      return true;
    }
    if (target.closest('[data-v20-node-reverse]')) {
      [c.from, c.to] = [c.to, c.from];
      window.MSC_V8?.syncLegacyDependencies?.();
      save();
      if (typeof plan === 'function') plan();
      closeEditor();
      toast('Connection reversed');
      return true;
    }
    if (target.closest('[data-v20-node-delete]')) {
      state.connections = (state.connections || []).filter(v => v.id !== c.id);
      window.MSC_V8?.syncLegacyDependencies?.();
      save();
      if (typeof plan === 'function') plan();
      closeEditor();
      toast('Connection removed');
      return true;
    }
    return true;
  }

  document.addEventListener('pointerdown', e => {
    const node = e.target.closest?.('[data-connection-node]');
    if (!node || e.button !== 0) return;
    pointer = { id: node.dataset.connectionNode, x: e.clientX, y: e.clientY, moved: false };
  }, true);

  document.addEventListener('pointermove', e => {
    if (!pointer) return;
    if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 4) pointer.moved = true;
  }, true);

  document.addEventListener('pointerup', () => {
    if (!pointer) return;
    if (pointer.moved) suppressClickUntil = performance.now() + 320;
    pointer = null;
  }, true);

  document.addEventListener('click', e => {
    if (act(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const node = e.target.closest?.('[data-connection-node]');
    if (node) {
      e.preventDefault();
      e.stopImmediatePropagation();
      document.querySelectorAll('.connection-popover,.v9-node-toolbar').forEach(el => el.remove());
      if (performance.now() >= suppressClickUntil) openEditor(node.dataset.connectionNode, e.clientX, e.clientY);
      return;
    }
    if (editor && !e.target.closest?.('#v20NodeEditor')) closeEditor();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && editor) closeEditor();
  }, true);

  window.MSC_V20_NODE = { open: openEditor, close: closeEditor };
})();
