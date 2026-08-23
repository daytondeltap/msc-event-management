/* v34: README-contract sanity repairs for connection nodes and mobile More. */
(() => {
  'use strict';

  const V34 = window.MSC_V34 = window.MSC_V34 || {};
  const TONES = ['neutral','blue','green','yellow','red'];
  let nodeEditor = null;
  let ignoreNextMoreClick = false;
  let ignoreMoreClickTimer = 0;
  let moreReturnFocus = null;

  const targetClosest = (event, selector) => event.target instanceof Element ? event.target.closest(selector) : null;
  const connection = id => (state.connections || []).find(c => c.id === id) || null;
  const eventName = id => state.events.find(e => e.id === id)?.name || 'Event';

  function closeNodeEditor(){
    nodeEditor?.remove();
    nodeEditor = null;
    document.querySelectorAll('.v24-node-toolbar').forEach(el => el.remove());
  }

  function clampNodeEditor(el, x, y){
    const r = el.getBoundingClientRect();
    const left = Math.max(10, Math.min(innerWidth - r.width - 10, x + 14));
    const top = Math.max(10, Math.min(innerHeight - r.height - 10, y + 14));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function openNodeEditor(id, x, y){
    const c = connection(id);
    if(!c) return;
    closeNodeEditor();
    const el = document.createElement('div');
    el.id = 'v34NodeEditor';
    el.className = 'v20-node-editor v34-node-editor show';
    el.dataset.v24Node = id;
    el.innerHTML = `
      <div class="v20-node-editor-head">
        <div><strong>${esc(eventName(c.from))} → ${esc(eventName(c.to))}</strong><small>Connection settings</small></div>
        <button type="button" class="v20-node-close" data-v34-node-close aria-label="Close connection settings">×</button>
      </div>
      <div class="v20-node-editor-grid">
        <label class="full"><span>Node name / label</span><input data-v24-label value="${esc(c.label || '')}" placeholder="e.g. Needs approval"></label>
        <label><span>Line</span><select data-v24-style><option value="solid" ${c.style !== 'dashed' ? 'selected' : ''}>Solid</option><option value="dashed" ${c.style === 'dashed' ? 'selected' : ''}>Dashed</option></select></label>
        <label><span>Color</span><select data-v24-tone>${TONES.map(t => `<option value="${t}" ${c.tone === t ? 'selected' : ''}>${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select></label>
      </div>
      <div class="v20-node-actions">
        <button type="button" class="button secondary compact" data-v24-branch>Branch</button>
        <button type="button" class="button secondary compact" data-v24-auto>Auto route</button>
        <button type="button" class="button secondary compact" data-v24-reverse>Reverse</button>
        <button type="button" class="button danger ghost compact" data-v24-delete>Delete</button>
      </div>`;
    document.body.appendChild(el);
    nodeEditor = el;
    clampNodeEditor(el, x, y);
    requestAnimationFrame(() => el.querySelector('[data-v24-label]')?.focus({preventScroll:true}));
  }

  // v24 creates a toolbar using an obsolete toolbar class family while the active
  // production stylesheet owns the supported .v20-node-editor shell. Replace only
  // that UI shell and keep all data-v24-* actions/state handling in v24.
  document.addEventListener('pointerup', event => {
    const hidden = document.querySelector('.v24-node-toolbar[data-v24-node]');
    if(!hidden) return;
    const id = hidden.dataset.v24Node;
    hidden.remove();
    openNodeEditor(id, event.clientX, event.clientY);
  }, true);

  document.addEventListener('click', event => {
    if(targetClosest(event, '[data-v34-node-close]')){
      event.preventDefault();
      closeNodeEditor();
      return;
    }
    const action = targetClosest(event, '#v34NodeEditor [data-v24-branch],#v34NodeEditor [data-v24-auto],#v34NodeEditor [data-v24-reverse],#v34NodeEditor [data-v24-delete]');
    if(action){ setTimeout(closeNodeEditor, 0); return; }
    if(nodeEditor && !targetClosest(event, '#v34NodeEditor') && !targetClosest(event, '[data-connection-node]')) closeNodeEditor();
  });

  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && nodeEditor){
      event.preventDefault();
      event.stopPropagation();
      closeNodeEditor();
    }
  }, true);

  function currentMore(){
    return {
      button: document.getElementById('mobileMoreButton'),
      sheet: document.getElementById('mobileMoreSheet')
    };
  }

  function ensureMore(){
    try { window.MSC_BUDGET_QOL?.syncMobileMenu?.(); } catch {}
    return currentMore();
  }

  // Important: this must be read-only. Calling syncMobileMenu() from the sheet class
  // observer creates a desktop loop because v32 closes the hidden sheet while syncing.
  function syncMoreA11y(){
    const {button,sheet} = currentMore();
    if(!button || !sheet) return;
    const open = sheet.classList.contains('open');
    button.setAttribute('aria-controls','mobileMoreSheet');
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-expanded',String(open));
    sheet.setAttribute('aria-hidden',String(!open));
  }

  function moreVisible(button){
    if(!button || button.hidden) return false;
    const style = getComputedStyle(button);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function openMore(){
    const {button,sheet} = ensureMore();
    if(!button || !sheet || !moreVisible(button)) return false;
    moreReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    sheet.classList.add('open');
    document.body.classList.add('mobile-more-open');
    syncMoreA11y();
    requestAnimationFrame(() => sheet.querySelector('.mobile-more-item,[data-mobile-more-close]')?.focus?.({preventScroll:true}));
    return true;
  }

  function closeMore(restoreFocus=false){
    const {button,sheet} = currentMore();
    if(!sheet) return false;
    const wasOpen = sheet.classList.contains('open');
    sheet.classList.remove('open');
    document.body.classList.remove('mobile-more-open');
    syncMoreA11y();
    if(wasOpen && restoreFocus){
      const target = moreReturnFocus?.isConnected ? moreReturnFocus : button;
      requestAnimationFrame(() => target?.focus?.({preventScroll:true}));
    }
    return wasOpen;
  }

  function toggleMore(){
    const {sheet} = ensureMore();
    return sheet?.classList.contains('open') ? closeMore(true) : openMore();
  }

  // Register before v33. Handle pointer activation on pointerup, then consume only the
  // one synthetic click generated by that pointer gesture. A later keyboard click is valid.
  document.addEventListener('pointerup', event => {
    if(!targetClosest(event,'#mobileMoreButton')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ignoreNextMoreClick = true;
    clearTimeout(ignoreMoreClickTimer);
    ignoreMoreClickTimer = setTimeout(() => { ignoreNextMoreClick = false; }, 0);
    toggleMore();
  }, true);

  document.addEventListener('click', event => {
    if(targetClosest(event,'#mobileMoreButton')){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(ignoreNextMoreClick){
        ignoreNextMoreClick = false;
        clearTimeout(ignoreMoreClickTimer);
        return;
      }
      toggleMore();
      return;
    }
    if(targetClosest(event,'[data-mobile-more-close]')){
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMore(true);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && document.getElementById('mobileMoreSheet')?.classList.contains('open')){
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMore(true);
    }
  }, true);

  const observeMore = () => {
    const {sheet} = ensureMore();
    if(!sheet || sheet.dataset.v34Observed) return;
    sheet.dataset.v34Observed = '1';
    new MutationObserver(syncMoreA11y).observe(sheet,{attributes:true,attributeFilter:['class']});
    syncMoreA11y();
  };
  observeMore();
  setTimeout(observeMore,200);
  setTimeout(observeMore,900);

  V34.openNodeEditor = openNodeEditor;
  V34.closeNodeEditor = closeNodeEditor;
  V34.openMore = openMore;
  V34.closeMore = closeMore;
  V34.toggleMore = toggleMore;
  V34.syncMore = syncMoreA11y;
})();
