const { test, expect } = require('@playwright/test');

const APP = 'http://127.0.0.1:4173/';
const boardA = 'A'.repeat(48);
const boardShared = 'S'.repeat(48);

async function ready(page){
  await page.goto(APP,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSC_BOOT_STATE?.phase==='production-ready' && !!window.MSC_AUTH && !!window.MSC_STORAGE_SCOPE,{timeout:10000});
}

async function fakeSupabase(page, token='token-a'){
  await page.evaluate(token=>{
    window.__isoToken=token;
    window.__isoChannelCount=0;
    window.__isoRemoved=0;
    const makeChannel=()=>{
      window.__isoChannelCount++;
      const ch={
        on(){return ch},
        subscribe(cb){cb?.('SUBSCRIBED');return ch},
        track:async()=>{},
        send:async()=>{},
        presenceState:()=>({})
      };
      return ch;
    };
    supabase={
      auth:{getSession:async()=>({data:{session:window.__isoToken?{access_token:window.__isoToken}:null}})},
      channel:makeChannel,
      removeChannel:async()=>{window.__isoRemoved++;return null}
    };
  },token);
}

async function setRoom(page,id){
  await page.evaluate(id=>{
    room=id;
    const u=new URL(location.href);u.searchParams.set('board',id);history.replaceState({},'',u);
  },id);
}

function boardResponse(title,eventName,{share=false,owner=false,role='editor'}={}){
  return {found:true,title,shareEnabled:share,owner,role,snapshot:{events:[{id:`evt-${eventName}`,name:eventName,position:{x:700,y:500}}],annualBudget:100000,budgetLedger:[],zoom:1,version:1,boardTitle:title,persistentBoard:true,contacts:[],connections:[],emailSettings:{autoApprovalEmails:false},planSettings:{}}};
}

test('private board is removed immediately when the replacement account is not a member',async({page})=>{
  await ready(page);
  await fakeSupabase(page,'token-a');
  await page.route('**/functions/v1/persistent-board?board=*',async route=>{
    const token=route.request().headers().authorization||'';
    if(token==='Bearer token-a')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(boardResponse('A Private','ACCOUNT A SECRET',{owner:true,role:'owner'}))});
    return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'board_private'})});
  });
  await setRoom(page,boardA);
  await page.evaluate(()=>MSC_AUTH.handleIdentity({id:'user-a',email:'a@example.test',user_metadata:{name:'A'}},'TEST_A'));
  expect(await page.evaluate(()=>({room,events:state.events.map(e=>e.name),scope:MSC_STORAGE_SCOPE.scope,access:MSC_BOARD_ACCESS.status}))).toMatchObject({room:boardA,events:['ACCOUNT A SECRET'],scope:'account:user-a',access:'allowed'});
  expect(await page.evaluate(id=>!!MSC_STORAGE_SCOPE.rawGet(`msc-event-management-v6:scope:account:user-a:room:${id}`),boardA)).toBeTruthy();

  await page.evaluate(()=>{window.__isoToken='token-b'});
  await page.evaluate(()=>MSC_AUTH.handleIdentity({id:'user-b',email:'b@example.test',user_metadata:{name:'B'}},'TEST_B'));
  const after=await page.evaluate(id=>({room,query:new URL(location.href).searchParams.get('board'),events:state.events.map(e=>e.name),scope:MSC_STORAGE_SCOPE.scope,access:MSC_BOARD_ACCESS.status,bCache:MSC_STORAGE_SCOPE.rawGet(`msc-event-management-v6:scope:account:user-b:room:${id}`)}),boardA);
  expect(after.room).toBe('');
  expect(after.query).toBeNull();
  expect(after.events).not.toContain('ACCOUNT A SECRET');
  expect(after.scope).toBe('account:user-b');
  expect(after.access).toBe('denied');
  expect(after.bCache).toBeNull();
});

