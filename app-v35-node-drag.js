/* v35: deterministic connection-node pointer owner. Loaded before v24 to avoid its RAF/pointerup race. */
(() => {
  'use strict';

  let drag = null;
  let swallowClickUntil = 0;

  const connection = id => (state.connections || []).find(c => c.id === id) || null;
  function worldPoint(clientX, clientY) {
    const viewport = document.getElementById('plannerViewport');
    if (!viewport) return null;
    const r = viewport.getBoundingClientRect();
    const z = Math.max(.01, zoom || 1);
    return {
      x: Math.max(28, Math.min(WORLD.width - 28, (viewport.scrollLeft + clientX - r.left) / z)),
      y: Math.max(28, Math.min(WORLD.height - 28, (viewport.scrollTop + clientY - r.top) / z))
    };
  }
  function commit(id, clientX, clientY) {
    const c = connection(id), point = worldPoint(clientX, clientY);
    if (!c || !point) return false;
    c.nodeMode = 'manual';
    c.node = { x: point.x, y: point.y };
    try { updateConnectionSvg(); } catch {}
    return true;
  }

  document.addEventListener('pointerdown', event => {
    const node = event.target.closest?.('[data-connection-node]');
    if (!node || event.button !== 0) return;
    drag = {
      id: node.dataset.connectionNode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false
    };
    window.MSC_V34?.closeNodeEditor?.();
    try { node.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('pointermove', event => {
    if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) drag.moved = true;
    if (drag.moved) commit(drag.id, drag.lastX, drag.lastY);
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', event => {
    if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return;
    const done = drag;
    drag = null;
    if (done.moved) {
      commit(done.id, event.clientX, event.clientY);
      swallowClickUntil = performance.now() + 350;
      try { save(true); updateConnectionSvg(); } catch (err) { console.warn('Connection route save failed', err); }
    } else {
      swallowClickUntil = performance.now() + 350;
      window.MSC_V34?.openNodeEditor?.(done.id, event.clientX, event.clientY);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('pointercancel', event => {
    if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return;
    drag = null;
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('click', event => {
    const node = event.target.closest?.('[data-connection-node]');
    if (!node) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (performance.now() > swallowClickUntil) window.MSC_V34?.openNodeEditor?.(node.dataset.connectionNode, event.clientX, event.clientY);
  }, true);

  window.MSC_V35_NODE = { commit };
})();
