/* v36: keep visible identity account-scoped and clear signed-in names on logout. */
(() => {
  'use strict';

  const LEGACY_NAME_KEY = 'mscDisplayName';
  const GUEST_NAME_KEY = 'mscGuestDisplayName';
  const ACCOUNT_NAME_PREFIX = 'mscAccountDisplayName:';
  const DEFAULT_GUEST_NAME = 'Guest';

  function cleanName(value, fallback = DEFAULT_GUEST_NAME) {
    const name = String(value || '').trim().slice(0, 40);
    return name || fallback;
  }

  function guestName() {
    try { return cleanName(localStorage.getItem(GUEST_NAME_KEY), DEFAULT_GUEST_NAME); }
    catch { return DEFAULT_GUEST_NAME; }
  }

  function accountName(user) {
    const metadata = user?.user_metadata || {};
    let saved = '';
    try { saved = localStorage.getItem(ACCOUNT_NAME_PREFIX + user.id) || ''; } catch {}
    return cleanName(
      saved || metadata.full_name || metadata.name || user?.email?.split('@')[0],
      'Account'
    );
  }

  function clearLegacyIdentity() {
    try { localStorage.removeItem(LEGACY_NAME_KEY); } catch {}
  }

  function applyIdentity(user) {
    authUser = user || null;
    if (authUser) {
      displayName = accountName(authUser);
      const metadata = authUser.user_metadata || {};
      avatarUrl = metadata.avatar_url || metadata.picture || '';
    } else {
      displayName = guestName();
      avatarUrl = '';
    }
    clearLegacyIdentity();
    try { accountUI(); } catch {}
    try { presenceUI(); } catch {}
    if (channel && connected) {
      try { updatePresence(); } catch {}
    }
  }

  // app-core historically seeded displayName from a global key. Replace it before the first render.
  displayName = guestName();
  clearLegacyIdentity();

  // v35 calls setAuthUser for verified identity transitions, so make that transition authoritative for UI identity too.
  setAuthUser = function(user) {
    applyIdentity(user || null);
  };

  // Own display-name edits so aliases cannot leak between Google accounts or into signed-out guest state.
  document.addEventListener('change', event => {
    if (event.target?.id !== 'displayName') return;
    const fallback = authUser ? accountName(authUser) : guestName();
    displayName = cleanName(event.target.value, fallback);
    try {
      if (authUser?.id) localStorage.setItem(ACCOUNT_NAME_PREFIX + authUser.id, displayName);
      else localStorage.setItem(GUEST_NAME_KEY, displayName);
      localStorage.removeItem(LEGACY_NAME_KEY);
    } catch {}
    event.target.value = displayName;
    Promise.resolve(updatePresence?.()).catch(() => {}).finally(() => {
      try { presenceUI(); } catch {}
    });
    event.stopImmediatePropagation();
  }, true);

  window.MSC_IDENTITY_V36 = {
    applyIdentity,
    guestName,
    accountName,
    keys: { guest: GUEST_NAME_KEY, accountPrefix: ACCOUNT_NAME_PREFIX }
  };
})();
