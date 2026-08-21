const { test, expect } = require('@playwright/test');

const viewports = [
  { name:'small-phone', width:360, height:740, touch:true },
  { name:'phone', width:390, height:844, touch:true },
  { name:'phone-landscape', width:667, height:375, touch:true },
  { name:'tablet-portrait', width:768, height:1024, touch:true },
  { name:'tablet-landscape', width:1024, height:768, touch:true },
  { name:'laptop', width:1366, height:768, touch:false },
  { name:'desktop', width:1920, height:1080, touch:false }
];

async function rect(page, selector){
  return page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});
}

for (const vp of viewports) {
  test(`${vp.name}: primary UI remains reachable`, async ({ browser }) => {
    const context = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, hasTouch:vp.touch, isMobile:vp.width<=900 });
    const page = await context.newPage();
    const fatal=[];
    page.on('pageerror',err=>fatal.push(String(err)));
    await page.goto('http://127.0.0.1:4173/?device-smoke=1',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#plannerViewport',{timeout:10000});
    await page.waitForFunction(()=>window.MSC_DEVICE_NAV||document.documentElement.dataset.production==='v28',{timeout:10000}).catch(()=>{});
    await page.waitForTimeout(500);

    const rootOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(rootOverflow).toBeLessThanOrEqual(3);

    for (const selector of ['#newEventButton','#accountButton','#presenceButton','#shareButton']) {
      await expect(page.locator(selector)).toBeVisible();
      const r=await rect(page,selector);
      expect(r.left).toBeGreaterThanOrEqual(-1);
      expect(r.right).toBeLessThanOrEqual(vp.width+1);
    }

    await expect(page.locator('#importButton')).toBeVisible();
    await expect(page.locator('#exportButton')).toBeVisible();
    await expect(page.locator('#settingsButton')).toBeVisible();

    if(vp.width<=900){
      expect(await page.locator('#importButton').evaluate(el=>el.parentElement?.classList.contains('nav-list'))).toBeTruthy();
      expect(await page.locator('#exportButton').evaluate(el=>el.parentElement?.classList.contains('nav-list'))).toBeTruthy();
      expect(await page.locator('#settingsButton').evaluate(el=>el.parentElement?.classList.contains('nav-list'))).toBeTruthy();
    }

    await page.locator('#importButton').click();
    await expect(page.locator('#importModal')).toHaveClass(/open/);
    const modal=await rect(page,'#importModal .modal-card');
    expect(modal.left).toBeGreaterThanOrEqual(-1);expect(modal.right).toBeLessThanOrEqual(vp.width+1);
    expect(modal.top).toBeGreaterThanOrEqual(-1);expect(modal.bottom).toBeLessThanOrEqual(vp.height+2);
    await page.locator('#importModal .modal-header [data-close-import]').click();

    await page.locator('#newEventButton').click();
    await expect(page.locator('#eventDrawer')).toHaveClass(/open/);
    const drawer=await rect(page,'#eventDrawer .drawer-panel');
    expect(drawer.left).toBeGreaterThanOrEqual(-1);expect(drawer.right).toBeLessThanOrEqual(vp.width+1);
    await page.locator('#eventDrawer .drawer-header [data-close-drawer]').click();

    await page.locator('#settingsButton').click();
    await expect(page.locator('#v25SettingsPanel')).toHaveClass(/open/);
    const settings=await rect(page,'#v25SettingsPanel .v25-settings-card');
    expect(settings.left).toBeGreaterThanOrEqual(-1);expect(settings.right).toBeLessThanOrEqual(vp.width+1);
    expect(settings.top).toBeGreaterThanOrEqual(-1);expect(settings.bottom).toBeLessThanOrEqual(vp.height+2);
    await page.locator('#v25SettingsPanel header [data-v25-settings-close]').click();

    await page.locator('.nav-list [data-view="calendar"]').click();
    await expect(page.locator('#calendarView')).toHaveClass(/active/);
    await page.locator('.nav-list [data-view="plan"]').click();
    await expect(page.locator('#planView')).toHaveClass(/active/);

    expect(fatal,`Browser errors at ${vp.name}: ${fatal.join('\n')}`).toEqual([]);
    await context.close();
  });
}
