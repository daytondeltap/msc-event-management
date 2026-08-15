/* MSC v13 settings, themes + visual onboarding */
(() => {
  'use strict';

  const PREF_KEY = 'mscAppearanceV13';
  const SECRET_KEY = 'mscFrutigerAeroUnlocked';
  const TUTORIAL_PREFIX = 'mscTutorialSeenV13:';
  const GUEST_TUTORIAL_KEY = 'mscTutorialSeenV13:guest';
  let tutorialIndex = 0;
  let secretClicks = 0;
  let autoTutorialQueuedFor = '';

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];

  function currentPreference() {
    return localStorage.getItem(PREF_KEY) || 'dark';
  }

  function resolveTheme(pref) {
    if (pref === 'aero') return 'aero';
    if (pref === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    return pref === 'light' ? 'light' : 'dark';
  }

  function applyTheme(pref = currentPreference(), persist = false) {
    if (!['dark', 'light', 'system', 'aero'].includes(pref)) pref = 'dark';
    if (persist) localStorage.setItem(PREF_KEY, pref);
    const resolved = resolveTheme(pref);
    document.documentElement.dataset.theme = resolved;
    document.body?.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'aero' ? '#5fb9ef' : resolved === 'light' ? '#f4f5f7' : '#050505';
    renderThemeChoices();
  }

  function tutorialSeenKey() {
    return authUser?.id ? `${TUTORIAL_PREFIX}${authUser.id}` : GUEST_TUTORIAL_KEY;
  }

  function tutorialArt(type) {
    const common = 'viewBox="0 0 720 380" role="img" aria-hidden="true"';
    if (type === 'boards') return `<svg ${common}><rect class="art-bg" width="720" height="380" rx="26"/><rect class="art-side" x="24" y="24" width="150" height="332" rx="18"/><circle class="art-logo" cx="58" cy="60" r="19"/><rect class="art-line" x="88" y="49" width="58" height="9" rx="4"/><rect class="art-line faint" x="88" y="65" width="42" height="7" rx="3"/><rect class="art-nav active" x="40" y="108" width="118" height="38" rx="9"/><rect class="art-nav" x="40" y="154" width="118" height="38" rx="9"/><rect class="art-nav" x="40" y="200" width="118" height="38" rx="9"/><rect class="art-panel" x="196" y="24" width="500" height="332" rx="18"/><rect class="art-line strong" x="222" y="58" width="154" height="18" rx="6"/><rect class="art-line faint" x="222" y="86" width="236" height="8" rx="4"/><g transform="translate(222 126)"><rect class="art-card selected" width="212" height="142" rx="14"/><rect class="art-line strong" x="18" y="19" width="118" height="12" rx="5"/><rect class="art-line faint" x="18" y="43" width="156" height="7" rx="3"/><rect class="art-chip" x="18" y="78" width="56" height="23" rx="11"/><rect class="art-chip" x="82" y="78" width="76" height="23" rx="11"/><rect class="art-button" x="18" y="111" width="78" height="20" rx="7"/></g><g transform="translate(452 126)"><rect class="art-card" width="212" height="142" rx="14"/><rect class="art-line strong" x="18" y="19" width="132" height="12" rx="5"/><rect class="art-line faint" x="18" y="43" width="148" height="7" rx="3"/><rect class="art-chip" x="18" y="78" width="84" height="23" rx="11"/><rect class="art-button" x="18" y="111" width="78" height="20" rx="7"/></g><circle class="art-plus" cx="646" cy="318" r="24"/><path class="art-plus-mark" d="M646 307v22M635 318h22"/></svg>`;
    if (type === 'plan') return `<svg ${common}><rect class="art-bg" width="720" height="380" rx="26"/><rect class="art-toolbar" x="24" y="24" width="672" height="54" rx="15"/><rect class="art-button" x="42" y="40" width="94" height="23" rx="7"/><rect class="art-button faint" x="144" y="40" width="64" height="23" rx="7"/><rect class="art-grid" x="24" y="92" width="672" height="264" rx="18"/><path class="art-connection" d="M252 189 C322 189 321 259 401 259"/><circle class="art-node" cx="328" cy="224" r="12"/><g transform="translate(56 132)"><rect class="art-card selected" width="196" height="116" rx="14"/><rect class="art-handle" width="196" height="28" rx="14"/><rect class="art-line strong" x="15" y="44" width="112" height="12" rx="5"/><rect class="art-line faint" x="15" y="68" width="150" height="7" rx="3"/><circle class="art-plus" cx="174" cy="14" r="9"/></g><g transform="translate(401 203)"><rect class="art-card target" width="226" height="116" rx="14"/><rect class="art-handle" width="226" height="28" rx="14"/><rect class="art-line strong" x="15" y="44" width="136" height="12" rx="5"/><rect class="art-line faint" x="15" y="68" width="166" height="7" rx="3"/></g><path class="art-cursor" d="M551 165l12 31 8-10 12 12 7-7-12-12 11-7z"/></svg>`;
    if (type === 'events') return `<svg ${common}><rect class="art-bg" width="720" height="380" rx="26"/><rect class="art-panel" x="24" y="24" width="672" height="332" rx="18"/><rect class="art-line strong" x="52" y="50" width="180" height="16" rx="5"/><rect class="art-button" x="558" y="44" width="104" height="30" rx="9"/><rect class="art-table-head" x="48" y="104" width="624" height="34" rx="7"/><g class="art-rows"><rect x="48" y="148" width="624" height="48" rx="7"/><rect x="48" y="204" width="624" height="48" rx="7"/><rect x="48" y="260" width="624" height="48" rx="7"/></g><circle class="art-status good" cx="74" cy="172" r="7"/><circle class="art-status warn" cx="74" cy="228" r="7"/><circle class="art-status cool" cx="74" cy="284" r="7"/><rect class="art-line" x="92" y="166" width="124" height="10" rx="4"/><rect class="art-line" x="92" y="222" width="154" height="10" rx="4"/><rect class="art-line" x="92" y="278" width="108" height="10" rx="4"/><rect class="art-chip" x="498" y="160" width="92" height="23" rx="11"/><rect class="art-chip" x="498" y="216" width="110" height="23" rx="11"/><rect class="art-chip" x="498" y="272" width="78" height="23" rx="11"/></svg>`;
    if (type === 'venues') return `<svg ${common}><rect class="art-bg" width="720" height="380" rx="26"/><rect class="art-panel" x="24" y="24" width="220" height="332" rx="18"/><rect class="art-line strong" x="48" y="49" width="112" height="14" rx="5"/><rect class="art-search" x="48" y="82" width="172" height="32" rx="9"/><rect class="art-card" x="48" y="132" width="172" height="64" rx="11"/><rect class="art-card selected" x="48" y="206" width="172" height="64" rx="11"/><rect class="art-map" x="262" y="24" width="434" height="332" rx="18"/><path class="art-road" d="M286 295C351 250 349 191 420 168s123-9 248-91"/><path class="art-road thin" d="M300 92c87 38 141 28 194 89s87 61 174 77"/><circle class="art-map-pin" cx="469" cy="187" r="18"/><path class="art-pin-dot" d="M469 177a7 7 0 1 1 0 14 7 7 0 0 1 0-14"/><circle class="art-location" cx="579" cy="265" r="10"/></svg>`;
    if (type === 'share') return `<svg ${common}><rect class="art-bg" width="720" height="380" rx="26"/><rect class="art-modal" x="118" y="46" width="484" height="288" rx="22"/><rect class="art-line strong" x="148" y="77" width="160" height="17" rx="5"/><rect class="art-line faint" x="148" y="105" width="260" height="8" rx="4"/><rect class="art-share-row" x="148" y="142" width="424" height="72" rx="13"/><circle class="art-logo" cx="180" cy="178" r="17"/><rect class="art-line" x="210" y="166" width="128" height="10" rx="4"/><rect class="art-line faint" x="210" y="184" width="168" height="7" rx="3"/><rect class="art-toggle" x="505" y="163" width="48" height="28" rx="14"/><circle class="art-toggle-knob" cx="539" cy="177" r="10"/><rect class="art-search" x="148" y="232" width="322" height="38" rx="9"/><rect class="art-button" x="480" y="232" width="92" height="38" rx="9"/><g transform="translate(194 297)"><circle class="art-person" cx="0" cy="0" r="17"/><circle class="art-person second" cx="38" cy="0" r="17"/><circle class="art-person third" cx="76" cy="0" r="17"/></g></svg>`;
    return `<svg ${common}><rect class="art-bg" width="720" height="380" rx="26"/><rect class="art-settings-side" x="95" y="34" width="530" height="312" rx="22"/><rect class="art-line strong" x="126" y="65" width="104" height="17" rx="5"/><g transform="translate(126 112)"><rect class="art-setting-row" width="468" height="56" rx="11"/><circle class="art-gear" cx="25" cy="28" r="11"/><rect class="art-line" x="49" y="18" width="94" height="9" rx="4"/><rect class="art-line faint" x="49" y="34" width="148" height="7" rx="3"/><rect class="art-chip" x="330" y="16" width="118" height="24" rx="12"/></g><g transform="translate(126 180)"><rect class="art-setting-row" width="468" height="56" rx="11"/><circle class="art-gear" cx="25" cy="28" r="11"/><rect class="art-line" x="49" y="18" width="132" height="9" rx="4"/><rect class="art-line faint" x="49" y="34" width="110" height="7" rx="3"/><rect class="art-button" x="350" y="15" width="98" height="26" rx="8"/></g><g transform="translate(126 248)"><rect class="art-setting-row" width="468" height="56" rx="11"/><circle class="art-gear" cx="25" cy="28" r="11"/><rect class="art-line" x="49" y="18" width="106" height="9" rx="4"/><rect class="art-line faint" x="49" y="34" width="164" height="7" rx="3"/><rect class="art-button" x="350" y="15" width="98" height="26" rx="8"/></g></svg>`;
  }

  const tutorialSteps = [
    { key: 'boards', eyebrow: '1 · Workspaces', title: 'Start from Boards', text: 'Create a board for each schedule or project. A board keeps its Plan, events, calendar, venues, contacts, budget, sharing and recovery history together.', tip: 'Boards autosave. Opened shared boards are remembered so you do not need the link every time.' },
    { key: 'plan', eyebrow: '2 · Visual planning', title: 'Build the plan directly', text: 'Drag event cards around the canvas. Press ＋ on one event, then click another event to create a connection. Connection nodes can be moved and configured.', tip: 'Ctrl/Cmd + wheel zooms. Space + drag pans. Esc cancels connection mode.' },
    { key: 'events', eyebrow: '3 · Event records', title: 'Keep details attached to events', text: 'Use Events or the Plan card editor for dates, owners, approvals, budgets and notes. Status and approval colors carry across the whole workspace.', tip: 'Use Contacts to map approval roles to email addresses for approval workflows.' },
    { key: 'venues', eyebrow: '4 · Calendar + venues', title: 'Schedule around real places', text: 'Calendar gives the date view. Venues uses OpenStreetMap for searches, saved pins and your local device position. ICS, JSON and text-based PDF calendars can be imported.', tip: 'Location tracking stays on your device and is not shared with collaborators.' },
    { key: 'share', eyebrow: '5 · Collaboration', title: 'Share the board you are already using', text: 'Open a board first, then press Share. The owner can enable link access. Signed-in collaborators who join are remembered and can reopen it from Boards later.', tip: 'Turning link sharing off blocks new people while keeping existing signed-in members.' },
    { key: 'settings', eyebrow: '6 · Recovery + options', title: 'Make the workspace yours', text: 'Version History can restore earlier checkpoints. Options controls appearance, account switching, board actions, motion and this tutorial.', tip: 'There may also be an old-school theme hiding somewhere in Appearance.' }
  ];

  function ensureSettingsDom() {
    const sidebarBottom = qs('.sidebar-bottom');
    if (sidebarBottom && !qs('#settingsButton')) {
      const b = document.createElement('button');
      b.className = 'nav-item settings-nav-item';
      b.id = 'settingsButton';
      b.type = 'button';
      b.innerHTML = '<span>⚙</span><b>Options</b>';
      sidebarBottom.insertBefore(b, qs('.save-indicator', sidebarBottom));
    }

    if (!qs('#v13Settings')) {
      const root = document.createElement('div');
      root.id = 'v13Settings';
      root.className = 'v13-settings-overlay';
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML = `<div class="v13-settings-backdrop" data-v13-close-settings></div><aside class="v13-settings-panel" role="dialog" aria-modal="true" aria-labelledby="v13SettingsTitle"><header class="v13-settings-header"><div><div class="eyebrow">MSC configuration</div><h2 id="v13SettingsTitle">Options</h2><p>Appearance, account, boards and help.</p></div><button class="icon-button" type="button" data-v13-close-settings>×</button></header><div id="v13SettingsBody" class="v13-settings-body"></div></aside>`;
      document.body.appendChild(root);
    }

    if (!qs('#v13Tutorial')) {
      const modal = document.createElement('div');
      modal.id = 'v13Tutorial';
      modal.className = 'v13-tutorial-overlay';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `<div class="v13-tutorial-backdrop"></div><section class="v13-tutorial-card" role="dialog" aria-modal="true" aria-labelledby="v13TutorialTitle"><div id="v13TutorialContent"></div></section>`;
      document.body.appendChild(modal);
    }
  }

  function openSettings() {
    ensureSettingsDom();
    renderSettings();
    qs('#v13Settings').classList.add('open');
    qs('#v13Settings').setAttribute('aria-hidden', 'false');
  }

  function closeSettings() {
    qs('#v13Settings')?.classList.remove('open');
    qs('#v13Settings')?.setAttribute('aria-hidden', 'true');
  }

  function userLabel() {
    return authUser ? (authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email || 'Google account') : 'Not signed in';
  }

  function renderSettings() {
    const body = qs('#v13SettingsBody');
    if (!body) return;
    const pref = currentPreference();
    const unlocked = localStorage.getItem(SECRET_KEY) === '1';
    const boardName = room ? (state.boardTitle || 'Untitled board') : 'No board open';
    const avatar = authUser && avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : esc(userLabel().slice(0,1).toUpperCase());
    body.innerHTML = `
      <section class="v13-setting-section">
        <div class="v13-setting-heading"><div><span class="v13-setting-icon">◐</span><div><h3>Appearance</h3><p>Choose how MSC looks on this device.</p></div></div><button class="v13-secret-trigger" data-v13-secret title="More themes" aria-label="More themes">✦</button></div>
        <div class="v13-theme-grid" id="v13ThemeGrid">
          <button class="v13-theme-card ${pref==='dark'?'active':''}" data-v13-theme="dark"><span class="theme-preview dark"><i></i><i></i><i></i></span><strong>Dark</strong><small>Original MSC</small></button>
          <button class="v13-theme-card ${pref==='light'?'active':''}" data-v13-theme="light"><span class="theme-preview light"><i></i><i></i><i></i></span><strong>Light</strong><small>Bright workspace</small></button>
          <button class="v13-theme-card ${pref==='system'?'active':''}" data-v13-theme="system"><span class="theme-preview system"><i></i><i></i><i></i></span><strong>System</strong><small>Follow device</small></button>
          ${unlocked ? `<button class="v13-theme-card aero ${pref==='aero'?'active':''}" data-v13-theme="aero"><span class="theme-preview aero"><i></i><i></i><i></i><b></b></span><strong>Frutiger Aero</strong><small>Vista-era secret theme</small></button>` : ''}
        </div>
        <label class="v13-toggle-row"><span><strong>Reduce motion</strong><small>Minimize interface animations.</small></span><input type="checkbox" id="v13ReduceMotion" ${localStorage.mscReduceMotionV13==='1'?'checked':''}><i></i></label>
      </section>

      <section class="v13-setting-section">
        <div class="v13-setting-heading"><div><span class="v13-setting-icon">☺</span><div><h3>Account</h3><p>Identity used for saved boards and collaboration.</p></div></div></div>
        <div class="v13-account-card"><span class="v13-account-avatar">${avatar}</span><div class="v13-account-copy"><strong>${esc(userLabel())}</strong><small>${esc(authUser?.email || 'Sign in to sync remembered boards across devices')}</small></div></div>
        <div class="v13-action-row">${authUser ? `<button class="button secondary" data-v13-switch-account>Switch account</button><button class="button secondary" data-v13-sign-out>Sign out here</button>` : `<button class="button primary" data-v13-sign-in>Continue with Google</button>`}</div>
      </section>

      <section class="v13-setting-section">
        <div class="v13-setting-heading"><div><span class="v13-setting-icon">▦</span><div><h3>Current board</h3><p>Workspace-level actions.</p></div></div></div>
        <div class="v13-board-summary"><span>▦</span><div><strong>${esc(boardName)}</strong><small>${room ? 'Autosaved workspace' : 'Open or create a board to use board actions'}</small></div></div>
        <div class="v13-action-grid"><button class="button secondary" data-v13-open-boards>Open Boards</button><button class="button secondary" data-v13-history ${room?'':'disabled'}>Version history</button><button class="button danger ghost" data-v13-delete-board ${room?'':'disabled'}>Delete board</button></div>
      </section>

      <section class="v13-setting-section">
        <div class="v13-setting-heading"><div><span class="v13-setting-icon">?</span><div><h3>Help & tutorial</h3><p>Replay onboarding or check essential controls.</p></div></div></div>
        <button class="v13-help-card" data-v13-replay-tutorial><span class="v13-help-art">▶</span><span><strong>Replay visual tutorial</strong><small>Boards, Plan, connections, venues, sharing and recovery.</small></span><b>›</b></button>
        <div class="v13-shortcuts"><span><kbd>Ctrl/Cmd</kbd> + wheel <b>Zoom Plan</b></span><span><kbd>Space</kbd> + drag <b>Pan canvas</b></span><span><kbd>Esc</kbd> <b>Cancel connection</b></span><span><kbd>＋</kbd> event → event <b>Create connection</b></span></div>
      </section>

      <section class="v13-setting-section v13-about"><div><strong>MSC Event Management</strong><small>Boards autosave locally and, for saved boards, online. Theme and tutorial preferences stay on this device.</small></div><span>v13</span></section>`;
    renderThemeChoices();
  }

  function renderThemeChoices() {
    const pref = currentPreference();
    qsa('[data-v13-theme]').forEach(b => b.classList.toggle('active', b.dataset.v13Theme === pref));
  }

  function showTutorial(index = 0, auto = false) {
    ensureSettingsDom();
    tutorialIndex = Math.max(0, Math.min(tutorialSteps.length - 1, index));
    if (auto) localStorage.setItem(tutorialSeenKey(), '1');
    qs('#v13Tutorial').classList.add('open');
    qs('#v13Tutorial').setAttribute('aria-hidden', 'false');
    renderTutorial();
  }

  function closeTutorial() {
    qs('#v13Tutorial')?.classList.remove('open');
    qs('#v13Tutorial')?.setAttribute('aria-hidden', 'true');
  }

  function renderTutorial() {
    const s = tutorialSteps[tutorialIndex];
    const root = qs('#v13TutorialContent');
    if (!root) return;
    root.innerHTML = `<div class="v13-tutorial-top"><div><div class="eyebrow">Welcome to MSC</div><h2 id="v13TutorialTitle">${esc(s.title)}</h2></div><button class="v13-tutorial-skip" type="button" data-v13-tutorial-close>Skip</button></div><div class="v13-tutorial-visual">${tutorialArt(s.key)}</div><div class="v13-tutorial-copy"><div class="v13-tutorial-step">${esc(s.eyebrow)}</div><p>${esc(s.text)}</p><div class="v13-tutorial-tip"><span>✦</span><small>${esc(s.tip)}</small></div></div><div class="v13-tutorial-footer"><div class="v13-tutorial-dots">${tutorialSteps.map((_,i)=>`<button aria-label="Go to step ${i+1}" data-v13-tutorial-dot="${i}" class="${i===tutorialIndex?'active':''}"></button>`).join('')}</div><div class="v13-tutorial-actions">${tutorialIndex ? '<button class="button secondary" type="button" data-v13-tutorial-back>Back</button>' : ''}<button class="button primary" type="button" data-v13-tutorial-next>${tutorialIndex === tutorialSteps.length - 1 ? 'Start planning' : 'Next'}</button></div></div>`;
  }

  function maybeShowFirstLogin(user) {
    if (!user?.id) return;
    const key = `${TUTORIAL_PREFIX}${user.id}`;
    if (localStorage.getItem(key) === '1' || autoTutorialQueuedFor === user.id) return;
    autoTutorialQueuedFor = user.id;
    setTimeout(() => {
      if (authUser?.id !== user.id || localStorage.getItem(key) === '1') return;
      showTutorial(0, true);
    }, 650);
  }

  async function switchGoogleAccount() {
    if (!supabase) return toast('Account service is still connecting');
    closeSettings();
    try {
      await supabase.auth.signOut({ scope: 'local' });
      const redirect = new URL(location.href); redirect.hash = '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirect.toString(), queryParams: { prompt: 'select_account' } }
      });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      toast('Could not switch Google account');
    }
  }

  async function signOutHere() {
    if (!supabase) return;
    try { await supabase.auth.signOut({ scope: 'local' }); toast('Signed out on this device'); renderSettings(); }
    catch (err) { console.error(err); toast('Could not sign out'); }
  }

  function goBoardAction(type) {
    closeSettings();
    setView('boards');
    if (!room || type === 'boards') return;
    setTimeout(() => {
      const card = qs(`[data-board-card="${CSS.escape(room)}"]`);
      if (!card) return toast('Open the current board from Boards first');
      if (type === 'history') card.querySelector('[data-board-history]')?.click();
      if (type === 'delete') card.querySelector('[data-board-delete]')?.click();
    }, 80);
  }

  function unlockAero() {
    if (localStorage.getItem(SECRET_KEY) === '1') return;
    secretClicks++;
    if (secretClicks === 3) toast('You found something… keep going');
    if (secretClicks >= 5) {
      localStorage.setItem(SECRET_KEY, '1');
      secretClicks = 0;
      renderSettings();
      toast('Frutiger Aero unlocked');
      const card = qs('[data-v13-theme="aero"]');
      card?.animate?.([{transform:'scale(.96)',opacity:.3},{transform:'scale(1.03)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  }

  function bind() {
    document.addEventListener('click', e => {
      if (e.target.closest('#settingsButton')) { e.preventDefault(); openSettings(); return; }
      if (e.target.closest('[data-v13-close-settings]')) { closeSettings(); return; }
      const theme = e.target.closest('[data-v13-theme]');
      if (theme) { applyTheme(theme.dataset.v13Theme, true); renderSettings(); return; }
      if (e.target.closest('[data-v13-secret]')) { unlockAero(); return; }
      if (e.target.closest('[data-v13-replay-tutorial]')) { closeSettings(); showTutorial(0, false); return; }
      if (e.target.closest('[data-v13-tutorial-close]')) { localStorage.setItem(tutorialSeenKey(), '1'); closeTutorial(); return; }
      if (e.target.closest('[data-v13-tutorial-back]')) { tutorialIndex--; renderTutorial(); return; }
      if (e.target.closest('[data-v13-tutorial-next]')) {
        if (tutorialIndex >= tutorialSteps.length - 1) { localStorage.setItem(tutorialSeenKey(), '1'); closeTutorial(); if (!room) setView('boards'); }
        else { tutorialIndex++; renderTutorial(); }
        return;
      }
      const dot = e.target.closest('[data-v13-tutorial-dot]');
      if (dot) { tutorialIndex = +dot.dataset.v13TutorialDot; renderTutorial(); return; }
      if (e.target.closest('[data-v13-switch-account]')) { switchGoogleAccount(); return; }
      if (e.target.closest('[data-v13-sign-out]')) { signOutHere(); return; }
      if (e.target.closest('[data-v13-sign-in]')) { closeSettings(); signInGoogle(); return; }
      if (e.target.closest('[data-v13-open-boards]')) { goBoardAction('boards'); return; }
      if (e.target.closest('[data-v13-history]')) { goBoardAction('history'); return; }
      if (e.target.closest('[data-v13-delete-board]')) { goBoardAction('delete'); return; }
    }, true);

    document.addEventListener('change', e => {
      if (e.target.id === 'v13ReduceMotion') {
        localStorage.mscReduceMotionV13 = e.target.checked ? '1' : '0';
        document.documentElement.classList.toggle('reduce-motion', e.target.checked);
      }
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && qs('#v13Tutorial.open')) { closeTutorial(); return; }
      if (e.key === 'Escape' && qs('#v13Settings.open')) closeSettings();
    }, true);

    const media = matchMedia('(prefers-color-scheme: light)');
    media.addEventListener?.('change', () => { if (currentPreference() === 'system') applyTheme('system', false); });
  }

  ensureSettingsDom();
  document.documentElement.classList.toggle('reduce-motion', localStorage.mscReduceMotionV13 === '1');
  applyTheme(currentPreference(), false);
  bind();

  // Observe current and future auth state without changing the existing online/auth layer.
  const baseSetAuthUser = typeof setAuthUser === 'function' ? setAuthUser : null;
  if (baseSetAuthUser) {
    setAuthUser = function(user) {
      baseSetAuthUser(user);
      renderSettings();
      if (user) maybeShowFirstLogin(user);
    };
  }
  if (authUser) maybeShowFirstLogin(authUser);

  window.MSC_OPTIONS = { open: openSettings, tutorial: () => showTutorial(0, false), applyTheme };
})();
