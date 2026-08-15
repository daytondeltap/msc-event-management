/* MSC v17: exact Aero wallpaper, server soundtrack catalog, contacts + email presets */
(() => {
  'use strict';

  const V17 = window.MSC_V17 = window.MSC_V17 || {};
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const AUDIO_DB = 'msc-aero-audio-v14';
  const AUDIO_STORE = 'tracks';
  const AUDIO_VOLUME_KEY = 'mscAeroVolumeV17';
  const AUDIO_TRACK_KEY = 'mscAeroServerTrackV17';
  let editingContactId = '';
  let editingPresetId = '';
  let composerEventId = '';
  let composerPresetId = '';
  let renderWrapping = false;
  let audio = null;
  let audioIndex = Number(localStorage.getItem(AUDIO_TRACK_KEY) || 0) || 0;
  let audioObjectUrl = '';

  const DEFAULT_PRESETS = [
    {
      id: 'approval-request',
      name: 'Approval request',
      subject: 'Approval requested: {event_name}',
      body: 'Hello {contact_name},\n\nCould you please review and approve {event_name}?\n\nDate: {date}\nVenue: {venue}\nLead: {lead}\nPlanned budget: {budget}\nDeadline: {deadline}\n\nObjective: {objective}\n\nOpen the board: {board_url}\n\nThank you.',
      recipientRole: '',
      trigger: 'awaiting_approval',
      auto: false
    },
    {
      id: 'event-reminder',
      name: 'Event reminder',
      subject: 'Reminder: {event_name} on {date_short}',
      body: 'Hello {contact_name},\n\nThis is a reminder for {event_name}.\n\nDate: {date}\nVenue: {venue}\nLead: {lead}\n\nBoard: {board_url}',
      recipientRole: '',
      trigger: 'manual',
      auto: false
    },
    {
      id: 'budget-review',
      name: 'Budget review',
      subject: 'Budget review: {event_name}',
      body: 'Hello {contact_name},\n\nPlease review the planned budget for {event_name}.\n\nPlanned budget: {budget}\nLead: {lead}\nDeadline: {deadline}\nObjective: {objective}\n\nBoard: {board_url}',
      recipientRole: 'Finance',
      trigger: 'manual',
      auto: false
    }
  ];

  const VARIABLES = [
    ['{event_name}', 'Event name'],
    ['{date}', 'Full event date/time'],
    ['{date_short}', 'Short event date'],
    ['{venue}', 'Venue'],
    ['{lead}', 'Person responsible'],
    ['{budget}', 'Planned budget'],
    ['{deadline}', 'Deadline'],
    ['{objective}', 'Objective'],
    ['{status}', 'Event status'],
    ['{approval_status}', 'Approval status'],
    ['{contact_name}', 'Recipient name'],
    ['{contact_role}', 'Recipient role'],
    ['{board_url}', 'Current board link']
  ];

  function isAero() {
    return document.documentElement.dataset.theme === 'aero';
  }

  function ensureAeroWallpaper() {
    let layer = q('#mscAeroWallpaperLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'mscAeroWallpaperLayer';
      layer.className = 'msc-aero-wallpaper';
      layer.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(layer, document.body.firstChild);
    }
    layer.style.backgroundImage = 'none';
    layer.innerHTML = '';
    let img = q('#mscAeroAsadalImage');
    if (!img) {
      img = document.createElement('img');
      img.id = 'mscAeroAsadalImage';
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = new URL('assets/asadal.jpg?v=20260815-v17', document.baseURI).href;
      layer.appendChild(img);
    }
    layer.classList.toggle('show', isAero());
    document.body.classList.toggle('msc-aero-active', isAero());
  }

  function ensureEmailState() {
    state.contacts = Array.isArray(state.contacts) ? state.contacts : [];
    state.emailSettings = state.emailSettings && typeof state.emailSettings === 'object' ? state.emailSettings : {};
    if (typeof state.emailSettings.autoApprovalEmails !== 'boolean') state.emailSettings.autoApprovalEmails = false;
    if (!Array.isArray(state.emailSettings.presets) || !state.emailSettings.presets.length) {
      state.emailSettings.presets = DEFAULT_PRESETS.map(x => ({ ...x }));
    }
    state.emailSettings.presets = state.emailSettings.presets.map(p => ({
      id: String(p.id || uid()),
      name: String(p.name || 'Email preset').slice(0, 80),
      subject: String(p.subject || ''),
      body: String(p.body || ''),
      recipientRole: String(p.recipientRole || ''),
      trigger: p.trigger === 'awaiting_approval' ? 'awaiting_approval' : 'manual',
      auto: !!p.auto
    }));
    if (!state.emailSettings.defaultPresetId || !state.emailSettings.presets.some(p => p.id === state.emailSettings.defaultPresetId)) {
      state.emailSettings.defaultPresetId = state.emailSettings.presets[0]?.id || '';
    }
  }

  function roleOptions(value = '') {
    const roles = [...new Set((state.contacts || []).map(c => String(c.role || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return ['<option value="">Use event approval role</option>', ...roles.map(role => `<option value="${esc(role)}" ${role === value ? 'selected' : ''}>${esc(role)}</option>`)].join('');
  }

  function contactFor(ev, preset = null) {
    ensureEmailState();
    const wantedRole = String(preset?.recipientRole || ev?.approvalRole || '').trim().toLowerCase();
    if (wantedRole) {
      const roleMatch = state.contacts.find(c => c.email && String(c.role || '').trim().toLowerCase() === wantedRole);
      if (roleMatch) return roleMatch;
    }
    const approver = String(ev?.approver || '').trim().toLowerCase();
    if (approver) {
      const approverMatch = state.contacts.find(c => c.email && (
        String(c.name || '').trim().toLowerCase() === approver ||
        String(c.role || '').trim().toLowerCase() === approver
      ));
      if (approverMatch) return approverMatch;
    }
    return null;
  }

  function variableValues(ev, contact) {
    const start = ev?.start ? new Date(ev.start) : null;
    const validStart = start && !Number.isNaN(+start);
    return {
      event_name: ev?.name || 'Untitled event',
      date: validStart ? start.toLocaleString() : 'Not set',
      date_short: validStart ? start.toLocaleDateString() : 'Not set',
      venue: ev?.venue || 'Not set',
      lead: ev?.lead || 'Unassigned',
      budget: typeof money === 'function' ? money(ev?.budgetPlanned || 0) : `฿${Number(ev?.budgetPlanned || 0).toLocaleString()}`,
      deadline: ev?.deadline || 'Not set',
      objective: ev?.objective || '—',
      status: ev?.status || 'Not started',
      approval_status: ev?.approvalStatus || 'Not required',
      contact_name: contact?.name || contact?.role || 'Recipient',
      contact_role: contact?.role || '',
      board_url: location.href
    };
  }

  function renderVariables(template, values) {
    return String(template || '').replace(/\{([a-z_]+)\}/gi, (all, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : all);
  }

  function presetById(id) {
    ensureEmailState();
    return state.emailSettings.presets.find(p => p.id === id) || state.emailSettings.presets[0] || null;
  }

  function mailto(to, subject, text) {
    location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }

  async function sendRenderedEmail(ev, preset, overrides = {}, { automatic = false } = {}) {
    const contact = contactFor(ev, preset);
    if (!contact?.email) {
      toast(`No contact email found for ${preset?.recipientRole || ev?.approvalRole || 'this event approval role'}`);
      return false;
    }
    const values = variableValues(ev, contact);
    const subject = String(overrides.subject ?? renderVariables(preset.subject, values)).trim().slice(0, 180);
    const text = String(overrides.text ?? renderVariables(preset.body, values)).trim().slice(0, 8000);
    if (!subject || !text) {
      toast('Email subject and message are required');
      return false;
    }
    const payload = {
      to: contact.email,
      subject,
      text,
      eventId: ev.id,
      eventName: ev.name,
      role: contact.role || '',
      contactName: contact.name || '',
      boardUrl: location.href,
      date: ev.start || '',
      venue: ev.venue || '',
      lead: ev.lead || '',
      budgetPlanned: +ev.budgetPlanned || 0,
      deadline: ev.deadline || '',
      objective: ev.objective || '',
      presetId: preset.id || ''
    };
    if (!authUser || !supabase) {
      mailto(payload.to, subject, text);
      if (automatic) toast('Prepared the automated email; sign in for unattended sending');
      return false;
    }
    try {
      const { data, error } = await supabase.functions.invoke('send-approval-email', { body: payload });
      if (error) throw error;
      if (data?.configured === false) throw new Error('Email provider not configured');
      toast(`Email sent to ${contact.email}`);
      return true;
    } catch (err) {
      console.warn('MSC email sender unavailable', err);
      mailto(payload.to, subject, text);
      toast('Server sender unavailable — opened a ready-to-send email instead');
      return false;
    }
  }
  V17.sendRenderedEmail = sendRenderedEmail;

  function automationKey(ev, preset, contact) {
    return `${preset.id}|${contact?.email || ''}|${ev.approvalStatus || ''}|${ev.status || ''}|${ev.start || ''}`;
  }

  function maybeAutomateEmail(ev, before = {}) {
    ensureEmailState();
    const awaiting = ev.approvalStatus === 'Awaiting approval' || ev.status === 'Awaiting approval';
    const entered = before.approvalStatus !== 'Awaiting approval' && before.status !== 'Awaiting approval';
    if (!awaiting || !entered) return;
    const presets = state.emailSettings.presets.filter(p => p.auto && p.trigger === 'awaiting_approval');
    if (!presets.length && state.emailSettings.autoApprovalEmails) {
      const fallback = presetById(state.emailSettings.defaultPresetId);
      if (fallback) presets.push(fallback);
    }
    ev.emailAutomationSent = ev.emailAutomationSent && typeof ev.emailAutomationSent === 'object' ? ev.emailAutomationSent : {};
    presets.forEach(async preset => {
      const contact = contactFor(ev, preset);
      if (!contact?.email) return;
      const key = automationKey(ev, preset, contact);
      if (ev.emailAutomationSent[preset.id] === key) return;
      const sent = await sendRenderedEmail(ev, preset, {}, { automatic: true });
      if (sent) {
        ev.emailAutomationSent[preset.id] = key;
        save(false);
      }
    });
  }

  if (window.MSC_V8) {
    window.MSC_V8.maybeAutomateApprovalEmail = maybeAutomateEmail;
    window.MSC_V8.sendApprovalEmail = async ev => {
      ensureEmailState();
      const preset = presetById(state.emailSettings.defaultPresetId);
      if (!preset) return false;
      return sendRenderedEmail(ev, preset);
    };
    window.MSC_V8.contactForEvent = ev => contactFor(ev, presetById(state.emailSettings.defaultPresetId));
    window.MSC_V8.roleOptions = roleOptions;
  }

  function ensureContactsShell() {
    if (!meta.contacts) meta.contacts = ['Contacts', 'People, roles and event email automations.'];
    if (!q('#contactsView')) {
      const section = document.createElement('section');
      section.id = 'contactsView';
      section.className = 'view';
      q('.main-shell')?.appendChild(section);
    }
    if (!q('[data-view="contacts"]')) {
      const button = document.createElement('button');
      button.className = 'nav-item';
      button.dataset.view = 'contacts';
      button.innerHTML = '<span>＠</span><b>Contacts</b>';
      q('.nav-list')?.appendChild(button);
    }
  }

  function contactRows() {
    return state.contacts.map(c => `<div class="v17-contact-row">
      <div><strong>${esc(c.name || 'Unnamed')}</strong><small>${esc(c.notes || 'No notes')}</small></div>
      <span>${esc(c.role || 'No role')}</span>
      <a href="mailto:${esc(c.email || '')}">${esc(c.email || 'No email')}</a>
      <div class="v17-row-actions"><button type="button" data-v17-contact-edit="${esc(c.id)}">Edit</button><button type="button" data-v17-contact-delete="${esc(c.id)}">Delete</button></div>
    </div>`).join('');
  }

  function presetCards() {
    return state.emailSettings.presets.map(p => `<article class="v17-preset-card ${p.auto ? 'auto' : ''}" data-v17-preset-card="${esc(p.id)}">
      <div class="v17-preset-head"><div><strong>${esc(p.name)}</strong><small>${p.trigger === 'awaiting_approval' ? 'When awaiting approval' : 'Manual'}</small></div>${p.auto ? '<span>Auto</span>' : ''}</div>
      <p>${esc(p.subject || 'No subject')}</p>
      <div class="v17-preset-meta"><span>${p.recipientRole ? `To ${esc(p.recipientRole)}` : 'Uses event approval role'}</span></div>
      <div class="v17-row-actions"><button type="button" data-v17-preset-use="${esc(p.id)}">Use</button><button type="button" data-v17-preset-edit="${esc(p.id)}">Edit</button><button type="button" data-v17-preset-duplicate="${esc(p.id)}">Duplicate</button><button type="button" data-v17-preset-delete="${esc(p.id)}">Delete</button></div>
    </article>`).join('');
  }

  function variableChips() {
    return VARIABLES.map(([token, label]) => `<button type="button" class="v17-var-chip" data-v17-variable="${esc(token)}" title="${esc(label)}">${esc(token)}</button>`).join('');
  }

  function renderContactsV17() {
    ensureContactsShell();
    ensureEmailState();
    const root = q('#contactsView');
    if (!root) return;
    const contact = state.contacts.find(c => c.id === editingContactId) || { id: '', name: '', role: '', email: '', notes: '' };
    const preset = state.emailSettings.presets.find(p => p.id === editingPresetId) || { id: '', name: '', subject: '', body: '', recipientRole: '', trigger: 'manual', auto: false };
    if (!composerEventId || !state.events.some(e => e.id === composerEventId)) composerEventId = state.events[0]?.id || '';
    if (!composerPresetId || !state.emailSettings.presets.some(p => p.id === composerPresetId)) composerPresetId = state.emailSettings.defaultPresetId || state.emailSettings.presets[0]?.id || '';
    const composerEvent = state.events.find(e => e.id === composerEventId) || null;
    const composerPreset = presetById(composerPresetId);
    const composerContact = composerEvent && composerPreset ? contactFor(composerEvent, composerPreset) : null;
    const composerValues = composerEvent ? variableValues(composerEvent, composerContact) : {};
    const composerSubject = composerPreset ? renderVariables(composerPreset.subject, composerValues) : '';
    const composerBody = composerPreset ? renderVariables(composerPreset.body, composerValues) : '';

    root.innerHTML = `<div class="v17-contacts-shell">
      <section class="panel v17-directory-panel">
        <div class="panel-header"><div><h2>Contacts</h2><p>Roles are reusable across events, approvals and email presets.</p></div><button class="button primary" type="button" id="v17NewContact">＋ Contact</button></div>
        <div class="v17-contact-table"><div class="v17-contact-row head"><span>Name</span><span>Role</span><span>Email</span><span>Actions</span></div>${contactRows() || '<div class="empty-state">No contacts yet.</div>'}</div>
      </section>

      <section class="panel v17-contact-editor">
        <div class="panel-header"><div><h2>${contact.id ? 'Edit contact' : 'Add contact'}</h2><p>Saving immediately refreshes event approval-role options.</p></div></div>
        <form id="v17ContactForm" class="v17-form-grid">
          <input type="hidden" name="id" value="${esc(contact.id)}">
          <label class="field"><span>Name</span><input name="name" required value="${esc(contact.name)}"></label>
          <label class="field"><span>Role</span><input name="role" required value="${esc(contact.role)}" placeholder="Principal"></label>
          <label class="field full"><span>Email</span><input name="email" type="email" required value="${esc(contact.email)}"></label>
          <label class="field full"><span>Notes</span><textarea name="notes" rows="2">${esc(contact.notes || '')}</textarea></label>
          <div class="v17-form-actions full"><button type="button" class="button secondary" id="v17ClearContact">Clear</button><button class="button primary" type="submit">Save contact</button></div>
        </form>
      </section>

      <section class="panel v17-email-panel">
        <div class="panel-header"><div><h2>Email automations</h2><p>Create presets once, reuse event variables, and optionally send them automatically.</p></div><button type="button" class="button primary" id="v17NewPreset">＋ Preset</button></div>
        <div class="v17-email-layout">
          <div class="v17-preset-list">${presetCards()}</div>
          <form id="v17PresetForm" class="v17-preset-editor">
            <input type="hidden" name="id" value="${esc(preset.id)}">
            <div class="v17-editor-title"><strong>${preset.id ? 'Edit preset' : 'New preset'}</strong><small>Variables are replaced with values from the event at send time.</small></div>
            <label class="field"><span>Preset name</span><input name="name" required value="${esc(preset.name)}" placeholder="Approval request"></label>
            <label class="field"><span>Recipient role</span><select name="recipientRole">${roleOptions(preset.recipientRole)}</select></label>
            <label class="field full"><span>Subject</span><input name="subject" required value="${esc(preset.subject)}"></label>
            <label class="field full"><span>Message</span><textarea name="body" rows="9" required>${esc(preset.body)}</textarea></label>
            <div class="v17-variable-box full"><span>Event variables</span><div>${variableChips()}</div></div>
            <label class="field"><span>Trigger</span><select name="trigger"><option value="manual" ${preset.trigger !== 'awaiting_approval' ? 'selected' : ''}>Manual only</option><option value="awaiting_approval" ${preset.trigger === 'awaiting_approval' ? 'selected' : ''}>Entering Awaiting approval</option></select></label>
            <label class="v17-check"><input type="checkbox" name="auto" ${preset.auto ? 'checked' : ''}><span><strong>Send automatically</strong><small>Requires Google sign-in and configured server email provider.</small></span></label>
            <div class="v17-form-actions full"><button type="button" class="button secondary" id="v17ClearPreset">Clear</button><button class="button primary" type="submit">Save preset</button></div>
          </form>
        </div>
      </section>

      <section class="panel v17-composer-panel">
        <div class="panel-header"><div><h2>Send a manual event email</h2><p>Choose an event and preset, then customize the rendered email before sending.</p></div></div>
        <div class="v17-composer-grid">
          <label class="field"><span>Event</span><select id="v17ComposerEvent">${state.events.map(e => `<option value="${esc(e.id)}" ${e.id === composerEventId ? 'selected' : ''}>${esc(e.name || 'Untitled event')}</option>`).join('')}</select></label>
          <label class="field"><span>Preset</span><select id="v17ComposerPreset">${state.emailSettings.presets.map(p => `<option value="${esc(p.id)}" ${p.id === composerPresetId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          <div class="v17-recipient-preview"><span>Recipient</span><strong>${composerContact?.email ? `${esc(composerContact.name || composerContact.role)} · ${esc(composerContact.email)}` : 'No matching contact'}</strong></div>
          <label class="field full"><span>Subject</span><input id="v17ComposerSubject" value="${esc(composerSubject)}"></label>
          <label class="field full"><span>Message</span><textarea id="v17ComposerBody" rows="9">${esc(composerBody)}</textarea></label>
          <div class="v17-form-actions full"><button type="button" class="button secondary" id="v17ComposerRefresh">Reset from preset</button><button type="button" class="button primary" id="v17ComposerSend">Send email</button></div>
        </div>
      </section>
    </div>`;
  }

  function refreshApprovalRoleSelects() {
    qa('select[name="approvalRole"]').forEach(select => {
      const value = select.value;
      select.innerHTML = roleOptions(value);
      select.value = value;
    });
  }

  function persistAndRefresh(message = '') {
    ensureEmailState();
    save();
    refreshApprovalRoleSelects();
    renderContactsV17();
    if (message) toast(message);
  }

  function insertAtCursor(input, text) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(text, start, end, 'end');
    input.focus();
  }

  document.addEventListener('submit', e => {
    if (e.target.id === 'v17ContactForm') {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = String(fd.get('id') || '') || uid();
      const next = {
        id,
        name: String(fd.get('name') || '').trim(),
        role: String(fd.get('role') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        notes: String(fd.get('notes') || '').trim()
      };
      if (!next.name || !next.role || !next.email) return toast('Name, role and email are required');
      const index = state.contacts.findIndex(c => c.id === id);
      if (index >= 0) state.contacts[index] = next;
      else state.contacts.push(next);
      editingContactId = '';
      persistAndRefresh('Contact saved');
      return;
    }
    if (e.target.id === 'v17PresetForm') {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = String(fd.get('id') || '') || uid();
      const next = {
        id,
        name: String(fd.get('name') || '').trim(),
        subject: String(fd.get('subject') || '').trim(),
        body: String(fd.get('body') || '').trim(),
        recipientRole: String(fd.get('recipientRole') || ''),
        trigger: fd.get('trigger') === 'awaiting_approval' ? 'awaiting_approval' : 'manual',
        auto: fd.get('auto') === 'on'
      };
      if (!next.name || !next.subject || !next.body) return toast('Preset name, subject and message are required');
      const index = state.emailSettings.presets.findIndex(p => p.id === id);
      if (index >= 0) state.emailSettings.presets[index] = next;
      else state.emailSettings.presets.push(next);
      editingPresetId = '';
      if (!state.emailSettings.defaultPresetId) state.emailSettings.defaultPresetId = id;
      persistAndRefresh('Email preset saved');
    }
  }, true);

  document.addEventListener('click', async e => {
    if (e.target.closest('#v17NewContact')) { editingContactId = ''; renderContactsV17(); q('#v17ContactForm [name="name"]')?.focus(); return; }
    if (e.target.closest('#v17ClearContact')) { editingContactId = ''; renderContactsV17(); return; }
    const editContact = e.target.closest('[data-v17-contact-edit]');
    if (editContact) { editingContactId = editContact.dataset.v17ContactEdit; renderContactsV17(); return; }
    const delContact = e.target.closest('[data-v17-contact-delete]');
    if (delContact) {
      const contact = state.contacts.find(c => c.id === delContact.dataset.v17ContactDelete);
      if (contact && confirm(`Delete ${contact.name || 'this contact'}?`)) {
        state.contacts = state.contacts.filter(c => c.id !== contact.id);
        persistAndRefresh('Contact deleted');
      }
      return;
    }
    if (e.target.closest('#v17NewPreset')) { editingPresetId = ''; renderContactsV17(); q('#v17PresetForm [name="name"]')?.focus(); return; }
    if (e.target.closest('#v17ClearPreset')) { editingPresetId = ''; renderContactsV17(); return; }
    const editPreset = e.target.closest('[data-v17-preset-edit]');
    if (editPreset) { editingPresetId = editPreset.dataset.v17PresetEdit; renderContactsV17(); return; }
    const usePreset = e.target.closest('[data-v17-preset-use]');
    if (usePreset) { composerPresetId = usePreset.dataset.v17PresetUse; state.emailSettings.defaultPresetId = composerPresetId; save(false); renderContactsV17(); q('#v17ComposerSubject')?.focus(); return; }
    const duplicatePreset = e.target.closest('[data-v17-preset-duplicate]');
    if (duplicatePreset) {
      const source = presetById(duplicatePreset.dataset.v17PresetDuplicate);
      if (source) {
        const copy = { ...source, id: uid(), name: `${source.name} copy`, auto: false };
        state.emailSettings.presets.push(copy);
        editingPresetId = copy.id;
        persistAndRefresh('Preset duplicated');
      }
      return;
    }
    const deletePreset = e.target.closest('[data-v17-preset-delete]');
    if (deletePreset) {
      if (state.emailSettings.presets.length <= 1) return toast('Keep at least one email preset');
      const source = presetById(deletePreset.dataset.v17PresetDelete);
      if (source && confirm(`Delete preset “${source.name}”?`)) {
        state.emailSettings.presets = state.emailSettings.presets.filter(p => p.id !== source.id);
        if (state.emailSettings.defaultPresetId === source.id) state.emailSettings.defaultPresetId = state.emailSettings.presets[0]?.id || '';
        editingPresetId = '';
        persistAndRefresh('Preset deleted');
      }
      return;
    }
    const variable = e.target.closest('[data-v17-variable]');
    if (variable) {
      const editor = q('#v17PresetForm');
      const active = document.activeElement;
      const target = active?.closest?.('#v17PresetForm') && (active.matches('input[name="subject"],textarea[name="body"]')) ? active : q('textarea[name="body"]', editor);
      insertAtCursor(target, variable.dataset.v17Variable);
      return;
    }
    if (e.target.closest('#v17ComposerRefresh')) { renderContactsV17(); return; }
    if (e.target.closest('#v17ComposerSend')) {
      const ev = state.events.find(x => x.id === composerEventId);
      const preset = presetById(composerPresetId);
      if (!ev || !preset) return toast('Choose an event and email preset');
      await sendRenderedEmail(ev, preset, { subject: q('#v17ComposerSubject')?.value || '', text: q('#v17ComposerBody')?.value || '' });
      return;
    }
  }, true);

  document.addEventListener('change', e => {
    if (e.target.id === 'v17ComposerEvent') { composerEventId = e.target.value; renderContactsV17(); }
    if (e.target.id === 'v17ComposerPreset') { composerPresetId = e.target.value; state.emailSettings.defaultPresetId = composerPresetId; save(false); renderContactsV17(); }
  }, true);

  const trackDefs = [
    { id: 'lease', title: 'LEASE', subtitle: 'Takeshi Abo · nostalgia edit' },
    { id: 'lotus', title: 'Lotus Waters', subtitle: 'remake' },
    { id: 'mii', title: 'Mii Maker', subtitle: 'Nintendo Wii U · Editing Mii' }
  ];

  function serverTrackUrl(id) {
    const value = window.MSC_CONFIG?.aeroTracks?.[id];
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function openAudioDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(AUDIO_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(AUDIO_STORE)) request.result.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function localTrack(id) {
    try {
      const db = await openAudioDb();
      const result = await new Promise((resolve, reject) => {
        const request = db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result;
    } catch { return null; }
  }

  function ensureServerPlayer() {
    q('#aeroMusicPlayer')?.classList.remove('show');
    if (q('#v17AeroPlayer')) return q('#v17AeroPlayer');
    const el = document.createElement('div');
    el.id = 'v17AeroPlayer';
    el.className = 'v17-aero-player';
    el.innerHTML = `<div class="v17-player-orb">♫</div><div class="v17-player-copy"><strong id="v17TrackTitle">Frutiger soundtrack</strong><small id="v17TrackSubtitle">Server soundtrack</small></div><div class="v17-player-controls"><button type="button" data-v17-prev>◀</button><button type="button" class="play" data-v17-play>▶</button><button type="button" data-v17-next>▶|</button></div><label class="v17-player-volume"><span>🔊</span><input type="range" min="0" max="1" step="0.02" value="${localStorage.getItem(AUDIO_VOLUME_KEY) || '0.55'}"></label>`;
    document.body.appendChild(el);
    audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = Number(localStorage.getItem(AUDIO_VOLUME_KEY) || 0.55);
    audio.addEventListener('ended', () => loadTrack(audioIndex + 1, true));
    audio.addEventListener('play', syncServerPlayer);
    audio.addEventListener('pause', syncServerPlayer);
    el.addEventListener('click', e => {
      if (e.target.closest('[data-v17-prev]')) loadTrack(audioIndex - 1, true);
      if (e.target.closest('[data-v17-next]')) loadTrack(audioIndex + 1, true);
      if (e.target.closest('[data-v17-play]')) toggleServerAudio();
    });
    q('input[type="range"]', el)?.addEventListener('input', e => {
      audio.volume = Number(e.target.value);
      localStorage.setItem(AUDIO_VOLUME_KEY, e.target.value);
    });
    syncServerPlayer();
    return el;
  }

  function syncServerPlayer() {
    const player = q('#v17AeroPlayer');
    if (!player) return;
    const def = trackDefs[(audioIndex + trackDefs.length) % trackDefs.length];
    q('#v17TrackTitle', player).textContent = def.title;
    const hasServer = !!serverTrackUrl(def.id);
    q('#v17TrackSubtitle', player).textContent = hasServer ? `${def.subtitle} · server` : `${def.subtitle} · local fallback`;
    q('[data-v17-play]', player).textContent = audio && !audio.paused ? '❚❚' : '▶';
    player.classList.toggle('show', isAero());
  }

  async function loadTrack(index, autoplay = false) {
    ensureServerPlayer();
    audioIndex = (index + trackDefs.length) % trackDefs.length;
    localStorage.setItem(AUDIO_TRACK_KEY, String(audioIndex));
    const def = trackDefs[audioIndex];
    let src = serverTrackUrl(def.id);
    if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); audioObjectUrl = ''; }
    if (!src) {
      const saved = await localTrack(def.id);
      if (saved?.blob) {
        audioObjectUrl = URL.createObjectURL(saved.blob);
        src = audioObjectUrl;
      }
    }
    if (!src) {
      audio.removeAttribute('src');
      audio.load();
      q('#v17TrackSubtitle').textContent = 'No server track configured';
      syncServerPlayer();
      return false;
    }
    audio.src = src;
    syncServerPlayer();
    if (autoplay) {
      try { await audio.play(); } catch { }
    }
    return true;
  }

  async function toggleServerAudio() {
    ensureServerPlayer();
    if (!audio.src) {
      const ok = await loadTrack(audioIndex, false);
      if (!ok) return toast('No server soundtrack is configured for this track');
    }
    if (audio.paused) {
      try { await audio.play(); } catch { toast('Press play again to start audio'); }
    } else audio.pause();
    syncServerPlayer();
  }

  function syncAero() {
    ensureAeroWallpaper();
    ensureServerPlayer();
    q('#v17AeroPlayer')?.classList.toggle('show', isAero());
    q('#aeroMusicPlayer')?.classList.remove('show');
    if (!isAero() && audio && !audio.paused) audio.pause();
  }

  const previousRender = typeof render === 'function' ? render : null;
  if (previousRender) {
    render = function (...args) {
      if (renderWrapping) return previousRender(...args);
      renderWrapping = true;
      try { previousRender(...args); }
      finally {
        renderWrapping = false;
        ensureEmailState();
        renderContactsV17();
      }
    };
  }

  const themeObserver = new MutationObserver(syncAero);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  ensureEmailState();
  ensureContactsShell();
  renderContactsV17();
  syncAero();
})();
