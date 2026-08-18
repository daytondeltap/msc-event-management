const STORAGE = 'msc-event-management-v6';
const STATUSES = ['Not started', 'Planning', 'Awaiting approval', 'Ready', 'Completed'];
const APPROVALS = ['Not required', 'Not submitted', 'Awaiting approval', 'Approved', 'Rejected'];
const SB_URL = 'https://pmfsgdraazaaulgwlant.supabase.co';
const SB_KEY = 'sb_publishable_XasQ8-MmhT9TFErxdbphbQ_8CJ9-Ywe';
const WORLD = { width: 4600, height: 3200 };
const COLORS = ['#7aa2ff','#57d38c','#e8bd5e','#c68cff','#ff7f86','#5dd5d5','#ff9a5d','#a8d35b'];

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => { try { return crypto.randomUUID(); } catch { return `msc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`; } };
const safeStorageGet = (store,key,fallback='') => { try { const value=store?.getItem?.(key); return value===null?fallback:value; } catch { return fallback; } };
const safeStorageSet = (store,key,value) => { try { store?.setItem?.(key,String(value)); return true; } catch (error) { window.MSC_STORAGE_HEALTH={...(window.MSC_STORAGE_HEALTH||{}),lastError:String(error?.name||error||'storage_error'),failedAt:Date.now()}; return false; } };
const safeStorageRemove = (store,key) => { try { store?.removeItem?.(key); return true; } catch { return false; } };
const safeJSON = (value,fallback=null) => { try { return JSON.parse(value); } catch { return fallback; } };
const safeDateISO = (value) => { if(!value)return ''; const d=new Date(value); return Number.isNaN(+d)?'':d.toISOString(); };
window.MSC_SAFE_STORAGE={get:safeStorageGet,set:safeStorageSet,remove:safeStorageRemove,json:safeJSON,dateISO:safeDateISO};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const split = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const money = (n) => '฿' + Math.round(+n || 0).toLocaleString();
const fmtDate = (v) => { const d=v?new Date(v):null; return d&&!Number.isNaN(+d)?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—'; };
const fmtTime = (v) => { const d=v?new Date(v):null; return d&&!Number.isNaN(+d)?d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}):''; };
const toLocal = (v) => {
  if (!v) return '';
  const d = new Date(v), p = n => String(n).padStart(2,'0');
  if(Number.isNaN(+d))return '';
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const approvalClass = (s='Not required') => `approval-${s.toLowerCase().replaceAll(' ','-')}`;
const approvalLabel = (s='Not required') => `<span class="approval-pill ${approvalClass(s)}"><span class="approval-dot"></span>${esc(s)}</span>`;
const peerColor = (id='') => COLORS[Math.abs([...id].reduce((a,c)=>a+c.charCodeAt(0),0)) % COLORS.length];

function fresh(name = '', position = null) {
  return {
    id: uid(), name, objective:'', start:'', end:'', lead:'', supporting:[], materials:[], venue:'', venueAddress:'',
    budgetPlanned:0, budgetActual:0, deadline:'', approvalRequired:false, approvalStatus:'Not required', approver:'',
    status:'Not started', dependencies:[], backupPlan:'', feedback:'', source:'local', externalId:'',
    position: position || {x:720 + Math.random()*1200, y:480 + Math.random()*850}
  };
}

function seed() {
  const day = (n, h=15, m=30) => { const d = new Date(); d.setDate(d.getDate()+n); d.setHours(h,m,0,0); return d.toISOString(); };
  return [
    {...fresh('Spirit Week',{x:650,y:460}), objective:'Build school spirit with simple daily themes.', start:day(8,8,0), end:day(12,15,0), lead:'Mina', supporting:['Alex','Dayton'], venue:'Campus-wide', materials:['Posters','Theme signs'], budgetPlanned:4500, deadline:day(3).slice(0,10), approvalRequired:true, approvalStatus:'Approved', approver:'MSC Advisor', status:'Ready'},
    {...fresh('Talent Show',{x:1110,y:720}), objective:'Give students a chance to perform for the middle school.', start:day(19), end:day(19,17,30), lead:'Dayton', supporting:['Maya','Alex'], venue:'Auditorium', materials:['Microphones','Stage lights'], budgetPlanned:15000, budgetActual:2500, deadline:day(6).slice(0,10), approvalRequired:true, approvalStatus:'Awaiting approval', approver:'Principal', status:'Awaiting approval', dependencies:['Spirit Week']},
    {...fresh('Charity Drive',{x:1570,y:440}), objective:'Collect useful supplies for a local community partner.', start:day(27,8,0), end:day(31,15,0), lead:'Maya', supporting:['Mina'], venue:'Main Lobby', materials:['Collection boxes','Labels'], budgetPlanned:2500, deadline:day(13).slice(0,10), approvalRequired:true, approvalStatus:'Not submitted', status:'Planning'}
  ];
}

let params = new URL(location.href).searchParams;
let room = params.get('board') || '';
let state = loadState();
let view = 'plan';
let zoom = state.zoom || 1;
let search = '';
let draft = null;
let selectedEventId = null;
let drag = null;
let boardDrag = '';
let imports = [];
let spaceDown = false;
let remoteApplying = false;

let supabase = null;
let authUser = null;
let channel = null;
let connected = false;
const tabId = safeStorageGet(sessionStorage,'mscTabId') || uid();
safeStorageSet(sessionStorage,'mscTabId',tabId);
let displayName = safeStorageGet(localStorage,'mscDisplayName') || `Member ${Math.floor(Math.random()*90+10)}`;
let avatarUrl = '';
let peers = {};
let remoteCursors = {};
let remoteActivities = {};
let lastCursorSent = 0;
let lastMoveSent = 0;
let snapshotRequested = false;

let mapsPromise = null;
let activeMap = null;
let geocodeCache = safeJSON(safeStorageGet(localStorage,'mscGeocodeCache','{}'),{});
if(!geocodeCache || typeof geocodeCache!=='object' || Array.isArray(geocodeCache)) geocodeCache={};

const meta = {
  home:['Overview','What needs attention across MSC events.'],
  plan:['Plan','Move events freely and build the schedule together.'],
  events:['Events','Every MSC event record in one place.'],
  board:['Status','Move events through the MSC workflow.'],
  calendar:['Calendar','School dates and council events together.'],
  venues:['Venues','Map venues, usage and conflicts.'],
  budget:['Budget','Planned and actual event spending.']
};

function storageKey() { return room ? `${STORAGE}:room:${room}` : STORAGE; }
function defaultState(){ return {events: room ? [] : seed(), annualBudget:100000, zoom:1, version:1}; }
function loadState() {
  const key=storageKey();
  let raw='';
  try{raw=localStorage.getItem(key)||'';}catch(error){window.MSC_LOCAL_LOAD_STATUS={key,unavailable:true,error:String(error?.name||error)};return defaultState();}
  if(!raw){window.MSC_LOCAL_LOAD_STATUS={key,found:false,valid:false};return defaultState();}
  const x=safeJSON(raw,null);
  if(x && typeof x==='object' && Array.isArray(x.events)){window.MSC_LOCAL_LOAD_STATUS={key,found:true,valid:true};return x;}
  window.MSC_LOCAL_LOAD_STATUS={key,found:true,valid:false,corrupted:true};
  return defaultState();
}
function normalizeEvent(e={},i=0){
  const item=(e&&typeof e==='object'&&!Array.isArray(e))?e:{};
  const fallback={x:700+(i%5)*410,y:470+Math.floor(i/5)*250};
  const rawPos=item.position&&typeof item.position==='object'?item.position:fallback;
  const px=Number(rawPos.x),py=Number(rawPos.y);
  const list=v=>(Array.isArray(v)?v:split(v)).map(x=>String(x??'').trim()).filter(Boolean);
  const status=STATUSES.includes(item.status)?item.status:'Not started';
  const approvalStatus=APPROVALS.includes(item.approvalStatus)?item.approvalStatus:(item.approvalRequired?'Not submitted':'Not required');
  const bp=Number(item.budgetPlanned),ba=Number(item.budgetActual);
  return {
    ...fresh(),...item,
    id:String(item.id||uid()).slice(0,160),
    name:String(item.name||''),objective:String(item.objective||''),lead:String(item.lead||''),venue:String(item.venue||''),venueAddress:String(item.venueAddress||''),
    supporting:list(item.supporting),materials:list(item.materials),dependencies:list(item.dependencies),
    budgetPlanned:Number.isFinite(bp)?bp:0,budgetActual:Number.isFinite(ba)?ba:0,
    approvalRequired:item.approvalRequired===true||item.approvalRequired==='true',approvalStatus,status,
    position:{x:Number.isFinite(px)?clamp(px,0,WORLD.width):fallback.x,y:Number.isFinite(py)?clamp(py,0,WORLD.height):fallback.y}
  };
}
function normalize() {
  if(!state||typeof state!=='object'||Array.isArray(state))state=defaultState();
  const seen=new Set();
  state.events=(Array.isArray(state.events)?state.events:[]).map(normalizeEvent).map(e=>{if(seen.has(e.id))e.id=uid();seen.add(e.id);return e;});
  const budget=Number(state.annualBudget);state.annualBudget=Number.isFinite(budget)?budget:100000;
  const z=Number(state.zoom);state.zoom=Number.isFinite(z)?clamp(z,.45,1.75):1;
  const ver=Number(state.version);state.version=Number.isFinite(ver)&&ver>=1?Math.floor(ver):1;
}
function cleanState() { return {events:state.events.map((e,i)=>normalizeEvent(e,i)), annualBudget:state.annualBudget, zoom, version:(state.version||1)+1, updatedAt:Date.now()}; }
function persistLocalState(){
  let serialized='';try{serialized=JSON.stringify(state);}catch(error){window.MSC_STORAGE_HEALTH={...(window.MSC_STORAGE_HEALTH||{}),serializationFailed:true,lastError:String(error)};return false;}
  const ok=safeStorageSet(localStorage,storageKey(),serialized);
  window.MSC_DURABILITY?.mirror?.(storageKey(),serialized);
  return ok;
}
function save(sync = true) {
  state.zoom = zoom;
  state.version = (Number(state.version) || 1) + 1;
  const localOk=persistLocalState();
  const saveText=$('#saveText');if(saveText)saveText.textContent=localOk?(room&&connected?'Live + local':'Saved locally'):(room?'Cloud sync pending':'Local backup unavailable');
  if(!localOk)window.MSC_DURABILITY?.notifyStorageFailure?.();
  if (sync && !remoteApplying && typeof broadcast==='function') broadcast('state', {from:tabId, state:cleanState()});
  return localOk;
}
function toast(text) {
  const region=$('#toastRegion');if(!region){console.info(text);return;}const n=document.createElement('div');n.className='toast';n.textContent=String(text??'');region.append(n);setTimeout(()=>n.remove(),2500);
}
function overlap(a,b) {
  if (!a.start || !b.start) return false;
  const as=+new Date(a.start), ae=+new Date(a.end||a.start), bs=+new Date(b.start), be=+new Date(b.end||b.start);
  return as < be && bs < ae;
}
function issues(e) {
  const out=[];
  if (e.deadline && e.status!=='Completed' && new Date(e.deadline) < new Date(new Date().toDateString())) out.push('Deadline passed');
  if (e.approvalRequired && e.approvalStatus!=='Approved') out.push(`Approval: ${e.approvalStatus}`);
  if (+e.budgetActual > +e.budgetPlanned && +e.budgetPlanned) out.push('Over budget');
  if (state.events.some(o=>o.id!==e.id && o.venue && e.venue && o.venue.toLowerCase()===e.venue.toLowerCase() && overlap(e,o))) out.push('Venue conflict');
  return out;
}
function visible() {
  const q = search.trim().toLowerCase();
  return state.events.filter(e => !q || [e.name,e.objective,e.lead,e.venue,e.venueAddress,e.status,e.approvalStatus,...e.supporting,...e.materials,...e.dependencies].join(' ').toLowerCase().includes(q));
}

function setView(v, announce=true) {
  if (!meta[v]) return;
  view = v;
  $$('.nav-item[data-view],.brand[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===`${v}View`));
  $('#viewTitle').textContent=meta[v][0]; $('#viewSubtitle').textContent=meta[v][1];
  if (v==='plan') requestAnimationFrame(centerIfNeeded);
  if (v==='venues') requestAnimationFrame(initVenueMap);
  if (announce) updatePresence({view:v});
  drawRemoteCursors();
  presenceUI();
}

function render() {
  home(); plan(); events(); statusBoard(); calendar(); venues(); budget(); presenceUI(); accountUI();
}
function metric(label,value,foot) { return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></div>`; }
function table(ev) {
  return `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Lead</th><th>Status</th><th>Approval</th><th>Venue</th></tr></thead><tbody>${ev.map(e=>`<tr data-open-event="${e.id}"><td><strong>${esc(e.name||'Untitled')}</strong></td><td>${fmtDate(e.start)}</td><td>${esc(e.lead||'—')}</td><td><span class="status-pill">${esc(e.status)}</span></td><td>${approvalLabel(e.approvalStatus)}</td><td>${esc(e.venue||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}
function home() {
  const ev=visible(), active=ev.filter(e=>e.status!=='Completed'), spent=ev.reduce((s,e)=>s+(+e.budgetActual||0),0), att=ev.flatMap(e=>issues(e).map(i=>[e,i])).slice(0,8);
  $('#homeView').innerHTML=`<div class="content"><div class="metrics">${metric('Active events',active.length,`${ev.length} total`)}${metric('Awaiting approval',ev.filter(e=>e.approvalStatus==='Awaiting approval'||e.status==='Awaiting approval').length,'Needs follow-up')}${metric('Ready',ev.filter(e=>e.status==='Ready').length,'Cleared to run')}${metric('Actual spend',money(spent),`${money(Math.max(0,state.annualBudget-spent))} remaining`)}</div><div class="grid-two"><div class="panel"><div class="panel-header"><div><h2>Upcoming</h2><p>Next events by date.</p></div></div>${table([...active].sort((a,b)=>new Date(a.start||'9999')-new Date(b.start||'9999')).slice(0,7))}</div><div class="panel"><div class="panel-header"><div><h2>Needs attention</h2><p>Deadlines, approvals and conflicts.</p></div></div>${att.length?att.map(([e,i])=>`<div class="import-row" data-open-event="${e.id}"><strong>${esc(e.name)}</strong><span style="margin-left:auto;color:#777">${esc(i)}</span></div>`).join(''):'<div class="empty-state">Everything looks clear.</div>'}</div></div></div>`;
}
