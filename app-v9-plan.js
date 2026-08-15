/* MSC v9 direct graph interactions */
(() => {
  'use strict';

  const V9 = window.MSC_V9 = window.MSC_V9 || {};
  const NODE_RADIUS = 15;
  const NODE_GAP = 48;
  const CARD_W = 360;
  const CARD_H = 178;
  const tones = ['neutral','blue','green','yellow','red'];
  const colors = {neutral:'#747474',blue:'#72a7ff',green:'#54d58a',yellow:'#f1c75b',red:'#ff7474'};

  let connectSourceId = '';
  let nodeToolbar = null;
  let nodeDrag = null;
  let dragFrame = 0;
  let suppressNodeClickUntil = 0;

  const ensure = () => window.MSC_V8?.ensureState?.();
  const eventById = id => state.events.find(e => e.id === id);

  function eventRect(e) {
    return { x:e.position.x - 20, y:e.position.y - 20, w:CARD_W + 40, h:CARD_H + 40 };
  }
  function insideRect(p, r) {
    return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  }
  function hashAngle(id='') {
    let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return (h % 360) * Math.PI / 180;
  }

  function pushOutsideCards(point, rects) {
    let p = {...point};
    for (const r of rects) {
      if (!insideRect(p,r)) continue;
      const dl = Math.abs(p.x-r.x), dr = Math.abs(r.x+r.w-p.x), dt = Math.abs(p.y-r.y), db = Math.abs(r.y+r.h-p.y);
      const m = Math.min(dl,dr,dt,db);
      if (m===dl) p.x=r.x-NODE_RADIUS-7;
      else if (m===dr) p.x=r.x+r.w+NODE_RADIUS+7;
      else if (m===dt) p.y=r.y-NODE_RADIUS-7;
      else p.y=r.y+r.h+NODE_RADIUS+7;
    }
    return p;
  }

  function resolveNode(point, occupied, rects, id='') {
    let p = pushOutsideCards(point, rects);
    const baseAngle = hashAngle(id);
    for (let pass=0; pass<18; pass++) {
      let collision = null;
      for (const o of occupied) {
        const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy);
        if (d < NODE_GAP) { collision={o,dx,dy,d}; break; }
      }
      if (!collision && !rects.some(r=>insideRect(p,r))) break;
      if (collision) {
        const angle = collision.d > .01 ? Math.atan2(collision.dy,collision.dx) : baseAngle + pass*.7;
        p.x = collision.o.x + Math.cos(angle)*(NODE_GAP+3);
        p.y = collision.o.y + Math.sin(angle)*(NODE_GAP+3);
      } else {
        const angle = baseAngle + pass*.82;
        p.x += Math.cos(angle)*(18+pass*2);
        p.y += Math.sin(angle)*(18+pass*2);
      }
      p = pushOutsideCards(p,rects);
    }
    p.x = clamp(p.x, 30, WORLD.width-30);
    p.y = clamp(p.y, 30, WORLD.height-30);
    return p;
  }

  function anchorPoint(e, node) {
    const x=e.position.x,y=e.position.y,w=CARD_W,h=CARD_H,cx=x+w/2,cy=y+h/2;
    const dx=node.x-cx,dy=node.y-cy;
    if (Math.abs(dx/(w/2)) > Math.abs(dy/(h/2))) return {x:dx>=0?x+w:x,y:cy};
    return {x:cx,y:dy>=0?y+h:y};
  }

  function layoutConnections(ev) {
    ensure();
    const ids = new Set(ev.map(e=>e.id));
    const rects = ev.map(eventRect);
    const occupied=[];
    const out=[];
    for (const c of state.connections.filter(c=>ids.has(c.from)&&ids.has(c.to))) {
      const a=eventById(c.from),b=eventById(c.to); if(!a||!b) continue;
      const ac={x:a.position.x+CARD_W/2,y:a.position.y+CARD_H/2};
      const bc={x:b.position.x+CARD_W/2,y:b.position.y+CARD_H/2};
      const desired=c.nodeMode==='manual'&&c.node?{x:+c.node.x,y:+c.node.y}:{x:(ac.x+bc.x)/2,y:(ac.y+bc.y)/2};
      const node=resolveNode(desired,occupied,rects,c.id);
      if(c.nodeMode==='manual') c.node={x:node.x,y:node.y};
      occupied.push(node);
      const start=anchorPoint(a,node),end=anchorPoint(b,node);
      out.push({c,a,b,node,start,end});
    }
    return out;
  }
  V9.layoutConnections=layoutConnections;

  function pathToNode(start,node,end) {
    const s1={x:start.x+(node.x-start.x)*.42,y:start.y+(node.y-start.y)*.16};
    const s2={x:start.x+(node.x-start.x)*.82,y:start.y+(node.y-start.y)*.82};
    const e1={x:node.x+(end.x-node.x)*.18,y:node.y+(end.y-node.y)*.18};
    const e2={x:node.x+(end.x-node.x)*.58,y:node.y+(end.y-node.y)*.84};
    return `M ${start.x} ${start.y} C ${s1.x} ${s1.y}, ${s2.x} ${s2.y}, ${node.x} ${node.y} C ${e1.x} ${e1.y}, ${e2.x} ${e2.y}, ${end.x} ${end.y}`;
  }

  connections = function(ev) {
    const layout=layoutConnections(ev);
    return `<defs><marker id="mscArrowV9" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" class="connection-arrow"></path></marker></defs>` + layout.map(({c,node,start,end})=>{
      const color=colors[c.tone]||colors.neutral;
      const label=c.label?`<g class="connection-label-v9" transform="translate(${node.x+21} ${node.y-18})"><rect x="-7" y="-14" rx="8" width="${Math.min(190,Math.max(38,String(c.label).length*7+14))}" height="22"></rect><text x="0" y="1">${esc(c.label)}</text></g>`:'';
      return `<g data-connection-group="${c.id}" style="--connection-color:${color}"><path class="connection-line connection-line-v9" data-style="${esc(c.style||'solid')}" stroke="${color}" marker-end="url(#mscArrowV9)" d="${pathToNode(start,node,end)}"/><g class="connection-node connection-node-v9 ${nodeDrag?.id===c.id?'is-dragging':''}" data-connection-node="${c.id}" transform="translate(${node.x} ${node.y})"><circle class="node-hit" r="22"></circle><circle class="node-ring" r="${NODE_RADIUS}"></circle><circle class="node-core" r="5"></circle></g>${label}</g>`;
    }).join('');
  };

  function redrawConnections() {
    const svg=document.querySelector('.connections');
    if(svg) svg.innerHTML=connections(visible());
  }

  function closeNodeToolbar(){nodeToolbar?.remove();nodeToolbar=null;}
  function toolbarPosition(x,y,el){
    const r=el.getBoundingClientRect(),w=r.width||330,h=r.height||118;
    el.style.left=`${clamp(x+14,12,innerWidth-w-12)}px`;
    el.style.top=`${clamp(y+14,12,innerHeight-h-12)}px`;
  }
  function showNodeToolbar(id,x,y){
    closeNodeToolbar();
    const c=state.connections.find(v=>v.id===id);if(!c)return;
    const a=eventById(c.from),b=eventById(c.to);
    const el=document.createElement('div');el.className='v9-node-toolbar';el.dataset.connectionToolbar=id;
    el.innerHTML=`<div class="v9-node-toolbar-head"><span class="v9-node-dot" style="--node-color:${colors[c.tone]||colors.neutral}"></span><span><strong>${esc(a?.name||'Event')} → ${esc(b?.name||'Event')}</strong><small>Drag the node to route this connection</small></span></div><div class="v9-node-toolbar-row"><input class="v9-node-label" data-v9-node-label value="${esc(c.label||'')}" placeholder="Connection label"><button type="button" data-v9-node-branch>Branch</button><button type="button" data-v9-node-style>${c.style==='dashed'?'Solid':'Dashed'}</button><button type="button" data-v9-node-tone>Color</button><button type="button" data-v9-node-reverse>Reverse</button><button type="button" class="danger" data-v9-node-delete>Delete</button></div>`;
    document.body.appendChild(el);nodeToolbar=el;requestAnimationFrame(()=>{el.classList.add('show');toolbarPosition(x,y,el);el.querySelector('input')?.focus({preventScroll:true});});
  }

  function applyConnectModeUI(){
    const shell=document.querySelector('.plan-shell');if(!shell)return;
    shell.classList.toggle('v9-connect-mode',!!connectSourceId);
    document.querySelectorAll('[data-event-block]').forEach(el=>{
      el.classList.toggle('v9-connect-source',el.dataset.eventBlock===connectSourceId);
      el.classList.toggle('v9-connect-target',!!connectSourceId&&el.dataset.eventBlock!==connectSourceId);
    });
    let hint=document.getElementById('v9ConnectHint');
    if(!connectSourceId){hint?.remove();return;}
    if(!hint){hint=document.createElement('div');hint.id='v9ConnectHint';hint.className='v9-connect-hint';document.querySelector('.plan-toolbar')?.appendChild(hint);}
    const src=eventById(connectSourceId);hint.innerHTML=`<span class="v9-pulse-dot"></span><strong>Connect from ${esc(src?.name||'event')}</strong><span>Click another event · Esc to cancel</span>`;
  }

  function cancelConnect(){connectSourceId='';applyConnectModeUI();}
  function beginConnect(id){
    ensure();
    if(connectSourceId===id){cancelConnect();return;}
    connectSourceId=id;closeNodeToolbar();applyConnectModeUI();
  }
  function finishConnect(targetId){
    const sourceId=connectSourceId;if(!sourceId)return false;
    if(targetId===sourceId){cancelConnect();return true;}
    if(state.connections.some(c=>c.from===sourceId&&c.to===targetId)){toast('Those events are already connected');cancelConnect();return true;}
    state.connections.push({id:uid(),from:sourceId,to:targetId,label:'',style:'solid',tone:'neutral',nodeMode:'auto'});
    window.MSC_V8?.syncLegacyDependencies?.();
    connectSourceId='';save();plan();toast('Connection added');
    return true;
  }

  function worldPoint(clientX,clientY){
    const viewport=document.getElementById('plannerViewport');if(!viewport)return null;
    const r=viewport.getBoundingClientRect();return{x:(viewport.scrollLeft+clientX-r.left)/Math.max(.01,zoom),y:(viewport.scrollTop+clientY-r.top)/Math.max(.01,zoom)};
  }
  function otherNodePositions(excludeId){return layoutConnections(visible()).filter(x=>x.c.id!==excludeId).map(x=>x.node);}
  function candidateForDrag(id,p){
    const rects=visible().map(eventRect),occupied=otherNodePositions(id);
    return resolveNode(p,occupied,rects,id);
  }

  function beginNodeDrag(e,node){
    if(e.button!==0)return;
    const id=node.dataset.connectionNode,c=state.connections.find(v=>v.id===id);if(!c)return;
    e.preventDefault();e.stopPropagation();closeNodeToolbar();
    nodeDrag={id,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
    document.body.classList.add('v9-node-dragging');
  }
  function moveNodeDrag(e){
    if(!nodeDrag)return;
    nodeDrag.lastX=e.clientX;nodeDrag.lastY=e.clientY;
    if(Math.hypot(e.clientX-nodeDrag.startX,e.clientY-nodeDrag.startY)>3)nodeDrag.moved=true;
    if(!nodeDrag.moved)return;
    e.preventDefault();
    if(dragFrame)return;
    dragFrame=requestAnimationFrame(()=>{
      dragFrame=0;const p=worldPoint(nodeDrag.lastX,nodeDrag.lastY);if(!p)return;
      const c=state.connections.find(v=>v.id===nodeDrag.id);if(!c)return;
      const safe=candidateForDrag(c.id,p);c.nodeMode='manual';c.node={x:safe.x,y:safe.y};
      redrawConnections();
      updatePresence?.({action:'moving',selectedEventId:null,detail:'connection node'});
    });
  }
  function endNodeDrag(e){
    if(!nodeDrag)return;
    const dragState=nodeDrag;nodeDrag=null;document.body.classList.remove('v9-node-dragging');
    if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0;}
    if(dragState.moved){
      suppressNodeClickUntil=Date.now()+250;
      save();redrawConnections();
      updatePresence?.({action:'idle',selectedEventId:selectedEventId||null,detail:''});
    } else showNodeToolbar(dragState.id,e.clientX,e.clientY);
  }

  function toolbarAction(target){
    const toolbar=target.closest('[data-connection-toolbar]');if(!toolbar)return false;
    const c=state.connections.find(v=>v.id===toolbar.dataset.connectionToolbar);if(!c)return false;
    if(target.matches('[data-v9-node-label]'))return true;
    if(target.closest('[data-v9-node-branch]')){beginConnect(c.from);closeNodeToolbar();return true;}
    if(target.closest('[data-v9-node-style]')){c.style=c.style==='dashed'?'solid':'dashed';save();redrawConnections();showNodeToolbar(c.id,toolbar.getBoundingClientRect().left,toolbar.getBoundingClientRect().top);return true;}
    if(target.closest('[data-v9-node-tone]')){const i=tones.indexOf(c.tone||'neutral');c.tone=tones[(i+1)%tones.length];save();redrawConnections();showNodeToolbar(c.id,toolbar.getBoundingClientRect().left,toolbar.getBoundingClientRect().top);return true;}
    if(target.closest('[data-v9-node-reverse]')){[c.from,c.to]=[c.to,c.from];window.MSC_V8?.syncLegacyDependencies?.();save();plan();closeNodeToolbar();return true;}
    if(target.closest('[data-v9-node-delete]')){state.connections=state.connections.filter(v=>v.id!==c.id);window.MSC_V8?.syncLegacyDependencies?.();save();plan();closeNodeToolbar();toast('Connection removed');return true;}
    return false;
  }

  document.addEventListener('pointerdown',e=>{
    const node=e.target.closest?.('[data-connection-node]');if(node)beginNodeDrag(e,node);
  },true);
  document.addEventListener('pointermove',moveNodeDrag,{capture:true,passive:false});
  document.addEventListener('pointerup',endNodeDrag,true);

  document.addEventListener('click',e=>{
    const add=e.target.closest?.('[data-link-from]');
    if(add){e.preventDefault();e.stopImmediatePropagation();beginConnect(add.dataset.linkFrom);return;}
    const node=e.target.closest?.('[data-connection-node]');
    if(node){e.preventDefault();e.stopImmediatePropagation();if(Date.now()>suppressNodeClickUntil&&!nodeDrag)showNodeToolbar(node.dataset.connectionNode,e.clientX,e.clientY);return;}
    if(toolbarAction(e.target)){e.preventDefault();e.stopImmediatePropagation();return;}
    if(connectSourceId){const block=e.target.closest?.('[data-event-block]');if(block){e.preventDefault();e.stopImmediatePropagation();finishConnect(block.dataset.eventBlock);return;}}
    if(nodeToolbar&&!e.target.closest?.('.v9-node-toolbar'))closeNodeToolbar();
  },true);

  document.addEventListener('change',e=>{
    if(!e.target.matches?.('[data-v9-node-label]'))return;
    const bar=e.target.closest('[data-connection-toolbar]'),c=bar&&state.connections.find(v=>v.id===bar.dataset.connectionToolbar);if(!c)return;c.label=e.target.value.trim();save();redrawConnections();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(connectSourceId){cancelConnect();e.preventDefault();}closeNodeToolbar();}
    if(e.key==='Enter'&&e.target.matches?.('[data-v9-node-label]')){e.preventDefault();e.target.blur();}
  });

  const basePlan=plan;
  plan=function(){basePlan();requestAnimationFrame(()=>{applyConnectModeUI();redrawConnections();});};

  window.addEventListener('resize',()=>closeNodeToolbar());
  ensure();
  if(view==='plan')plan();
})();
