/* MSC v15: contained Aero soundtrack manager */
(() => {
  'use strict';
  const DB = 'msc-aero-audio-v14';
  const STORE = 'tracks';
  const defs = [
    ['lease','LEASE','Takeshi Abo · nostalgia edit'],
    ['lotus','Lotus Waters','remake'],
    ['mii','Mii Maker','Nintendo Wii U · Editing Mii']
  ];
  const q=(s,r=document)=>r.querySelector(s);

  function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function states(){
    const db=await dbOpen();
    const out={};
    await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),st=tx.objectStore(STORE);let left=defs.length;defs.forEach(([id])=>{const r=st.get(id);r.onsuccess=()=>{out[id]=r.result||null;if(--left===0)resolve()};r.onerror=()=>{if(--left===0)resolve()}});tx.onerror=()=>reject(tx.error)}).catch(()=>{});
    db.close();return out;
  }
  function ensureModal(){
    if(q('#v15AudioModal'))return q('#v15AudioModal');
    const el=document.createElement('div');el.id='v15AudioModal';el.className='v15-audio-modal';el.setAttribute('aria-hidden','true');
    el.innerHTML=`<section class="v15-audio-card" role="dialog" aria-modal="true" aria-labelledby="v15AudioTitle"><header class="v15-audio-titlebar"><div><h3 id="v15AudioTitle">Frutiger soundtrack</h3><p>Manage the three local Aero tracks without leaving the app.</p></div><button type="button" data-v15-audio-close aria-label="Close">×</button></header><div class="v15-audio-body"><div id="v15AudioSlots"></div><div class="v15-audio-help">Choose the three matching MP3s. MSC stores them only in this browser with IndexedDB; shared boards never contain the audio files.</div></div><footer class="v15-audio-actions"><button class="button secondary" type="button" data-v15-audio-close>Done</button><button class="button primary" type="button" data-v15-audio-choose>Choose audio files</button></footer></section>`;
    document.body.appendChild(el);
    el.addEventListener('click',e=>{if(e.target===el||e.target.closest('[data-v15-audio-close]'))close();if(e.target.closest('[data-v15-audio-choose]'))choose()});
    return el;
  }
  async function draw(){
    const host=q('#v15AudioSlots');if(!host)return;const s=await states().catch(()=>({}));
    host.innerHTML=defs.map(([id,title,sub],i)=>{const r=s[id];return `<div class="v15-audio-slot"><span>${i===0?'♫':i===1?'◉':'◎'}</span><p><strong>${title}</strong><small>${r?.name?`Saved as ${r.name}`:sub}</small></p><b class="v15-audio-state ${r?'loaded':''}">${r?'Loaded':'Not loaded'}</b></div>`}).join('');
  }
  function open(){const el=ensureModal();el.classList.add('open');el.setAttribute('aria-hidden','false');draw()}
  function close(){const el=q('#v15AudioModal');el?.classList.remove('open');el?.setAttribute('aria-hidden','true')}
  function choose(){
    let input=q('#aeroTrackFiles');
    if(!input){input=document.createElement('input');input.type='file';input.id='aeroTrackFiles';input.accept='audio/*';input.multiple=true;input.className='v15-audio-file';document.body.appendChild(input)}
    const once=()=>setTimeout(draw,250);input.addEventListener('change',once,{once:true});input.click();
  }
  document.addEventListener('click',e=>{
    const hit=e.target.closest?.('[data-aero-load],[data-v14-load-audio]');
    if(!hit)return;
    e.preventDefault();e.stopImmediatePropagation();open();
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#v15AudioModal')?.classList.contains('open')){e.preventDefault();close()}},true);
  ensureModal();
})();