test('shared board can survive an account switch only after the new account receives its own server authorization',async({page})=>{
  await ready(page);
  await fakeSupabase(page,'token-a');
  await page.route('**/functions/v1/persistent-board?board=*',async route=>{
    const token=route.request().headers().authorization||'';
    const data=token==='Bearer token-a'
      ? boardResponse('Shared Council','A VERSION',{share:true,owner:true,role:'owner'})
      : boardResponse('Shared Council','B SERVER VERSION',{share:true,owner:false,role:'editor'});
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await setRoom(page,boardShared);
  await page.evaluate(()=>MSC_AUTH.handleIdentity({id:'user-a',email:'a@example.test',user_metadata:{}},'TEST_A'));
  await page.evaluate(()=>{state.events[0].name='A STALE LOCAL';localStorage.setItem(storageKey(),JSON.stringify(state));window.__isoToken='token-b'});
  await page.evaluate(()=>MSC_AUTH.handleIdentity({id:'user-b',email:'b@example.test',user_metadata:{}},'TEST_B'));
  const result=await page.evaluate(()=>({room,events:state.events.map(e=>e.name),scope:MSC_STORAGE_SCOPE.scope,access:MSC_BOARD_ACCESS.status,role:MSC_BOARD_ACCESS.role}));
  expect(result).toEqual({room:boardShared,events:['B SERVER VERSION'],scope:'account:user-b',access:'allowed',role:'editor'});
});

test('stale unscoped board cache is never rendered before identity authorization',async({page})=>{
  const id='L'.repeat(48);
  await page.addInitScript(({id})=>{
    localStorage.setItem(`msc-event-management-v6:room:${id}`,JSON.stringify({events:[{id:'leak',name:'LEAKED OLD PRIVATE BOARD',position:{x:100,y:100}}],annualBudget:1,zoom:1,version:1}));
  },{id});
  await page.route('**/functions/v1/persistent-board?board=*',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'board_private'})}));
  await page.goto(`${APP}?board=${id}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.MSC_STORAGE_SCOPE && !!window.MSC_AUTH,{timeout:10000});
  expect(await page.locator('body').textContent()).not.toContain('LEAKED OLD PRIVATE BOARD');
  expect(await page.evaluate(()=>state.events.some(e=>e.name==='LEAKED OLD PRIVATE BOARD'))).toBeFalsy();
  await page.waitForFunction(()=>room==='' || MSC_BOARD_ACCESS.status==='denied' || MSC_BOARD_ACCESS.status==='unavailable',{timeout:10000});
  expect(await page.locator('body').textContent()).not.toContain('LEAKED OLD PRIVATE BOARD');
});

test('guest owner secret is usable only in guest scope and remains hidden from signed-in code',async({page})=>{
  await ready(page);
  const id='G'.repeat(48),key='guest-owner-secret-'.padEnd(48,'x');
  const result=await page.evaluate(({id,key})=>{
    MSC_STORAGE_SCOPE.setIdentity(null);
    localStorage.setItem(`mscBoardOwnerKey:${id}`,key);
    const guest=localStorage.getItem(`mscBoardOwnerKey:${id}`);
    MSC_STORAGE_SCOPE.setIdentity({id:'signed-user'});
    const account=localStorage.getItem(`mscBoardOwnerKey:${id}`);
    const raw=MSC_STORAGE_SCOPE.rawGet(`mscBoardOwnerKey:${id}`);
    return{guest,account,raw,scope:MSC_STORAGE_SCOPE.scope};
  },{id,key});
  expect(result.guest).toBe(key);
  expect(result.account).toBeNull();
  expect(result.raw).toBe(key);
  expect(result.scope).toBe('account:signed-user');
});

test('board recents are isolated per verified account',async({page})=>{
  await ready(page);
  const result=await page.evaluate(()=>{
    MSC_STORAGE_SCOPE.setIdentity({id:'user-a'});
    localStorage.setItem('mscBoardRecentsV10',JSON.stringify([{boardId:'A-board'}]));
    const a1=localStorage.getItem('mscBoardRecentsV10');
    MSC_STORAGE_SCOPE.setIdentity({id:'user-b'});
    const b0=localStorage.getItem('mscBoardRecentsV10');
    localStorage.setItem('mscBoardRecentsV10',JSON.stringify([{boardId:'B-board'}]));
    const b1=localStorage.getItem('mscBoardRecentsV10');
    MSC_STORAGE_SCOPE.setIdentity({id:'user-a'});
    const a2=localStorage.getItem('mscBoardRecentsV10');
    return{a1,b0,b1,a2};
  });
  expect(JSON.parse(result.a1)[0].boardId).toBe('A-board');
  expect(result.b0).toBeNull();
  expect(JSON.parse(result.b1)[0].boardId).toBe('B-board');
  expect(JSON.parse(result.a2)[0].boardId).toBe('A-board');
});

test('Realtime cannot join until board access is explicitly allowed for the current board',async({page})=>{
  await ready(page);
  await fakeSupabase(page,'token-a');
  const counts=await page.evaluate(async id=>{
    room=id;
    MSC_BOARD_ACCESS.status='checking';MSC_BOARD_ACCESS.boardId=id;
    await connectRoom();
    const denied=window.__isoChannelCount;
    MSC_BOARD_ACCESS.status='allowed';MSC_BOARD_ACCESS.boardId=id;
    await connectRoom();
    return{denied,allowed:window.__isoChannelCount};
  },boardA);
  expect(counts.denied).toBe(0);
  expect(counts.allowed).toBe(1);
});

test('account boundary removes private board state, URL and open overlays before sign-out or account switch',async({page})=>{
  await ready(page);
  await fakeSupabase(page,'token-a');
  const result=await page.evaluate(async id=>{
    room=id;
    const u=new URL(location.href);u.searchParams.set('board',id);history.replaceState({},'',u);
    MSC_STORAGE_SCOPE.setIdentity({id:'user-a'});
    MSC_BOARD_ACCESS.status='allowed';MSC_BOARD_ACCESS.boardId=id;
    state={events:[{id:'private',name:'PRIVATE BEFORE SWITCH',position:{x:100,y:100}}],annualBudget:1,budgetLedger:[],zoom:1,version:1};normalize();render();
    document.getElementById('eventDrawer').classList.add('open');
    document.getElementById('shareModal').classList.add('open');
    await MSC_AUTH.prepareAccountBoundary();
    return{room,query:new URL(location.href).searchParams.get('board'),events:state.events.map(e=>e.name),scope:MSC_STORAGE_SCOPE.scope,drawer:document.getElementById('eventDrawer').classList.contains('open'),share:document.getElementById('shareModal').classList.contains('open')};
  },boardA);
  expect(result.room).toBe('');
  expect(result.query).toBeNull();
  expect(result.events).not.toContain('PRIVATE BEFORE SWITCH');
  expect(result.scope).toBe('pending');
  expect(result.drawer).toBeFalsy();
  expect(result.share).toBeFalsy();
});
