import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoute, parseRoute } from '../../server/routing.mjs';

const START = [19.93, 50.06], END = [19.94, 50.06];
const METRES_PER_DEGREE = 6371008.8 * Math.PI / 180;
const report = (id, coordinates, overrides = {}) => ({ id, coordinates, kind: 'obstacle', status: 'active', stale: false, duration: 'temporary', locationAccuracy: 'precise', measurement: 'measured', ...overrides });
const input = overrides => parseRoute({ start: START, end: END, ...overrides });
const detour = latitude => [START, [START[0], latitude], [END[0], latitude], END];

function response(points, waypointIndices = [0, points.length - 1]) {
  return new Response(JSON.stringify({ features: [{ geometry: { type: 'LineString', coordinates: points }, properties: {
    summary: { distance: 1000, duration: 800 }, way_points: waypointIndices,
    segments: [{ steps: [{ instruction: 'Test route', distance: 1000, way_points: [0, points.length - 1] }] }],
  } }], metadata: { engine: { version: 'test' } } }));
}

async function calculate(parsed, reports, handler) {
  const requests = [];
  const route = await calculateRoute(parsed, reports, { orsBase: 'http://isolated.test', fetchImpl: async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    return handler ? handler(request, requests.length) : response([START, END]);
  } });
  return { route, requests };
}

test('city-wide reports do not exhaust local polygon limit; stale and resolved reports never join detours', async () => {
  const reports = Array.from({ length: 150 }, (_, index) => report(`far-${index}`, [20.18 + index * 0.00001, 50.1]));
  reports.push(report('stale', [19.935, 50.06], { stale: true }), report('resolved', START, { status: 'resolved' }));
  const { route, requests } = await calculate(input(), reports);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.avoid_polygons, undefined);
  assert.deepEqual(route.source.reportsAvoided, []);
  assert.equal(route.source.reportPolygonsCount, 0);
});

test('report selection follows the calculated segments to intermediate stops', async () => {
  const via = [19.93, 50.08];
  const { route, requests } = await calculate(input({ waypoints: [via] }), [report('along-via-leg', [19.93, 50.075])],
    (_r, attempt) => attempt === 1 ? response([START, via, END], [0, 1, 2]) : response([START, [19.929, 50.075], via, END], [0, 2, 3]));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].coordinates, [START, via, END]);
  assert.equal(requests[1].options.avoid_polygons.coordinates.length, 1);
  assert.deepEqual(route.source.reportsAvoided, ['along-via-leg']);
});

test('detour validation uses precise segment intersections without blocking the other sidewalk', async () => {
  const reports = [
    report('near-segment-middle', [19.935, 50.08 + .5 / METRES_PER_DEGREE]),
    report('other-sidewalk', [19.935, 50.08 + 5 / METRES_PER_DEGREE]),
    report('stale-on-detour', [19.936, 50.08], { stale: true }),
    report('resolved-on-detour', [19.934, 50.08], { status: 'resolved' }),
  ];
  const { route, requests } = await calculate(input(), reports, (_request, attempt) => response(detour(attempt === 1 ? 50.08 : 50.04)));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.avoid_polygons, undefined);
  assert.equal(requests[1].options.avoid_polygons.coordinates.length, 1);
  assert.deepEqual(route.source.reportsAvoided, ['near-segment-middle']);
  assert.equal(route.source.reportSelection.requests, 2);
  assert.equal(route.source.reportPolygonsCount, 1);
  assert(route.warnings.some(warning => warning.includes('Ominięto zgłoszone przejścia')));
});

test('detour validation handles longitude distances at Kraków latitude and honours width measurements', async () => {
  const dx = metres => metres / (METRES_PER_DEGREE * Math.cos(50.08 * Math.PI / 180));
  const reports = [report('near-longitude', [19.95 + dx(.5), 50.08]),
    report('outside-longitude', [19.95 + dx(5), 50.08]),
    report('wide-enough', [19.95, 50.075], { kind: 'width', widthCm: 100 }),
    report('no-width-data', [19.95, 50.085], { kind: 'width', widthCm: null })];
  const first = [START, [19.95, 50.07], [19.95, 50.09], END];
  const { route, requests } = await calculate(input({ profile: { widthCm: 70 } }), reports,
    (_request, attempt) => response(attempt === 1 ? first : [START, END]));
  assert.equal(requests.length, 2);
  assert.deepEqual(route.source.reportsAvoided, ['near-longitude']);
});

