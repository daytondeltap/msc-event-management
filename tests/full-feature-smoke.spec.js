const { test, expect } = require('@playwright/test');

async function cleanPage(page){
  await page.addInitScript(()=>{
    try{localStorage.clear()}catch{}
    try{sessionStorage.clear()}catch{}
  });
  const fatal=[];
  page.on('pageerror',err=>fatal.push(String(err)));
  await page.goto('http://127.0.0.1:4173/?feature-smoke=1',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#plannerViewport',{timeout:15000});
  await page.waitForTimeout(650);
  return fatal;
}

async function nav(page,view){
  await page.locator(`.nav-list [data-view="${view}"]`).click();
  await expect(page.locator(`#${view}View`)).toHaveClass(/active/);
}

test('core event, plan, status, calendar, budget and import flows work together', async ({ page }) => {
  const fatal=await cleanPage(page);
  const initial=await page.evaluate(()=>state.events.length);
  expect(initial).toBe(3);

  const start=await page.evaluate(()=>{
    const d=new Date();d.setDate(Math.min(d.getDate()+1,28));d.setHours(10,0,0,0);return toLocal(d.toISOString());
  });
  await page.locator('#newEventButton').click();
  await expect(page.locator('#eventDrawer')).toHaveClass(/open/);
  await page.locator('#eventForm [name="name"]').fill('Regression Event');
  await page.locator('#eventForm [name="objective"]').fill('Feature regression test');
  await page.locator('#eventForm [name="start"]').fill(start);
  await page.locator('#eventForm [name="lead"]').fill('QA');
  await page.locator('#eventForm [name="venue"]').fill('Regression Hall');
  await page.locator('#eventForm [name="venueAddress"]').fill('Bangkok, Thailand');
  await page.locator('#eventForm [name="budgetPlanned"]').fill('1234');
  await page.locator('#eventForm [name="budgetActual"]').fill('345');
  await page.locator('#eventForm [name="status"]').selectOption({label:'Planning'});
  await page.locator('#eventForm button[type="submit"]').click();
  await expect(page.locator('#eventDrawer')).not.toHaveClass(/open/);

  const event=await page.evaluate(()=>state.events.find(e=>e.name==='Regression Event'));
  expect(event).toBeTruthy();expect(event.budgetPlanned).toBe(1234);expect(event.budgetActual).toBe(345);

  await nav(page,'events');
  await expect(page.locator('#eventsView')).toContainText('Regression Event');

  await nav(page,'budget');
  await expect(page.locator('#budgetView')).toContainText('฿23,234');
  await expect(page.locator('#budgetView')).toContainText('฿2,845');
  await expect(page.locator('#budgetView')).toContainText('฿97,155');
  await expect(page.locator('#budgetView')).toContainText('Regression Event');

  await nav(page,'board');
  await expect(page.locator('#boardView')).toContainText('Regression Event');
  await expect(page.locator('[data-status-drop="Planning"]')).toContainText('Regression Event');

  await nav(page,'calendar');
  await expect(page.locator('#calendarView')).toContainText('Regression Event');

  await nav(page,'plan');
  const id=event.id;
  const block=page.locator(`[data-event-block="${id}"]`);
  await block.scrollIntoViewIfNeeded();
  const before=await page.evaluate(id=>({...state.events.find(e=>e.id===id).position}),id);
  const handle=block.locator('[data-drag-block]');
  const box=await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x+30,box.y+18);await page.mouse.down();await page.mouse.move(box.x+90,box.y+58,{steps:5});await page.mouse.up();
  await page.waitForTimeout(150);
  const after=await page.evaluate(id=>({...state.events.find(e=>e.id===id).position}),id);
  expect(Math.abs(after.x-before.x)+Math.abs(after.y-before.y)).toBeGreaterThan(20);

  const source=page.locator('[data-event-block]').filter({hasText:'Charity Drive'});
  const target=page.locator('[data-event-block]').filter({hasText:'Regression Event'});
  await source.scrollIntoViewIfNeeded();
  await source.locator('[data-link-from]').click();
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await page.waitForTimeout(120);
  const connectionId=await page.evaluate(()=>state.connections.find(c=>{
    const a=state.events.find(e=>e.id===c.from),b=state.events.find(e=>e.id===c.to);return a?.name==='Charity Drive'&&b?.name==='Regression Event';
  })?.id||'');
  expect(connectionId).not.toBe('');
  const node=page.locator(`[data-connection-node="${connectionId}"]`);
  await expect(node).toBeVisible();
  await node.click();
  await expect(page.locator('[data-v24-node]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.locator('#importButton').click();
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:regression-import-1\nDTSTART:20261210T090000Z\nDTEND:20261210T100000Z\nSUMMARY:Imported Regression Event\nLOCATION:Import Hall\nEND:VEVENT\nEND:VCALENDAR`;
  await page.locator('#calendarFile').setInputFiles({name:'regression.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)});
  await expect(page.locator('#importPreview')).toContainText('Imported Regression Event');
  await expect(page.locator('#confirmImportButton')).toBeEnabled();
  await page.locator('#confirmImportButton').click();
  await page.waitForFunction(()=>state.events.some(e=>e.name==='Imported Regression Event'));
  expect(await page.evaluate(()=>state.events.filter(e=>e.name==='Imported Regression Event').length)).toBe(1);

  expect(fatal,`Browser errors: ${fatal.join('\n')}`).toEqual([]);
});

test('contacts, presets, options, boards/share launcher and venues remain reachable', async ({ page }) => {
  const fatal=await cleanPage(page);

  await page.locator('.nav-list [data-view="contacts"]').click();
  await expect(page.locator('#contactsView')).toHaveClass(/active/);
  await expect(page.locator('.v17-preset-card')).toHaveCount(3);
  await page.locator('#v25ContactForm [name="name"]').fill('Regression Contact');
  await page.locator('#v25ContactForm [name="role"]').fill('Principal');
  await page.locator('#v25ContactForm [name="email"]').fill('regression@example.com');
  await page.locator('[data-v25-save-contact]').click();
  await expect(page.locator('#contactsView')).toContainText('Regression Contact');
  expect(await page.evaluate(()=>state.contacts.some(c=>c.email==='regression@example.com'))).toBeTruthy();
  await expect(page.locator('#v25PresetForm [name="recipientTarget"]')).toContainText('Regression Contact');

  await page.locator('[data-v25-new-preset]').click();
  await page.locator('#v25PresetForm [name="name"]').fill('Regression preset');
  await page.locator('#v25PresetForm [name="subject"]').fill('Hello {event_name}');
  await page.locator('#v25PresetForm [name="body"]').fill('Hi {contact_name}');
  await page.locator('#v25PresetForm [name="recipientTarget"]').selectOption({label:/Regression Contact/});
  await page.locator('[data-v25-save-preset]').click();
  await expect(page.locator('#contactsView')).toContainText('Regression preset');
  expect(await page.evaluate(()=>state.emailSettings.presets.some(p=>p.name==='Regression preset'))).toBeTruthy();

  await page.locator('#settingsButton').click();
  await expect(page.locator('#v25SettingsPanel')).toHaveClass(/open/);
  await expect(page.locator('#v25PerfMode')).toBeVisible();
  await page.locator('[data-v25-theme="light"]').click();
  expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe('light');
  await page.locator('#v25ReduceMotion').check();
  expect(await page.evaluate(()=>document.documentElement.classList.contains('reduce-motion'))).toBeTruthy();
  await page.locator('#v25SettingsPanel header [data-v25-settings-close]').click();

  await page.locator('.nav-list [data-view="boards"]').click();
  await page.waitForFunction(()=>window.MSC_FEATURES?.workspaceReady===true,{timeout:12000});
  await expect(page.locator('#boardsView')).toHaveClass(/active/);
  await expect(page.locator('#createBoardButton')).toBeVisible();

  await page.locator('#shareButton').click();
  await expect(page.locator('#shareModal')).toHaveClass(/open/);
  await expect(page.locator('#shareModal')).toContainText('Choose a board first');
  await page.locator('[data-close-v11-share]').click();

  await page.locator('.nav-list [data-view="venues"]').click();
  await page.waitForFunction(()=>window.MSC_FEATURES?.mapsReady===true,{timeout:15000});
  await expect(page.locator('#venuesView')).toContainText('OpenStreetMap');
  await expect(page.locator('#venuesView')).not.toContainText('Configure Google Maps');

  await page.locator('#accountButton').click();
  await expect(page.locator('#accountModal')).toHaveClass(/open/);
  await expect(page.locator('#signInGoogleButton')).toBeVisible();
  await expect(page.locator('#authSetupNote')).not.toContainText('OAuth setup required');

  expect(fatal,`Browser errors: ${fatal.join('\n')}`).toEqual([]);
});
