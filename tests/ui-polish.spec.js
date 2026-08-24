const { test, expect } = require('@playwright/test');

const APP = 'http://127.0.0.1:4173/';

async function ready(page){
  await page.goto(APP,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSC_BOOT_STATE?.phase==='production-ready',{timeout:10000});
  await page.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('features-v37-polish.css')),{timeout:10000});
}

function seconds(value='0s'){
  return Math.max(...String(value).split(',').map(v=>{
    v=v.trim();
    if(v.endsWith('ms')) return Number.parseFloat(v)/1000;
    return Number.parseFloat(v)||0;
  }));
}

test('v37 polish stays short, blur-free and does not disturb planner coordinates',async({page})=>{
  await ready(page);

  const source=await page.evaluate(()=>fetch('features-v37-polish.css').then(r=>r.text()));
  expect(source).not.toMatch(/transition\s*:\s*all/i);
  expect(source).not.toMatch(/backdrop-filter\s*:\s*blur/i);
  expect(source).toContain('.planner-world,.connections,.cursor-layer,.remote-cursor{animation:none!important}');

  const timing=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement);
    const button=getComputedStyle(document.querySelector('#newEventButton'));
    return {
      fast:root.getPropertyValue('--motion-fast').trim(),
      ui:root.getPropertyValue('--motion-ui').trim(),
      panel:root.getPropertyValue('--motion-panel').trim(),
      button:button.transitionDuration
    };
  });
  expect(seconds(timing.fast)).toBeLessThanOrEqual(.12);
  expect(seconds(timing.ui)).toBeLessThanOrEqual(.16);
  expect(seconds(timing.panel)).toBeLessThanOrEqual(.19);
  expect(seconds(timing.button)).toBeLessThanOrEqual(.16);

  await page.locator('#accountButton').click();
  await expect(page.locator('#accountModal')).toHaveClass(/open/);
  const modal=await page.locator('#accountModal .modal-card').evaluate(el=>{
    const c=getComputedStyle(el);
    const backdrop=getComputedStyle(document.querySelector('#accountModal .modal-backdrop'));
    return {name:c.animationName,duration:c.animationDuration,backdrop:backdrop.backdropFilter||backdrop.webkitBackdropFilter||'none'};
  });
  expect(modal.name).toContain('v37ModalIn');
  expect(seconds(modal.duration)).toBeLessThanOrEqual(.19);
  expect(modal.backdrop).toBe('none');
  await page.locator('[data-close-account]').last().click();

  const block=page.locator('.event-block').first();
  await expect(block).toBeVisible();
  const before=await block.evaluate(el=>getComputedStyle(el).transform);
  await block.hover();
  const after=await block.evaluate(el=>getComputedStyle(el).transform);
  expect(after).toBe(before);
});

test('reduced-motion removes v37 animations and transitions',async({browser})=>{
  const context=await browser.newContext({reducedMotion:'reduce'});
  const page=await context.newPage();
  await ready(page);
  await page.locator('#accountButton').click();
  const values=await page.evaluate(()=>({
    modal:getComputedStyle(document.querySelector('#accountModal .modal-card')).animationName,
    button:getComputedStyle(document.querySelector('#newEventButton')).transitionDuration,
    view:getComputedStyle(document.querySelector('.view.active')).animationName
  }));
  expect(values.modal).toBe('none');
  // Chromium may serialize a disabled transition as 0.00001s internally.
  expect(seconds(values.button)).toBeLessThanOrEqual(.00002);
  expect(values.view).toBe('none');
  await context.close();
});

test('mobile More uses the fast sheet entrance without backdrop blur',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await ready(page);
  const more=page.locator('#mobileMoreButton');
  await expect(more).toBeVisible();
  await more.tap();
  await expect(page.locator('#mobileMoreSheet')).toHaveClass(/open/);
  const sheet=await page.evaluate(()=>{
    const panel=getComputedStyle(document.querySelector('#mobileMoreSheet .mobile-more-panel'));
    const backdrop=getComputedStyle(document.querySelector('#mobileMoreSheet .mobile-more-backdrop'));
    return {name:panel.animationName,duration:panel.animationDuration,backdrop:backdrop.backdropFilter||backdrop.webkitBackdropFilter||'none'};
  });
  expect(sheet.name).toContain('v37SheetIn');
  expect(seconds(sheet.duration)).toBeLessThanOrEqual(.19);
  expect(sheet.backdrop).toBe('none');
  await context.close();
});
