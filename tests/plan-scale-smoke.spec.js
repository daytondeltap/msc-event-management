const { test, expect } = require('@playwright/test');

test.setTimeout(90000);

async function boot(page){
  await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();});
  const fatal=[];page.on('pageerror',err=>fatal.push(String(err)));
  await page.goto('http://127.0.0.1:4173/?plan-scale-smoke=1',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#plannerViewport',{timeout:15000});
  await page.waitForFunction(()=>window.GEM_STABILITY_V31,{timeout:15000});
  return fatal;
}

test('connection node editor, branch, routing, reverse and delete remain functional', async ({ page }) => {
  const fatal=await boot(page);
  const ids=await page.evaluate(()=>{
    const [a,b,c]=state.events;
    a.position={x:900,y:650};b.position={x:1500,y:650};c.position={x:1500,y:1050};
    const conn={id:'v31-node-regression',from:a.id,to:b.id,label:'',style:'solid',tone:'neutral',nodeMode:'auto'};
    state.connections=[conn];window.MSC_V24.syncDeps();save(false);render();setView('plan',false);
    return {a:a.id,b:b.id,c:c.id};
  });
  await page.waitForTimeout(250);

  let node=page.locator('[data-connection-node="v31-node-regression"]');
  await expect(node).toBeVisible();
  await node.click();
  await expect(page.locator('[data-v24-node="v31-node-regression"]')).toHaveCount(1);
  await page.locator('[data-v24-label]').fill('QA dependency');
  await page.locator('[data-v24-style]').selectOption('dashed');
  await page.locator('[data-v24-tone]').selectOption('green');
  await page.locator('[data-v24-label]').blur();
  expect(await page.evaluate(()=>{const c=state.connections.find(x=>x.id==='v31-node-regression');return [c.label,c.style,c.tone]})).toEqual(['QA dependency','dashed','green']);

  await page.locator('[data-v24-reverse]').click();
  expect(await page.evaluate(ids=>{const c=state.connections.find(x=>x.id==='v31-node-regression');return c.from===ids.b&&c.to===ids.a},ids)).toBeTruthy();

  await page.waitForTimeout(250);
  node=page.locator('[data-connection-node="v31-node-regression"]');
  const box=await node.boundingBox();expect(box).toBeTruthy();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+75,{steps:6});await page.mouse.up();
  await page.waitForTimeout(350);
  const manual=await page.evaluate(()=>{const c=state.connections.find(x=>x.id==='v31-node-regression');return {mode:c.nodeMode,node:c.node}});
  expect(manual.mode).toBe('manual');expect(Number.isFinite(manual.node?.x)&&Number.isFinite(manual.node?.y)).toBeTruthy();

  node=page.locator('[data-connection-node="v31-node-regression"]');await node.click();
  await page.locator('[data-v24-auto]').click();
  expect(await page.evaluate(()=>state.connections.find(x=>x.id==='v31-node-regression')?.nodeMode)).toBe('auto');

  await page.waitForTimeout(250);
  await page.locator('[data-connection-node="v31-node-regression"]').click();
  await page.locator('[data-v24-branch]').click();
  await page.locator(`[data-event-block="${ids.c}"]`).click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>state.connections.length)).toBe(2);

  await page.locator('[data-connection-node="v31-node-regression"]').click();
  await page.locator('[data-v24-delete]').click();
  expect(await page.evaluate(()=>state.connections.some(x=>x.id==='v31-node-regression'))).toBeFalsy();
  expect(fatal,`Browser errors: ${fatal.join('\n')}`).toEqual([]);
});

test('300-event boards stay virtualized and paginated across Plan, Events, Status and Budget', async ({ page }) => {
  const fatal=await boot(page);
  await page.evaluate(()=>{
    state.events=[];state.connections=[];state.planSettings={monthChunksEnabled:true,autoArrangeImports:true,chunkCardsPerRow:3};
    for(let i=0;i<300;i++){
      const month=i%12,day=(i%25)+1;
      const d=new Date(2027,month,day,9,0,0,0);
      const e=fresh(`Scale Event ${i}`,{x:120+(i%10)*390,y:120+Math.floor(i/10)*205});
      e.start=d.toISOString();e.end=new Date(+d+3600000).toISOString();e.source='imported';e.status=STATUSES[i%STATUSES.length];e.budgetPlanned=100+i;e.budgetActual=50+i;
      state.events.push(e);
    }
    window.MSC_V24.arrangeImportedByMonth({persist:false,notify:false});
    state.version=(state.version||1)+1;save(false);render();setView('plan',false);
  });
  await page.waitForTimeout(350);
  const planStats=await page.evaluate(()=>({cards:document.querySelectorAll('#planView [data-event-block]').length,chunks:document.querySelectorAll('#planView .v20-month-chunk').length,badge:document.querySelector('[data-v23-render-count]')?.textContent||''}));
  expect(planStats.cards).toBeGreaterThan(0);expect(planStats.cards).toBeLessThanOrEqual(160);expect(planStats.chunks).toBe(12);expect(planStats.badge).toContain('/ 300 visible');

  await page.locator('.nav-list [data-view="events"]').click();
  await expect(page.locator('#eventsView')).toHaveClass(/active/);
  expect(await page.locator('#eventsView tbody tr').count()).toBe(100);
  await expect(page.locator('#eventsView .v23-page-controls')).toContainText('Page 1 of 3');

  await page.locator('.nav-list [data-view="board"]').click();
  await expect(page.locator('#boardView')).toHaveClass(/active/);
  expect(await page.locator('#boardView .board-card').count()).toBeLessThanOrEqual(250);
  await expect(page.locator('#boardView .v23-status-pager')).toContainText('Status page 1 of 2');
  await expect(page.locator('#boardView .v23-status-pager')).toContainText('up to 50 cards per column');

  await page.locator('.nav-list [data-view="budget"]').click();
  await expect(page.locator('#budgetView')).toHaveClass(/active/);
  expect(await page.locator('#budgetView tbody tr').count()).toBe(100);
  await expect(page.locator('#budgetView .v23-page-controls')).toContainText('Page 1 of 3');

  expect(fatal,`Browser errors: ${fatal.join('\n')}`).toEqual([]);
});
