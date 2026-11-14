(function (root) {
  'use strict';

  const ROUTING_BASE = 'https://router.project-osrm.org/route/v1/driving/';
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const DEFAULT_CORRIDOR_METERS = 30;
  const SIGNAL_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
  const MAX_SIGNAL_QUERIES_PER_DAY = 10;
  const SIGNAL_QUERY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const inFlightSignalQueries = new Map();
  let memorySignalQueryTimes = [];

  function isCoordinate(point) {
    return Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) &&
      Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90;
  }

  function haversine(a, b) {
    const radians = value => value * Math.PI / 180;
    const lat1 = radians(a[1]);
    const lat2 = radians(b[1]);
    const dLat = lat2 - lat1;
    const dLng = radians(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function cumulativeDistances(coordinates) {
    const cumulative = [0];
    for (let i = 1; i < coordinates.length; i += 1) {
      cumulative.push(cumulative[i - 1] + haversine(coordinates[i - 1], coordinates[i]));
    }
    return cumulative;
  }

  function routeError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function fetchDrivingRoute(from, to, options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || root.fetch;
    if (!isCoordinate(from) || !isCoordinate(to)) {
      throw routeError('Choose valid source and destination coordinates.', 'INVALID_COORDINATE');
    }
    if (typeof fetchImpl !== 'function') {
      throw routeError('Road routing is unavailable in this browser.', 'SERVICE_UNAVAILABLE');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs || 15000);
    const url = ROUTING_BASE + `${Number(from[0])},${Number(from[1])};${Number(to[0])},${Number(to[1])}` +
      '?overview=full&geometries=geojson&alternatives=false&steps=false';

    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw routeError('The road-routing service could not be reached. Try again shortly.', 'HTTP_ERROR');
      let payload;
      try { payload = await response.json(); }
      catch (_) { throw routeError('The routing service returned an unreadable response. No route was drawn.', 'INVALID_ROUTE'); }
      const route = payload && payload.code === 'Ok' && Array.isArray(payload.routes) ? payload.routes[0] : null;
      const coordinates = route && route.geometry && route.geometry.type === 'LineString'
        ? route.geometry.coordinates : null;
      if (!route || !Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(isCoordinate)) {
        const message = payload && payload.code === 'NoRoute'
          ? 'No drivable road route was found between those locations.'
          : 'The routing service returned an invalid route. No route was drawn.';
        throw routeError(message, payload && payload.code || 'INVALID_ROUTE');
      }
      if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
        throw routeError('The routing service did not return a usable distance and duration.', 'INVALID_ROUTE');
      }
      return { coordinates, distanceM: route.distance, durationSec: route.duration, source: 'OSRM' };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw routeError('Road routing timed out. Check your connection and try again.', 'TIMEOUT');
      }
      if (error instanceof TypeError) {
        throw routeError('Road routing is temporarily unavailable. Check your connection and try again.', 'NETWORK_ERROR');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function routeBounds(coordinates, paddingMeters) {
    const valid = coordinates.filter(isCoordinate);
    if (!valid.length) throw routeError('The route has no usable geometry.', 'INVALID_ROUTE');
    const lons = valid.map(point => Number(point[0]));
    const lats = valid.map(point => Number(point[1]));
    const middleLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const padLat = (paddingMeters || 250) / 111320;
    const padLng = (paddingMeters || 250) / Math.max(10000, 111320 * Math.cos(middleLat * Math.PI / 180));
    return {
      south: Math.min(...lats) - padLat,
      west: Math.min(...lons) - padLng,
      north: Math.max(...lats) + padLat,
      east: Math.max(...lons) + padLng
    };
  }

  function boundsCacheKey(bounds) {
    return [bounds.south, bounds.west, bounds.north, bounds.east]
      .map(value => Number(value).toFixed(3)).join(',');
  }

  function readCachedElements(storage, key) {
    if (!storage) return null;
    try {
      const entry = JSON.parse(storage.getItem(`signalx:osm-signals:${key}`) || 'null');
      if (entry && Date.now() - entry.savedAt < SIGNAL_CACHE_TTL_MS && Array.isArray(entry.elements)) {
        return entry.elements;
      }
    } catch (_) { /* Storage may be disabled or full; proceed without it. */ }
    return null;
  }

  function writeCachedElements(storage, key, elements) {
    if (!storage) return;
    try {
      storage.setItem(`signalx:osm-signals:${key}`, JSON.stringify({ savedAt: Date.now(), elements }));
    } catch (_) { /* Storage may be disabled or full; the live result remains usable. */ }
  }

  function reserveSignalQuery(storage) {
    const now = Date.now();
    const storageKey = 'signalx:osm-signal-query-times';
    let times = memorySignalQueryTimes;
    if (storage) {
      try {
        const saved = JSON.parse(storage.getItem(storageKey) || 'null');
        if (Array.isArray(saved)) times = saved;
      } catch (_) { /* Use the in-memory limit when storage is unavailable. */ }
    }
    times = times.filter(timestamp => Number.isFinite(timestamp) && now - timestamp < SIGNAL_QUERY_WINDOW_MS);
    if (times.length >= MAX_SIGNAL_QUERIES_PER_DAY) {
      throw routeError('Signal lookup has reached this browser session’s daily request limit. The road route is still available.', 'SIGNAL_RATE_LIMIT');
    }
    times.push(now);
    memorySignalQueryTimes = times;
    if (storage) {
      try { storage.setItem(storageKey, JSON.stringify(times)); }
      catch (_) { /* Keep the in-memory limit if storage is disabled or full. */ }
    }
  }

  async function fetchOsmSignalNodes(bounds, options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || root.fetch;
    let storage = settings.storage;
    if (!Object.prototype.hasOwnProperty.call(settings, 'storage')) {
      try { storage = root.sessionStorage; } catch (_) { storage = null; }
    }
    const key = boundsCacheKey(bounds);
    const cached = readCachedElements(storage, key);
    if (cached) return cached;
    if (inFlightSignalQueries.has(key)) return inFlightSignalQueries.get(key);
    if (typeof fetchImpl !== 'function') throw routeError('OpenStreetMap signal lookup is unavailable.', 'SIGNAL_SERVICE_UNAVAILABLE');
    reserveSignalQuery(storage);

    const query = `[out:json][timeout:12];node["highway"="traffic_signals"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out body;`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs || 15000);
    const request = (async () => {
      try {
        const response = await fetchImpl(settings.overpassUrl || OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        if (!response.ok) {
          const error = routeError(response.status === 429
            ? 'OpenStreetMap signal lookup is rate limited. Wait briefly and try again.'
            : 'OpenStreetMap signal data is temporarily unavailable.', 'SIGNAL_HTTP_ERROR');
          error.status = response.status;
          throw error;
        }
        let payload;
        try { payload = await response.json(); }
        catch (_) { throw routeError('OpenStreetMap returned an unreadable signal-data response.', 'INVALID_SIGNAL_DATA'); }
        if (!payload || !Array.isArray(payload.elements)) {
          throw routeError('OpenStreetMap returned an invalid signal-data response.', 'INVALID_SIGNAL_DATA');
        }
        const elements = payload.elements.filter(element => element && element.type === 'node' &&
          element.tags && element.tags.highway === 'traffic_signals' &&
          Number.isFinite(element.lat) && Number.isFinite(element.lon));
        writeCachedElements(storage, key, elements);
        return elements;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          throw routeError('OpenStreetMap signal lookup timed out. The road route is still available.', 'SIGNAL_TIMEOUT');
        }
        if (error instanceof TypeError) {
          throw routeError('OpenStreetMap signal lookup failed. The road route is still available.', 'SIGNAL_NETWORK_ERROR');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        inFlightSignalQueries.delete(key);
      }
    })();
    inFlightSignalQueries.set(key, request);
    return request;
  }

  function projectPointToRoute(point, coordinates, cumulative) {
    if (!isCoordinate(point) || !Array.isArray(coordinates) || coordinates.length < 2) return null;
    const distances = cumulative || cumulativeDistances(coordinates);
    const pointLat = Number(point[1]);
    let best = null;
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      const a = coordinates[i];
      const b = coordinates[i + 1];
      const meanLat = (pointLat + Number(a[1]) + Number(b[1])) / 3;
      const metersPerLng = 111320 * Math.cos(meanLat * Math.PI / 180);
      const metersPerLat = 111320;
      const ax = (Number(a[0]) - Number(point[0])) * metersPerLng;
      const ay = (Number(a[1]) - pointLat) * metersPerLat;
      const bx = (Number(b[0]) - Number(point[0])) * metersPerLng;
      const by = (Number(b[1]) - pointLat) * metersPerLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
      const offsetX = ax + dx * fraction;
      const offsetY = ay + dy * fraction;
      const distanceM = Math.hypot(offsetX, offsetY);
      const segmentLength = distances[i + 1] - distances[i];
      const candidate = {
        distanceFromRouteM: distanceM,
        distanceAlongM: distances[i] + segmentLength * fraction,
        snappedCoordinate: [
          Number(a[0]) + (Number(b[0]) - Number(a[0])) * fraction,
          Number(a[1]) + (Number(b[1]) - Number(a[1])) * fraction
        ]
      };
      if (!best || candidate.distanceFromRouteM < best.distanceFromRouteM) best = candidate;
    }
    return best;
  }

  function matchSignalsToRoute(elements, coordinates, toleranceMeters, dedupeMeters) {
    const tolerance = Number.isFinite(toleranceMeters) ? toleranceMeters : DEFAULT_CORRIDOR_METERS;
    const dedupe = Number.isFinite(dedupeMeters) ? dedupeMeters : 22;
    const cumulative = cumulativeDistances(coordinates);
    const matches = [];
    (elements || []).forEach(element => {
      if (!element || element.type !== 'node' || !element.tags || element.tags.highway !== 'traffic_signals' ||
          !Number.isFinite(element.lat) || !Number.isFinite(element.lon)) return;
      const projected = projectPointToRoute([element.lon, element.lat], coordinates, cumulative);
      if (!projected || projected.distanceFromRouteM > tolerance) return;
      const signal = {
        id: String(element.id),
        lat: element.lat,
        lng: element.lon,
        name: element.tags.name || element.tags.ref || '',
        routeDistanceM: projected.distanceAlongM,
        routeOffsetM: projected.distanceFromRouteM,
        tags: element.tags
      };
      const duplicateIndex = matches.findIndex(existing =>
        haversine([existing.lng, existing.lat], [signal.lng, signal.lat]) <= dedupe);
      if (duplicateIndex === -1) matches.push(signal);
      else if (signal.routeOffsetM < matches[duplicateIndex].routeOffsetM) matches[duplicateIndex] = signal;
    });
    return matches.sort((a, b) => a.routeDistanceM - b.routeDistanceM);
  }

  async function fetchSignalsAlongRoute(coordinates, options) {
    const settings = options || {};
    const bounds = routeBounds(coordinates, settings.paddingMeters || 250);
    const area = (bounds.north - bounds.south) * (bounds.east - bounds.west);
    if (area > (settings.maxBoundsArea || 0.1)) {
      throw routeError('This route covers too large an area for a responsible public signal-data lookup.', 'SIGNAL_AREA_TOO_LARGE');
    }
    const nodes = await fetchOsmSignalNodes(bounds, settings);
    return matchSignalsToRoute(nodes, coordinates,
      settings.toleranceMeters === undefined ? DEFAULT_CORRIDOR_METERS : settings.toleranceMeters,
      settings.dedupeMeters);
  }

  function coordinateAtDistance(coordinates, distanceM, cumulative) {
    const distances = cumulative || cumulativeDistances(coordinates);
    if (!coordinates.length) return null;
    if (distanceM <= 0) return coordinates[0].slice();
    const lastIndex = coordinates.length - 1;
    if (distanceM >= distances[lastIndex]) return coordinates[lastIndex].slice();
    for (let i = 0; i < lastIndex; i += 1) {
      if (distanceM <= distances[i + 1]) {
        const length = distances[i + 1] - distances[i];
        const fraction = length === 0 ? 0 : (distanceM - distances[i]) / length;
        return [
          coordinates[i][0] + (coordinates[i + 1][0] - coordinates[i][0]) * fraction,
          coordinates[i][1] + (coordinates[i + 1][1] - coordinates[i][1]) * fraction
        ];
      }
    }
    return coordinates[lastIndex].slice();
  }

  const api = {
    DEFAULT_CORRIDOR_METERS,
    ROUTING_BASE,
    OVERPASS_URL,
    isCoordinate,
    haversine,
    cumulativeDistances,
    routeBounds,
    fetchDrivingRoute,
    fetchOsmSignalNodes,
    fetchSignalsAlongRoute,
    matchSignalsToRoute,
    projectPointToRoute,
    coordinateAtDistance
  };
  root.SignalXRoute = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