test('the polygon limit is checked again after a distant detour encounters an additional report', async () => {
  const reports = Array.from({ length: 100 }, (_, index) => report(`local-${index}`, [19.935 + index * 0.000001, 50.06]));
  reports.push(report('new-on-detour', [19.935, 50.08]));
  let calls = 0;
  await assert.rejects(calculate(input(), reports, () => { calls++; return response(calls === 1 ? [START, END] : detour(50.08)); }),
    error => error.status === 422 && error.code === 'TOO_MANY_BARRIERS');
  assert.equal(calls, 2);
});

test('three changing detours end with an explicit failure; no unchecked last route is returned', async () => {
  const reports = [50.07, 50.08, 50.09].map((lat, i) => report(`next-${i}`, [19.935, lat]));
  let calls = 0;
  await assert.rejects(calculate(input(), reports, () => response(detour(50.06 + (++calls) * 0.01))),
    error => error.status === 422 && error.code === 'BARRIERS_UNRESOLVED');
  assert.equal(calls, 3);
});

test('ORS failure during an added-barrier retry does not return the successful but unchecked first result', async () => {
  let calls = 0;
  await assert.rejects(calculate(input(), [report('on-detour', [19.935, 50.08])], () => {
    if (++calls === 1) return response(detour(50.08));
    throw new TypeError('Simulated unavailable engine');
  }), error => error.status === 503 && error.code === 'ROUTING_UNAVAILABLE');
  assert.equal(calls, 2);
});

test('surface preference has no hidden roughness or track filter when disabled, and retains grade1 when enabled', async () => {
  const off = await calculate(input({ profile: { avoidUnpaved: false } }), []);
  const on = await calculate(input({ profile: { avoidUnpaved: true } }), []);
  const offRestrictions = off.requests[0].options.profile_params.restrictions;
  const onRestrictions = on.requests[0].options.profile_params.restrictions;
  assert.equal(offRestrictions.surface_type, 'any');
  assert.equal(offRestrictions.track_type, undefined);
  assert.equal(offRestrictions.smoothness_type, undefined);
  assert.equal(onRestrictions.surface_type, 'cobblestone');
  assert.equal(onRestrictions.track_type, 'grade2');
  assert.equal(onRestrictions.smoothness_type, undefined);
  assert.equal(onRestrictions.maximum_incline, 6);
  assert.equal(onRestrictions.maximum_sloped_kerb, 0.06);
  assert.equal(on.requests[0].options.profile_params.allow_unsuitable, false);
  assert(on.route.warnings.some(warning => warning.includes('wyboje i koleiny')));
});

test('explicitly disabling report avoidance does not trigger additional route requests', async () => {
  const { route, requests } = await calculate(input({ avoidReports: false }), [report('on-detour', [19.935, 50.08])],
    () => response(detour(50.08)));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.avoid_polygons, undefined);
  assert.deepEqual(route.source.reportsAvoided, []);
});

test('all detour attempts share a 30s budget and the last read receives only remaining time', async t => {
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    timeouts.push(milliseconds); return new AbortController().signal;
  });
  let elapsed = 0, calls = 0;
  const reports = [report('first-detour', [19.935, 50.07]), report('second-detour', [19.935, 50.08])];
  const route = await calculateRoute(input(), reports, { orsBase: 'http://isolated.test', now: () => elapsed,
    fetchImpl: async () => {
      elapsed += [12000, 14000, 3000][calls];
      calls++;
      return response(calls < 3 ? detour(50.06 + calls * 0.01) : [START, END]);
    } });
  assert.equal(calls, 3);
  assert.deepEqual(timeouts, [15000, 15000, 4000]);
  assert.equal(elapsed, 29000);
  assert.equal(route.source.reportSelection.requests, 3);
});

test('exhausted overall routing budget returns timeout without starting another attempt or leaking a route', async t => {
  t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
  let elapsed = 0, calls = 0;
  await assert.rejects(calculateRoute(input(), [report('first-detour', [19.935, 50.07]), report('second-detour', [19.935, 50.08])],
    { orsBase: 'http://isolated.test', now: () => elapsed, fetchImpl: async () => {
      // The fake reader ignores its signal; the deadline still rejects its late response.
      elapsed += calls === 0 ? 14000 : 17000;
      return response(detour(50.06 + (++calls) * 0.01));
    } }), error => error.status === 504 && error.code === 'ROUTING_TIMEOUT');
  assert.equal(calls, 2);
});
