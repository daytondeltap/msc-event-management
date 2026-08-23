const { test, expect } = require('@playwright/test');

const APP = 'http://127.0.0.1:4173/';

async function waitForV33(page) {
  await page.waitForFunction(() => window.MSC_BOOT_STATE?.phase === 'production-ready', { timeout: 10000 });
  await page.waitForFunction(() => !!window.MSC_BUDGET_QOL && !!window.MSC_PROD_QOL, { timeout: 10000 });
}

test('v33 strips email from presence and uses simpler copy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto(`${APP}?prod-smoke=privacy`, { waitUntil: 'domcontentloaded' });
  await waitForV33(page);

  const payload = await page.evaluate(() => {
    authUser = {
      id: 'user-1',
      email: 'student@example.com',
      user_metadata: { full_name: 'Test Member' }
    };
    return identityPayload({ action: 'editing' });
  });

  expect(payload.name).toBeTruthy();
  expect(payload.action).toBe('editing');
  expect(Object.prototype.hasOwnProperty.call(payload, 'email')).toBeFalsy();
  await expect(page.locator('#viewSubtitle')).toHaveText('Arrange events and connect the plan.');
  await page.locator('#newEventButton').click();
  await expect(page.locator('#drawerActivity')).toHaveText('Edit the event details.');
  expect(errors).toEqual([]);
});

test('remote collaborator cursor renders as a dot and reuses its node', async ({ page }) => {
  await page.goto(`${APP}?prod-smoke=cursor`, { waitUntil: 'domcontentloaded' });
  await waitForV33(page);

  const result = await page.evaluate(async () => {
    room = 'prod-smoke-room';
    view = 'plan';
    remoteCursors = {
      peerA: { from: 'peerA', name: 'Alex', x: 80, y: 90, t: Date.now() }
    };
    drawRemoteCursors();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const first = document.querySelector('[data-cursor-id="peerA"]');
    remoteCursors.peerA.x = 120;
    remoteCursors.peerA.t = Date.now();
    drawRemoteCursors();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const second = document.querySelector('[data-cursor-id="peerA"]');
    return {
      sameNode: first === second,
      dots: document.querySelectorAll('.cursor-dot').length,
      arrows: document.querySelectorAll('#cursorLayer .cursor-pointer').length,
      label: second?.querySelector('.cursor-label')?.textContent || ''
    };
  });

  expect(result.sameNode).toBeTruthy();
  expect(result.dots).toBe(1);
  expect(result.arrows).toBe(0);
  expect(result.label).toBe('Alex');
});

test('mobile More has stable open state, accessible state, and working secondary navigation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto(`${APP}?prod-smoke=more`, { waitUntil: 'domcontentloaded' });
  await waitForV33(page);
  await page.waitForSelector('#mobileMoreButton');

  const more = page.locator('#mobileMoreButton');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(page.locator('#mobileMoreSheet')).toHaveClass(/open/);
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobileMoreGrid')).toContainText('Calendar');
  await expect(page.locator('#mobileMoreGrid')).toContainText('Boards');
  await expect(page.locator('#mobileMoreGrid')).toContainText('Contacts');

  await page.locator('#mobileMoreGrid [data-view="calendar"]').click();
  await expect(page.locator('#calendarView')).toHaveClass(/active/);
  await expect(page.locator('#mobileMoreSheet')).not.toHaveClass(/open/);
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  await more.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobileMoreSheet')).not.toHaveClass(/open/);
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
  await context.close();
});

test('production keyboard QoL focuses search and opens a new event', async ({ page }) => {
  await page.goto(`${APP}?prod-smoke=keyboard`, { waitUntil: 'domcontentloaded' });
  await waitForV33(page);

  await page.keyboard.press('/');
  await expect(page.locator('#globalSearch')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('#plannerViewport').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('n');
  await expect(page.locator('#eventDrawer')).toHaveClass(/open/);
});
