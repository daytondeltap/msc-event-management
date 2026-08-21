/* v31 regression fixes: auth reliability, callback restoration and pointer cleanup. */
(() => {
  'use strict';
  const V31 = window.MSC_V31 = window.MSC_V31 || {};
  let clientPromise = null;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safeToast = text => { try { toast(text); } catch {} };

  async function importWithTimeout(src, timeout = 6500) {
    let timer = 0;
    try {
      return await Promise.race([
        import(src),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout:${src}`)), timeout); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureSupabaseClient() {
    if (typeof supabase !== 'undefined' && supabase) return supabase;
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      // Give the normal startup import time to finish before using a second CDN.
      for (let i = 0; i < 12; i++) {
        if (typeof supabase !== 'undefined' && supabase) return supabase;
        await wait(125);
      }
      let mod = null;
      let lastError = null;
      for (const src of [
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm',
        'https://esm.run/@supabase/supabase-js@2.111.0'
      ]) {
        try { mod = await importWithTimeout(src); if (mod?.createClient) break; }
        catch (err) { lastError = err; }
      }
      if (!mod?.createClient) throw lastError || new Error('Supabase client unavailable');
      const client = mod.createClient(SB_URL, SB_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
      supabase = client;
      const { data } = await client.auth.getSession();
      try { setAuthUser(data.session?.user || null); } catch {}
      client.auth.onAuthStateChange((_event, session) => {
        try { setAuthUser(session?.user || null); } catch {}
        try { if (room) reconnectRoom(); } catch {}
      });
      try { if (room && !channel) connectRoom(); } catch {}
      return client;
    })().catch(err => { clientPromise = null; throw err; });
    return clientPromise;
  }

  function validReturnUrl(value) {
    try {
      const u = new URL(value, location.href);
      return u.origin === location.origin && u.pathname === location.pathname ? u : null;
    } catch { return null; }
  }

  async function restoreOAuthReturn(client) {
    let raw = '';
    try { raw = sessionStorage.getItem('mscOAuthReturnV31') || ''; } catch {}
    if (!raw) return;
    const target = validReturnUrl(raw);
    if (!target) { try { sessionStorage.removeItem('mscOAuthReturnV31'); } catch {} return; }
    let session = null;
    try { ({ data:{ session } = {} } = await client.auth.getSession()); } catch {}
    if (!session) return;
    try { sessionStorage.removeItem('mscOAuthReturnV31'); } catch {}
    const current = new URL(location.href);
    // Do not reload when the user signed in from the canonical page.
    if (target.search === current.search && target.hash === current.hash) return;
    location.replace(target.toString());
  }

  function patchAuthCopy() {
    const note = document.getElementById('authSetupNote');
    const stateEl = document.getElementById('accountState');
    if (typeof authUser !== 'undefined' && authUser) {
      if (note) note.textContent = 'Signed-in identity is used for live presence, saved boards and collaboration attribution.';
      return;
    }
    if (note) note.textContent = 'Google sign-in is available. Continue with Google to use saved boards and collaboration across devices.';
    const small = stateEl?.querySelector('.account-profile small');
    if (small && /configured|oauth setup|required/i.test(small.textContent || '')) small.textContent = 'Continue with Google to sign in. Local planning still works without an account.';
  }

  async function robustGoogleSignIn() {
    const button = document.getElementById('signInGoogleButton');
    const oldText = button?.innerHTML || '';
    if (button) { button.disabled = true; button.textContent = 'Connecting…'; }
    try {
      const client = await ensureSupabaseClient();
      const returnUrl = new URL(location.href);
      returnUrl.hash = '';
      try { sessionStorage.setItem('mscOAuthReturnV31', returnUrl.toString()); } catch {}
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await client.auth.signInWithOAuth({
        provider:'google',
        options:{ redirectTo }
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google sign-in failed to start', err);
      safeToast('Google sign-in could not start — please try again');
      const note = document.getElementById('authSetupNote');
      if (note) note.textContent = 'Google sign-in is temporarily unavailable. Your local board is unaffected; retry in a moment.';
      try { sessionStorage.removeItem('mscOAuthReturnV31'); } catch {}
    } finally {
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.innerHTML = oldText || '<span class="google-g">G</span> Continue with Google';
      }
    }
  }

  // Keep the existing account behavior, but correct stale configuration messaging.
  try {
    if (typeof accountUI === 'function' && !accountUI.__v31) {
      const baseAccountUI = accountUI;
      accountUI = function() { baseAccountUI(); patchAuthCopy(); };
      accountUI.__v31 = true;
    }
    signInGoogle = robustGoogleSignIn;
    const button = document.getElementById('signInGoogleButton');
    if (button) button.onclick = robustGoogleSignIn;
    accountUI?.();
  } catch (err) { console.warn('v31 auth UI guard skipped', err); }

  function finishPointerInteraction() {
    try {
      if (drag?.type === 'block') { endBlockDrag(); return; }
      if (drag?.type === 'pan') {
        drag.p?.classList?.remove('panning');
        drag = null;
      }
    } catch (err) { console.warn('v31 pointer cleanup skipped', err); }
  }
  document.addEventListener('pointercancel', finishPointerInteraction, true);
  document.addEventListener('lostpointercapture', finishPointerInteraction, true);
  window.addEventListener('blur', finishPointerInteraction);

  // A completed OAuth exchange may need to return to a board/query that was intentionally removed from redirectTo.
  ensureSupabaseClient().then(client => restoreOAuthReturn(client)).catch(() => patchAuthCopy());

  V31.ensureSupabaseClient = ensureSupabaseClient;
  V31.signInGoogle = robustGoogleSignIn;
  V31.patchAuthCopy = patchAuthCopy;
  V31.finishPointerInteraction = finishPointerInteraction;
  V31.ready = true;
})();
