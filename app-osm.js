/* MSC OpenStreetMap venue layer.
   Replaces Google Maps with Leaflet + OpenStreetMap and keeps geolocation local to this browser. */
(() => {
  'use strict';

  const DEFAULT_CENTER = [13.7563, 100.5018];
  const DEFAULT_ZOOM = 11;
  const NOMINATIM_MIN_INTERVAL = 1100;
  const OSM_CACHE_KEY = 'mscOsmGeocodeCache';

  let osmMap = null;
  let venueLayer = null;
  let venueMarkers = new Map();
  let userMarker = null;
  let userAccuracy = null;
  let geoWatchId = null;
  let followUser = true;
  let lastNominatimAt = 0;
  let nominatimQueue = Promise.resolve();
  let osmCache = {};

  try { osmCache = JSON.parse(localStorage.getItem(OSM_CACHE_KEY) || '{}'); } catch { osmCache = {}; }

  if (typeof getMapsKey === 'function') getMapsKey = () => '';
  if (typeof loadGoogleMaps === 'function') loadGoogleMaps = () => Promise.reject(new Error('Google Maps was replaced by OpenStreetMap'));

  function saveOsmCache() {
    try { localStorage.setItem(OSM_CACHE_KEY, JSON.stringify(osmCache)); } catch {}
  }

  function normalizedQuery(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  async function rateLimitedNominatimSearch(query) {
    const q = normalizedQuery(query);
    if (!q) return null;
    const cacheKey = q.toLowerCase();
    if (osmCache[cacheKey]) return osmCache[cacheKey];

    const run = async () => {
      const wait = Math.max(0, NOMINATIM_MIN_INTERVAL - (Date.now() - lastNominatimAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastNominatimAt = Date.now();

      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', q);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
      if (!response.ok) throw new Error(`OpenStreetMap lookup failed (${response.status})`);
      const data = await response.json();
      const hit = data?.[0];
      if (!hit) return null;

      const point = {
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        formattedAddress: hit.display_name || q,
        osmType: hit.osm_type || '',
        osmId: hit.osm_id || '',
        placeId: hit.place_id || ''
      };
      osmCache[cacheKey] = point;
      saveOsmCache();
      return point;
    };

    const task = nominatimQueue.then(run, run);
    nominatimQueue = task.catch(() => null);
    return task;
  }

  if (typeof geocodeAddress === 'function') geocodeAddress = rateLimitedNominatimSearch;

  function ensureHiddenVenueFields(form) {
    ['venueLat','venueLng','venuePlaceId'].forEach(name => {
      if (!form.elements[name]) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        form.appendChild(input);
      }
    });
  }

  function setFormPoint(form, point, updateAddress = true) {
    ensureHiddenVenueFields(form);
    form.elements.venueLat.value = point?.lat ?? '';
    form.elements.venueLng.value = point?.lng ?? '';
    form.elements.venuePlaceId.value = point ? `osm:${point.osmType || 'place'}:${point.osmId || point.placeId || ''}` : '';
    if (updateAddress && point?.formattedAddress && form.elements.venueAddress) form.elements.venueAddress.value = point.formattedAddress;
    updateVenueLookupStatus(point ? 'Location saved to this event.' : 'Location cleared.', point ? 'ok' : '');
  }

  function updateVenueLookupStatus(text, tone = '') {
    const status = document.getElementById('osmVenueLookupStatus');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function mountOsmVenueTools() {
    const form = document.getElementById('eventForm');
    if (!form) return;
    ensureHiddenVenueFields(form);
    const addressInput = form.elements.venueAddress;
    if (!addressInput) return;
    addressInput.placeholder = 'School address or place name';
    const label = addressInput.closest('.field');
    if (!label || label.querySelector('.osm-venue-tools')) return;

    const tools = document.createElement('div');
    tools.className = 'osm-venue-tools';
    tools.innerHTML = `
      <div class="osm-venue-actions">
        <button class="mini-action" type="button" id="osmFindVenue">⌕ Find on map</button>
        <button class="mini-action" type="button" id="osmUseCurrentLocation">◎ Use my location</button>
        <button class="mini-action subtle" type="button" id="osmClearVenueLocation">Clear pin</button>
      </div>
      <small id="osmVenueLookupStatus" class="osm-venue-status">No API key required · OpenStreetMap lookup is only sent when you press Find.</small>`;
    label.appendChild(tools);

    const hasPoint = Number(form.elements.venueLat.value) && Number(form.elements.venueLng.value);
    if (hasPoint) updateVenueLookupStatus('This event already has a saved map location.', 'ok');
  }

  async function findVenueFromDrawer() {
    const form = document.getElementById('eventForm');
    if (!form) return;
    const query = normalizedQuery(form.elements.venueAddress?.value || form.elements.venue?.value);
    if (!query) return toast('Enter a venue address or place name first');
    const button = document.getElementById('osmFindVenue');
    if (button) { button.disabled = true; button.textContent = 'Finding…'; }
    updateVenueLookupStatus('Searching OpenStreetMap…');
    try {
      const point = await rateLimitedNominatimSearch(query);
      if (!point) {
        updateVenueLookupStatus('No matching place found. Try a more specific address.', 'warn');
        toast('No matching OpenStreetMap place found');
        return;
      }
      setFormPoint(form, point, true);
      toast('Venue location saved');
    } catch (err) {
      console.error(err);
      updateVenueLookupStatus('Place lookup is temporarily unavailable. You can still save the address manually.', 'warn');
      toast('OpenStreetMap lookup unavailable');
    } finally {
      if (button) { button.disabled = false; button.textContent = '⌕ Find on map'; }
    }
  }

  function useCurrentLocationInDrawer() {
    const form = document.getElementById('eventForm');
    if (!form) return;
    if (!navigator.geolocation) return toast('Location is not supported by this browser');
    const button = document.getElementById('osmUseCurrentLocation');
    if (button) { button.disabled = true; button.textContent = 'Locating…'; }
    updateVenueLookupStatus('Waiting for browser location permission…');
    navigator.geolocation.getCurrentPosition(pos => {
      setFormPoint(form, { lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
      updateVenueLookupStatus(`Location saved · accuracy about ${Math.round(pos.coords.accuracy)} m.`, 'ok');
      if (button) { button.disabled = false; button.textContent = '◎ Use my location'; }
      toast('Current location saved to this event');
    }, err => {
      updateVenueLookupStatus(err.code === 1 ? 'Location permission was not granted.' : 'Could not determine your location.', 'warn');
      if (button) { button.disabled = false; button.textContent = '◎ Use my location'; }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 });
  }

  function clearDrawerLocation() {
    const form = document.getElementById('eventForm');
    if (!form) return;
    setFormPoint(form, null, false);
  }

  function eventsWithCoordinates() {
    return (typeof visible === 'function' ? visible() : state.events).filter(e => Number(e.venueLat) && Number(e.venueLng));
  }

  function makeVenueIcon() {
    return L.divIcon({
      className: 'msc-osm-divicon',
      html: '<span class="msc-osm-pin"><span></span></span>',
      iconSize: [30, 38],
      iconAnchor: [15, 35],
      popupAnchor: [0, -34]
    });
  }

  function popupHtml(name, eventsAtVenue) {
    return `<div class="msc-osm-popup"><strong>${esc(name)}</strong><small>${eventsAtVenue.length} event${eventsAtVenue.length === 1 ? '' : 's'}</small>${eventsAtVenue.slice(0,6).map(ev => `<button type="button" data-osm-open-event="${ev.id}">${esc(ev.name)}</button>`).join('')}</div>`;
  }

  function destroyVenueMap() {
    if (osmMap) {
      try { osmMap.remove(); } catch {}
    }
    osmMap = null;
    venueLayer = null;
    venueMarkers = new Map();
    activeMap = null;
  }

  function fitVenueMarkers() {
    if (!osmMap || !venueMarkers.size) return;
    const bounds = L.latLngBounds([...venueMarkers.values()].map(marker => marker.getLatLng()));
    if (bounds.isValid()) osmMap.fitBounds(bounds.pad(.18), { maxZoom: 16, animate: true, duration: .45 });
  }

  function mapStatus(text) {
    const el = document.getElementById('osmMapStatus');
    if (el) el.textContent = text;
  }

  function plotVenueMarkers() {
    if (!osmMap || !venueLayer) return;
    venueLayer.clearLayers();
    venueMarkers.clear();
    const groups = venueGroups();
    for (const [name, eventsAtVenue] of Object.entries(groups)) {
      const located = eventsAtVenue.find(e => Number(e.venueLat) && Number(e.venueLng));
      if (!located) continue;
      const marker = L.marker([Number(located.venueLat), Number(located.venueLng)], { icon: makeVenueIcon(), title: name });
      marker.bindPopup(popupHtml(name, eventsAtVenue), { className: 'msc-leaflet-popup', maxWidth: 280 });
      marker.addTo(venueLayer);
      venueMarkers.set(name, marker);
    }
    const missing = Object.values(groups).filter(eventsAtVenue => !eventsAtVenue.some(e => Number(e.venueLat) && Number(e.venueLng))).length;
    mapStatus(`${venueMarkers.size} mapped venue${venueMarkers.size === 1 ? '' : 's'}${missing ? ` · ${missing} still need a pin` : ''}`);
  }

  initVenueMap = function() {
    if (view !== 'venues') return;
    const el = document.getElementById('venueMap');
    if (!el) return;
    if (!window.L) {
      el.innerHTML = '<div class="map-placeholder"><div class="inner"><h3>Map library unavailable</h3><p>The rest of the app still works. Reload when the Leaflet CDN is reachable.</p></div></div>';
      return;
    }

    destroyVenueMap();
    osmMap = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      scrollWheelZoom: true
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    activeMap = osmMap;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(osmMap);

    venueLayer = L.layerGroup().addTo(osmMap);
    plotVenueMarkers();
    if (venueMarkers.size) fitVenueMarkers();
    setTimeout(() => osmMap?.invalidateSize(), 80);
  };

  function venueHasPoint(eventsAtVenue) {
    return eventsAtVenue.some(e => Number(e.venueLat) && Number(e.venueLng));
  }

  function venueAddress(eventsAtVenue) {
    return eventsAtVenue.find(e => e.venueAddress)?.venueAddress || '';
  }

  venues = function() {
    const groups = venueGroups();
    const rows = Object.entries(groups).map(([name, eventsAtVenue]) => {
      const conflict = eventsAtVenue.some((a, i) => eventsAtVenue.slice(i + 1).some(b => overlap(a, b)));
      const located = venueHasPoint(eventsAtVenue);
      const address = venueAddress(eventsAtVenue);
      const sample = eventsAtVenue[0];
      return `<div class="venue-row osm-venue-row" data-venue-name="${esc(name)}">
        <div class="venue-row-copy"><strong>${esc(name)}</strong><small>${eventsAtVenue.length} event${eventsAtVenue.length === 1 ? '' : 's'}${conflict ? ' · ⚠ conflict' : ''}${address ? ` · ${esc(address)}` : ''}</small></div>
        <div class="venue-row-actions">
          ${located ? `<button class="mini-action" type="button" data-osm-show-venue="${esc(name)}">Show</button>` : `<button class="mini-action" type="button" data-osm-locate-event="${sample.id}" ${address || sample.venue ? '' : 'disabled'}>Locate</button>`}
        </div>
      </div>`;
    }).join('');

    $('#venuesView').innerHTML = `<div class="venue-shell"><div class="venue-layout">
      <div class="panel venue-list">
        <div class="panel-header"><div><h2>Venue usage</h2><p>OpenStreetMap · no API key required.</p></div></div>
        ${rows || '<div class="empty-state">No venues assigned yet.</div>'}
      </div>
      <div class="panel venue-map-wrap osm-map-panel">
        <div class="map-toolbar osm-map-toolbar">
          <div class="osm-map-status"><span class="osm-provider-dot"></span><span id="osmMapStatus">OpenStreetMap</span></div>
          <div class="osm-map-actions">
            <button class="button secondary" id="fitVenueMap" ${eventsWithCoordinates().length ? '' : 'disabled'}>Fit venues</button>
            <button class="button secondary" id="trackLocationButton">◎ Track my location</button>
          </div>
        </div>
        <div id="venueMap" class="venue-map osm-map"></div>
        <div class="location-privacy-note" id="locationPrivacyNote">Your live location stays on this device and is never broadcast to collaborators.</div>
      </div>
    </div></div>`;
    requestAnimationFrame(initVenueMap);
  };

  async function locateVenueEvent(eventId, button) {
    const ev = state.events.find(x => x.id === eventId);
    if (!ev) return;
    const query = normalizedQuery(ev.venueAddress || ev.venue);
    if (!query) return toast('Add an address to this event first');
    if (button) { button.disabled = true; button.textContent = 'Locating…'; }
    try {
      const point = await rateLimitedNominatimSearch(query);
      if (!point) return toast('No matching OpenStreetMap place found');
      state.events.filter(x => x.venue && x.venue.toLowerCase() === ev.venue.toLowerCase()).forEach(x => {
        x.venueLat = point.lat;
        x.venueLng = point.lng;
        if (!x.venueAddress) x.venueAddress = point.formattedAddress;
        x.venuePlaceId = `osm:${point.osmType || 'place'}:${point.osmId || point.placeId || ''}`;
      });
      save();
      venues();
      toast('Venue pinned on OpenStreetMap');
    } catch (err) {
      console.error(err);
      toast('Could not locate that venue right now');
    } finally {
      if (button && document.body.contains(button)) { button.disabled = false; button.textContent = 'Locate'; }
    }
  }

  function showVenueOnMap(name) {
    const marker = venueMarkers.get(name);
    if (!marker || !osmMap) return;
    osmMap.flyTo(marker.getLatLng(), Math.max(osmMap.getZoom(), 16), { animate: true, duration: .5 });
    marker.openPopup();
  }

  function stopLocationTracking(removeMarker = false) {
    if (geoWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
    followUser = true;
    const button = document.getElementById('trackLocationButton');
    if (button) button.textContent = '◎ Track my location';
    const note = document.getElementById('locationPrivacyNote');
    if (note) note.textContent = 'Your live location stays on this device and is never broadcast to collaborators.';
    if (removeMarker && osmMap) {
      if (userMarker) osmMap.removeLayer(userMarker);
      if (userAccuracy) osmMap.removeLayer(userAccuracy);
      userMarker = userAccuracy = null;
    }
  }

  function updateUserLocation(position) {
    if (!osmMap || view !== 'venues') return;
    const latlng = [position.coords.latitude, position.coords.longitude];
    const accuracy = Math.max(1, position.coords.accuracy || 1);
    if (!userAccuracy) userAccuracy = L.circle(latlng, { radius: accuracy, className: 'msc-location-accuracy', interactive: false }).addTo(osmMap);
    else userAccuracy.setLatLng(latlng).setRadius(accuracy);
    if (!userMarker) userMarker = L.circleMarker(latlng, { radius: 7, className: 'msc-user-location', weight: 3, fillOpacity: 1 }).bindTooltip('You · local only', { direction: 'top', offset: [0, -8] }).addTo(osmMap);
    else userMarker.setLatLng(latlng);
    if (followUser) {
      osmMap.flyTo(latlng, Math.max(osmMap.getZoom(), 16), { animate: true, duration: .45 });
      followUser = false;
    }
    const note = document.getElementById('locationPrivacyNote');
    if (note) note.textContent = `Location active · accuracy about ${Math.round(accuracy)} m · visible only to you.`;
  }

  function toggleLocationTracking() {
    if (geoWatchId !== null) {
      stopLocationTracking(false);
      return;
    }
    if (!navigator.geolocation) return toast('Location is not supported by this browser');
    const button = document.getElementById('trackLocationButton');
    if (button) button.textContent = 'Stop tracking';
    const note = document.getElementById('locationPrivacyNote');
    if (note) note.textContent = 'Waiting for browser location permission…';
    followUser = true;
    geoWatchId = navigator.geolocation.watchPosition(updateUserLocation, err => {
      const message = err.code === 1 ? 'Location permission was not granted.' : 'Location tracking is unavailable.';
      const noteEl = document.getElementById('locationPrivacyNote');
      if (noteEl) noteEl.textContent = `${message} Nothing was shared.`;
      stopLocationTracking(false);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
  }

  const originalOpenEvent = typeof openEvent === 'function' ? openEvent : null;
  if (originalOpenEvent) {
    openEvent = function(e = null, pos = null) {
      originalOpenEvent(e, pos);
      requestAnimationFrame(() => {
        mountOsmVenueTools();
        const form = document.getElementById('eventForm');
        if (!form) return;
        ensureHiddenVenueFields(form);
        const item = e || draft;
        if (item) {
          form.elements.venueLat.value = item.venueLat || '';
          form.elements.venueLng.value = item.venueLng || '';
          form.elements.venuePlaceId.value = item.venuePlaceId || '';
        }
      });
    };
  }

  const originalSetView = typeof setView === 'function' ? setView : null;
  if (originalSetView) {
    setView = function(v, announce = true) {
      const leavingVenues = typeof view !== 'undefined' && view === 'venues' && v !== 'venues';
      if (leavingVenues) stopLocationTracking(true);
      originalSetView(v, announce);
    };
  }

  document.addEventListener('click', e => {
    const find = e.target.closest('#osmFindVenue');
    if (find) { e.preventDefault(); findVenueFromDrawer(); return; }
    const current = e.target.closest('#osmUseCurrentLocation');
    if (current) { e.preventDefault(); useCurrentLocationInDrawer(); return; }
    const clear = e.target.closest('#osmClearVenueLocation');
    if (clear) { e.preventDefault(); clearDrawerLocation(); return; }
    const track = e.target.closest('#trackLocationButton');
    if (track) { e.preventDefault(); toggleLocationTracking(); return; }
    const fit = e.target.closest('#fitVenueMap');
    if (fit && osmMap) { e.preventDefault(); fitVenueMarkers(); return; }
    const locate = e.target.closest('[data-osm-locate-event]');
    if (locate) { e.preventDefault(); locateVenueEvent(locate.dataset.osmLocateEvent, locate); return; }
    const show = e.target.closest('[data-osm-show-venue]');
    if (show) { e.preventDefault(); showVenueOnMap(show.dataset.osmShowVenue); return; }
    const open = e.target.closest('[data-osm-open-event]');
    if (open) {
      e.preventDefault();
      const ev = state.events.find(x => x.id === open.dataset.osmOpenEvent);
      if (ev) openEvent(ev);
    }
  }, true);

  if (typeof render === 'function') render();
  if (typeof setView === 'function') setView(view, false);
})();
