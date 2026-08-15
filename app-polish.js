/* MSC v7 polish layer: Google auth UX, Maps/Places, smoother plan navigation,
   approval treatment, and Canva-style collaboration indicators. */
(() => {
  'use strict';

  const MAPS_CALLBACK_PREFIX = 'mscMapsV7_';
  let planPan = { targetX: 0, targetY: 0, raf: 0, bound: null };
  let autocompleteMountedFor = null;
  let mapInfo = null;
  let activityDockTimer = 0;
  let currentEditingField = '';

  const viewLabel = (v) => (typeof meta !== 'undefined' && meta[v]?.[0]) || v || 'Workspace';
  const getEventName = (eventId) => (typeof state !== 'undefined' && state.events?.find(e => e.id === eventId)?.name) || 'event';
  const actionText = (p) => {
    const detail = p.detail ? ` ${p.detail}` : '';
    if (p.action === 'moving') return `moving ${getEventName(p.selectedEventId)}`;
    if (p.action === 'editing') return `editing${detail || ` ${getEventName(p.selectedEventId)}`}`;
    if (p.action === 'selected') return `selected ${getEventName(p.selectedEventId)}`;
    if (p.action === 'panning') return 'moving around the board';
    return `on ${viewLabel(p.view)}`;
  };

  function ensureFixedUI() {
    if (!document.getElementById('liveActivityDock')) {
      const dock = document.createElement('aside');
      dock.id = 'liveActivityDock';
      dock.className = 'live-activity-dock';
      dock.setAttribute('aria-label', 'Live collaboration activity');
      document.body.appendChild(dock);
    }
    if (!document.getElementById('planMiniMap')) {
      const mini = document.createElement('div');
      mini.id = 'planMiniMap';
      mini.className = 'plan-minimap';
      mini.innerHTML = '<div class="plan-minimap-label">Board map</div><div class="plan-minimap-stage"></div>';
      document.body.appendChild(mini);
      mini.addEventListener('pointerdown', (e) => {
        const viewport = document.getElementById('plannerViewport');
        const stage = mini.querySelector('.plan-minimap-stage');
        if (!viewport || !stage || typeof WORLD === 'undefined') return;
        const r = stage.getBoundingClientRect();
        const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        viewport.scrollTo({
          left: px * WORLD.width * zoom - viewport.clientWidth / 2,
          top: py * WORLD.height * zoom - viewport.clientHeight / 2,
          behavior: 'smooth'
        });
      });
    }
  }

  function renderMiniMap() {
    ensureFixedUI();
    const mini = document.getElementById('planMiniMap');
    const stage = mini?.querySelector('.plan-minimap-stage');
    const viewport = document.getElementById('plannerViewport');
    if (!mini || !stage || typeof view === 'undefined' || view !== 'plan' || !viewport || typeof state === 'undefined') {
      if (mini) mini.classList.remove('show');
      return;
    }
    mini.classList.add('show');
    const worldW = WORLD?.width || 4600, worldH = WORLD?.height || 3200;
    const sx = 100 / worldW, sy = 100 / worldH;
    const localBlocks = (state.events || []).map((e) => {
      const c = (typeof approvalClass === 'function' ? approvalClass(e.approvalStatus) : '');
      return `<span class="minimap-block ${c}" style="left:${e.position.x * sx}%;top:${e.position.y * sy}%"></span>`;
    }).join('');
    const peerDots = Object.values(typeof peers !== 'undefined' ? peers : {}).map((p) => {
      const cursor = typeof remoteCursors !== 'undefined' ? remoteCursors[p.clientId] : null;
      if (!cursor || p.view !== 'plan') return '';
      const worldX = (viewport.scrollLeft + cursor.x) / Math.max(zoom, .01);
      const worldY = (viewport.scrollTop + cursor.y) / Math.max(zoom, .01);
      return `<span class="minimap-peer" style="--peer-color:${peerColor(p.clientId)};left:${worldX * sx}%;top:${worldY * sy}%"></span>`;
    }).join('');
    const left = viewport.scrollLeft / Math.max(zoom, .01) * sx;
    const top = viewport.scrollTop / Math.max(zoom, .01) * sy;
    const width = viewport.clientWidth / Math.max(zoom, .01) * sx;
    const height = viewport.clientHeight / Math.max(zoom, .01) * sy;
    stage.innerHTML = `${localBlocks}${peerDots}<span class="minimap-viewport" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"></span>`;
  }

  function renderActivityDock() {
    ensureFixedUI();
    const dock = document.getElementById('liveActivityDock');
    if (!dock) return;
    const arr = Object.values(typeof peers !== 'undefined' ? peers : {}).filter(p => p.clientId !== tabId);
    if (!room || !arr.length) {
      dock.classList.remove('show');
      dock.innerHTML = '';
      return;
    }
    dock.classList.add('show');
    dock.innerHTML = `<div class="live-dock-title"><span class="live-dot"></span> Live workspace</div>${arr.slice(0,5).map(p => {
      const color = peerColor(p.clientId);
      const avatar = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc((p.name || '?').slice(0,1).toUpperCase());
      return `<div class="live-dock-row" style="--peer-color:${color}">
        <span class="live-dock-avatar">${avatar}</span>
        <span class="live-dock-copy"><strong>${esc(p.name || 'Member')}</strong><small>${esc(actionText(p))}</small></span>
        <span class="live-dock-page">${esc(viewLabel(p.view))}</span>
      </div>`;
    }).join('')}`;
  }

  function refreshCollabChrome() {
    clearTimeout(activityDockTimer);
    activityDockTimer = setTimeout(() => {
      renderActivityDock();
      renderMiniMap();
      decoratePresenceAvatars();
    }, 0);
  }

  function decoratePresenceAvatars() {
    const stack = document.getElementById('presenceStack');
    if (!stack) return;
    [...stack.children].forEach((el) => {
      if (!el.querySelector('.presence-live-dot')) {
        const dot = document.createElement('span');
        dot.className = 'presence-live-dot';
        el.appendChild(dot);
      }
    });
  }

  const originalIdentityPayload = typeof identityPayload === 'function' ? identityPayload : null;
  if (originalIdentityPayload) {
    identityPayload = function(extra = {}) {
      return {
        ...originalIdentityPayload(extra),
        detail: extra.detail ?? currentEditingField ?? '',
        updatedAt: Date.now()
      };
    };
  }

  const originalPresenceUI = typeof presenceUI === 'function' ? presenceUI : null;
  if (originalPresenceUI) {
    presenceUI = function() {
      originalPresenceUI();
      const pop = document.getElementById('presencePopover');
      if (pop) {
        pop.querySelectorAll('.presence-row').forEach((row, idx) => {
          const arr = [identityPayload(), ...Object.values(peers || {}).filter(p => p.clientId !== tabId)];
          const p = arr[idx];
          if (!p) return;
          const where = row.querySelector('.where');
          const chip = row.querySelector('.activity-chip');
          if (where) where.textContent = `${viewLabel(p.view)}${p.selectedEventId ? ` · ${getEventName(p.selectedEventId)}` : ''}`;
          if (chip) chip.textContent = p.clientId === tabId ? 'you' : actionText(p);
        });
      }
      refreshCollabChrome();
    };
  }

  const originalPatchPeerActivity = typeof patchPeerActivity === 'function' ? patchPeerActivity : null;
  if (originalPatchPeerActivity) {
    patchPeerActivity = function(payload) {
      originalPatchPeerActivity(payload);
      if (peers[payload.from]) peers[payload.from].detail = payload.detail || '';
      refreshCollabChrome();
    };
  }

  document.addEventListener('focusin', (e) => {
    const field = e.target.closest('#eventForm input,#eventForm textarea,#eventForm select');
    if (!field || !draft) return;
    const label = field.closest('.field')?.querySelector(':scope > span')?.textContent?.trim() || field.name || 'event';
    currentEditingField = label;
    updatePresence({selectedEventId:draft.id, action:'editing', detail:label});
    broadcast('activity', {from:tabId,eventId:draft.id,action:'editing',detail:label,view,name:displayName,avatar:avatarUrl,t:Date.now()});
  });
  document.addEventListener('focusout', (e) => {
    const field = e.target.closest('#eventForm input,#eventForm textarea,#eventForm select');
    if (!field || !draft) return;
    setTimeout(() => {
      if (!document.activeElement?.closest?.('#eventForm')) {
        currentEditingField = '';
        updatePresence({selectedEventId:draft.id, action:'editing', detail:'event details'});
      }
    }, 30);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!room || view !== 'plan') return;
    const p = e.target.closest('#plannerViewport');
    if (p && !e.target.closest('.event-block')) {
      updatePresence({action:'panning', selectedEventId:null, detail:''});
      broadcast('activity', {from:tabId,action:'panning',eventId:null,view:'plan',name:displayName,avatar:avatarUrl,t:Date.now()});
    }
  }, true);
  document.addEventListener('pointerup', () => {
    if (room && view === 'plan' && drag?.type !== 'block') updatePresence({action:selectedEventId?'selected':'idle',selectedEventId});
  });

  function bindSmoothPlanViewport() {
    const viewport = document.getElementById('plannerViewport');
    if (!viewport || planPan.bound === viewport) return;
    planPan.bound = viewport;
    planPan.targetX = viewport.scrollLeft;
    planPan.targetY = viewport.scrollTop;

    const tick = () => {
      planPan.raf = 0;
      const dx = planPan.targetX - viewport.scrollLeft;
      const dy = planPan.targetY - viewport.scrollTop;
      if (Math.abs(dx) < .3 && Math.abs(dy) < .3) {
        viewport.scrollLeft = planPan.targetX;
        viewport.scrollTop = planPan.targetY;
        renderMiniMap();
        return;
      }
      viewport.scrollLeft += dx * .24;
      viewport.scrollTop += dy * .24;
      renderMiniMap();
      planPan.raf = requestAnimationFrame(tick);
    };

    viewport.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const dx = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      planPan.targetX = clamp(planPan.targetX + dx * 1.15, 0, viewport.scrollWidth - viewport.clientWidth);
      planPan.targetY = clamp(planPan.targetY + dy * 1.15, 0, viewport.scrollHeight - viewport.clientHeight);
      if (!planPan.raf) planPan.raf = requestAnimationFrame(tick);
    }, {passive:false, capture:true});

    viewport.addEventListener('scroll', () => {
      if (!planPan.raf) {
        planPan.targetX = viewport.scrollLeft;
        planPan.targetY = viewport.scrollTop;
      }
      renderMiniMap();
    }, {passive:true});
  }

  const originalPlan = typeof plan === 'function' ? plan : null;
  if (originalPlan) {
    plan = function() {
      originalPlan();
      requestAnimationFrame(() => {
        bindSmoothPlanViewport();
        renderMiniMap();
        applyApprovalDecorations();
        mountVenueAutocomplete();
      });
    };
  }

  function approvalTone(status='Not required') {
    const s = status.toLowerCase();
    if (s === 'approved') return '#43d17a';
    if (s === 'awaiting approval') return '#f1c75b';
    if (s === 'rejected') return '#ff6b6b';
    if (s === 'not submitted') return '#9b9b9b';
    return '#555';
  }
  function applyApprovalDecorations() {
    document.querySelectorAll('[data-event-block]').forEach(el => {
      const ev = state.events.find(x => x.id === el.dataset.eventBlock);
      if (!ev) return;
      el.style.setProperty('--approval-color', approvalTone(ev.approvalStatus));
      el.dataset.approval = ev.approvalStatus || 'Not required';
    });
    const sel = document.querySelector('#eventForm [name="approvalStatus"]');
    if (sel) {
      sel.classList.add('approval-select');
      sel.style.setProperty('--approval-color', approvalTone(sel.value));
    }
  }
  document.addEventListener('change', (e) => {
    if (e.target.matches('#eventForm [name="approvalStatus"]')) e.target.style.setProperty('--approval-color', approvalTone(e.target.value));
  });

  const originalRender = typeof render === 'function' ? render : null;
  if (originalRender) {
    render = function() {
      originalRender();
      applyApprovalDecorations();
      refreshCollabChrome();
      requestAnimationFrame(bindSmoothPlanViewport);
    };
  }

  const originalSignInGoogle = typeof signInGoogle === 'function' ? signInGoogle : null;
  if (originalSignInGoogle) {
    signInGoogle = async function() {
      if (!supabase) return toast('Online services are still connecting');
      const redirectTo = new URL(location.href);
      redirectTo.hash = '';
      const { error } = await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo.toString(),scopes:'openid email profile'}});
      if (error) {
        console.error(error);
        toast('Google sign-in still needs the Google OAuth credentials');
        const note = document.getElementById('authSetupNote');
        if (note) note.innerHTML = `Google OAuth is wired in. In Supabase Auth, enable Google using a Web client ID + client secret. Use <code>${esc(SB_URL + '/auth/v1/callback')}</code> as the Google authorized redirect URI.`;
      }
    };
  }

  const originalAccountUI = typeof accountUI === 'function' ? accountUI : null;
  if (originalAccountUI) {
    accountUI = function() {
      originalAccountUI();
      const note = document.getElementById('authSetupNote');
      if (!authUser && note) note.innerHTML = `Google login is ready in the frontend. Required Google OAuth redirect URI: <code>${esc(SB_URL + '/auth/v1/callback')}</code>. The Google client secret stays in Supabase and is never committed to GitHub.`;
    };
  }

  loadGoogleMaps = function() {
    if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;
    const key = getMapsKey();
    if (!key) return Promise.reject(new Error('No Maps API key'));
    mapsPromise = new Promise((resolve, reject) => {
      const cb = `${MAPS_CALLBACK_PREFIX}${Date.now()}`;
      window[cb] = () => {
        delete window[cb];
        if (window.google?.maps?.importLibrary) resolve(window.google.maps);
        else reject(new Error('Google Maps loaded without importLibrary'));
      };
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`;
      script.onerror = () => { delete window[cb]; mapsPromise = null; reject(new Error('Maps failed to load')); };
      document.head.appendChild(script);
    });
    return mapsPromise;
  };

  geocodeAddress = async function(address) {
    const clean = String(address || '').trim();
    if (!clean) return null;
    if (geocodeCache[clean]) return geocodeCache[clean];
    await loadGoogleMaps();
    const { Geocoder } = await google.maps.importLibrary('geocoding');
    const geocoder = new Geocoder();
    const response = await geocoder.geocode({address: clean, region:'TH'});
    const result = response.results?.[0];
    if (!result?.geometry?.location) return null;
    const point = {lat:result.geometry.location.lat(),lng:result.geometry.location.lng(),formattedAddress:result.formatted_address || clean,placeId:result.place_id || ''};
    geocodeCache[clean] = point;
    localStorage.mscGeocodeCache = JSON.stringify(geocodeCache);
    return point;
  };

  function addHiddenVenueFields(form) {
    ['venueLat','venueLng','venuePlaceId'].forEach(name => {
      if (!form.elements[name]) {
        const input = document.createElement('input'); input.type='hidden'; input.name=name; form.appendChild(input);
      }
    });
  }

  async function mountVenueAutocomplete() {
    const form = document.getElementById('eventForm');
    if (!form) return;
    addHiddenVenueFields(form);
    const addressInput = form.elements.venueAddress;
    if (!addressInput || !getMapsKey()) return;
    const hostLabel = addressInput.closest('.field');
    if (!hostLabel || hostLabel.querySelector('.places-autocomplete-host')) return;
    const host = document.createElement('div'); host.className='places-autocomplete-host'; host.innerHTML='<span class="places-loading">Google Places loading…</span>'; hostLabel.appendChild(host);
    try {
      await loadGoogleMaps();
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      host.innerHTML='';
      const autocomplete = new PlaceAutocompleteElement(); autocomplete.placeholder='Search Google Maps for a venue'; autocomplete.className='msc-place-autocomplete'; host.appendChild(autocomplete); autocompleteMountedFor=host;
      autocomplete.addEventListener('gmp-select', async (event) => {
        try {
          const prediction=event.placePrediction; if(!prediction)return; const place=prediction.toPlace();
          await place.fetchFields({fields:['displayName','formattedAddress','location','id']});
          if(place.formattedAddress)addressInput.value=place.formattedAddress;
          if(place.displayName&&!form.elements.venue.value.trim())form.elements.venue.value=place.displayName;
          if(place.location){form.elements.venueLat.value=place.location.lat();form.elements.venueLng.value=place.location.lng();}
          form.elements.venuePlaceId.value=place.id||''; addressInput.dispatchEvent(new Event('input',{bubbles:true})); toast('Venue selected from Google Maps');
        } catch(err){console.error('Place selection failed',err);}
      });
    } catch(err){console.warn(err);host.innerHTML='<span class="places-loading">Places autocomplete unavailable. Manual address still works.</span>';}
  }

  const originalOpenEvent = typeof openEvent === 'function' ? openEvent : null;
  if (originalOpenEvent) {
    openEvent = function(e=null,pos=null) {
      originalOpenEvent(e,pos);
      const form=document.getElementById('eventForm');
      if(form){addHiddenVenueFields(form);if(e){if(form.elements.venueLat)form.elements.venueLat.value=e.venueLat||'';if(form.elements.venueLng)form.elements.venueLng.value=e.venueLng||'';if(form.elements.venuePlaceId)form.elements.venuePlaceId.value=e.venuePlaceId||'';}}
      applyApprovalDecorations(); requestAnimationFrame(mountVenueAutocomplete);
    };
  }

  const originalCollect = typeof collect === 'function' ? collect : null;
  if (originalCollect) {
    collect = function() {
      const x=originalCollect(),f=document.getElementById('eventForm');
      x.venueLat=+(f?.elements.venueLat?.value||x.venueLat||0)||'';x.venueLng=+(f?.elements.venueLng?.value||x.venueLng||0)||'';x.venuePlaceId=f?.elements.venuePlaceId?.value||x.venuePlaceId||'';return x;
    };
  }

  initVenueMap = async function() {
    if(view!=='venues'||!getMapsKey()||!document.getElementById('venueMap'))return;
    const el=document.getElementById('venueMap');
    try{
      await loadGoogleMaps();
      const [{Map},{AdvancedMarkerElement}]=await Promise.all([google.maps.importLibrary('maps'),google.maps.importLibrary('marker')]);
      const {InfoWindow}=await google.maps.importLibrary('maps');
      const map=new Map(el,{center:{lat:13.7563,lng:100.5018},zoom:11,mapId:'DEMO_MAP_ID',mapTypeControl:false,streetViewControl:false,fullscreenControl:true,gestureHandling:'greedy'});activeMap=map;mapInfo=new InfoWindow();
      const bounds=new google.maps.LatLngBounds();let count=0;
      for(const [name,eventsAtVenue] of Object.entries(venueGroups())){
        const preferred=eventsAtVenue.find(x=>x.venueLat&&x.venueLng);let pos=preferred?{lat:+preferred.venueLat,lng:+preferred.venueLng}:null;
        if(!pos){const address=eventsAtVenue.find(x=>x.venueAddress)?.venueAddress||name;try{pos=await geocodeAddress(address)}catch(err){console.warn('Could not geocode',address,err)}}
        if(!pos)continue;
        const marker=new AdvancedMarkerElement({map,position:pos,title:name});
        marker.addListener('click',()=>{mapInfo.setContent(`<div class="msc-map-info"><strong>${esc(name)}</strong><small>${eventsAtVenue.length} event${eventsAtVenue.length===1?'':'s'}</small>${eventsAtVenue.slice(0,4).map(ev=>`<button type="button" data-map-open-event="${ev.id}">${esc(ev.name)}</button>`).join('')}</div>`);mapInfo.open({map,anchor:marker});});
        bounds.extend(pos);count++;
      }
      if(count===1)map.setZoom(15);else if(count>1)map.fitBounds(bounds,72);
    }catch(err){console.error(err);el.innerHTML=`<div class="map-placeholder"><div class="inner"><h3>Google Maps could not load</h3><p>Enable Maps JavaScript API, Places API (new), and billing. Restrict the browser key to your GitHub Pages domain.</p><button class="button secondary" id="configureMapsRetry">Maps settings</button></div></div>`;}
  };

  document.addEventListener('click',(e)=>{const b=e.target.closest('[data-map-open-event]');if(!b)return;const ev=state.events.find(x=>x.id===b.dataset.mapOpenEvent);if(ev)openEvent(ev);});

  ensureFixedUI();
  if(typeof render==='function')render();
  if(typeof setView==='function')setView(view,false);
  if(typeof accountUI==='function')accountUI();
  refreshCollabChrome();
  window.addEventListener('resize',()=>{renderMiniMap();refreshCollabChrome();});
  setInterval(()=>{if(room)refreshCollabChrome();},1500);
})();
