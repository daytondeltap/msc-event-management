/* MSC v21 preboot: prevent large saved boards from doing the legacy all-view render before optimizers load. */
(() => {
  'use strict';
  const HEAVY = 30;
  window.MSC_FAST_BOOT = window.MSC_FAST_BOOT || { ready:false };
  const q = s => document.querySelector(s);

  function shell(count) {
    const root=q('#planView'); if(!root) return;
    root.innerHTML=`<div class="v21-fast-boot"><span class="v21-fast-spinner"></span><div><strong>Opening ${count.toLocaleString()} events…</strong><small>Preparing the optimized planner without rendering hidden pages.</small></div></div>`;
  }

  // Replace the legacy render-all-views function before app-bind's first render().
  render = function() {
    const count=state.events?.length||0;
    if(view==='plan' && count>=HEAVY && !window.MSC_FAST_BOOT.ready){ shell(count); }
    else if(view==='home') home();
    else if(view==='plan') plan();
    else if(view==='events') events();
    else if(view==='board') statusBoard();
    else if(view==='calendar') calendar();
    else if(view==='venues') venues();
    else if(view==='budget') budget();
    try{presenceUI?.();}catch{} try{accountUI?.();}catch{}
  };
})();
