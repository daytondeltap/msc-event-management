/* MSC v8 contacts + approval email automation */
(() => {
  'use strict';
  const V8=window.MSC_V8=window.MSC_V8||{};
  let editingContactId='';

  function ensureContactsUI(){
    V8.ensureState?.();
    if(!meta.contacts)meta.contacts=['Contacts','Roles, people and approval email routing.'];
    if(!document.getElementById('contactsView')){const s=document.createElement('section');s.id='contactsView';s.className='view';document.querySelector('.main-shell').appendChild(s);}
    if(!document.querySelector('[data-view="contacts"]')){const b=document.createElement('button');b.className='nav-item';b.dataset.view='contacts';b.innerHTML='<span>＠</span><b>Contacts</b>';document.querySelector('.nav-list').appendChild(b);}
  }

  function contactForEvent(ev){
    const role=String(ev.approvalRole||'').trim().toLowerCase();
    if(role){const c=state.contacts.find(x=>String(x.role||'').trim().toLowerCase()===role&&x.email);if(c)return c;}
    const approver=String(ev.approver||'').trim().toLowerCase();
    return state.contacts.find(x=>x.email&&(String(x.name||'').trim().toLowerCase()===approver||String(x.role||'').trim().toLowerCase()===approver))||null;
  }
  V8.contactForEvent=contactForEvent;

  function signature(ev,c){return`${ev.id}|${c?.email||''}|${ev.approvalRole||''}|${ev.approvalStatus||''}`;}
  function payloadFor(ev,c){
    const boardUrl=location.href;
    return{to:c.email,subject:`Approval requested: ${ev.name}`,text:`Hello ${c.name||c.role||'Approver'},\n\nApproval is requested for “${ev.name}”.\n\nDate: ${ev.start?new Date(ev.start).toLocaleString():'Not set'}\nVenue: ${ev.venue||'Not set'}\nLead: ${ev.lead||'Unassigned'}\nPlanned budget: ${money(ev.budgetPlanned)}\nDeadline: ${ev.deadline||'Not set'}\n\nObjective: ${ev.objective||'—'}\n\nOpen the MSC board: ${boardUrl}\n\nSent from MSC Event Management.`,eventId:ev.id,eventName:ev.name,role:c.role||'',contactName:c.name||'',boardUrl,date:ev.start||'',venue:ev.venue||'',lead:ev.lead||'',budgetPlanned:+ev.budgetPlanned||0,deadline:ev.deadline||'',objective:ev.objective||''};
  }
  function mailto(p){location.href=`mailto:${encodeURIComponent(p.to)}?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.text)}`;}
  async function sendApprovalEmail(ev,{automatic=false}={}){
    V8.ensureState?.();const c=contactForEvent(ev);if(!c?.email){toast('Assign an approval role with a contact email first');return false;}const p=payloadFor(ev,c);
    if(!authUser||!supabase){mailto(p);if(automatic)toast('Prepared approval email; sign in for unattended sending');return false;}
    try{const{data,error}=await supabase.functions.invoke('send-approval-email',{body:p});if(error)throw error;if(data?.configured===false)throw new Error('Email provider not configured');ev.approvalEmailLastSentFor=signature(ev,c);save();toast(`Approval email sent to ${c.email}`);return true;}catch(err){console.warn('Approval automation unavailable',err);mailto(p);toast('Email provider is not configured yet — opened a ready-to-send email instead');return false;}
  }
  V8.sendApprovalEmail=sendApprovalEmail;
  V8.maybeAutomateApprovalEmail=(ev,before={})=>{if(!state.emailSettings?.autoApprovalEmails)return;const awaiting=ev.approvalStatus==='Awaiting approval'||ev.status==='Awaiting approval',entered=before.approvalStatus!=='Awaiting approval'&&before.status!=='Awaiting approval',c=contactForEvent(ev);if(!awaiting||!entered||!c)return;if(ev.approvalEmailLastSentFor===signature(ev,c))return;sendApprovalEmail(ev,{automatic:true});};

  function contactsView(){
    ensureContactsUI();const rows=state.contacts.map(c=>`<div class="contact-row"><strong>${esc(c.name||'Unnamed')}</strong><small>${esc(c.role||'No role')}</small><small>${esc(c.email||'No email')}</small><span class="contact-actions"><button data-contact-edit="${c.id}" title="Edit">✎</button><button data-contact-delete="${c.id}" title="Delete">×</button></span></div>`).join(''),edit=state.contacts.find(c=>c.id===editingContactId)||{id:'',name:'',role:'',email:'',notes:''};
    $('#contactsView').innerHTML=`<div class="contacts-shell"><div class="panel contacts-list"><div class="panel-header"><div><h2>Contacts</h2><p>Map council/school roles to email addresses for approvals.</p></div><button class="button secondary" id="newContactButton">＋ Contact</button></div><div class="contacts-table"><div class="contact-row head"><span>Name</span><span>Role</span><span>Email</span><span></span></div>${rows||'<div class="empty-state">No contacts yet. Add roles such as Principal, Advisor or Finance.</div>'}</div></div><div style="display:grid;gap:16px;align-content:start"><div class="panel contact-editor"><h3>${edit.id?'Edit contact':'Add contact'}</h3><p>Roles are used by events to choose where approval requests go.</p><form id="contactForm"><input type="hidden" name="id" value="${esc(edit.id)}"><div class="contact-editor-grid"><label class="field"><span>Name</span><input name="name" value="${esc(edit.name)}" required></label><label class="field"><span>Role</span><input name="role" value="${esc(edit.role)}" required placeholder="Principal"></label><label class="field full"><span>Email</span><input name="email" type="email" value="${esc(edit.email)}" required></label><label class="field full"><span>Notes</span><input name="notes" value="${esc(edit.notes||'')}"></label></div><div class="modal-actions"><button type="button" class="button secondary" id="cancelContactEdit">Clear</button><button class="button primary" type="submit">Save contact</button></div></form></div><div class="panel automation-card"><h3>Approval email automation</h3><p>When enabled, an event entering Awaiting approval sends to the contact mapped to its approval role. Signed-in users use the secure server function; otherwise the app opens a prepared email.</p><div class="toggle-row"><span><strong>Automatic approval emails</strong><small>Triggers only when an event enters Awaiting approval.</small></span><label class="switch"><input id="approvalEmailToggle" type="checkbox" ${state.emailSettings?.autoApprovalEmails?'checked':''}><i></i></label></div><div class="mail-status">${authUser?'Signed in · secure sender checked on first send.':'Sign in with Google for unattended sending.'}</div></div></div></div>`;
  }
  V8.contactsView=contactsView;

  const baseRender=typeof render==='function'?render:null;if(baseRender)render=function(){V8.ensureState?.();ensureContactsUI();baseRender();contactsView();};

  document.addEventListener('submit',e=>{if(e.target.id!=='contactForm')return;e.preventDefault();const fd=new FormData(e.target),id=String(fd.get('id')||''),item={id:id||uid(),name:String(fd.get('name')||'').trim(),role:String(fd.get('role')||'').trim(),email:String(fd.get('email')||'').trim(),notes:String(fd.get('notes')||'').trim()};const i=state.contacts.findIndex(c=>c.id===item.id);if(i>=0)state.contacts[i]=item;else state.contacts.push(item);editingContactId='';save();contactsView();render();setView('contacts',false);toast('Contact saved');},true);
  document.addEventListener('click',e=>{
    if(e.target.id==='newContactButton'){editingContactId='';contactsView();setTimeout(()=>document.querySelector('#contactForm [name="name"]')?.focus(),20);return;}const edit=e.target.closest('[data-contact-edit]');if(edit){editingContactId=edit.dataset.contactEdit;contactsView();return;}const del=e.target.closest('[data-contact-delete]');if(del){state.contacts=state.contacts.filter(c=>c.id!==del.dataset.contactDelete);save();contactsView();return;}if(e.target.id==='cancelContactEdit'){editingContactId='';contactsView();return;}
    const quick=e.target.closest('[data-inline-mail]');if(quick){e.preventDefault();const ev=state.events.find(x=>x.id===quick.dataset.inlineMail);if(ev)sendApprovalEmail(ev);return;}if(e.target.closest('[data-drawer-approval-mail]')){e.preventDefault();const current=draft&&state.events.find(x=>x.id===draft.id)||draft;if(current){let ev=current;try{if(typeof collect==='function')ev={...current,...collect()};}catch{}sendApprovalEmail(ev);}return;}
  },true);
  document.addEventListener('change',e=>{if(e.target.id==='approvalEmailToggle'){state.emailSettings.autoApprovalEmails=e.target.checked;save();contactsView();toast(e.target.checked?'Approval email automation enabled':'Approval email automation disabled');}},true);

  ensureContactsUI();contactsView();
})();
