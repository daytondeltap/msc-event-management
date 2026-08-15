/* MSC v11.1 board-first sharing + reliable rename */
(() => {
  'use strict';
  const RECENTS='mscBoardRecentsV10', OWNER='mscBoardOwnerKey:', ENDPOINT=`${SB_URL}/functions/v1/persistent-board`;
  let share={enabled:false,owner:false,role:'',loading:false,denied:false}, renameId='';

  const recents=()=>{try{const x=JSON.parse(localStorage.getItem(RECENTS)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
  const putRecents=x=>{try{localStorage.setItem(RECENTS,JSON.stringify(x.slice(0,60)))}catch{}};
  const recent=id=>recents().find(x=>x.boardId===id);
  const ownerKey=id=>localStorage.getItem(OWNER+id)||'';
  const ensureOwnerKey=id=>{let k=ownerKey(id);if(!k){k=uid().replaceAll('-','')+uid().replaceAll('-','');localStorage.setItem(OWNER+id,k)}return k};
  async function accessToken(){try{const {data}=await supabase?.auth?.getSession?.()||{};return data?.session?.access_token||''}catch{return''}}
  async function req(method,id,body=null){
    const headers={'Content-Type':'application/json'},t=await accessToken(),k=ownerKey(id);if(t)headers.Authorization=`Bearer ${t}`;if(k)headers['x-board-owner']=k;
    const opts={method,headers,cache:'no-store'};if(body!==null)opts.body=JSON.stringify({boardId:id,...(k?{ownerKey:k}:{}),...body});
    const r=await fetch(`${ENDPOINT}?board=${encodeURIComponent(id)}`,opts);let d={};try{d=await r.json()}catch{};if(!r.ok){const e=new Error(d.error||`Board request failed (${r.status})`);e.status=r.status;throw e}return d;
  }
  const modal=(id,on)=>{const e=document.getElementById(id);if(e){e.classList.toggle('open',on);e.setAttribute('aria-hidden',on?'false':'true')}};
  function localSnapshot(id){
    if(id===room)return{...cleanState(),boardTitle:state.boardTitle||recent(id)?.title||'Untitled board',persistentBoard:true};
    try{const x=JSON.parse(localStorage.getItem(`${STORAGE}:room:${id}`)||'null');return x?.events?x:null}catch{return null}
  }
  async function ensureServer(id){
    try{const d=await req('GET',id);if(d.found)return d}catch(e){if(e.status===403)throw e}
    const snap=localSnapshot(id);if(!snap)throw new Error('board_not_found');if(!authUser)ensureOwnerKey(id);
    const title=snap.boardTitle||recent(id)?.title||'Untitled board';await req('POST',id,{snapshot:{...snap,boardTitle:title,persistentBoard:true},title,checkpoint:true,label:'Board recovered'});return req('GET',id);
  }

  function ensureRenameModal(){
    if(document.getElementById('boardRenameModal'))return;
    const m=document.createElement('div');m.id='boardRenameModal';m.className='modal';m.setAttribute('aria-hidden','true');m.innerHTML=`<div class="modal-backdrop" data-close-v11-rename></div><section class="modal-card board-rename-card" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">Board</div><h2>Rename board</h2><p>Updates the board name for everyone.</p></div><button class="icon-button" type="button" data-close-v11-rename>×</button></div><form id="v11RenameForm" class="board-rename-form"><label class="field"><span>Board name</span><input name="title" maxlength="100" required autocomplete="off"></label><div class="modal-actions"><button class="button secondary" type="button" data-close-v11-rename>Cancel</button><button class="button primary" type="submit">Rename</button></div></form></section>`;document.body.appendChild(m);
  }
  function patchBoards(){
    const names=new Map(recents().map(x=>[x.boardId,x.title]));
    document.querySelectorAll('[data-board-card]').forEach(card=>{const id=card.dataset.boardCard,title=id===room?(state.boardTitle||names.get(id)):names.get(id),label=card.querySelector('.board-title-wrap strong');if(title&&label&&label.textContent!==title)label.textContent=title});
    document.querySelectorAll('[data-board-rename]').forEach(b=>{b.dataset.v11Rename=b.dataset.boardRename;b.removeAttribute('data-board-rename')});
    const s=document.getElementById('shareButton');if(s&&s.dataset.v11!=='1'){s.dataset.v11='1';s.innerHTML='<span>↗</span> Share'}
  }
  function openRename(id){ensureRenameModal();renameId=id;const input=document.querySelector('#v11RenameForm input[name="title"]'),card=document.querySelector(`[data-board-card="${CSS.escape(id)}"] .board-title-wrap strong`);if(input)input.value=(id===room?state.boardTitle:'')||recent(id)?.title||card?.textContent?.trim()||'Untitled board';modal('boardRenameModal',true);setTimeout(()=>{input?.focus();input?.select()},25)}
  async function renameBoard(id,title){
    const name=String(title||'').trim().slice(0,100);if(!id||!name)return;const btn=document.querySelector('#v11RenameForm button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='Renaming…'}
    try{await ensureServer(id);await req('POST',id,{action:'rename',title:name});const list=recents(),i=list.findIndex(x=>x.boardId===id),now=new Date().toISOString();if(i>=0)list[i]={...list[i],title:name,updatedAt:now};else list.unshift({boardId:id,title:name,updatedAt:now,lastOpenedAt:now});putRecents(list);if(id===room){state.boardTitle=name;localStorage.setItem(storageKey(),JSON.stringify(state));save(false)}else{try{const k=`${STORAGE}:room:${id}`,x=JSON.parse(localStorage.getItem(k)||'null');if(x){x.boardTitle=name;localStorage.setItem(k,JSON.stringify(x))}}catch{}}modal('boardRenameModal',false);patchBoards();const card=document.querySelector(`[data-board-card="${CSS.escape(id)}"] .board-title-wrap strong`);if(card&&card.textContent!==name)card.textContent=name;const pill=document.querySelector('#boardContextPill strong');if(id===room&&pill&&pill.textContent!==name)pill.textContent=name;toast('Board renamed')}catch(e){console.error(e);toast(e.status===403?'You cannot rename this private board':'Could not rename this board')}finally{if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent='Rename'}}
  }

  function rebuildShare(){
    const card=document.querySelector('#shareModal .share-card');if(!card)return;card.innerHTML=`<div class="modal-header"><div><div class="eyebrow">Sharing</div><h2 id="v11ShareTitle">Share board</h2><p id="v11ShareSub">Sharing is attached to a saved board.</p></div><button class="icon-button" type="button" data-close-v11-share>×</button></div><div id="v11ShareBody"></div>`;
  }
  const link=()=>{const u=new URL(location.href);if(room)u.searchParams.set('board',room);return room?u.toString():''};
  function drawShare(){
    const body=document.getElementById('v11ShareBody');if(!body)return;const title=state.boardTitle||recent(room)?.title||'Untitled board',h=document.getElementById('v11ShareTitle'),p=document.getElementById('v11ShareSub');
    if(!room){if(h)h.textContent='Share a board';if(p)p.textContent='Open or create a board before enabling collaboration.';body.innerHTML=`<div class="share-board-required"><div class="share-required-icon">▦</div><strong>Choose a board first</strong><p>Collaboration is a share setting on an existing board, not a separate workspace.</p><div class="share-required-actions"><button class="button secondary" type="button" data-v11-open-boards>Open Boards</button><button class="button primary" type="button" data-v11-new-board>＋ New board</button></div></div>`;return}
    if(h)h.textContent=`Share ${title}`;if(p)p.textContent='Enable link sharing, then copy the join link.';
    if(share.denied){body.innerHTML=`<div class="share-board-required"><div class="share-required-icon">⊘</div><strong>This board is private</strong><p>You do not have access to this board.</p><div class="share-required-actions"><button class="button primary" type="button" data-v11-open-boards>Back to Boards</button></div></div>`;return}
    body.innerHTML=`<div class="share-board-summary"><div class="share-board-icon">▦</div><div><strong>${esc(title)}</strong><small>${share.loading?'Checking sharing…':share.enabled?'Link sharing on':'Private board'}</small></div></div><div class="share-access-panel"><div class="share-access-copy"><strong>Anyone with the link can join</strong><small>${share.enabled?'New people can open and collaborate on this board.':'Only the owner and remembered members can open it.'}</small></div><label class="share-toggle ${share.owner?'':'disabled'}"><input id="v11ShareToggle" type="checkbox" ${share.enabled?'checked':''} ${share.owner&&!share.loading?'':'disabled'}><span></span></label></div><div class="share-member-note">${share.owner?'Turning this off blocks new people. Signed-in collaborators who already joined keep access from Boards.':`Only the owner can change sharing. Your access is ${esc(share.role||'member')}.`}</div><div class="share-link-row v11-share-link-row"><input readonly value="${share.enabled?esc(link()):''}" placeholder="Enable link sharing to get a join link"><button class="button primary" type="button" data-v11-copy ${share.enabled?'':'disabled'}>Copy link</button></div>`;
  }
  async function refreshShare(repair=true){
    if(!room){share={enabled:false,owner:false,role:'',loading:false,denied:false};drawShare();return}share.loading=true;drawShare();
    try{const d=repair?await ensureServer(room):await req('GET',room);share={enabled:!!d.shareEnabled,owner:!!d.owner,role:d.role||'',loading:false,denied:false};state.collaborationEnabled=share.enabled;if(d.title)state.boardTitle=d.title;localStorage.setItem(storageKey(),JSON.stringify(state));const list=recents(),i=list.findIndex(x=>x.boardId===room);if(i>=0){list[i]={...list[i],title:state.boardTitle||list[i].title,shareEnabled:share.enabled,updatedAt:d.updatedAt||list[i].updatedAt};putRecents(list)}}catch(e){share.loading=false;if(e.status===403){share.denied=true;share.enabled=false;if(channel&&supabase){try{await supabase.removeChannel(channel)}catch{}channel=null;connected=false}}else console.warn('Share state unavailable',e)}drawShare();patchBoards()
  }
  async function setShare(on){if(!room||!share.owner||share.loading)return;share.loading=true;drawShare();try{const d=await req('POST',room,{action:'sharing',shareEnabled:!!on});share.enabled=!!d.shareEnabled;state.collaborationEnabled=share.enabled;save(false);if(share.enabled&&supabase)reconnectRoom();toast(share.enabled?'Link sharing enabled':'Link sharing disabled')}catch(e){console.error(e);toast(e.status===403?'Only the owner can change sharing':'Could not change sharing')}finally{share.loading=false;drawShare()}}
  function openShare(){rebuildShare();modal('shareModal',true);drawShare();if(room)refreshShare()}
  function goBoards(make=false){modal('shareModal',false);setView('boards');if(make)setTimeout(()=>document.getElementById('createBoardButton')?.click(),30)}

  ensureRenameModal();rebuildShare();patchBoards();
  const shareBtn=document.getElementById('shareButton');if(shareBtn)shareBtn.onclick=e=>{e.preventDefault();openShare()};
  const basePresence=presenceUI;presenceUI=function(){basePresence();document.getElementById('persistentBoardControl')?.remove();if(document.getElementById('v11ShareBody'))drawShare()};
  const baseClean=cleanState;cleanState=function(){return{...baseClean(),boardTitle:state.boardTitle||'',collaborationEnabled:!!state.collaborationEnabled}};
  createShared=function(){goBoards(true)};

  const obs=new MutationObserver(()=>{patchBoards();document.getElementById('persistentBoardControl')?.remove()});obs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    const r=e.target.closest?.('[data-v11-rename]');if(r){e.preventDefault();e.stopPropagation();openRename(r.dataset.v11Rename);return}
    if(e.target.closest?.('[data-close-v11-rename]')){modal('boardRenameModal',false);return}
    if(e.target.closest?.('[data-close-v11-share]')){modal('shareModal',false);return}
    if(e.target.closest?.('[data-v11-open-boards]')){goBoards(false);return}
    if(e.target.closest?.('[data-v11-new-board]')){goBoards(true);return}
    if(e.target.closest?.('[data-v11-copy]')){if(!share.enabled)return toast('Enable link sharing first');navigator.clipboard.writeText(link()).then(()=>toast('Share link copied')).catch(()=>toast('Could not copy the link'));return}
  },true);
  document.addEventListener('change',e=>{if(e.target.id==='v11ShareToggle')setShare(e.target.checked)},true);
  document.addEventListener('submit',e=>{if(e.target.id!=='v11RenameForm')return;e.preventDefault();renameBoard(renameId,new FormData(e.target).get('title'))},true);

  if(room)setTimeout(async()=>{await refreshShare();if(share.denied){toast('This board is private');setView('boards')}},300);
})();
