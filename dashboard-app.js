(function () {
  'use strict';

  const routeApi = window.SignalXRoute;
  const map = L.map('map').setView([28.655, 77.15], 12);
  const tileErrorNotice = document.getElementById('map-tile-error');
  const osmTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);
  let tileErrorsInCurrentLoad = 0;
  osmTiles.on('loading', () => { tileErrorsInCurrentLoad = 0; });
  osmTiles.on('tileerror', () => { tileErrorsInCurrentLoad += 1; });
  osmTiles.on('load', () => { tileErrorNotice.hidden = tileErrorsInCurrentLoad === 0; });

  const srcInput = document.getElementById('src-input');
  const dstInput = document.getElementById('dst-input');
  const goButton = document.getElementById('go-btn');
  let allJunctions = [];
  let sourceSelection = null;
  let destinationSelection = null;
  let routeData = null;
  let routeSignals = [];
  let routeLineLayers = [];
  let signalMarkers = [];
  let endpointMarkers = [];
  let vehicleMarker = null;
  let userMarker = null;
  let userLat = null;
  let userLng = null;
  let userSpeedKmph = null;
  let gpsOnRoute = false;
  let gpsTracking = false;
  let watchId = null;
  let routeProgressM = 0;
  let routeRequestId = 0;
  let lastRoutingRequestAt = 0;
  const routeCache = new Map();
  const SIMULATED_SPEED_KMPH = 32;
  const MAX_CACHED_ROUTES = 40;
  const indiaTimeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const routeCumulative = () => routeData ? routeApi.cumulativeDistances(routeData.coordinates) : [];

  function currentIndiaMinutes(date) {
    const parts = Object.fromEntries(indiaTimeFormatter.formatToParts(date).map(part => [part.type, part.value]));
    return Number(parts.hour) * 60 + Number(parts.minute);
  }

  function cacheRoute(key, route) {
    routeCache.delete(key);
    routeCache.set(key, { savedAt: Date.now(), route });
    while (routeCache.size > MAX_CACHED_ROUTES) {
      routeCache.delete(routeCache.keys().next().value);
    }
  }

  function setRouteMessage(message, isError) {
    const element = document.getElementById('route-status');
    element.textContent = message || '';
    element.classList.toggle('error', Boolean(isError));
  }

  function setEndpointSelection(type, junction) {
    const selection = {
      label: `${junction.junction_code} — ${junction.junction_name || junction.junction_code}`,
      code: junction.junction_code,
      coordinates: [Number(junction.lng), Number(junction.lat)]
    };
    if (type === 'src') {
      sourceSelection = selection;
      srcInput.value = selection.label;
    } else {
      destinationSelection = selection;
      dstInput.value = selection.label;
    }
  }

  function parseCoordinateInput(value) {
    const match = String(value).trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    const coordinates = [lng, lat];
    return routeApi.isCoordinate(coordinates) ? { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, coordinates } : null;
  }

  function selectedEndpoint(type) {
    const input = type === 'src' ? srcInput : dstInput;
    const selected = type === 'src' ? sourceSelection : destinationSelection;
    if (selected && input.value === selected.label) return selected;
    return parseCoordinateInput(input.value);
  }

  function hideSug(id) { document.getElementById(id).style.display = 'none'; }

  window.handleInputChange = function (type) {
    if (type === 'src') sourceSelection = null;
    else destinationSelection = null;
    routeRequestId += 1;
    goButton.disabled = false;
    goButton.textContent = '▶ GO';
  };

  window.showSug = function (query, boxId, type) {
    const box = document.getElementById(boxId);
    box.replaceChildren();
    const normalized = String(query || '').trim().toLowerCase();
    if (normalized.length < 2) { box.style.display = 'none'; return; }
    const matches = allJunctions.filter(junction =>
      (junction.junction_name || '').toLowerCase().includes(normalized) ||
      (junction.junction_code || '').toLowerCase().includes(normalized)
    ).slice(0, 8);
    matches.forEach(junction => {
      const item = document.createElement('div');
      item.className = 'sug-item';
      item.addEventListener('mousedown', () => {
        setEndpointSelection(type, junction);
        hideSug(boxId);
      });
      const code = document.createElement('b');
      code.textContent = junction.junction_code || '';
      const name = document.createTextNode(junction.junction_name || 'Unnamed junction');
      const district = document.createElement('small');
      district.textContent = junction.district || '';
      item.append(code, name, district);
      box.appendChild(item);
    });
    box.style.display = matches.length ? 'block' : 'none';
  };

  window.hideSug = hideSug;

  function clearRouteLayers() {
    routeLineLayers.forEach(layer => map.removeLayer(layer));
    signalMarkers.forEach(marker => map.removeLayer(marker));
    endpointMarkers.forEach(marker => map.removeLayer(marker));
    routeLineLayers = [];
    signalMarkers = [];
    endpointMarkers = [];
    if (vehicleMarker) { map.removeLayer(vehicleMarker); vehicleMarker = null; }
  }

  function resetRouteView() {
    clearRouteLayers();
    routeData = null;
    routeSignals = [];
    routeProgressM = 0;
    document.getElementById('corridor-title').textContent = 'ROAD ROUTE';
    document.getElementById('corridor-sub').textContent = 'Select source and destination, then press GO';
    document.getElementById('corridor-count').textContent = '';
    document.getElementById('junction-list').replaceChildren();
    document.getElementById('junction-list').style.display = 'none';
    document.getElementById('list-header').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('next-box').style.display = 'none';
    document.getElementById('stat-speed').textContent = '--';
    document.getElementById('stat-signal').textContent = '--';
    document.getElementById('stat-dist').textContent = '--';
    document.getElementById('stat-rec').textContent = '--';
  }

  function drawRoadRoute(from, to) {
    const latLngs = routeData.coordinates.map(point => [point[1], point[0]]);
    // Keep every OSRM road vertex so the layered animation follows each bend
    // instead of drawing a visual shortcut between route endpoints.
    const routeLine = (className, options) => L.polyline(latLngs, {
      ...options, className, lineCap: 'round', lineJoin: 'round', interactive: false
    }).addTo(map);
    routeLineLayers.push(routeLine('route-line-glow', { color: '#26c6da', weight: 18, opacity: 0.2 }));
    routeLineLayers.push(routeLine('route-line-casing', { color: '#06172a', weight: 10, opacity: 0.96 }));
    const routeCore = routeLine('route-line-core route-line-reveal', { color: '#4fc3f7', weight: 5, opacity: 0.98 });
    routeLineLayers.push(routeCore);
    routeLineLayers.push(routeLine('route-line-flow', {
      color: '#e1f8ff', weight: 2, opacity: 0.95, dashArray: '1 16', dashOffset: '0'
    }));
    const routePath = routeCore.getElement();
    if (routePath && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const pathLength = routePath.getTotalLength();
      routePath.style.strokeDasharray = `${pathLength}`;
      routePath.style.strokeDashoffset = `${pathLength}`;
      requestAnimationFrame(() => { routePath.style.strokeDashoffset = '0'; });
    }
    const addEndpoint = (coordinate, title, color) => {
      const marker = L.circleMarker([coordinate[1], coordinate[0]], {
        radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1
      }).addTo(map).bindPopup(title);
      endpointMarkers.push(marker);
    };
    addEndpoint(routeData.coordinates[0], `Route start: ${from.label}`, '#00e676');
    addEndpoint(routeData.coordinates[routeData.coordinates.length - 1], `Route destination: ${to.label}`, '#ffab00');
    if (vehicleMarker) map.removeLayer(vehicleMarker);
    const start = routeData.coordinates[0];
    vehicleMarker = L.circleMarker([start[1], start[0]], {
      radius: 8, color: '#fff', fillColor: '#4fc3f7', fillOpacity: 1, weight: 2
    }).addTo(map).bindPopup('Demo vehicle (GPS position is used when enabled)');
    map.fitBounds(L.latLngBounds(latLngs), { padding: [35, 35], maxZoom: 15 });
  }

  function matchingDatasetRecord(signal) {
    let nearest = null;
    let nearestDistance = 35;
    allJunctions.forEach(junction => {
      if (!Number.isFinite(Number(junction.lat)) || !Number.isFinite(Number(junction.lng))) return;
      const distance = routeApi.haversine([signal.lng, signal.lat], [Number(junction.lng), Number(junction.lat)]);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = junction; }
    });
    return nearest;
  }

  function enrichSignals(signals) {
    return signals.map(signal => {
      const datasetRecord = matchingDatasetRecord(signal);
      const planRecord = datasetRecord && Array.isArray(datasetRecord.plans) && datasetRecord.plans.length
        ? datasetRecord : null;
      return {
        ...signal,
        datasetRecord,
        planRecord,
        displayName: signal.name || (datasetRecord && datasetRecord.junction_name) || 'OSM traffic signal',
        code: datasetRecord && datasetRecord.junction_code || ''
      };
    });
  }

  function getActivePlan(signal) {
    if (!signal || !signal.planRecord) return null;
    const currentMinutes = currentIndiaMinutes(new Date());
    const parseTime = value => {
      const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return null;
      return hours * 60 + minutes;
    };
    for (const plan of signal.planRecord.plans) {
      const start = parseTime(plan.slot_start);
      const end = parseTime(plan.slot_end);
      if (start === null || end === null) continue;
      if ((start <= end && currentMinutes >= start && currentMinutes < end) ||
          (start > end && (currentMinutes >= start || currentMinutes < end))) return plan;
    }
    return null;
  }

  function planTimings(plan) {
    if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) return null;
    const cycle = Number(plan.total_cycle_sec);
    const phases = plan.phases.map(Number);
    if (!Number.isFinite(cycle) || cycle <= 0 ||
        phases.some(value => !Number.isFinite(value) || value <= 0) ||
        phases.reduce((total, value) => total + value, 0) > cycle) return null;
    return { cycle, phases };
  }

  function simulatedSignalPhase(plan) {
    const timings = planTimings(plan);
    if (!timings) return null;
    const { cycle, phases: phaseLengths } = timings;
    const position = Math.floor(Date.now() / 1000) % cycle;
    let elapsed = 0;
    for (let index = 0; index < phaseLengths.length; index += 1) {
      const phaseEnd = elapsed + phaseLengths[index];
      if (position < phaseEnd) {
        return { isGreen: index === 0, remaining: Math.ceil(phaseEnd - position), phase: index + 1, cycle, greenSeconds: phaseLengths[0] };
      }
      elapsed = phaseEnd;
    }
    return null;
  }

  function recommendation(distanceM, plan) {
    const timings = planTimings(plan);
    if (!timings || !Number.isFinite(distanceM) || distanceM <= 0) return null;
    const { cycle, phases } = timings;
    const nowPosition = Math.floor(Date.now() / 1000) % cycle;
    const possible = [];
    for (let speed = 15; speed <= 80; speed += 1) {
      const arrival = (nowPosition + distanceM / (speed / 3.6)) % cycle;
      if (arrival < phases[0]) possible.push(speed);
    }
    if (!possible.length) return { badge: 'stop', kmph: 0, color: '#ff1744', arriveGreen: false };
    const best = possible.reduce((a, b) => Math.abs(a - 40) <= Math.abs(b - 40) ? a : b);
    const badge = best <= 25 ? 'slow' : 'go';
    return { badge, kmph: best, color: badge === 'go' ? '#00e676' : '#8b6517', arriveGreen: true };
  }

  function nextSignal() {
    return routeSignals.find(signal => signal.routeDistanceM > routeProgressM + 8) || null;
  }

  function signalPhaseText(signal, phase) {
    if (!signal.planRecord) return 'OSM verified signal · phase timing unavailable';
    if (!phase) return 'Modeled phase unavailable for this time';
    return `SIMULATED ${phase.isGreen ? 'GREEN' : 'RED'} · ${phase.remaining}s left`;
  }

  function makeSignalMarker(signal, phase) {
    const color = phase ? (phase.isGreen ? '#217443' : '#ad3c42') : '#8b6517';
    const marker = L.circleMarker([signal.lat, signal.lng], {
      radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95
    }).addTo(map);
    const label = signal.code ? `${signal.code} — ${signal.displayName}` : signal.displayName;
    marker.bindPopup(`<b>${escapeHtml(label)}</b><br>${escapeHtml(signalPhaseText(signal, phase))}<br>OSM traffic signal node`);
    marker.on('click', () => {
      const row = Array.from(document.querySelectorAll('.jrow')).find(item => item.dataset.signalId === signal.id);
      if (row) row.scrollIntoView({ block: 'nearest' });
    });
    signalMarkers.push(marker);
    return marker;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function renderSignalList() {
    const list = document.getElementById('junction-list');
    list.replaceChildren();
    routeSignals.forEach((signal, index) => {
      const passed = signal.routeDistanceM <= routeProgressM + 8;
      const plan = getActivePlan(signal);
      const phase = simulatedSignalPhase(plan);
      const rec = !passed && plan ? recommendation(signal.routeDistanceM - routeProgressM, plan) : null;
      const status = passed ? 'PASSED' : phase ? (phase.isGreen ? 'SIM GREEN' : 'SIM RED') : 'SIGNAL';
      const color = passed ? '#777' : rec ? rec.color : phase ? (phase.isGreen ? '#217443' : '#ad3c42') : '#8b6517';
      const distance = Math.max(0, Math.round(signal.routeDistanceM - routeProgressM));
      const row = document.createElement('div');
      row.className = `jrow${signal === nextSignal() ? ' is-next' : ''}`;
      row.dataset.signalId = signal.id;
      row.innerHTML = `<div class="col-num">${String(index + 1).padStart(2, '0')}</div>
        <div class="col-name"><div class="jname">${escapeHtml(signal.code ? `${signal.code} — ${signal.displayName}` : signal.displayName)}</div>
        <div class="jcode">OSM tagged traffic signal${phase ? ' · phase is simulated' : ' · no timing data'}</div></div>
        <div class="col-stat"><span class="badge ${rec ? rec.badge : 'slow'}" style="${rec ? '' : 'background:rgba(255,171,0,.12);color:#ffab00;border-color:#ffab00'}">${status}</span></div>
        <div class="col-time" style="color:${color}">${passed ? '—' : `${distance}m`}</div>`;
      row.addEventListener('click', () => map.setView([signal.lat, signal.lng], 17));
      list.appendChild(row);
      const marker = signalMarkers[index] || makeSignalMarker(signal, phase);
      marker.setStyle({ fillColor: passed ? '#777' : phase ? (phase.isGreen ? '#217443' : '#ad3c42') : '#8b6517' });
      marker.setPopupContent(`<b>${escapeHtml(signal.code ? `${signal.code} — ${signal.displayName}` : signal.displayName)}</b><br>${escapeHtml(signalPhaseText(signal, phase))}<br>OSM traffic signal node`);
    });
    while (signalMarkers.length > routeSignals.length) map.removeLayer(signalMarkers.pop());
  }

  function renderRouteStatus(message) {
    document.getElementById('corridor-count').textContent =
      `${routeSignals.length} OSM-mapped signal${routeSignals.length === 1 ? '' : 's'} on this route`;
    setRouteMessage(message || 'Signal phase panels are simulated; live signal-controller data is not connected.', false);
  }

  window.selectSug = function (code, boxId, type) {
    const junction = allJunctions.find(item => item.junction_code === code);
    if (junction) setEndpointSelection(type, junction);
    hideSug(boxId);
  };

  window.goRoute = async function () {
    const from = selectedEndpoint('src');
    const to = selectedEndpoint('dst');
    if (!from || !to) {
      setRouteMessage('Choose a listed junction or enter coordinates as latitude, longitude for both endpoints.', true);
      return;
    }
    if (from.coordinates[0] === to.coordinates[0] && from.coordinates[1] === to.coordinates[1]) {
      setRouteMessage('Source and destination must be different locations.', true);
      return;
    }

    const requestId = ++routeRequestId;
    resetRouteView();
    setRouteMessage('Requesting a drivable road route…');
    goButton.disabled = true;
    goButton.textContent = 'ROUTING…';
    try {
      const routeKey = `${from.coordinates.join(',')}>${to.coordinates.join(',')}`;
      const cached = routeCache.get(routeKey);
      const cacheAge = cached && Date.now() - cached.savedAt;
      if (cached && Number.isFinite(cached.savedAt) && cacheAge >= 0 && cacheAge < 5 * 60 * 1000) {
        routeData = cached.route;
        cacheRoute(routeKey, cached.route);
      } else {
        routeCache.delete(routeKey);
        const waitMs = Math.max(0, 1000 - (Date.now() - lastRoutingRequestAt));
        if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
        if (requestId !== routeRequestId) return;
        lastRoutingRequestAt = Date.now();
        routeData = await routeApi.fetchDrivingRoute(from.coordinates, to.coordinates);
        cacheRoute(routeKey, routeData);
      }
      if (requestId !== routeRequestId) return;
      routeData.cumulative = routeCumulative();
      routeProgressM = 0;
      if (gpsTracking && userLat !== null && userLng !== null) {
        const snapped = routeApi.projectPointToRoute([userLng, userLat], routeData.coordinates, routeData.cumulative);
        gpsOnRoute = Boolean(snapped && snapped.distanceFromRouteM <= 100);
        if (gpsOnRoute) routeProgressM = Math.min(routeData.distanceM, snapped.distanceAlongM);
      }
      drawRoadRoute(from, to);
      document.getElementById('empty-state').style.display = 'none';
      document.getElementById('list-header').style.display = 'flex';
      document.getElementById('junction-list').style.display = 'block';
      document.getElementById('next-box').style.display = 'block';
      document.getElementById('corridor-title').textContent = `${from.label} → ${to.label}`;
      document.getElementById('corridor-sub').textContent =
        `${(routeData.distanceM / 1000).toFixed(1)} km · OSRM estimate ${Math.max(1, Math.round(routeData.durationSec / 60))} min`;
      document.getElementById('corridor-count').textContent = 'Road route ready · checking mapped traffic signals…';
      setRouteMessage(gpsOnRoute
        ? 'Road route ready. GPS route tracking is active; looking up OSM-tagged traffic signals…'
        : 'The line follows OSRM road geometry. Looking up OSM-tagged traffic signals…');
      try {
        const signals = await routeApi.fetchSignalsAlongRoute(routeData.coordinates, {
          toleranceMeters: routeApi.DEFAULT_CORRIDOR_METERS,
          paddingMeters: 250
        });
        if (requestId !== routeRequestId) return;
        routeSignals = enrichSignals(signals);
        renderSignalList();
        const signalMessage = routeSignals.length
          ? `Only OSM nodes explicitly tagged highway=traffic_signals and within ${routeApi.DEFAULT_CORRIDOR_METERS} m of this route are listed. Any phase shown is simulated from the local timing dataset; it is not live controller data.`
          : `No OSM-tagged traffic signals were matched within ${routeApi.DEFAULT_CORRIDOR_METERS} m of this route. No signals are inferred from nearby junctions.`;
        renderRouteStatus(signalMessage);
        updateDashboard();
      } catch (signalError) {
        if (requestId !== routeRequestId) return;
        routeSignals = [];
        renderSignalList();
        document.getElementById('corridor-count').textContent = 'Road route ready · signal lookup unavailable';
        setRouteMessage(`${signalError.message} No junctions are being shown as confirmed signals.`, true);
        updateDashboard();
      }
    } catch (error) {
      if (requestId !== routeRequestId) return;
      resetRouteView();
      setRouteMessage(error.message || 'Routing failed. No route was drawn.', true);
    } finally {
      if (requestId === routeRequestId) {
        goButton.disabled = false;
        goButton.textContent = '▶ GO';
      }
    }
  };

  function updateDashboard() {
    if (!routeData) return;
    const next = nextSignal();
    const remaining = Math.max(0, routeData.distanceM - routeProgressM);
    document.getElementById('stat-speed').textContent = gpsTracking
      ? gpsOnRoute && userSpeedKmph !== null ? Math.round(userSpeedKmph) : '--'
      : SIMULATED_SPEED_KMPH;
    document.getElementById('stat-dist').textContent = Math.round(remaining);
    document.getElementById('stat-rec').textContent = '--';
    document.getElementById('speed-circle').style.borderColor = '#1684a0';
    document.getElementById('stat-rec').style.color = '#b84649';
    const name = document.getElementById('nb-name');
    const now = document.getElementById('nb-now');
    const time = document.getElementById('nb-time');
    const fill = document.getElementById('nb-fill');
    const cycleText = document.getElementById('nb-cycle');
    const arrival = document.getElementById('nb-arrive');
    if (!next) {
      document.getElementById('stat-signal').textContent = '--';
      document.getElementById('stat-signal').style.color = '#218251';
      name.textContent = routeProgressM >= routeData.distanceM ? 'Destination reached' : 'No next mapped signal';
      now.textContent = 'Status: OSM signal sequence';
      now.style.color = '#167d94';
      time.textContent = `Route left: ${Math.round(remaining)} m`;
      fill.style.width = '0%';
      cycleText.textContent = 'Signal phase: simulated only; no live controller data';
      arrival.textContent = routeProgressM >= routeData.distanceM ? 'End of selected route' : 'No verified next signal on this route';
      arrival.style.cssText = 'background:rgba(79,195,247,.12);color:#167d94;border:1px solid rgba(22,132,160,.25);font-size:11px;margin-top:8px;padding:5px 8px;border-radius:4px;text-align:center;font-weight:700;';
    } else {
      const distance = Math.max(0, next.routeDistanceM - routeProgressM);
      const plan = getActivePlan(next);
      const phase = simulatedSignalPhase(plan);
      const rec = plan ? recommendation(distance, plan) : null;
      document.getElementById('stat-signal').textContent = Math.round(distance);
      document.getElementById('stat-signal').style.color = '#218251';
      name.textContent = next.code ? `${next.code} — ${next.displayName}` : next.displayName;
      now.textContent = phase ? `SIMULATED ${phase.isGreen ? 'GREEN' : 'RED'}` : 'Phase timing unavailable';
      now.style.color = phase ? (phase.isGreen ? '#217443' : '#ad3c42') : '#8b6517';
      time.textContent = phase ? `Left: ${phase.remaining}s` : 'OSM mapped';
      fill.style.width = phase ? `${Math.min(100, phase.remaining / phase.cycle * 100)}%` : '0%';
      fill.style.background = phase && phase.isGreen ? '#217443' : '#ad3c42';
      cycleText.textContent = plan
        ? `SIMULATED cycle ${plan.total_cycle_sec}s · local schedule, not live controller data`
        : 'No local signal timing record matched';
      arrival.textContent = rec
        ? rec.arriveGreen ? `Demo estimate: ${rec.kmph} km/h may reach simulated green` : 'Demo estimate: no green arrival speed found'
        : 'No recommendation: verified signal timing is unavailable';
      arrival.style.cssText = 'background:rgba(79,195,247,.12);color:#3e5873;border:1px solid rgba(22,132,160,.25);font-size:11px;margin-top:8px;padding:5px 8px;border-radius:4px;text-align:center;font-weight:700;';
    }
    if (!gpsTracking) {
      document.getElementById('route-status').classList.remove('error');
      if (routeProgressM >= routeData.distanceM) setRouteMessage('Demo vehicle reached the destination. Enable GPS for route-position tracking.');
    }
    renderSignalList();
    if (vehicleMarker) {
      const point = routeApi.coordinateAtDistance(routeData.coordinates, routeProgressM, routeData.cumulative);
      vehicleMarker.setLatLng([point[1], point[0]]);
    }
  }

  function tick() {
    document.getElementById('clock').textContent = `🕐 ${indiaTimeFormatter.format(new Date())} IST`;
    if (!routeData) return;
    if (!gpsTracking) routeProgressM = Math.min(routeData.distanceM, routeProgressM + SIMULATED_SPEED_KMPH / 3.6);
    updateDashboard();
  }

  window.startGPS = function () {
    routeRequestId += 1;
    goButton.disabled = false;
    goButton.textContent = '▶ GO';
    const badge = document.getElementById('gps-badge');
    badge.className = 'searching';
    badge.textContent = '📡 Getting GPS…';
    if (!navigator.geolocation) {
      badge.className = 'error';
      badge.textContent = '❌ GPS unavailable';
      setRouteMessage('This browser does not support geolocation.', true);
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(position => {
      gpsTracking = true;
      userLat = position.coords.latitude;
      userLng = position.coords.longitude;
      sourceSelection = null;
      srcInput.value = `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`;
      userSpeedKmph = Number.isFinite(position.coords.speed) && position.coords.speed >= 0
        ? position.coords.speed * 3.6 : null;
      badge.className = 'active';
      badge.textContent = `✅ GPS ±${Math.round(position.coords.accuracy)}m`;
      if (userMarker) userMarker.setLatLng([userLat, userLng]);
      else userMarker = L.circleMarker([userLat, userLng], {
        radius: 9, color: '#fff', fillColor: '#4fc3f7', fillOpacity: 1, weight: 2
      }).addTo(map).bindPopup('Your GPS location');
      if (!routeData) map.setView([userLat, userLng], 14);
      if (routeData) {
        const snapped = routeApi.projectPointToRoute([userLng, userLat], routeData.coordinates, routeData.cumulative);
        gpsOnRoute = Boolean(snapped && snapped.distanceFromRouteM <= 100);
        if (gpsOnRoute) {
          routeProgressM = Math.min(routeData.distanceM, snapped.distanceAlongM);
          setRouteMessage('GPS route tracking active. Signal phases remain simulated; no live controller feed is connected.');
        } else {
          setRouteMessage('GPS is more than 100 m from this route. The last route position is retained; choose a route from your current location.', true);
        }
        updateDashboard();
      }
    }, error => {
      gpsTracking = false;
      gpsOnRoute = false;
      badge.className = 'error';
      badge.textContent = error.code === error.PERMISSION_DENIED ? '❌ GPS denied' : '❌ GPS error';
      setRouteMessage(error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. You can still use demo route progress.'
        : 'Could not read GPS position. Check location settings and try again.', true);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  };

  srcInput.addEventListener('blur', () => setTimeout(() => hideSug('src-sug'), 200));
  dstInput.addEventListener('blur', () => setTimeout(() => hideSug('dst-sug'), 200));
  [srcInput, dstInput].forEach(input => input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goRoute();
    }
  }));
  fetch('junctions_geocoded.json').then(response => {
    if (!response.ok) throw new Error('Could not load junctions_geocoded.json.');
    return response.json();
  }).then(data => {
    if (!Array.isArray(data)) throw new Error('Junction dataset must be a JSON array.');
    allJunctions = data.filter(item => routeApi.isCoordinate([Number(item.lng), Number(item.lat)]));
    setRouteMessage(`${allJunctions.length} mapped dataset locations loaded. Pick a suggestion or enter coordinates.`);
  }).catch(() => setRouteMessage('Junction dataset could not be loaded. Coordinate entry still works.', true));

  window.addEventListener('beforeunload', () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  });
  setInterval(tick, 1000);
})();
