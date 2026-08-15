/* MSC v18: wallpaper + contacts reliability fixes */
(() => {
  'use strict';
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const WALLPAPER_ID = 'mscAeroWallpaperLayer';
  const IMAGE_ID = 'mscAeroAsadalImage';
  let patchingContacts = false;

  function isAero() {
    return document.documentElement.dataset.theme === 'aero';
  }

  function forceWallpaper() {
    let layer = q(`#${WALLPAPER_ID}`);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = WALLPAPER_ID;
      layer.className = 'msc-aero-wallpaper';
      layer.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(layer, document.body.firstChild);
    }

    let img = q(`#${IMAGE_ID}`, layer);
    if (!img) {
      layer.replaceChildren();
      img = document.createElement('img');
      img.id = IMAGE_ID;
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      layer.appendChild(img);
    }

    const src = new URL('assets/asadal.jpg?v=20260815-v18b', document.baseURI).href;
    if (img.src !== src) img.src = src;
    layer.classList.toggle('show', isAero());
    document.body.classList.toggle('msc-aero-active', isAero());
  }

  function refreshRoleSelects() {
    const roles = [...new Set((state.contacts || []).map(c => String(c.role || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    qa('select[name="approvalRole"]').forEach(select => {
      const value = select.value;
      select.innerHTML = ['<option value="">No role selected</option>', ...roles.map(role => `<option value="${esc(role)}">${esc(role)}</option>`)].join('');
      select.value = value;
    });

    qa('select[name="recipientRole"]').forEach(select => {
      const value = select.value;
      select.innerHTML = ['<option value="">Use event approval role</option>', ...roles.map(role => `<option value="${esc(role)}">${esc(role)}</option>`)].join('');
      select.value = value;
    });
  }

  function renderContactRows() {
    const table = q('#contactsView .v17-contact-table');
    if (!table) return;
    const rows = (state.contacts || []).map(c => `<div class="v17-contact-row">
      <div><strong>${esc(c.name || 'Unnamed')}</strong><small>${esc(c.notes || 'No notes')}</small></div>
      <span>${esc(c.role || 'No role')}</span>
      <a href="mailto:${esc(c.email || '')}">${esc(c.email || 'No email')}</a>
      <div class="v17-row-actions"><button type="button" data-v17-contact-edit="${esc(c.id)}">Edit</button><button type="button" data-v17-contact-delete="${esc(c.id)}">Delete</button></div>
    </div>`).join('');
    table.innerHTML = `<div class="v17-contact-row head"><span>Name</span><span>Role</span><span>Email</span><span>Actions</span></div>${rows || '<div class="empty-state">No contacts yet.</div>'}`;
  }

  function clearContactEditor(form) {
    if (!form) return;
    ['id', 'name', 'role', 'email', 'notes'].forEach(name => {
      const field = form.elements.namedItem(name);
      if (field) field.value = '';
    });
    const title = form.closest('.v17-contact-editor')?.querySelector('.panel-header h2');
    if (title) title.textContent = 'Add contact';
  }

  function saveContact(form) {
    if (!form) return;
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const role = String(fd.get('role') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const notes = String(fd.get('notes') || '').trim();
    const emailInput = form.elements.namedItem('email');

    if (!name || !role || !email) {
      toast('Name, role and email are required');
      return;
    }
    if (emailInput && typeof emailInput.checkValidity === 'function' && !emailInput.checkValidity()) {
      emailInput.reportValidity?.();
      return;
    }

    state.contacts = Array.isArray(state.contacts) ? state.contacts : [];
    const id = String(fd.get('id') || '') || uid();
    const item = { id, name, role, email, notes };
    const index = state.contacts.findIndex(c => c.id === id);
    if (index >= 0) state.contacts[index] = item;
    else state.contacts.push(item);

    save(true);
    refreshRoleSelects();

    const clearButton = q('#v17ClearContact');
    if (clearButton) {
      clearButton.click();
      queueMicrotask(() => {
        renderContactRows();
        refreshRoleSelects();
        patchContactForm();
      });
    } else {
      renderContactRows();
      clearContactEditor(form);
    }
    toast('Contact saved');
  }

  function patchContactForm() {
    if (patchingContacts) return;
    patchingContacts = true;
    try {
      const legacy = q('#v17ContactForm');
      if (legacy) legacy.id = 'v18ContactForm';
      const form = q('#v18ContactForm');
      if (!form || form.dataset.v18Bound === '1') return;
      form.dataset.v18Bound = '1';

      const oldSubmit = q('button[type="submit"]', form);
      if (oldSubmit) {
        oldSubmit.type = 'button';
        oldSubmit.id = 'v18SaveContact';
      }

      form.addEventListener('submit', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        saveContact(form);
      }, true);

      q('#v18SaveContact', form)?.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        saveContact(form);
      });
    } finally {
      patchingContacts = false;
    }
  }

  const contactsObserver = new MutationObserver(() => patchContactForm());
  const contactsRoot = q('#contactsView');
  if (contactsRoot) contactsObserver.observe(contactsRoot, { childList: true, subtree: true });
  else {
    const bodyObserver = new MutationObserver(() => {
      const root = q('#contactsView');
      if (!root) return;
      contactsObserver.observe(root, { childList: true, subtree: true });
      bodyObserver.disconnect();
      patchContactForm();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#v17NewContact,#v17ClearContact,[data-v17-contact-edit]')) {
      queueMicrotask(patchContactForm);
    }
  }, true);

  const themeObserver = new MutationObserver(() => requestAnimationFrame(forceWallpaper));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pageshow', forceWallpaper);
  window.addEventListener('resize', forceWallpaper, { passive: true });

  forceWallpaper();
  patchContactForm();
})();
