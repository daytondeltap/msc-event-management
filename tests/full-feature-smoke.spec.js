const { test, expect } = require('@playwright/test');

test.setTimeout(90000);

async function cleanPage(page){
  await page.addInitScript(()=>{
    try{localStorage.clear()}catch{}
    try{sessionStorage.clear()}catch{}
  });
  const fatal=[];
  page.on('pageerror',err=>fatal.push(String(err)));
  await page.goto('http://127.0.0.1:4173/?feature-smoke=1',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#plannerViewport',{timeout:15000});
  await page.waitForFunction(()=>window.GEM_STABILITY_V31,{timeout:15000});
  await page.waitForTimeout(250);
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
  await expect(page.locator('#accountState')).toContainText('Continue with Google');

  expect(fatal,`Browser errors: ${fatal.join('\n')}`).toEqual([]);
});

test('JSON/PDF/large import, export, OSM lookup and Google OAuth initiation are functional', async ({ page }) => {
  const fatal=await cleanPage(page);

  // JSON import preserves event fields.
  await page.locator('#importButton').click();
  const json={events:[{id:'json-regression-1',name:'JSON Regression Event',start:'2026-11-05T09:00:00Z',end:'2026-11-05T10:00:00Z',venue:'JSON Hall',budgetPlanned:777,status:'Ready'}]};
  await page.locator('#calendarFile').setInputFiles({name:'events.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
  await expect(page.locator('#importPreview')).toContainText('JSON Regression Event');
  await page.locator('#confirmImportButton').click();
  await page.waitForFunction(()=>state.events.some(e=>e.name==='JSON Regression Event'));
  expect(await page.evaluate(()=>state.events.find(e=>e.name==='JSON Regression Event')?.budgetPlanned)).toBe(777);

  // Export produces the complete board JSON download.
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#exportButton').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('msc-events.json');

  // Text PDF import goes through the actual PDF.js extraction path.
  const pdfBase64='JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA2IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNiAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYwODIxMTMxODIyKzAwJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwODIxMTMxODIyKzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKNyAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMjEKPj4Kc3RyZWFtCkdhcFFoMEU9RiwwVVxIM1RccE5ZVF5RS2s/dGM+SVAsO1cjVTFeMjNpaFBFTV8/Q1c0S0lTaTwhWzdgI09CX3F1UWRrKkdnbmBGRFRSJVVeLDZLL0hMJSo9ISZnNidgMHNhREwrWEJdKDZqb2VwSkk7SUBvYlowfj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMDkyIDAwMDAwIG4gCjAwMDAwMDAxOTkgMDAwMDAgbiAKMDAwMDAwMDM5MiAwMDAwMCBuIAowMDAwMDAwNDYwIDAwMDAwIG4gCjAwMDAwMDA3MjEgMDAwMDAgbiAKMDAwMDAwMDc4MCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzxiMmQ1MmNhNjg1NWNjZjA4MTdjOWRlMmY4ZDgzYzIxNT48YjJkNTJjYTY4NTVjY2YwODE3YzlkZTJmOGQ4M2MyMTU+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDUgMCBSCi9Sb290IDQgMCBSCi9TaXplIDgKPj4Kc3RhcnR4cmVmCjk5MQolJUVPRgo=';
  await page.locator('#importButton').click();
  await page.locator('#calendarFile').setInputFiles({name:'calendar.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdfBase64,'base64')});
  await expect(page.locator('#importPreview')).toContainText('Winter Fair',{timeout:20000});
  await page.locator('[data-close-import]').first().click();

  // 125 ICS events must paginate at the documented 60-row preview size without committing them.
  const parts=['BEGIN:VCALENDAR','VERSION:2.0'];
  for(let i=0;i<125;i++)parts.push('BEGIN:VEVENT',`UID:bulk-${i}`,`DTSTART:202612${String((i%28)+1).padStart(2,'0')}T090000Z`,`SUMMARY:Bulk Event ${i}`,'END:VEVENT');
  parts.push('END:VCALENDAR');
  await page.locator('#importButton').click();
  await page.locator('#calendarFile').setInputFiles({name:'bulk.ics',mimeType:'text/calendar',buffer:Buffer.from(parts.join('\n'))});
  await expect(page.locator('.v21-import-summary')).toContainText('125 calendar items');
  await expect(page.locator('[data-v21-import-index]')).toHaveCount(60);
  await expect(page.locator('.v21-import-pager')).toContainText('Page 1 of 3');
  await page.locator('[data-v21-page="1"]').click();
  await expect(page.locator('.v21-import-pager')).toContainText('Page 2 of 3');
  await page.locator('[data-close-import]').first().click();

  // Lazy OSM loads, and explicit place lookup writes the coordinates into the event form.
  await page.route('**/nominatim.openstreetmap.org/search**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{lat:'13.7563',lon:'100.5018',display_name:'Regression Hall, Bangkok, Thailand',osm_type:'node',osm_id:12345,place_id:67890}])}));
  await nav(page,'venues');
  await page.waitForFunction(()=>window.MSC_FEATURES?.mapsReady===true,{timeout:20000});
  await page.locator('#newEventButton').click();
  await page.locator('#eventForm [name="name"]').fill('Mapped Regression Event');
  await page.locator('#eventForm [name="venue"]').fill('Regression Hall');
  await page.locator('#eventForm [name="venueAddress"]').fill('Regression Hall Bangkok');
  await expect(page.locator('#osmFindVenue')).toBeVisible();
  await page.locator('#osmFindVenue').click();
  await page.waitForFunction(()=>document.querySelector('#eventForm [name="venueLat"]')?.value==='13.7563');
  expect(await page.locator('#eventForm [name="venueLng"]').inputValue()).toBe('100.5018');
  await page.locator('#eventForm button[type="submit"]').click();
  expect(await page.evaluate(()=>state.events.find(e=>e.name==='Mapped Regression Event')?.venuePlaceId)).toContain('osm:node:12345');

  // Exercise the frontend OAuth entry point without leaving the test page.
  await page.evaluate(()=>{
    const original=supabase.auth.signInWithOAuth.bind(supabase.auth);
    window.__v31RestoreOAuth=()=>{supabase.auth.signInWithOAuth=original};
    supabase.auth.signInWithOAuth=async options=>{window.__v31OauthOptions=options;return{data:{url:'https://accounts.google.com/o/oauth2/v2/auth'},error:null}};
  });
  await page.evaluate(()=>window.GEM_STABILITY_V31.stableGoogleSignIn());
  const oauth=await page.evaluate(()=>window.__v31OauthOptions);
  expect(oauth.provider).toBe('google');
  expect(oauth.options.redirectTo).toBe('http://127.0.0.1:4173/');
  expect(await page.evaluate(()=>sessionStorage.getItem('gemAuthReturnV31'))).toContain('?feature-smoke=1');
  await page.evaluate(()=>window.__v31RestoreOAuth?.());

  expect(fatal,`Browser errors: ${fatal.join('\n')}`).toEqual([]);
});
