const test = require('node:test');
const assert = require('node:assert/strict');
const SignalXRoute = require('./route-engine.js');

const curvedRoute = [
  [77.0000, 28.6000],
  [77.0100, 28.6000],
  [77.0100, 28.6100]
];

function signal(id, lon, lat, tags) {
  return { type: 'node', id, lon, lat, tags: tags || { highway: 'traffic_signals' } };
}

test('requests a full GeoJSON driving route and returns service distance and duration', async () => {
  let requestedUrl = '';
  const result = await SignalXRoute.fetchDrivingRoute([77, 28.6], [77.01, 28.61], {
    fetchImpl: async url => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{
          distance: 1500,
          duration: 240,
          geometry: { type: 'LineString', coordinates: curvedRoute }
        }] })
      };
    }
  });
  assert.match(requestedUrl, /overview=full/);
  assert.match(requestedUrl, /geometries=geojson/);
  assert.deepEqual(result.coordinates, curvedRoute);
  assert.equal(result.distanceM, 1500);
  assert.equal(result.durationSec, 240);
});

test('does not fabricate a route when OSRM returns NoRoute', async () => {
  await assert.rejects(
    SignalXRoute.fetchDrivingRoute([77, 28.6], [77.01, 28.61], {
      fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) })
    }),
    error => error.code === 'NoRoute' && /No drivable road route/.test(error.message)
  );
});

test('keeps reverse-direction coordinates in the requested order', async () => {
  let requestedUrl = '';
  await SignalXRoute.fetchDrivingRoute([77.2289, 28.6378], [77.0412, 28.6823], {
    fetchImpl: async url => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ code: 'Ok', routes: [{
        distance: 1200, duration: 180,
        geometry: { type: 'LineString', coordinates: [[77.2289, 28.6378], [77.22, 28.64]] }
      }] }) };
    }
  });
  assert.match(requestedUrl, /77\.2289,28\.6378;77\.0412,28\.6823/);
});

test('rejects invalid endpoints and unavailable routing services clearly', async () => {
  await assert.rejects(SignalXRoute.fetchDrivingRoute([181, 28], [77, 28], { fetchImpl: async () => {} }),
    error => error.code === 'INVALID_COORDINATE');
  await assert.rejects(SignalXRoute.fetchDrivingRoute([77, 28], [78, 28], {
    fetchImpl: async () => { throw new TypeError('offline'); }
  }), error => error.code === 'NETWORK_ERROR' && /temporarily unavailable/.test(error.message));
});

test('turns routing timeouts into a clear no-route error', async () => {
  await assert.rejects(SignalXRoute.fetchDrivingRoute([77, 28.6], [77.01, 28.61], {
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })
  }), error => error.code === 'TIMEOUT' && /timed out/.test(error.message));
});

test('matches only tagged signals close to route geometry and orders them along a curved route', () => {
  const nodes = [
    signal(2, 77.0100, 28.6050),
    signal(1, 77.0050, 28.60012),
    signal(3, 77.0200, 28.6050),
    signal(4, 77.0060, 28.6000, { highway: 'crossing' }),
    signal(5, 77.00505, 28.60002),
    signal(6, 77.0030, 28.6004)
  ];
  const matches = SignalXRoute.matchSignalsToRoute(nodes, curvedRoute, 40, 22);
  assert.deepEqual(matches.map(item => item.id), ['5', '2']);
  assert.ok(matches[0].routeDistanceM < matches[1].routeDistanceM);
  assert.ok(matches[0].routeOffsetM < 20);
});

test('reversing route geometry reverses the matched signal order', () => {
  const nodes = [signal(1, 77.0050, 28.6000), signal(2, 77.0100, 28.6050)];
  const forward = SignalXRoute.matchSignalsToRoute(nodes, curvedRoute);
  const reverse = SignalXRoute.matchSignalsToRoute(nodes, curvedRoute.slice().reverse());
  assert.deepEqual(forward.map(item => item.id), ['1', '2']);
  assert.deepEqual(reverse.map(item => item.id), ['2', '1']);
});

test('returns an empty sequence when no verified traffic-signal nodes are present', () => {
  const matches = SignalXRoute.matchSignalsToRoute([
    signal(1, 77.005, 28.6, { highway: 'crossing' }),
    signal(2, 77.005, 28.604)
  ], curvedRoute);
  assert.deepEqual(matches, []);
});

test('interpolates vehicle progress along curved route geometry', () => {
  const cumulative = SignalXRoute.cumulativeDistances(curvedRoute);
  const corner = SignalXRoute.coordinateAtDistance(curvedRoute, cumulative[1], cumulative);
  assert.deepEqual(corner, curvedRoute[1]);
  const projection = SignalXRoute.projectPointToRoute([77.01, 28.605], curvedRoute, cumulative);
  const halfVertical = (cumulative[2] - cumulative[1]) / 2;
  assert.ok(Math.abs(projection.distanceAlongM - cumulative[1] - halfVertical) < 2);
});

test('uses cached signal data for the same route bounds instead of repeating a query', async () => {
  const store = new Map();
  const storage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, value)
  };
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return { ok: true, json: async () => ({ elements: [signal(10, 77.005, 28.6001)] }) };
  };
  const first = await SignalXRoute.fetchSignalsAlongRoute(curvedRoute, { fetchImpl, storage });
  const second = await SignalXRoute.fetchSignalsAlongRoute(curvedRoute, { fetchImpl, storage });
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(requests, 1);
});

test('reports unavailable signal data without inventing matched signals', async () => {
  await assert.rejects(SignalXRoute.fetchSignalsAlongRoute(curvedRoute, {
    storage: null,
    fetchImpl: async () => ({ ok: false, status: 503 })
  }), error => error.code === 'SIGNAL_HTTP_ERROR' && /signal data is temporarily unavailable/.test(error.message));
});

test('honors the per-session daily signal-query limit without contacting Overpass', async () => {
  const key = 'signalx:osm-signal-query-times';
  const store = new Map([[key, JSON.stringify(Array.from({ length: 10 }, () => Date.now()))]]);
  const storage = { getItem: name => store.get(name) || null, setItem: (name, value) => store.set(name, value) };
  let requests = 0;
  await assert.rejects(SignalXRoute.fetchOsmSignalNodes(SignalXRoute.routeBounds(curvedRoute), {
    storage,
    fetchImpl: async () => { requests += 1; return { ok: true, json: async () => ({ elements: [] }) }; }
  }), error => error.code === 'SIGNAL_RATE_LIMIT' && /daily request limit/.test(error.message));
  assert.equal(requests, 0);
});
