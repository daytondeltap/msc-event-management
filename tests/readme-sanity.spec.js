const { test, expect } = require('@playwright/test');

const APP = 'http://127.0.0.1:4173/';

async function ready(page){
  await page.goto(`${APP}?readme-sanity=1`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#plannerViewport',{timeout:10000});
  await page.waitForFunction(()=>window.MSC_BOOT_STATE?.phase==='production-ready' && !!window.MSC_V34,{timeout:10000});
}

async function seedSimpleGraph(page){
  return page.evaluate(()=>{
    const a=state.events[0],b=state.events[1],c=state.events[2];
    a.position={x:180,y:220};b.position={x:760,y:220};c.position={x:760,y:620};
    state.connections=[{id:'sanity-conn',from:a.id,to:b.id,label:'',style:'solid',tone:'neutral',nodeMode:'auto'}];
    window.MSC_V24?.syncDeps?.();save(false);render();setView('plan',false);
    return {a:a.id,b:b.id,c:c.id};
  });
}

test('README core routes, drawers, Options and lazy workspaces remain reachable', async ({ page })=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await ready(page);
  const routes=[['home','homeView'],['plan','planView'],['events','eventsView'],['board','boardView'],['calendar','calendarView'],['budget','budgetView'],['contacts','contactsView']];
  for(const [view,id] of routes){
    await page.locator(`[data-view="${view}"]`).first().click();
    await expect(page.locator(`#${id}`)).toHaveClass(/active/);
  }

  await page.locator('#newEventButton').click();
  await expect(page.locator('#eventDrawer')).toHaveClass(/open/);
  await page.locator('[data-close-drawer]').last().click();

  await page.locator('#importButton').click();
  await expect(page.locator('#importModal')).toHaveClass(/open/);
  await page.locator('[data-close-import]').last().click();

  await page.locator('#settingsButton').click();
  await expect(page.locator('#v25SettingsPanel')).toHaveClass(/open/);
  await expect(page.locator('#v25SettingsPanel')).toContainText('Large calendars & Plan');
  await expect(page.locator('#v25SettingsPanel')).toContainText('Email API');
  await page.locator('[data-v25-settings-close]').last().click();

  await page.locator('#shareButton').click();
  await expect(page.locator('#shareModal')).toHaveClass(/open/,{timeout:10000});
  await page.locator('button[data-close-v11-share],button[data-close-share]').click();
  await expect(page.locator('[data-view="boards"]')).toHaveCount(1,{timeout:10000});
  await page.locator('[data-view="boards"]').click();
  await expect(page.locator('#boardsView')).toHaveClass(/active/,{timeout:10000});

  await page.locator('[data-view="venues"]').first().click();
  await expect(page.locator('#venuesView')).toHaveClass(/active/);
  await page.locator('[data-view="plan"]').first().click();
  await expect(page.locator('#planView')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('Plan connection node can be named, styled, colored, dragged, auto-routed, reversed and deleted', async ({ page })=>{
  await ready(page);
  const ids=await seedSimpleGraph(page);
  const node=page.locator('[data-connection-node="sanity-conn"]');
  await expect(node).toBeVisible();

  let box=await node.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+70,{steps:6});
  await page.mouse.up();
  let conn=await page.evaluate(()=>state.connections.find(c=>c.id==='sanity-conn'));
  expect(conn.nodeMode).toBe('manual');
  expect(conn.node).toBeTruthy();

  await page.waitForTimeout(250);
  await expect(node).toBeVisible();
  await node.click();
  await expect(page.locator('#v34NodeEditor')).toBeVisible();
  await expect(page.locator('#v34NodeEditor')).toContainText('Node name / label');
  await page.locator('#v34NodeEditor [data-v24-label]').fill('Needs approval');
  await page.locator('#v34NodeEditor [data-v24-style]').selectOption('dashed');
  await page.locator('#v34NodeEditor [data-v24-tone]').selectOption('red');
  await page.locator('#viewTitle').click();
  conn=await page.evaluate(()=>state.connections.find(c=>c.id==='sanity-conn'));
  expect(conn).toMatchObject({label:'Needs approval',style:'dashed',tone:'red',nodeMode:'manual'});

  await expect(node).toBeVisible();
  await node.click();
  await page.locator('#v34NodeEditor [data-v24-auto]').click();
  conn=await page.evaluate(()=>state.connections.find(c=>c.id==='sanity-conn'));
  expect(conn.nodeMode).toBe('auto');

  await expect(node).toBeVisible();
  await node.click();
  await page.locator('#v34NodeEditor [data-v24-reverse]').click();
  conn=await page.evaluate(()=>state.connections.find(c=>c.id==='sanity-conn'));
  expect(conn.from).toBe(ids.b);expect(conn.to).toBe(ids.a);

  await expect(node).toBeVisible();
  await node.click();
  await page.locator('#v34NodeEditor [data-v24-delete]').click();
  expect(await page.evaluate(()=>state.connections.some(c=>c.id==='sanity-conn'))).toBeFalsy();
});

test('Plan add-connection and inline event editing still work', async ({ page })=>{
  await ready(page);
  const ids=await page.evaluate(()=>{
    const a=state.events[0],b=state.events[1];a.position={x:160,y:200};b.position={x:720,y:200};state.connections=[];save(false);render();setView('plan',false);return{a:a.id,b:b.id};
  });
  await page.locator(`[data-link-from="${ids.a}"]`).click();
  await page.locator(`[data-event-block="${ids.b}"] .block-body`).click();
  await page.waitForFunction(({a,b})=>state.connections.some(c=>c.from===a&&c.to===b),ids);

  await page.locator(`[data-v23-edit="${ids.a}"]`).click();
  const form=page.locator(`[data-v23-inline-form="${ids.a}"]`);
  await expect(form).toBeVisible();
  await form.locator('[name="name"]').fill('Renamed on Plan');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator(`[data-event-block="${ids.a}"] .block-title`)).toHaveText('Renamed on Plan');
});

test('Contacts, approval roles and custom email presets remain connected', async ({ page })=>{
  await ready(page);
  await page.locator('[data-view="contacts"]').click();
  await page.locator('#v25ContactForm [name="name"]').fill('Sanity Advisor');
  await page.locator('#v25ContactForm [name="role"]').fill('Advisor');
  await page.locator('#v25ContactForm [name="email"]').fill('advisor@example.com');
  await page.locator('[data-v25-save-contact]').click();
  await expect(page.locator('#contactsView')).toContainText('Sanity Advisor');
  await expect(page.locator('#contactsView')).toContainText('Approval request');
  await expect(page.locator('#contactsView')).toContainText('Event reminder');
  await expect(page.locator('#contactsView')).toContainText('Budget review');

  await page.locator('[data-v25-new-preset]').click();
  await page.locator('#v25PresetForm [name="name"]').fill('Sanity preset');
  await page.locator('#v25PresetForm [name="recipientTarget"]').selectOption('@role:Advisor');
  await page.locator('#v25PresetForm [name="subject"]').fill('Check {event_name}');
  await page.locator('#v25PresetForm [name="body"]').fill('Hello {contact_name} — review {event_name}.');
  await page.locator('[data-v25-save-preset]').click();
  await expect(page.locator('#contactsView')).toContainText('Sanity preset');

  await page.locator('#newEventButton').click();
  await expect(page.locator('#eventForm [name="approvalRole"]')).toContainText('Advisor');
  await page.locator('[data-close-drawer]').last().click();
});

test('large ICS preview paginates, imports in bulk and produces bounded Plan DOM with month chunks', async ({ page })=>{
  await ready(page);
  await page.locator('#importButton').click();
  const events=[];
  for(let i=0;i<105;i++){
    const day=String((i%28)+1).padStart(2,'0');
    const month=String((i%3)+1).padStart(2,'0');
    events.push(`BEGIN:VEVENT\nUID:sanity-${i}\nDTSTART:2027${month}${day}T090000\nDTEND:2027${month}${day}T100000\nSUMMARY:Sanity ${i}\nLOCATION:Hall\nEND:VEVENT`);
  }
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\n${events.join('\n')}\nEND:VCALENDAR`;
  await page.locator('#calendarFile').setInputFiles({name:'sanity.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)});
  await expect(page.locator('.v21-import-summary')).toContainText('105 calendar items',{timeout:10000});
  await expect(page.locator('.v21-import-pager')).toContainText('Page 1 of 2');
  await page.locator('#confirmImportButton').click();
  await page.waitForFunction(()=>state.events.filter(e=>String(e.externalId||'').startsWith('sanity-')).length===105,{timeout:15000});
  await page.locator('[data-view="plan"]').first().click();
  await page.waitForTimeout(300);
  const counts=await page.evaluate(()=>({cards:document.querySelectorAll('[data-event-block]').length,chunks:document.querySelectorAll('.v20-month-chunk').length,total:state.events.length}));
  expect(counts.cards).toBeLessThanOrEqual(160);
  expect(counts.chunks).toBeGreaterThanOrEqual(3);
  expect(counts.total).toBeGreaterThanOrEqual(105);
});

test('Options appearance, reduce-motion and JSON export remain functional', async ({ page })=>{
  await ready(page);
  await page.locator('#settingsButton').click();
  const star=page.locator('[data-v25-aero-secret]');
  for(let i=0;i<5;i++) await star.click();
  await expect(page.locator('[data-v25-theme="aero"]')).toBeVisible();
  await page.locator('[data-v25-theme="aero"]').click();
  expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe('aero');
  await expect(page.locator('#mscAeroWallpaperLayer')).toHaveClass(/show/);
  await page.locator('#v25ReduceMotion').check();
  expect(await page.evaluate(()=>document.documentElement.classList.contains('reduce-motion'))).toBeTruthy();
  await page.locator('[data-v25-settings-close]').last().click();

  const download=page.waitForEvent('download');
  await page.locator('#exportButton').click();
  expect((await download).suggestedFilename()).toBe('msc-events.json');
});

for(const width of [360,390,667,768]){
  test(`More works by touch and keyboard at ${width}px`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height:width===667?375:844},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    await page.goto(`${APP}?readme-more=${width}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSC_BOOT_STATE?.phase==='production-ready' && !!window.MSC_V34,{timeout:10000});
    const more=page.locator('#mobileMoreButton');
    await expect(more).toBeVisible();
    await more.tap();
    await expect(page.locator('#mobileMoreSheet')).toHaveClass(/open/);
    await expect(page.locator('#mobileMoreGrid')).toContainText('Calendar');
    await page.locator('[data-mobile-more-close]').last().tap();
    await expect(page.locator('#mobileMoreSheet')).not.toHaveClass(/open/);
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mobileMoreSheet')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobileMoreSheet')).not.toHaveClass(/open/);
    await context.close();
  });
}
