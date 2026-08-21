const { test, expect } = require('@playwright/test');

const SB_URL='https://pmfsgdraazaaulgwlant.supabase.co';
const SB_KEY='sb_publishable_XasQ8-MmhT9TFErxdbphbQ_8CJ9-Ywe';
const SITE='https://daytondeltap.github.io/msc-event-management/';

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
    method:'OPTIONS',headers:{Origin:'https://daytondeltap.github.io'}
  });
  expect(cors.ok()).toBeTruthy();
  expect(cors.headers()['access-control-allow-origin']).toBe('https://daytondeltap.github.io');

  const get=await request.get(`${SB_URL}/functions/v1/persistent-board?board=${board}`,{
    headers:{Origin:'https://daytondeltap.github.io'},maxRedirects:0
  });
  expect(get.status()).toBe(200);
  const data=await get.json();
  expect(data.found).toBe(false);
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
