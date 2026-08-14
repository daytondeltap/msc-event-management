async function initSupabase() {
  try {
    const mod=await import('https://esm.sh/@supabase/supabase-js@2.111.0');
    supabase=mod.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await supabase.auth.getSession(); setAuthUser(data.session?.user||null);
    supabase.auth.onAuthStateChange((_event,session)=>{setAuthUser(session?.user||null); if(room) reconnectRoom();});
    if(room) connectRoom();
  } catch(err){console.error(err);toast('Online services unavailable — local mode still works');}
}
function setAuthUser(user){
  authUser=user; const md=user?.user_metadata||{}; if(user){displayName=md.full_name||md.name||user.email?.split('@')[0]||displayName;avatarUrl=md.avatar_url||md.picture||'';localStorage.mscDisplayName=displayName;} else avatarUrl=''; accountUI(); presenceUI(); if(channel&&connected)updatePresence();
}
async function signInGoogle(){
  if(!supabase)return toast('Supabase is still connecting');
  const redirect=new URL(location.href); redirect.hash='';
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.toString()}});
  if(error){console.error(error);toast('Google login is not configured yet');$('#authSetupNote').textContent='Google OAuth needs a Web client ID + client secret configured in Supabase Auth, plus this GitHub Pages URL in the redirect allow list.';}
}
async function signOut(){if(!supabase)return;await supabase.auth.signOut();toast('Signed out');}
function accountUI(){
  const label=authUser?(authUser.user_metadata?.full_name||authUser.email||'Account'):'Sign in'; $('#accountLabel').textContent=label;
  $('#accountAvatar').innerHTML=avatarUrl?`<img src="${esc(avatarUrl)}" alt="">`:esc((label||'G').slice(0,1).toUpperCase());
  $('#accountState').innerHTML=authUser?`<div class="account-profile"><span class="big-avatar">${avatarUrl?`<img src="${esc(avatarUrl)}" alt="">`:esc(label.slice(0,1).toUpperCase())}</span><span><strong>${esc(label)}</strong><small>${esc(authUser.email||'Google account')}</small></span></div>`:`<div class="account-profile"><span class="big-avatar">G</span><span><strong>Not signed in</strong><small>Google login is coded and will activate after the Google OAuth provider is configured in Supabase.</small></span></div>`;
  $('#signOutButton').style.visibility=authUser?'visible':'hidden'; $('#signInGoogleButton').style.display=authUser?'none':'inline-flex';
  $('#authSetupNote').textContent=authUser?'Signed-in identity is used for live presence and collaboration attribution.':'OAuth setup required: Google Cloud Web client ID + client secret in Supabase Auth. No Google secret belongs in this frontend.';
}

