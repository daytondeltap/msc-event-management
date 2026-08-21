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
async function visualBounds(page){
  return page.evaluate(()=>{
    const vv=window.visualViewport;
    const left=vv?.offsetLeft||0,top=vv?.offsetTop||0;
    const width=vv?.width||window.innerWidth,height=vv?.height||window.innerHeight;
    return {left,top,right:left+width,bottom:top+height,width,height};
  });
}
function expectInside(r,b,pad=2){
  expect(r.left).toBeGreaterThanOrEqual(b.left-pad);
  expect(r.right).toBeLessThanOrEqual(b.right+pad);
  expect(r.top).toBeGreaterThanOrEqual(b.top-pad);
  expect(r.bottom).toBeLessThanOrEqual(b.bottom+pad);
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
    const visible=await visualBounds(page);

    // Body chrome itself may never be wider than the viewport; intentional table/calendar/status overflow lives inside dedicated scrollers.
    const rootOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(rootOverflow).toBeLessThanOrEqual(3);

    for (const selector of ['#newEventButton','#accountButton','#presenceButton','#shareButton']) {
      await expect(page.locator(selector)).toBeVisible();
      const r=await rect(page,selector);
      expect(r.left).toBeGreaterThanOrEqual(visible.left-1);
      expect(r.right).toBeLessThanOrEqual(visible.right+1);
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
    expectInside(await rect(page,'#importModal .modal-card'),await visualBounds(page));
    await page.locator('[data-close-import]').last().click();

    await page.locator('#newEventButton').click();
    await expect(page.locator('#eventDrawer')).toHaveClass(/open/);
    const drawer=await rect(page,'#eventDrawer .drawer-panel');
    const drawerBounds=await visualBounds(page);
    expect(drawer.left).toBeGreaterThanOrEqual(drawerBounds.left-1);expect(drawer.right).toBeLessThanOrEqual(drawerBounds.right+1);
    await page.locator('[data-close-drawer]').last().click();

    await page.locator('#settingsButton').click();
    await expect(page.locator('#v25SettingsPanel')).toHaveClass(/open/);
    expectInside(await rect(page,'#v25SettingsPanel .v25-settings-card'),await visualBounds(page));
    await page.locator('[data-v25-settings-close]').last().click();

    // View navigation must work even when the mobile bar is horizontally scrollable.
    await page.locator('.nav-list [data-view="calendar"]').click();
    await expect(page.locator('#calendarView')).toHaveClass(/active/);
    await page.locator('.nav-list [data-view="plan"]').click();
    await expect(page.locator('#planView')).toHaveClass(/active/);

    expect(fatal,`Browser errors at ${vp.name}: ${fatal.join('\n')}`).toEqual([]);
    await context.close();
  });
}
