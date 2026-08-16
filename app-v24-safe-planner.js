/* MSC v24: native graph + month layout without legacy planner wrappers/observers. */
(() => {
  'use strict';
  const V24 = window.MSC_V24 = window.MSC_V24 || {};
  const CARD_W=360,CARD_H=178,NODE_GAP=46;
  const tones={neutral:'#747474',blue:'#72a7ff',green:'#54d58a',yellow:'#e8bd5e',red:'#ff7474'};
  let sourceId='', nodeDrag=null, toolbar=null, raf=0, suppressNodeClickUntil=0;

  function ensure(){
    state.contacts=Array.isArray(state.contacts)?state.contacts:[];
    state.connections=Array.isArray(state.connections)?state.connections:[];
    state.emailSettings=state.emailSettings&&typeof state.emailSettings==='object'?state.emailSettings:{autoApprovalEmails:false};
    state.planSettings=state.planSettings&&typeof state.planSettings==='object'?state.planSettings:{};
    if(state.planSettings.monthChunksEnabled===undefined)state.planSettings.monthChunksEnabled=true;
    if(state.planSettings.autoArrangeImports===undefined)state.planSettings.autoArrangeImports=true;
    if(!state.planSettings.chunkCardsPerRow)state.planSettings.chunkCardsPerRow=3;
    if(!state.connections.length){
      const byName=new Map(state.events.map(e=>[String(e.name||'').trim().toLowerCase(),e]));
      const seen=new Set();
      for(const target of state.events)for(const dep of target.dependencies||[]){const src=byName.get(String(dep).trim().toLowerCase());if(!src||src.id===target.id)continue;const k=`${src.id}>${target.id}`;if(seen.has(k))continue;seen.add(k);state.connections.push({id:uid(),from:src.id,to:target.id,label:'',style:'solid',tone:'neutral',nodeMode:'auto'});}
    }
    const ids=new Set(state.events.map(e=>e.id));state.connections=state.connections.filter(c=>ids.has(c.from)&&ids.has(c.to)&&c.from!==c.to);
  }
  function eventById(id){return state.events.find(e=>e.id===id)}
  function syncDeps(){const byId=new Map(state.events.map(e=>[e.id,e]));state.events.forEach(e=>e.dependencies=[]);for(const c of state.connections){const a=byId.get(c.from),b=byId.get(c.to);if(a&&b&&!b.dependencies.includes(a.name))b.dependencies.push(a.name)}}
  V24.ensure=ensure;V24.syncDeps=syncDeps;

  const priorClean=typeof cleanState==='function'?cleanState:null;
  if(priorClean)cleanState=function(){ensure();return{...priorClean(),contacts:state.contacts,connections:state.connections,emailSettings:state.emailSettings,planSettings:state.planSettings,boardTitle:state.boardTitle||'',persistentBoard:!!state.persistentBoard,collaborationEnabled:!!state.collaborationEnabled}};

  function rect(e){return{x:(+e.position?.x||0)-20,y:(+e.position?.y||0)-20,w:CARD_W+40,h:CARD_H+40}}
  function inside(p,r){return p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h}
  function safeNode(p,occupied,rects){let out={x:+p.x||30,y:+p.y||30};for(let pass=0;pass<14;pass++){let changed=false;for(const r of rects){if(!inside(out,r))continue;const dl=Math.abs(out.x-r.x),dr=Math.abs(r.x+r.w-out.x),dt=Math.abs(out.y-r.y),db=Math.abs(r.y+r.h-out.y),m=Math.min(dl,dr,dt,db);if(m===dl)out.x=r.x-22;else if(m===dr)out.x=r.x+r.w+22;else if(m===dt)out.y=r.y-22;else out.y=r.y+r.h+22;changed=true}for(const o of occupied){const dx=out.x-o.x,dy=out.y-o.y,d=Math.hypot(dx,dy);if(d<NODE_GAP){const a=d>.1?Math.atan2(dy,dx):(pass*.9);out.x=o.x+Math.cos(a)*NODE_GAP;out.y=o.y+Math.sin(a)*NODE_GAP;changed=true}}if(!changed)break}out.x=clamp(out.x,28,WORLD.width-28);out.y=clamp(out.y,28,WORLD.height-28);return out}
  function anchor(e,n){const x=+e.position?.x||0,y=+e.position?.y||0,cx=x+CARD_W/2,cy=y+CARD_H/2,dx=n.x-cx,dy=n.y-cy;if(Math.abs(dx/(CARD_W/2))>Math.abs(dy/(CARD_H/2)))return{x:dx>=0?x+CARD_W:x,y:cy};return{x:cx,y:dy>=0?y+CARD_H:y}}
  function layout(ev){ensure();const ids=new Set(ev.map(e=>e.id)),rects=ev.map(rect),occ=[],out=[];for(const c of state.connections){if(!ids.has(c.from)||!ids.has(c.to))continue;const a=eventById(c.from),b=eventById(c.to);if(!a||!b)continue;const ac={x:(+a.position.x||0)+CARD_W/2,y:(+a.position.y||0)+CARD_H/2},bc={x:(+b.position.x||0)+CARD_W/2,y:(+b.position.y||0)+CARD_H/2};const wanted=c.nodeMode==='manual'&&c.node?c.node:{x:(ac.x+bc.x)/2,y:(ac.y+bc.y)/2};const n=safeNode(wanted,occ,rects);if(c.nodeMode==='manual')c.node={x:n.x,y:n.y};occ.push(n);out.push({c,a,b,n,s:anchor(a,n),e:anchor(b,n)})}return out}
  function path(s,n,e){const a={x:s.x+(n.x-s.x)*.55,y:s.y+(n.y-s.y)*.25},b={x:n.x+(e.x-n.x)*.45,y:n.y+(e.y-n.y)*.75};return`M ${s.x} ${s.y} C ${a.x} ${a.y}, ${n.x} ${n.y}, ${n.x} ${n.y} C ${n.x} ${n.y}, ${b.x} ${b.y}, ${e.x} ${e.y}`}
  connections=function(ev){return layout(ev).map(({c,n,s,e})=>`<g data-connection-group="${esc(c.id)}" style="--connection-color:${tones[c.tone]||tones.neutral}"><path class="connection-line connection-line-v9" data-style="${esc(c.style||'solid')}" stroke="${tones[c.tone]||tones.neutral}" d="${path(s,n,e)}"/><g class="connection-node connection-node-v9" data-connection-node="${esc(c.id)}" transform="translate(${n.x} ${n.y})"><circle class="node-hit" r="22"></circle><circle class="node-ring" r="15"></circle><circle class="node-core" r="5"></circle></g>${c.label?`<g class="connection-label-v9" transform="translate(${n.x+20} ${n.y-16})"><text>${esc(c.label)}</text></g>`:''}</g>`).join('')};

  updateConnectionSvg=function(){
    const svg=document.querySelector('.connections');if(!svg)return;
    const shown=[...document.querySelectorAll('[data-event-block]')].map(el=>eventById(el.dataset.eventBlock)).filter(Boolean);
    try{svg.innerHTML=connections(shown)}catch(err){console.warn('Connection repaint skipped',err)}
  };

  function refresh(){window.MSC_V23?.refreshPlan?.();}
  function paintMode(){document.querySelector('.plan-shell')?.classList.toggle('v9-connect-mode',!!sourceId);document.querySelectorAll('[data-event-block]').forEach(el=>{el.classList.toggle('v9-connect-source',el.dataset.eventBlock===sourceId);el.classList.toggle('v9-connect-target',!!sourceId&&el.dataset.eventBlock!==sourceId)});let h=document.getElementById('v24ConnectHint');if(!sourceId){h?.remove();return}if(!h){h=document.createElement('div');h.id='v24ConnectHint';h.className='v9-connect-hint';document.querySelector('.plan-toolbar')?.appendChild(h)}h.innerHTML=`<span class="v9-pulse-dot"></span><strong>Choose destination</strong><span>Click another event · Esc cancels</span>`}
  function begin(id){sourceId=id;closeToolbar();paintMode()}
  function finish(id){if(!sourceId)return false;const from=sourceId;sourceId='';paintMode();if(id===from)return true;if(state.connections.some(c=>c.from===from&&c.to===id)){toast('Those events are already connected');return true}state.connections.push({id:uid(),from,to:id,label:'',style:'solid',tone:'neutral',nodeMode:'auto'});syncDeps();save(true);refresh();toast('Connection added');return true}

  function closeToolbar(){toolbar?.remove();toolbar=null}
  function openToolbar(id,x,y){closeToolbar();const c=state.connections.find(v=>v.id===id);if(!c)return;const a=eventById(c.from),b=eventById(c.to);const el=document.createElement('div');el.className='v20-node-toolbar v24-node-toolbar';el.dataset.v24Node=id;el.innerHTML=`<div class="v9-node-toolbar-head"><span class="v9-node-dot" style="--node-color:${tones[c.tone]||tones.neutral}"></span><span><strong>${esc(a?.name||'Event')} → ${esc(b?.name||'Event')}</strong><small>Drag the node to route this connection.</small></span></div><div class="v9-node-toolbar-row v20-node-toolbar-row"><input data-v24-label value="${esc(c.label||'')}" placeholder="Connection label"><select data-v24-style><option value="solid" ${c.style!=='dashed'?'selected':''}>Solid</option><option value="dashed" ${c.style==='dashed'?'selected':''}>Dashed</option></select><select data-v24-tone>${Object.keys(tones).map(t=>`<option value="${t}" ${c.tone===t?'selected':''}>${t}</option>`).join('')}</select><button type="button" data-v24-branch>Branch</button><button type="button" data-v24-auto>Auto route</button><button type="button" data-v24-reverse>Reverse</button><button type="button" class="danger" data-v24-delete>Delete</button></div>`;document.body.appendChild(el);toolbar=el;requestAnimationFrame(()=>{const r=el.getBoundingClientRect();el.style.left=`${clamp(x+12,10,innerWidth-r.width-10)}px`;el.style.top=`${clamp(y+12,10,innerHeight-r.height-10)}px`;el.classList.add('show')})}
  function worldPoint(x,y){const p=document.getElementById('plannerViewport');if(!p)return null;const r=p.getBoundingClientRect(),z=Math.max(.01,zoom||1);return{x:(p.scrollLeft+x-r.left)/z,y:(p.scrollTop+y-r.top)/z}}

  document.addEventListener('pointerdown',e=>{const n=e.target.closest?.('[data-connection-node]');if(!n||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();nodeDrag={id:n.dataset.connectionNode,x:e.clientX,y:e.clientY,moved:false};closeToolbar()},true);
  document.addEventListener('pointermove',e=>{if(!nodeDrag)return;if(Math.hypot(e.clientX-nodeDrag.x,e.clientY-nodeDrag.y)>3)nodeDrag.moved=true;if(!nodeDrag.moved||raf)return;raf=requestAnimationFrame(()=>{raf=0;const p=worldPoint(e.clientX,e.clientY),c=state.connections.find(v=>v.id===nodeDrag.id);if(!p||!c)return;const shown=[...document.querySelectorAll('[data-event-block]')].map(el=>eventById(el.dataset.eventBlock)).filter(Boolean),others=layout(shown).filter(v=>v.c.id!==c.id).map(v=>v.n),rects=shown.map(rect),n=safeNode(p,others,rects);c.nodeMode='manual';c.node=n;refresh()})},{capture:true,passive:true});
  document.addEventListener('pointerup',e=>{if(!nodeDrag)return;const d=nodeDrag;nodeDrag=null;if(d.moved){suppressNodeClickUntil=Date.now()+300;save(true);refresh()}else{suppressNodeClickUntil=Date.now()+250;openToolbar(d.id,e.clientX,e.clientY)}},true);

  document.addEventListener('click',e=>{
    const add=e.target.closest?.('[data-link-from]');if(add){e.preventDefault();e.stopImmediatePropagation();begin(add.dataset.linkFrom);return}
    const node=e.target.closest?.('[data-connection-node]');if(node){e.preventDefault();e.stopImmediatePropagation();if(Date.now()>suppressNodeClickUntil)openToolbar(node.dataset.connectionNode,e.clientX,e.clientY);return}
    if(sourceId){const block=e.target.closest?.('[data-event-block]');if(block){e.preventDefault();e.stopImmediatePropagation();finish(block.dataset.eventBlock);return}}
    const bar=e.target.closest?.('[data-v24-node]');if(bar){const c=state.connections.find(v=>v.id===bar.dataset.v24Node);if(!c)return;if(e.target.closest('[data-v24-branch]')){e.preventDefault();begin(c.from);closeToolbar();return}if(e.target.closest('[data-v24-auto]')){c.nodeMode='auto';delete c.node;save(true);closeToolbar();refresh();return}if(e.target.closest('[data-v24-reverse]')){[c.from,c.to]=[c.to,c.from];syncDeps();save(true);closeToolbar();refresh();return}if(e.target.closest('[data-v24-delete]')){state.connections=state.connections.filter(v=>v.id!==c.id);syncDeps();save(true);closeToolbar();refresh();toast('Connection removed');return}}
    if(toolbar&&!e.target.closest('.v24-node-toolbar'))closeToolbar();
  },true);
  document.addEventListener('change',e=>{const bar=e.target.closest?.('[data-v24-node]');if(!bar)return;const c=state.connections.find(v=>v.id===bar.dataset.v24Node);if(!c)return;if(e.target.matches('[data-v24-style]'))c.style=e.target.value;if(e.target.matches('[data-v24-tone]'))c.tone=e.target.value;save(false);refresh()},true);
  document.addEventListener('input',e=>{if(!e.target.matches?.('[data-v24-label]'))return;const bar=e.target.closest('[data-v24-node]'),c=state.connections.find(v=>v.id===bar?.dataset.v24Node);if(c)c.label=e.target.value},true);
  document.addEventListener('focusout',e=>{if(e.target.matches?.('[data-v24-label]')){save(true);refresh()}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sourceId){sourceId='';paintMode()}},true);

  function imported(e){return['imported','pdf','ics','ical','calendar'].includes(String(e?.source||'').toLowerCase())}
  function arrangeImportedByMonth({persist=true,notify=true}={}){ensure();const groups=new Map();for(const e of state.events){if(!imported(e)||!e.start)continue;const d=new Date(e.start);if(Number.isNaN(+d))continue;const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}if(!groups.size){if(notify)toast('No imported calendar events to arrange');return false}const cols=clamp(+state.planSettings.chunkCardsPerRow||3,2,5),gapX=28,gapY=28,chunkGap=70,left=130,top=145,chunkW=68+cols*CARD_W+(cols-1)*gapX;let x=left,y=top,rowH=0;for(const list of [...groups.values()]){list.sort((a,b)=>+new Date(a.start)-+new Date(b.start));const rows=Math.ceil(list.length/cols),h=62+rows*CARD_H+Math.max(0,rows-1)*gapY+34;if(x!==left&&x+chunkW>WORLD.width-130){x=left;y+=rowH+chunkGap;rowH=0}list.forEach((e,i)=>{e.position={x:x+34+(i%cols)*(CARD_W+gapX),y:y+62+Math.floor(i/cols)*(CARD_H+gapY)}});rowH=Math.max(rowH,h);x+=chunkW+64;WORLD.height=Math.max(WORLD.height,y+h+320)}if(persist)save(true);refresh();if(notify)toast(`${groups.size} month chunk${groups.size===1?'':'s'} arranged`);return true}
  V24.arrangeImportedByMonth=arrangeImportedByMonth;
  window.MSC_V20=window.MSC_V20||{};window.MSC_V20.arrangeImportedByMonth=arrangeImportedByMonth;

  ensure();
})();
