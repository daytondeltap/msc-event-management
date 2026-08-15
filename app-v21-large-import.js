/* MSC v21: non-blocking large calendar import + deferred sync */
(() => {
  'use strict';
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const PAGE=60;
  let selected=new Set(), page=0, busy=false, deferredSave=0;
  const previousLoadImport=typeof loadImport==='function'?loadImport:null;

  const yieldFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  const yieldIdle=()=>new Promise(r=>('requestIdleCallback' in window?requestIdleCallback(()=>r(),{timeout:90}):setTimeout(r,0)));

  function progress(title,detail='',pct=0){
    let el=q('#v21ImportProgress');
    if(!el){el=document.createElement('div');el.id='v21ImportProgress';el.className='v21-import-progress';el.innerHTML='<div class="v21-import-progress-card"><div class="v21-import-progress-head"><span class="v21-fast-spinner"></span><span><strong></strong><small></small></span></div><div class="v21-progress-track"><i></i></div></div>';document.body.appendChild(el);}
    q('strong',el).textContent=title;q('small',el).textContent=detail;q('.v21-progress-track i',el).style.width=`${Math.max(4,Math.min(100,pct))}%`;el.classList.add('show');
  }
  function hideProgress(){q('#v21ImportProgress')?.classList.remove('show');}

  function renderPage(){
    const root=q('#importPreview');if(!root)return;
    const total=imports.length,pages=Math.max(1,Math.ceil(total/PAGE));page=Math.max(0,Math.min(page,pages-1));const start=page*PAGE,end=Math.min(total,start+PAGE);
    const rows=[];for(let i=start;i<end;i++){const e=imports[i];rows.push(`<label class="import-row"><input type="checkbox" data-v21-import-index="${i}" ${selected.has(i)?'checked':''}><strong>${esc(e.name)}</strong><span style="margin-left:auto;color:#777">${fmtDate(e.start)}</span></label>`)}
    root.innerHTML=`<div class="v21-import-summary"><div><strong>${total.toLocaleString()} calendar items</strong><small>${selected.size.toLocaleString()} selected · showing ${total?start+1:0}–${end}</small></div><div class="v21-import-actions"><button type="button" class="button secondary compact" data-v21-select-all>All</button><button type="button" class="button secondary compact" data-v21-select-none>None</button></div></div>${rows.join('')||'<div class="empty-state">No events detected.</div>'}${total>PAGE?`<div class="v21-import-pager"><button type="button" class="button secondary compact" data-v21-page="-1" ${page===0?'disabled':''}>← Previous</button><span>Page ${page+1} of ${pages}</span><button type="button" class="button secondary compact" data-v21-page="1" ${page>=pages-1?'disabled':''}>Next →</button></div>`:''}`;
    const confirm=q('#confirmImportButton');if(confirm)confirm.disabled=!selected.size;
  }
  function resetSelection(){selected=new Set(imports.map((_,i)=>i));page=0;renderPage();}

  loadImport=async function(file){
    if(!file||busy)return;progress('Reading calendar…',file.name,8);await yieldFrame();
    try{
      const lower=file.name.toLowerCase();
      if(lower.endsWith('.pdf')){
        if(!previousLoadImport)throw new Error('PDF importer unavailable');
        await previousLoadImport(file);
      }else{
        const text=await file.text();await yieldIdle();
        imports=lower.endsWith('.json')?parseJSON(text):parseICS(text);
      }
      await yieldFrame();resetSelection();hideProgress();
    }catch(err){console.error(err);hideProgress();toast('Could not read that calendar file');}
  };

  function keyFor(e){const ext=String(e.externalId||'').trim();if(ext)return`id:${ext}`;return`evt:${String(e.name||'').trim().toLowerCase()}|${String(e.start||'')}|${String(e.venue||'').trim().toLowerCase()}`;}
  function lightLocalSave(){
    state.zoom=zoom;state.version=(state.version||1)+1;
    localStorage.setItem(storageKey(),JSON.stringify(state));
    const t=q('#saveText');if(t)t.textContent=room?'Saved locally · syncing soon':'Saved locally';
  }
  function scheduleDeferredFullSave(){
    clearTimeout(deferredSave);deferredSave=setTimeout(()=>{try{save(true);}catch(err){console.warn('Deferred import sync failed',err);}},2400);
  }

  async function commit(){
    if(busy||!selected.size)return;busy=true;
    const picked=[...selected].sort((a,b)=>a-b).map(i=>imports[i]).filter(Boolean);
    const existing=new Set((state.events||[]).map(keyFor));
    const add=[];for(const e of picked){const k=keyFor(e);if(existing.has(k))continue;existing.add(k);add.push(e);}
    if(!add.length){busy=false;toast('All selected events are already on this board');return;}
    progress('Importing calendar…',`Adding ${add.length.toLocaleString()} events`,18);await yieldFrame();
    for(let i=0;i<add.length;i++){state.events.push(add[i]);if(i&&i%300===0){progress('Importing calendar…',`${i.toLocaleString()} of ${add.length.toLocaleString()} added`,18+Math.round(25*i/add.length));await yieldIdle();}}
    progress('Organizing Plan…','Grouping imported events by month',52);await yieldFrame();
    const settings=state.planSettings||{};
    if(settings.autoArrangeImports!==false)window.MSC_V20?.arrangeImportedByMonth?.({persist:false,notify:false});
    await yieldIdle();
    progress('Saving locally…','One bulk snapshot instead of hundreds of saves',68);lightLocalSave();await yieldFrame();
    q('#importModal')?.classList.remove('open');
    const input=q('#calendarFile');if(input)input.value='';
    progress('Drawing workspace…',`${state.events.length.toLocaleString()} total events`,82);await yieldIdle();
    window.MSC_FAST_BOOT&&(window.MSC_FAST_BOOT.ready=true);
    try{render();setView(view,false);}catch(err){console.error('Bulk import render failed',err);}
    await yieldFrame();hideProgress();busy=false;scheduleDeferredFullSave();
    toast(`${add.length.toLocaleString()} event${add.length===1?'':'s'} imported${settings.autoArrangeImports!==false?' · sorted by month':''}`);
  }

  document.addEventListener('change',e=>{const box=e.target.closest?.('[data-v21-import-index]');if(!box)return;const i=+box.dataset.v21ImportIndex;if(box.checked)selected.add(i);else selected.delete(i);const c=q('#confirmImportButton');if(c)c.disabled=!selected.size;const s=q('.v21-import-summary small');if(s)s.textContent=`${selected.size.toLocaleString()} selected · page ${page+1}`;},true);
  document.addEventListener('click',e=>{
    const p=e.target.closest?.('[data-v21-page]');if(p){e.preventDefault();page+=+p.dataset.v21Page;renderPage();return;}
    if(e.target.closest?.('[data-v21-select-all]')){e.preventDefault();selected=new Set(imports.map((_,i)=>i));renderPage();return;}
    if(e.target.closest?.('[data-v21-select-none]')){e.preventDefault();selected.clear();renderPage();return;}
    if(e.target.closest?.('#confirmImportButton')){e.preventDefault();e.stopImmediatePropagation();commit();return;}
  },true);

  window.MSC_FAST_BOOT=window.MSC_FAST_BOOT||{};window.MSC_FAST_BOOT.ready=true;
  if(view==='plan'&&(state.events?.length||0)>=30)requestAnimationFrame(()=>requestAnimationFrame(()=>{try{plan();}catch(err){console.error('Optimized plan hydration failed',err);}}));
})();
