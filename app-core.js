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
const uid = () => crypto.randomUUID();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const split = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const money = (n) => '฿' + Math.round(+n || 0).toLocaleString();
const fmtDate = (v) => v ? new Date(v).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : '—';
const fmtTime = (v) => v ? new Date(v).toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit', hour12:false}) : '';
const toLocal = (v) => {
  if (!v) return '';
  const d = new Date(v), p = n => String(n).padStart(2,'0');
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
const tabId = sessionStorage.mscTabId || uid();
sessionStorage.mscTabId = tabId;
let displayName = localStorage.mscDisplayName || `Member ${Math.floor(Math.random()*90+10)}`;
let avatarUrl = '';
let peers = {};
let remoteCursors = {};
let remoteActivities = {};
let lastCursorSent = 0;
let lastMoveSent = 0;
let snapshotRequested = false;

let mapsPromise = null;
let activeMap = null;
let geocodeCache = JSON.parse(localStorage.mscGeocodeCache || '{}');

const meta = {
  home:['Overview','What needs attention across MSC events.'],
  plan:['Plan','Move events freely and build the schedule together.'],
  events:['Events','Every MSC event record in one place.'],
  board:['Status','Move events through the MSC workflow.'],
  calendar:['Calendar','School dates and council events together.'],
  venues:['Venues','Map venues, usage and conflicts.'],
  budget:['Budget','Plan funds, calculate costs and track money in and out.']
};

function storageKey() { return room ? `${STORAGE}:room:${room}` : STORAGE; }
function loadState() {
  try { const x = JSON.parse(localStorage.getItem(storageKey())); if (x?.events) return x; } catch {}
  return {events: room ? [] : seed(), annualBudget:100000, budgetLedger:[], zoom:1, version:1};
}
function normalize() {
  state.events = (state.events || []).map((e,i) => ({
    ...fresh(), ...e,
    supporting: Array.isArray(e.supporting) ? e.supporting : split(e.supporting),
    materials: Array.isArray(e.materials) ? e.materials : split(e.materials),
    dependencies: Array.isArray(e.dependencies) ? e.dependencies : split(e.dependencies),
    position: e.position || {x:700+(i%5)*410,y:470+Math.floor(i/5)*250}
  }));
  state.annualBudget=Math.max(0,+state.annualBudget||0);
  state.budgetLedger=(Array.isArray(state.budgetLedger)?state.budgetLedger:[]).map(x=>({
    id:String(x?.id||uid()),
    type:x?.type==='income'?'income':'expense',
    amount:Math.max(0,+x?.amount||0),
    date:String(x?.date||''),
    category:String(x?.category||''),
    note:String(x?.note||''),
    eventId:String(x?.eventId||''),
    createdAt:+x?.createdAt||Date.now()
  })).filter(x=>x.amount>0);
}
function cleanState() { return {events:state.events, annualBudget:state.annualBudget, budgetLedger:state.budgetLedger||[], zoom, version:(state.version||1)+1, updatedAt:Date.now()}; }
function save(sync = true) {
  state.zoom = zoom;
  state.version = (state.version || 1) + 1;
  localStorage.setItem(storageKey(), JSON.stringify(state));
  $('#saveText').textContent = room && connected ? 'Live + local' : 'Saved locally';
  if (sync && !remoteApplying) broadcast('state', {from:tabId, state:cleanState()});
}
function toast(text) {
  const n = document.createElement('div'); n.className='toast'; n.textContent=text; $('#toastRegion').append(n); setTimeout(()=>n.remove(),2500);
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
function budgetSnapshot() {
  const ledger=state.budgetLedger||[];
  const income=ledger.filter(x=>x.type==='income').reduce((s,x)=>s+(+x.amount||0),0);
  const unlinkedExpenses=ledger.filter(x=>x.type==='expense'&&!x.eventId).reduce((s,x)=>s+(+x.amount||0),0);
  const ledgerExpenses=ledger.filter(x=>x.type==='expense').reduce((s,x)=>s+(+x.amount||0),0);
  const eventActual=state.events.reduce((s,e)=>s+(+e.budgetActual||0),0);
  const planned=state.events.reduce((s,e)=>s+(+e.budgetPlanned||0),0);
  const trackedSpend=eventActual+unlinkedExpenses;
  return {income,unlinkedExpenses,ledgerExpenses,eventActual,planned,trackedSpend,available:(+state.annualBudget||0)+income-trackedSpend};
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
  return `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Lead</th><th>Status</th><th>Approval</th><th>Venue</th></tr></thead><tbody>${ev.map(e=>`<tr data-open-event="${e.id}"><td data-label="Event"><strong>${esc(e.name||'Untitled')}</strong></td><td data-label="Date">${fmtDate(e.start)}</td><td data-label="Lead">${esc(e.lead||'—')}</td><td data-label="Status"><span class="status-pill">${esc(e.status)}</span></td><td data-label="Approval">${approvalLabel(e.approvalStatus)}</td><td data-label="Venue">${esc(e.venue||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}
function home() {
  const ev=visible(), active=ev.filter(e=>e.status!=='Completed'), moneyState=budgetSnapshot(), spent=moneyState.trackedSpend, att=ev.flatMap(e=>issues(e).map(i=>[e,i])).slice(0,8);
  $('#homeView').innerHTML=`<div class="content"><div class="metrics">${metric('Active events',active.length,`${ev.length} total`)}${metric('Awaiting approval',ev.filter(e=>e.approvalStatus==='Awaiting approval'||e.status==='Awaiting approval').length,'Needs follow-up')}${metric('Ready',ev.filter(e=>e.status==='Ready').length,'Cleared to run')}${metric('Tracked spend',money(spent),`${money(moneyState.available)} available`)}</div><div class="grid-two"><div class="panel"><div class="panel-header"><div><h2>Upcoming</h2><p>Next events by date.</p></div></div>${table([...active].sort((a,b)=>new Date(a.start||'9999')-new Date(b.start||'9999')).slice(0,7))}</div><div class="panel"><div class="panel-header"><div><h2>Needs attention</h2><p>Deadlines, approvals and conflicts.</p></div></div>${att.length?att.map(([e,i])=>`<div class="import-row" data-open-event="${e.id}"><strong>${esc(e.name)}</strong><span style="margin-left:auto;color:#777">${esc(i)}</span></div>`).join(''):'<div class="empty-state">Everything looks clear.</div>'}</div></div></div>`;
}