function identityPayload(extra={}){
  return {clientId:tabId,userId:authUser?.id||null,name:displayName,avatar:avatarUrl,email:authUser?.email||'',view,selectedEventId:selectedEventId||null,action:'idle',onlineAt:new Date().toISOString(),...extra};
}
async function updatePresence(extra={}){if(!channel||!connected)return;try{await channel.track(identityPayload(extra));}catch{}}
function flattenPresence(){const out={};if(!channel)return out;const raw=channel.presenceState();Object.values(raw).flat().forEach(p=>out[p.clientId]=p);return out;}
async function connectRoom(){
  if(!room||!supabase)return;
  if(channel)await supabase.removeChannel(channel);
  connected=false; peers={}; snapshotRequested=false;
  channel=supabase.channel(`msc-board:${room}`,{config:{presence:{key:tabId},broadcast:{ack:false,self:false}}});
  channel
    .on('presence',{event:'sync'},()=>{peers=flattenPresence();presenceUI();applyRemoteActivityDecorations();updateDrawerActivity();})
    .on('broadcast',{event:'cursor'},({payload})=>{if(payload.from===tabId)return;remoteCursors[payload.from]=payload;drawRemoteCursors();})
    .on('broadcast',{event:'activity'},({payload})=>{if(payload.from===tabId)return;remoteActivities[payload.from]=payload;patchPeerActivity(payload);applyRemoteActivityDecorations();updateDrawerActivity();presenceUI();})
    .on('broadcast',{event:'block-move'},({payload})=>{if(payload.from===tabId)return;const ev=state.events.find(x=>x.id===payload.eventId);if(ev){ev.position={x:payload.x,y:payload.y};const el=$(`[data-event-block="${payload.eventId}"]`);if(el){el.style.setProperty('--x',`${payload.x}px`);el.style.setProperty('--y',`${payload.y}px`);}updateConnectionSvg();}})
    .on('broadcast',{event:'state'},({payload})=>{if(payload.from===tabId||!payload.state)return;applyRemoteState(payload.state);})
    .on('broadcast',{event:'snapshot-request'},({payload})=>{if(payload.from!==tabId)broadcast('snapshot-target',{from:tabId,to:payload.from,state:cleanState()});})
    .on('broadcast',{event:'snapshot-target'},({payload})=>{if(payload.to!==tabId||!payload.state)return;applyRemoteState(payload.state);})
    .subscribe(async status=>{
      if(status==='SUBSCRIBED'){
        connected=true;await updatePresence();presenceUI();$('#saveText').textContent='Live + local';
        if(!state.events.length&&!snapshotRequested){snapshotRequested=true;broadcast('snapshot-request',{from:tabId});setTimeout(()=>{if(!state.events.length)render()},700);}
      } else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){connected=false;presenceUI();}
    });
}
async function reconnectRoom(){if(room&&supabase)await connectRoom();}
function applyRemoteState(next){remoteApplying=true;state={...state,...next};normalize();zoom=state.zoom||zoom;localStorage.setItem(storageKey(),JSON.stringify(state));render();setView(view,false);remoteApplying=false;}
function patchPeerActivity(payload){if(!peers[payload.from])peers[payload.from]={clientId:payload.from,name:payload.name,avatar:payload.avatar,view:'plan'};peers[payload.from]={...peers[payload.from],selectedEventId:payload.eventId||null,action:payload.action||'idle',view:payload.view||peers[payload.from].view};}
function broadcast(event,payload){if(!channel||!connected)return;channel.send({type:'broadcast',event,payload});}
function presenceUI(){
  const self=identityPayload(); const byId=new Map([[tabId,self]]); Object.values(peers).forEach(p=>byId.set(p.clientId,p)); const arr=[...byId.values()];
  $('#presenceCount').textContent=room?arr.length:'1'; $('#presenceStack').innerHTML=(room?arr:[self]).slice(0,4).map(p=>`<span class="presence-avatar" style="box-shadow:0 0 0 1px ${peerColor(p.clientId)}" title="${esc(p.name)}">${p.avatar?`<img src="${esc(p.avatar)}" alt="">`:esc((p.name||'?').slice(0,2).toUpperCase())}</span>`).join('');
  $('#presencePopover').innerHTML=arr.map(p=>`<div class="presence-row"><span class="presence-avatar" style="margin:0;box-shadow:0 0 0 1px ${peerColor(p.clientId)}">${p.avatar?`<img src="${esc(p.avatar)}" alt="">`:esc((p.name||'?').slice(0,2).toUpperCase())}</span><span><span class="who">${esc(p.name||'Member')}${p.clientId===tabId?' · you':''}</span><span class="where">${esc(meta[p.view]?.[0]||p.view||'Workspace')}${p.selectedEventId?` · ${esc(state.events.find(e=>e.id===p.selectedEventId)?.name||'event')}`:''}</span></span><span class="activity-chip">${esc(p.action||'idle')}</span></div>`).join('');
  if($('#shareState'))$('#shareState').innerHTML=room?`<strong>${connected?'Live':'Connecting…'}</strong> · ${arr.length} online · board ${esc(room.slice(0,8))}`:'This is a local board. Create an empty shared board to collaborate online.';
  if($('#shareLink'))$('#shareLink').value=room?location.href:''; if($('#leaveSharedBoard'))$('#leaveSharedBoard').disabled=!room;
}
function applyRemoteActivityDecorations(){
  $$('.event-block').forEach(el=>{const eventId=el.dataset.eventBlock, people=peersForEvent(eventId);el.classList.toggle('remote-selected',people.length>0);if(people.length)el.style.setProperty('--peer-color',peerColor(people[0].clientId));});
}
function drawRemoteCursors(){
  const layer=$('#cursorLayer'); if(!room||view!=='plan'){layer.innerHTML='';return;}const viewport=$('#plannerViewport');if(!viewport){layer.innerHTML='';return;}const r=viewport.getBoundingClientRect();
  layer.innerHTML=Object.values(remoteCursors).filter(c=>Date.now()-c.t<4500).map(c=>`<div class="remote-cursor" style="--peer-color:${peerColor(c.from)};transform:translate3d(${r.left+c.x}px,${r.top+c.y}px,0)"><div class="cursor-pointer"></div><span class="cursor-label">${c.avatar?`● `:''}${esc(c.name||'Member')}</span></div>`).join('');
}

function createShared(){
  room=uid().replaceAll('-','')+uid().replaceAll('-','').slice(0,16); state={events:[],annualBudget:100000,zoom:1,version:1}; zoom=1; localStorage.setItem(storageKey(),JSON.stringify(state));
  const u=new URL(location.href);u.searchParams.set('board',room);history.replaceState({},'',u);render();setView('plan',false);connectRoom();toast('Empty shared board created');
}
async function leaveShared(){if(channel&&supabase)await supabase.removeChannel(channel);room='';connected=false;peers={};remoteCursors={};remoteActivities={};state=loadState();normalize();zoom=state.zoom||1;const u=new URL(location.href);u.searchParams.delete('board');history.replaceState({},'',u);render();setView('plan',false);toast('Returned to local board');}

function centerIfNeeded(){const p=$('#plannerViewport');if(p&&p.scrollLeft<10&&p.scrollTop<10){p.scrollLeft=980;p.scrollTop=620;}}
function updateConnectionSvg(){const svg=$('.connections');if(svg)svg.innerHTML=connections(visible());}
function selectEvent(id,announce=true){selectedEventId=id;$$('.event-block').forEach(el=>el.classList.toggle('selected',el.dataset.eventBlock===id));if(announce){updatePresence({selectedEventId:id,action:'selected'});broadcast('activity',{from:tabId,eventId:id,action:'selected',view,name:displayName,avatar:avatarUrl,t:Date.now()});}}
