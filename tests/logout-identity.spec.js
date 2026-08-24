const { test, expect } = require('@playwright/test');

const APP = 'http://127.0.0.1:4173/';

async function ready(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.MSC_BOOT_STATE?.phase === 'production-ready' && !!window.MSC_IDENTITY_V36, { timeout: 10000 });
}

test('logout immediately removes the signed-in name from account and presence UI', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    localStorage.setItem('mscDisplayName', 'STALE LEGACY NAME');
    setAuthUser({
      id: 'user-a',
      email: 'alice@example.test',
      user_metadata: { full_name: 'Alice Example', avatar_url: 'https://example.test/alice.png' }
    });
    presenceUI();
  });

  await expect(page.locator('#accountLabel')).toHaveText('Alice Example');
  await expect(page.locator('#presencePopover')).toContainText('Alice Example');

  await page.evaluate(() => {
    setAuthUser(null);
    presenceUI();
  });

  await expect(page.locator('#accountLabel')).toHaveText('Sign in');
  await expect(page.locator('#accountState')).toContainText('Not signed in');
  await expect(page.locator('#presencePopover')).toContainText('Guest');
  await expect(page.locator('#presencePopover')).not.toContainText('Alice Example');
  expect(await page.evaluate(() => ({
    displayName,
    avatarUrl,
    legacy: localStorage.getItem('mscDisplayName')
  }))).toEqual({ displayName: 'Guest', avatarUrl: '', legacy: null });
});

test('display aliases are isolated between accounts and guest mode', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const a = { id: 'user-a', email: 'a@example.test', user_metadata: { full_name: 'Account A' } };
    const b = { id: 'user-b', email: 'b@example.test', user_metadata: { full_name: 'Account B' } };

    setAuthUser(a);
    const input = document.getElementById('displayName');
    input.value = 'A custom alias';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    const aName = displayName;

    setAuthUser(b);
    const bName = displayName;
    setAuthUser(null);
    const guestName = displayName;
    setAuthUser(a);
    const aAgain = displayName;

    return {
      aName,
      bName,
      guestName,
      aAgain,
      aStored: localStorage.getItem('mscAccountDisplayName:user-a'),
      bStored: localStorage.getItem('mscAccountDisplayName:user-b'),
      legacy: localStorage.getItem('mscDisplayName')
    };
  });

  expect(result).toEqual({
    aName: 'A custom alias',
    bName: 'Account B',
    guestName: 'Guest',
    aAgain: 'A custom alias',
    aStored: 'A custom alias',
    bStored: null,
    legacy: null
  });
});
