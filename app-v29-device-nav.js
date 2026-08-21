/* MSC v29: adaptive cross-device navigation */
(() => {
  'use strict';
  const MOBILE = matchMedia('(max-width: 900px)');
  const COARSE = matchMedia('(pointer: coarse)');
  const originalHomes = new Map();
  let syncQueued = false;

  function remember(el){
    if(!el || originalHomes.has(el)) return;
    originalHomes.set(el,{parent:el.parentNode,next:el.nextSibling});
  }
  function moveUtility(el,nav){
    if(!el||!nav)return;
    remember(el);
    if(el.parentNode!==nav)nav.appendChild(el);
    el.dataset.mobileUtility='1';
  }
  function restore(el){
    const home=originalHomes.get(el);if(!el||!home?.parent)return;
    if(el.parentNode===home.parent)return;
    if(home.next&&home.next.parentNode===home.parent)home.parent.insertBefore(el,home.next);else home.parent.appendChild(el);
    delete el.dataset.mobileUtility;
  }
  function utilityItems(){return ['importButton','exportButton','settingsButton'].map(id=>document.getElementById(id)).filter(Boolean)}
  function syncUtilities(){
    const nav=document.querySelector('.nav-list');if(!nav)return;
    const items=utilityItems();
    if(MOBILE.matches)items.forEach(el=>moveUtility(el,nav));else items.forEach(restore);
    syncAria();
  }
  function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(()=>{syncQueued=false;syncUtilities();clampFloating()})}

  function resetViewportFit(){
    const topbar=document.querySelector('.topbar');
    if(topbar){topbar.style.left='';topbar.style.width='';topbar.style.maxWidth='';}
    document.querySelectorAll('.v25-settings').forEach(el=>{el.style.left='';el.style.top='';el.style.right='';el.style.bottom='';el.style.width='';el.style.height=''})
  }
  function fitMobileViewport(){
    if(!MOBILE.matches){resetViewportFit();return}
    const vv=window.visualViewport;
    const left=vv?.offsetLeft||0,top=vv?.offsetTop||0;
    const width=Math.max(280,Math.floor(vv?.width||window.innerWidth));
    const height=Math.max(240,Math.floor(vv?.height||window.innerHeight));

    // The top bar is sticky. Its left value is a viewport threshold, not a normal offset,
    // so compensate only for the visual viewport itself; subtracting main-shell's rect
    // would double-apply any transient document offset and push controls off-screen.
    const topbar=document.querySelector('.topbar');
    if(topbar){
      topbar.style.left=`${Math.round(left)}px`;
      topbar.style.width=`${width}px`;
      topbar.style.maxWidth=`${width}px`;
    }

    // Fixed settings overlays otherwise size to the layout viewport, which can differ slightly
    // from visualViewport on mobile Chrome. Bound the overlay to the actually visible area.
    document.querySelectorAll('.v25-settings').forEach(el=>{
      el.style.left=`${Math.round(left)}px`;
      el.style.top=`${Math.round(top)}px`;
      el.style.right='auto';
      el.style.bottom='auto';
      el.style.width=`${width}px`;
      el.style.height=`${height}px`;
    });
  }

  function syncViewport(){
    const vv=window.visualViewport;
    const h=Math.max(240,Math.floor(vv?.height||window.innerHeight));
    const w=Math.max(280,Math.floor(vv?.width||window.innerWidth));
    document.documentElement.style.setProperty('--msc-vv-height',`${h}px`);
    document.documentElement.style.setProperty('--msc-vv-width',`${w}px`);
    document.documentElement.classList.toggle('msc-coarse-pointer',COARSE.matches);
    fitMobileViewport();
    clampFloating();
  }
  function revealActive(){
    if(!MOBILE.matches)return;
    const nav=document.querySelector('.nav-list'),active=nav?.querySelector('.nav-item.active');
    if(!active)return;
    try{active.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}catch{}
  }
  function syncAria(){
    document.querySelectorAll('.nav-item[data-view],.brand[data-view]').forEach(el=>{
      if(el.classList.contains('active'))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
    });
  }
  function clampElement(el,pad=8){
    if(!el||getComputedStyle(el).position!=='fixed')return;
    const r=el.getBoundingClientRect(),vv=window.visualViewport;
    const vw=vv?.width||innerWidth,vh=vv?.height||innerHeight;
    let left=r.left,top=r.top,changed=false;
    if(r.right>vw-pad){left=Math.max(pad,vw-r.width-pad);changed=true}
    if(r.left<pad){left=pad;changed=true}
    if(r.bottom>vh-pad){top=Math.max(pad,vh-r.height-pad);changed=true}
    if(r.top<pad){top=pad;changed=true}
    if(changed){el.style.left=`${Math.round(left)}px`;el.style.top=`${Math.round(top)}px`;el.style.right='auto';el.style.bottom='auto'}
  }
  function clampFloating(){document.querySelectorAll('.v20-node-editor.show').forEach(el=>clampElement(el,8))}

  function topOpenLayer(){
    return document.querySelector('.v25-settings.open')||document.querySelector('.drawer.open')||[...document.querySelectorAll('.modal.open')].pop()||document.querySelector('.v20-node-editor.show');
  }
  function closeTopLayer(){
    const layer=topOpenLayer();if(!layer)return false;
    const close=layer.querySelector('[data-v25-settings-close],[data-close-drawer],[data-close-share],[data-close-account],[data-close-maps],[data-close-import],.v20-node-close');
    if(close){close.click();return true}
    return false;
  }

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!e.defaultPrevented&&closeTopLayer()){e.preventDefault();e.stopPropagation()}
  },true);
  document.addEventListener('focusin',e=>{
    const target=e.target;if(!(target instanceof Element))return;
    if(!target.closest('.modal-card,.drawer-panel,.v25-settings-card,.v20-node-editor'))return;
    setTimeout(()=>{try{target.scrollIntoView({block:'nearest',inline:'nearest'})}catch{}},30);
  });
  document.addEventListener('click',e=>{
    const viewButton=e.target.closest?.('[data-view]');
    if(viewButton){setTimeout(()=>{syncViewport();queueSync();revealActive()},20);return}
    if(e.target.closest?.('#settingsButton,#importButton,#exportButton,#shareButton,#accountButton,#presenceButton'))setTimeout(()=>{syncViewport();queueSync()},20);
  },true);
  window.addEventListener('msc:viewchange',()=>setTimeout(()=>{syncViewport();syncAria();revealActive()},0));
  window.addEventListener('orientationchange',()=>setTimeout(()=>{syncViewport();queueSync();revealActive()},80));
  window.addEventListener('resize',()=>{syncViewport();queueSync()},{passive:true});
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
  MOBILE.addEventListener?.('change',()=>{syncViewport();queueSync();setTimeout(revealActive,30)});COARSE.addEventListener?.('change',syncViewport);

  const sidebar=document.querySelector('.sidebar');
  if(sidebar)new MutationObserver(queueSync).observe(sidebar,{childList:true,subtree:true});
  syncViewport();syncUtilities();setTimeout(()=>{syncViewport();syncUtilities();revealActive()},150);setTimeout(()=>{syncViewport();syncUtilities()},700);
  window.MSC_DEVICE_NAV={sync:syncUtilities,viewport:syncViewport,revealActive,fit:fitMobileViewport};
})();
