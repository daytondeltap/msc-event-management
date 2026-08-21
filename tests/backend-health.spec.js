const { test, expect } = require('@playwright/test');
const { randomUUID } = require('crypto');

const SB_URL='https://pmfsgdraazaaulgwlant.supabase.co';
const SB_KEY='sb_publishable_XasQ8-MmhT9TFErxdbphbQ_8CJ9-Ywe';
const SITE='https://daytondeltap.github.io/msc-event-management/';
const ORIGIN='https://daytondeltap.github.io';

test('Supabase Auth is healthy and Google provider starts an OAuth redirect', async ({ request }) => {
  const health=await request.get(`${SB_URL}/auth/v1/health`,{headers:{apikey:SB_KEY}});
  expect(health.ok(),`Auth health returned ${health.status()}`).toBeTruthy();

  const u=new URL(`${SB_URL}/auth/v1/authorize`);
  u.searchParams.set('provider','google');
  u.searchParams.set('redirect_to',SITE);
  const auth=await request.get(u.toString(),{headers:{apikey:SB_KEY},maxRedirects:0});
  expect([301,302,303,307,308],`Google authorize returned ${auth.status()} ${await auth.text()}`).toContain(auth.status());
  const location=auth.headers()['location']||'';
  expect(location,'Google OAuth did not redirect to Google').toMatch(/accounts\.google\.com|google\.com\/o\/oauth/i);
});

test('persistent-board endpoint is available with correct production CORS', async ({ request }) => {
  const board='v31healthcheck0000000000000000000000000000000000000000000000000000';
  const cors=await request.fetch(`${SB_URL}/functions/v1/persistent-board?board=${board}`,{
    method:'OPTIONS',headers:{Origin:ORIGIN}
  });
  expect(cors.ok()).toBeTruthy();
  expect(cors.headers()['access-control-allow-origin']).toBe(ORIGIN);

  const get=await request.get(`${SB_URL}/functions/v1/persistent-board?board=${board}`,{
    headers:{Origin:ORIGIN},maxRedirects:0
  });
  expect(get.status()).toBe(200);
  const data=await get.json();
  expect(data.found).toBe(false);
});

test('guest board create, private access, sharing, rename, history and delete all work', async ({ request }) => {
  const board=`v31${randomUUID().replaceAll('-','')}${randomUUID().replaceAll('-','')}`;
  const ownerKey=`owner${randomUUID().replaceAll('-','')}${randomUUID().replaceAll('-','')}`;
  const endpoint=`${SB_URL}/functions/v1/persistent-board?board=${board}`;
  const ownerHeaders={Origin:ORIGIN,'Content-Type':'application/json','x-board-owner':ownerKey};
  const snapshot={events:[],annualBudget:100000,zoom:1,version:1,persistentBoard:true,boardTitle:'v31 health board'};

  try {
    const create=await request.post(endpoint,{headers:ownerHeaders,data:{boardId:board,ownerKey,title:'v31 health board',snapshot,checkpoint:true,label:'health create'}});
    expect(create.status(),await create.text()).toBe(200);
    expect((await create.json()).saved).toBe(true);

    const privateGet=await request.get(endpoint,{headers:{Origin:ORIGIN}});
    expect(privateGet.status(),'new guest-owned board should be private without owner key').toBe(403);

    const owned=await request.get(endpoint,{headers:ownerHeaders});
    expect(owned.status(),await owned.text()).toBe(200);
    const ownedData=await owned.json();
    expect(ownedData.found).toBe(true);
    expect(ownedData.owner).toBe(true);
    expect(ownedData.title).toBe('v31 health board');

    const sharing=await request.post(endpoint,{headers:ownerHeaders,data:{boardId:board,ownerKey,action:'sharing',shareEnabled:true}});
    expect(sharing.status(),await sharing.text()).toBe(200);
    expect((await sharing.json()).shareEnabled).toBe(true);

    const publicGet=await request.get(endpoint,{headers:{Origin:ORIGIN}});
    expect(publicGet.status(),await publicGet.text()).toBe(200);
    expect((await publicGet.json()).shareEnabled).toBe(true);

    const rename=await request.post(endpoint,{headers:ownerHeaders,data:{boardId:board,ownerKey,action:'rename',title:'v31 renamed board'}});
    expect(rename.status(),await rename.text()).toBe(200);
    expect((await rename.json()).title).toBe('v31 renamed board');

    const versions=await request.get(`${endpoint}&versions=1`,{headers:ownerHeaders});
    expect(versions.status(),await versions.text()).toBe(200);
    const versionData=await versions.json();
    expect(Array.isArray(versionData.versions)).toBe(true);
    expect(versionData.versions.length).toBeGreaterThanOrEqual(2);

    const sharingOff=await request.post(endpoint,{headers:ownerHeaders,data:{boardId:board,ownerKey,action:'sharing',shareEnabled:false}});
    expect(sharingOff.status(),await sharingOff.text()).toBe(200);
    expect((await sharingOff.json()).shareEnabled).toBe(false);
  } finally {
    const del=await request.delete(endpoint,{headers:ownerHeaders,data:{boardId:board,ownerKey}});
    expect([200,404],`cleanup failed: ${del.status()} ${await del.text()}`).toContain(del.status());
  }
});

test('JWT-protected user functions reject anonymous calls instead of exposing data', async ({ request }) => {
  for(const slug of ['board-library','email-config','send-approval-email']){
    const res=await request.post(`${SB_URL}/functions/v1/${slug}`,{
      headers:{'Content-Type':'application/json',apikey:SB_KEY},
      data:{action:'get'}
    });
    expect([401,403],`${slug} unexpectedly allowed anonymous access (${res.status()})`).toContain(res.status());
  }
});
