/* generic event manager v31 — regression/stability fixes only */
(() => {
  'use strict';

  const AUTH_RETURN_KEY='gemAuthReturnV31';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let authInitPromise=null;

  /* Some legacy Boards helpers forgot the guest-owner header. Add it centrally without changing request semantics. */
  if(!window.fetch.__gemOwnerKeyV31){
    const nativeFetch=window.fetch.bind(window);
    const wrapped=async(input,init={})=>{
      try{
        const raw=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
        const u=new URL(raw,location.href);
        if(u.pathname.includes('/functions/v1/persistent-board')){
          const board=u.searchParams.get('board')||'';
          const ownerKey=board?localStorage.getItem(`mscBoardOwnerKey:${board}`)||'':'';
          if(ownerKey){
            const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
            if(!headers.has('x-board-owner'))headers.set('x-board-owner',ownerKey);
            init={...init,headers};
          }
        }
      }catch(err){console.warn('Board request owner-key patch skipped',err)}
      return nativeFetch(input,init);
    };
    wrapped.__gemOwnerKeyV31=true;
    window.fetch=wrapped;
  }

  function authMessage(text,tone=''){
    const note=document.getElementById('authSetupNote');
    if(note){note.textContent=text;note.dataset.tone=tone;}
  }

  function cleanedCurrentUrl(){
    const u=new URL(location.href);
    u.hash='';
    ['code','error','error_code','error_description','error_uri'].forEach(k=>u.searchParams.delete(k));
    return u;
  }

  function oauthRedirectUrl(){
    /* Keep the OAuth allow-list target deterministic. Board/query state is restored from sessionStorage after sign-in. */
    return new URL(location.pathname,location.origin).toString();
  }

  async function importSupabaseFallback(){
    let lastError=null;
    for(const src of [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm',
      'https://esm.run/@supabase/supabase-js@2.111.0'
    ]){
      try{
        const mod=await Promise.race([
          import(src),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error(`timeout:${src}`)),6500))
        ]);
        if(mod?.createClient)return mod;
      }catch(err){lastError=err}
    }
    throw lastError||new Error('Supabase client library unavailable');
  }

  async function makeFallbackClient(){
    const mod=await importSupabaseFallback();
    const client=mod.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    supabase=client;
    const {data}=await client.auth.getSession();
    try{setAuthUser(data.session?.user||null)}catch{}
    client.auth.onAuthStateChange((_event,session)=>{
      try{setAuthUser(session?.user||null)}catch{}
      try{if(room)reconnectRoom()}catch{}
    });
    try{if(room&&!channel)connectRoom()}catch{}
    return client;
  }

  async function ensureSupabaseReady(){
    if(typeof supabase!=='undefined'&&supabase)return supabase;
    if(authInitPromise)return authInitPromise;
    authInitPromise=(async()=>{
      /* app-bind starts Supabase during normal startup. Give that request time to finish before retrying. */
      for(let i=0;i<20;i++){
        if(typeof supabase!=='undefined'&&supabase)return supabase;
        await sleep(100);
      }
      if(typeof initSupabase==='function'){
        try{await initSupabase()}catch(err){console.warn('Primary Supabase retry failed',err)}
      }
      if(typeof supabase!=='undefined'&&supabase)return supabase;
      /* Some school/network filters block esm.sh. Fall back to independent ESM CDNs before declaring sign-in unavailable. */
      return makeFallbackClient();
    })().finally(()=>{authInitPromise=null});
    return authInitPromise;
  }

  async function stableGoogleSignIn(){
    const button=document.getElementById('signInGoogleButton');
    const oldText=button?.innerHTML||'';
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    authMessage('Connecting to Google…');
    try{
      const client=await ensureSupabaseReady();
      if(!client?.auth)throw new Error('Online sign-in service could not be reached. Please retry.');
      const returnUrl=cleanedCurrentUrl();
      try{sessionStorage.setItem(AUTH_RETURN_KEY,returnUrl.toString())}catch{}
      const {error}=await client.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:oauthRedirectUrl()}
      });
      if(error)throw error;
    }catch(err){
      console.error('Google sign-in failed',err);
      const message=String(err?.message||err||'Google sign-in failed');
      authMessage(`Google sign-in failed: ${message}`,'error');
      try{toast('Google sign-in failed — see the account panel for details')}catch{}
      try{sessionStorage.removeItem(AUTH_RETURN_KEY)}catch{}
    }finally{
      if(button&&document.body.contains(button)){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=oldText;}
    }
  }

  async function stableSignOut(){
    try{
      const client=await ensureSupabaseReady();
      if(!client?.auth)throw new Error('Sign-out service unavailable');
      const {error}=await client.auth.signOut();
      if(error)throw error;
      try{toast('Signed out')}catch{}
    }catch(err){
      console.warn('Sign out failed',err);
      try{toast('Could not sign out — please retry')}catch{}
    }
  }

  function patchAccountCopy(){
    if(typeof authUser!=='undefined'&&authUser)return;
    const stateBox=document.getElementById('accountState');
    if(stateBox){
      stateBox.innerHTML='<div class="account-profile"><span class="big-avatar">G</span><span><strong>Not signed in</strong><small>Continue with Google to sync identity, boards and collaboration across devices.</small></span></div>';
    }
    const note=document.getElementById('authSetupNote');
    if(note&&!note.dataset.tone)note.textContent='Google sign-in is available. If Google rejects an account, this panel will show the returned error.';
  }

  function bindAuthButtons(){
    const signIn=document.getElementById('signInGoogleButton');
    if(signIn&&signIn.dataset.v31Auth!=='1'){
      signIn.dataset.v31Auth='1';
      signIn.onclick=stableGoogleSignIn;
    }
    const signOutButton=document.getElementById('signOutButton');
    if(signOutButton&&signOutButton.dataset.v31Auth!=='1'){
      signOutButton.dataset.v31Auth='1';
      signOutButton.onclick=stableSignOut;
    }
    patchAccountCopy();
  }

  /* Keep the account copy accurate after existing auth UI re-renders. */
  if(typeof accountUI==='function'&&!accountUI.__gemV31){
    const previousAccountUI=accountUI;
    accountUI=function(){
      const result=previousAccountUI();
      patchAccountCopy();
      bindAuthButtons();
      return result;
    };
    accountUI.__gemV31=true;
  }

  function oauthErrorFromUrl(){
    const search=new URLSearchParams(location.search);
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    return search.get('error_description')||hash.get('error_description')||search.get('error')||hash.get('error')||'';
  }

  async function restoreAuthReturn(){
    const error=oauthErrorFromUrl();
    if(error){
      authMessage(`Google sign-in failed: ${decodeURIComponent(error)}`,'error');
      try{toast('Google sign-in was not completed')}catch{}
      return;
    }
    let saved='';
    try{saved=sessionStorage.getItem(AUTH_RETURN_KEY)||''}catch{}
    if(!saved)return;
    const client=await ensureSupabaseReady();
    let user=null;
    try{const {data}=await client?.auth?.getSession?.()||{};user=data?.session?.user||null}catch{}
    if(!user)return;
    let target;
    try{target=new URL(saved)}catch{return}
    if(target.origin!==location.origin||target.pathname!==location.pathname){
      try{sessionStorage.removeItem(AUTH_RETURN_KEY)}catch{}
      return;
    }
    try{sessionStorage.removeItem(AUTH_RETURN_KEY)}catch{}
    const current=cleanedCurrentUrl();
    if(target.search!==current.search){
      location.replace(target.toString());
      return;
    }
    history.replaceState({},'',target.pathname+target.search);
  }

  function cancelPointerInteraction(){
    try{
      if(typeof drag==='undefined'||!drag)return;
      if(drag.type==='block'&&typeof endBlockDrag==='function')endBlockDrag();
      else if(drag.type==='pan'){
        drag.p?.classList?.remove('panning');
        drag=null;
      }
    }catch(err){console.warn('Pointer recovery failed',err)}
  }

  document.addEventListener('pointercancel',cancelPointerInteraction,true);
  document.addEventListener('lostpointercapture',cancelPointerInteraction,true);
  window.addEventListener('blur',cancelPointerInteraction);
  document.addEventListener('dragend',()=>{try{if(typeof boardDrag!=='undefined')boardDrag=''}catch{}},true);

  /* A same-file re-selection should still trigger import on browsers that otherwise suppress change. */
  const file=document.getElementById('calendarFile');
  if(file&&!file.dataset.v31Reset){
    file.dataset.v31Reset='1';
    file.addEventListener('click',()=>{file.value=''},true);
  }

  bindAuthButtons();
  setTimeout(bindAuthButtons,250);
  setTimeout(restoreAuthReturn,350);
  window.GEM_STABILITY_V31={ensureSupabaseReady,stableGoogleSignIn,restoreAuthReturn};
})();
