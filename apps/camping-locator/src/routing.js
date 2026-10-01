// Driving routes from every home plot to one destination, so a group can see
// whose drive is actually the long one before committing to a campsite.
//
// OSRM's public demo server does this without an API key and answered a
// Denver->Colorado Springs query from this host in 0.65s with full geometry,
// which is what makes drawing the real road route (rather than a straight
// line) affordable here. It is donated capacity though, and the project asks
// that it not be hammered, so: one request per origin, requests issued a few
// at a time rather than all at once, and every result cached so dragging an
// unrelated home does not re-request the routes that did not change.
import { haversineMiles } from './meetingPoint.js';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 20000;
// Small enough to stay polite on a shared public service, big enough that a
// group of four or five resolves in one wave.
const CONCURRENCY = 3;

const METRES_PER_MILE = 1609.34;

// Distinct per-origin colours. Deliberately not the layer palette from
// map.js - a route has to stay readable crossing a map already covered in
// category-coloured pins, so these are stronger and more saturated than the
// muted earth tones the markers use.
export const ROUTE_COLORS = [
  '#c1583f', '#2f6f36', '#1c766d', '#8a5a9e', '#b3891f',
  '#3f6fae', '#a8455f', '#4f7a2a', '#8a5f3f', '#5a5aa8',
];

export const routeColor = (index) => ROUTE_COLORS[index % ROUTE_COLORS.length];

const cache = new Map();
const keyFor = (from, to) =>
  `${from[0].toFixed(5)},${from[1].toFixed(5)}>${to[0].toFixed(5)},${to[1].toFixed(5)}`;

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours} h ${rem} min` : `${hours} h`;
}

// OSRM takes lng,lat - the reverse of the [lat, lng] pairs used everywhere
// else in this app. Getting this backwards does not error, it silently
// routes somewhere in the wrong hemisphere, so the conversion lives in one
// place rather than at each call site.
const toOsrmCoord = (point) => `${point[1]},${point[0]}`;

async function fetchRoute(from, to, signal) {
  const key = keyFor(from, to);
  if (cache.has(key)) return cache.get(key);

  const url = `${OSRM_BASE}/${toOsrmCoord(from)};${toOsrmCoord(to)}?overview=full&geometries=geojson`;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  // Both the caller's cancellation and our own timeout have to be able to
  // abort this; AbortSignal.any keeps the two independent.
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(url, { signal: combined });
  if (!res.ok) throw new Error(`routing service responded ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    // OSRM says "NoRoute" for an origin with no drivable connection to the
    // destination - an island, or a plot dropped in the middle of a lake.
    throw new Error(data.code === 'NoRoute' ? 'No drivable route' : `routing failed (${data.code || 'unknown'})`);
  }
  const route = data.routes[0];
  const result = {
    miles: route.distance / METRES_PER_MILE,
    seconds: route.duration,
    // GeoJSON is lng,lat; Leaflet wants lat,lng.
    line: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
  cache.set(key, result);
  return result;
}

// Resolves one entry per plot, in the same order, each either a route or an
// error. One unroutable home must not blank out everyone else's route, which
// is why this never rejects as a whole.
export async function routeEveryoneTo(plots, destination, { signal, onProgress } = {}) {
  const results = new Array(plots.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < plots.length) {
      const index = cursor++;
      const plot = plots[index];
      try {
        const route = await fetchRoute(plot.point, destination, signal);
        results[index] = { ok: true, ...route };
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        results[index] = {
          ok: false,
          error: err.message || 'Route unavailable',
          // Still worth showing something: the straight-line distance makes
          // it obvious whether a failed route was 20 miles or 2000.
          miles: haversineMiles(plot.point, destination),
        };
      }
      done += 1;
      onProgress?.(done, plots.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, plots.length) }, () => worker())
  );
  return results;
}

// Who has the worst of it, and by how much - the number a group actually
// argues about.
export function routeSpread(results) {
  const ok = results.filter((r) => r?.ok);
  if (ok.length < 2) return null;
  const times = ok.map((r) => r.seconds);
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { min, max, spread: max - min, longestIndex: results.findIndex((r) => r?.ok && r.seconds === max) };
}
