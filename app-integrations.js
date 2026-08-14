function beginBlockDrag(ev,pointer){
  const viewport=$('#plannerViewport'); drag={type:'block',event:ev,startX:pointer.clientX,startY:pointer.clientY,x:ev.position.x,y:ev.position.y,raf:0,nextX:ev.position.x,nextY:ev.position.y}; selectEvent(ev.id,false); updatePresence({selectedEventId:ev.id,action:'moving'});broadcast('activity',{from:tabId,eventId:ev.id,action:'moving',view:'plan',name:displayName,avatar:avatarUrl,t:Date.now()});const el=$(`[data-event-block="${ev.id}"]`);el?.classList.add('moving');viewport?.classList.remove('panning');
}
function scheduleLocalMove(x,y){if(!drag||drag.type!=='block')return;drag.nextX=x;drag.nextY=y;if(drag.raf)return;drag.raf=requestAnimationFrame(()=>{drag.raf=0;drag.event.position.x=drag.nextX;drag.event.position.y=drag.nextY;const el=$(`[data-event-block="${drag.event.id}"]`);if(el){el.style.setProperty('--x',`${drag.nextX}px`);el.style.setProperty('--y',`${drag.nextY}px`);}updateConnectionSvg();});}
function endBlockDrag(){if(!drag||drag.type!=='block')return;const id=drag.event.id;const el=$(`[data-event-block="${id}"]`);el?.classList.remove('moving');save();updatePresence({selectedEventId:id,action:'selected'});broadcast('activity',{from:tabId,eventId:id,action:'selected',view:'plan',name:displayName,avatar:avatarUrl,t:Date.now()});drag=null;}
function zoomAt(viewport, clientX, clientY, delta){
  const r=viewport.getBoundingClientRect();const old=zoom;const next=clamp(old+delta,.45,1.75);if(next===old)return;const wx=(viewport.scrollLeft+clientX-r.left)/old,wy=(viewport.scrollTop+clientY-r.top)/old;zoom=next;state.zoom=zoom;const world=$('#plannerWorld');if(world)world.style.transform=`scale(${zoom})`;viewport.scrollLeft=wx*zoom-(clientX-r.left);viewport.scrollTop=wy*zoom-(clientY-r.top);$('.zoom-label').textContent=`${Math.round(zoom*100)}%`;save(false);
}

function getMapsKey(){return localStorage.mscGoogleMapsKey || window.MSC_CONFIG?.googleMapsApiKey || '';}
function loadGoogleMaps(){
  if(window.google?.maps)return Promise.resolve(window.google.maps);if(mapsPromise)return mapsPromise;const key=getMapsKey();if(!key)return Promise.reject(new Error('No Maps API key'));
  mapsPromise=new Promise((resolve,reject)=>{const cb=`mscMapsReady_${Date.now()}`;window[cb]=()=>{delete window[cb];resolve(window.google.maps)};const s=document.createElement('script');s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=marker&callback=${cb}`;s.async=true;s.defer=true;s.onerror=()=>reject(new Error('Maps failed to load'));document.head.appendChild(s);});return mapsPromise;
}
async function geocodeAddress(address){
  if(!address)return null;if(geocodeCache[address])return geocodeCache[address];await loadGoogleMaps();const geocoder=new google.maps.Geocoder();const {results}=await geocoder.geocode({address});const loc=results?.[0]?.geometry?.location;if(!loc)return null;const point={lat:loc.lat(),lng:loc.lng()};geocodeCache[address]=point;localStorage.mscGeocodeCache=JSON.stringify(geocodeCache);return point;
}
async function initVenueMap(){
  if(view!=='venues'||!getMapsKey()||!$('#venueMap'))return;
  try{
    await loadGoogleMaps();const {Map}=await google.maps.importLibrary('maps');const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
    const map=new Map($('#venueMap'),{center:{lat:13.7563,lng:100.5018},zoom:11,mapId:'DEMO_MAP_ID',mapTypeControl:false,streetViewControl:false,fullscreenControl:true});activeMap=map;
    const bounds=new google.maps.LatLngBounds();let count=0;const byVenue=Object.entries(venueGroups());
    for(const [name,ev] of byVenue){const address=ev.find(x=>x.venueAddress)?.venueAddress||name;try{const pos=await geocodeAddress(address);if(!pos)continue;new AdvancedMarkerElement({map,position:pos,title:name});bounds.extend(pos);count++;}catch(err){console.warn('Could not geocode',address,err)}}
    if(count===1)map.setZoom(15);else if(count>1)map.fitBounds(bounds,60);
  }catch(err){console.error(err);const el=$('#venueMap');if(el)el.innerHTML=`<div class="map-placeholder"><div class="inner"><h3>Google Maps could not load</h3><p>Check that the Maps JavaScript API is enabled, billing is active, and the API key allows this GitHub Pages referrer.</p><button class="button secondary" id="configureMapsRetry">Maps settings</button></div></div>`;}
}

function exportJSON(){const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='msc-events.json';a.click();URL.revokeObjectURL(a.href);}
function parseICS(text){
  const lines=text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/),out=[];let cur=null;
  for(const l of lines){if(l==='BEGIN:VEVENT')cur={};else if(l==='END:VEVENT'&&cur){out.push(cur);cur=null}else if(cur){const i=l.indexOf(':');if(i<0)continue;const k=l.slice(0,i).split(';')[0],v=l.slice(i+1);cur[k]=v;}}
  const parse=v=>{if(!v)return'';if(/^\d{8}$/.test(v))return new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T00:00:00`).toISOString();const z=v.endsWith('Z'),s=v.replace('Z','');return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)||'00'}:${s.slice(11,13)||'00'}:${s.slice(13,15)||'00'}${z?'Z':''}`).toISOString();};
  return out.map(x=>({...fresh(x.SUMMARY||'Imported event'),start:parse(x.DTSTART),end:parse(x.DTEND),venue:x.LOCATION||'',objective:(x.DESCRIPTION||'').replace(/\\n/g,'\n'),source:'imported',externalId:x.UID||''}));
}
function parseJSON(text){const j=JSON.parse(text),arr=Array.isArray(j)?j:(j.events||j.items||[]);return arr.map(x=>({...fresh(x.name||x.title||x.summary||'Imported event'),objective:x.objective||x.description||'',start:x.start||x.startDate||x.date||'',end:x.end||x.endDate||'',venue:x.venue||x.location||'',venueAddress:x.venueAddress||x.address||'',lead:x.lead||x.personResponsible||'',supporting:x.supportingMembers||x.supporting||[],materials:x.materialsRequired||x.materials||[],budgetPlanned:+(x.budgetPlanned??x.budget??0)||0,deadline:x.deadline||'',approvalRequired:!!x.approvalRequired,approvalStatus:x.approvalStatus||'Not required',status:x.status||'Not started',dependencies:x.dependencies||[],backupPlan:x.backupPlan||'',feedback:x.postEventFeedback||x.feedback||'',source:'imported',externalId:x.id||x.uid||''}));}
async function loadImport(file){try{const t=await file.text();imports=file.name.toLowerCase().endsWith('.json')?parseJSON(t):parseICS(t);$('#importPreview').innerHTML=imports.map((e,i)=>`<label class="import-row"><input type="checkbox" data-import-index="${i}" checked><strong>${esc(e.name)}</strong><span style="margin-left:auto;color:#777">${fmtDate(e.start)}</span></label>`).join('')||'<div class="empty-state">No events detected.</div>';$('#confirmImportButton').disabled=!imports.length}catch{toast('Could not read that calendar file')}}
