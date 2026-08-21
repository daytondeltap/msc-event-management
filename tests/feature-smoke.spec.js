const { test, expect } = require('@playwright/test');

const APP = 'http://127.0.0.1:4173/';

async function waitForProduction(page) {
  await page.waitForFunction(() => window.MSC_BOOT_STATE?.phase === 'production-ready' || document.documentElement.dataset.production === 'v28', { timeout: 10000 });
}

test('event logistics and budget values persist and render', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto(`${APP}?feature-smoke=event`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#plannerViewport');
  await waitForProduction(page);

  await page.locator('#newEventButton').click();
  await page.locator('#eventForm [name="name"]').fill('Feature Smoke Event');
  await page.locator('#eventForm [name="venue"]').fill('Feature Smoke Hall');
  await page.locator('#eventForm [name="venueAddress"]').fill('Bangkok, Thailand');
  await page.locator('#eventForm [name="budgetPlanned"]').fill('12345');
  await page.locator('#eventForm [name="budgetActual"]').fill('2345');
  await page.locator('#eventForm [name="status"]').selectOption({ label: 'Planning' });
  await page.locator('#eventForm [name="approvalRequired"]').selectOption('true');
  await page.locator('#eventForm [name="approvalStatus"]').selectOption({ label: 'Awaiting approval' });
  await page.locator('#eventForm button[type="submit"]').click();
  await expect(page.locator('#eventDrawer')).not.toHaveClass(/open/);

  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('msc-event-management-v6') || '{}');
    return !!state.events?.find(e => e.name === 'Feature Smoke Event');
  }, { timeout: 5000 });
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('msc-event-management-v6') || '{}');
    return state.events?.find(e => e.name === 'Feature Smoke Event') || null;
  });
  expect(saved).toMatchObject({
    venue: 'Feature Smoke Hall',
    venueAddress: 'Bangkok, Thailand',
    budgetPlanned: 12345,
    budgetActual: 2345,
    status: 'Planning',
    approvalRequired: true,
    approvalStatus: 'Awaiting approval'
  });

  await page.locator('#globalSearch').fill('Feature Smoke Event');
  await page.locator('[data-view="budget"]').click();
  await expect(page.locator('#budgetView')).toContainText('฿12,345');
  await expect(page.locator('#budgetView')).toContainText('฿2,345');
  expect(errors).toEqual([]);
});

test('Google OAuth uses a canonical callback and remembers the board URL', async ({ page }) => {
  await page.goto(`${APP}?board=feature-smoke-board`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#accountButton');
  await page.waitForTimeout(300);

  const result = await page.evaluate(async () => {
    supabase = {
      auth: {
        signInWithOAuth: async args => {
          window.__mscOAuthArgs = args;
          return { data: {}, error: null };
        }
      }
    };
    wrapGoogleOAuthRedirect();
    await signInGoogle();
    return {
      args: window.__mscOAuthArgs,
      returnUrl: sessionStorage.getItem('mscGoogleOAuthReturnV31')
    };
  });

  expect(result.args.provider).toBe('google');
  expect(result.args.options.redirectTo).toBe(APP);
  expect(result.returnUrl).toBe(`${APP}?board=feature-smoke-board`);
});

test('guest board owner key is attached to persistence requests', async ({ page }) => {
  let seenOwner = '';
  await page.route('**/functions/v1/persistent-board?board=feature-smoke-owner', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type,x-board-owner,authorization,apikey'
        },
        body: 'ok'
      });
      return;
    }
    seenOwner = request.headers()['x-board-owner'] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('mscBoardOwnerKey:feature-smoke-owner', 'feature-owner-secret'));
  const ok = await page.evaluate(async () => {
    const res = await fetch(`${SB_URL}/functions/v1/persistent-board?board=feature-smoke-owner`, { cache: 'no-store' });
    return res.ok;
  });
  expect(ok).toBeTruthy();
  expect(seenOwner).toBe('feature-owner-secret');
});

test('Boards loader can retry after a transient script failure', async ({ page }) => {
  let attempts = 0;
  await page.route('**/app-v9-persistence.js', async route => {
    attempts += 1;
    if (attempts === 1) return route.abort('failed');
    return route.continue();
  });

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#shareButton');
  await page.locator('#shareButton').click();
  await page.waitForTimeout(350);
  expect(attempts).toBe(1);
  await expect(page.locator('#shareModal')).not.toHaveClass(/open/);

  await page.locator('#shareButton').click();
  await expect(page.locator('#shareModal')).toHaveClass(/open/, { timeout: 10000 });
  expect(attempts).toBe(2);
});
