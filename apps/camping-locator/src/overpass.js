/**
 * Data source: OpenStreetMap, queried live via the Overpass API — free, no
 * API key, no account. Public Overpass instances are a shared community
 * resource, so this only ever queries the user's current map viewport (see
 * boundsAreaDegrees + the caller's zoom guard), never the whole country at
 * once, and falls back across mirrors rather than hammering one endpoint.
 * A viewport past TILE_THRESHOLD_DEG is split into a grid of smaller tiles
 * fetched SEQUENTIALLY (see splitIntoTiles) instead of one large request —
 * lets the caller allow a bigger search area without risking a slow/timed
 * out single query. Sequential, not concurrent: verified live with a
 * two-request isolated test (bypassing this module entirely) that
 * Overpass's public rate limit is a slot that takes ~30-45s of real
 * wall-clock time to regenerate after use, not a hard "N at once" ceiling
 * that's free the instant a response lands — firing tiles concurrently,
 * even just 2 at a time, reliably collided with that recovery window and
 * produced explicit 429s and opaque 502s. Sequential requests, one at a
 * time, don't hit this.
 *
 * Tag conventions (verified against real data, not assumed):
 *  - Campsites: tourism=camp_site. Most genuinely free/dispersed sites in
 *    OSM are NOT tagged fee=no explicitly — they're just untagged or
 *    marked backcountry=yes. Reliable "this costs money or is restricted"
 *    signals are fee=yes, access=private/customers/permit, or
 *    reservation=required — anything else is treated as free/dispersed.
 *  - Drinking water: amenity=drinking_water. This tag is dramatically
 *    denser than the others in any populated area (verified live: a
 *    ~4 sq-degree tile touching Denver's suburbs was enough to blow past a
 *    45s timeout with it included) — queryArea only asks for it when
 *    includeWater is true, so the default/auto-fired searches (water is
 *    off by default) stay fast, and it's fetched on demand when that layer
 *    is actually toggled on.
 *  - State parks: boundary=protected_area with a `protection_title` of
 *    "State Park" (e.g. Utahraptor State Park uses this exact field) —
 *    protect_class alone is NOT reliable, it's inconsistently applied
 *    across mappers. This is a regex tag search, which Overpass can't
 *    serve from a simple key=value index the way it can for camp_site —
 *    it's the single most expensive clause in this query, so like water
 *    it's opt-in (includeStateParks) rather than part of every routine
 *    search; the default/auto-fired search is just the cheap exact-match
 *    camp_site lookup. National parks and paid/reservable campgrounds are
 *    NOT sourced from here — see nps.js and ridb.js: those come from the
 *    official NPS and Recreation.gov APIs instead, which are faster and
 *    more authoritative than OSM for exactly those two categories (verified
 *    live: NPS's ~474 units fit in one cached fetch with no per-viewport
 *    querying at all, and RIDB is a real indexed database rather than a
 *    spatial query engine on shared community infrastructure). OSM remains
 *    genuinely the best available source for free/dispersed camping
 *    specifically — RIDB is Recreation.gov's reservation system and is
 *    almost entirely fee-based campgrounds, confirmed against real query
 *    results, not a source for informal dispersed sites.
 */

import { fetchWithTimeout } from './fetchUtil.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY_TIMEOUT_S = 25;
// A few seconds past the server's own [timeout:25] budget — the server
// self-aborts at 25s, so waiting much longer client-side only adds dead
// time to a search that's already going to fail.
const FETCH_TIMEOUT_MS = 28000;

function buildQuery(bounds, { includeWater, includeStateParks }) {
  const b = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(` +
    `node["tourism"="camp_site"](${b});` +
    `way["tourism"="camp_site"](${b});` +
    (includeWater ? `node["amenity"="drinking_water"](${b});` : '') +
    (includeStateParks
      ? `way["boundary"="protected_area"]["protection_title"~"State Park",i](${b});` +
        `relation["boundary"="protected_area"]["protection_title"~"State Park",i](${b});`
      : '') +
    `);out center tags;`;
}

function pointOf(el) {
  if (el.type === 'node') return [el.lat, el.lon];
  if (el.center) return [el.center.lat, el.center.lon];
  return null;
}

function isReliablyNotFree(tags) {
  return (
    tags.fee === 'yes' ||
    ['private', 'customers', 'permit', 'no'].includes(tags.access) ||
    tags.reservation === 'required'
  );
}

// freeCamping and stateParks only — national parks and paid campgrounds
// come from nps.js / ridb.js instead (see the module docstring above).
function classify(elements) {
  const result = { freeCamping: [], water: [], stateParks: [] };
  for (const el of elements) {
    const tags = el.tags || {};
    const point = pointOf(el);
    if (!point) continue;
    const item = { id: `${el.type}/${el.id}`, point, tags };

    if (tags.tourism === 'camp_site') {
      if (!isReliablyNotFree(tags)) result.freeCamping.push(item);
    } else if (tags.amenity === 'drinking_water') {
      result.water.push(item);
    } else if (tags.boundary === 'protected_area' && /state park/i.test(tags.protection_title || '')) {
      result.stateParks.push(item);
    }
  }
  return result;
}

// One bbox, small enough to be a single safe Overpass request. Tries the
// primary mirror first, falling back to the secondary on a real failure
// (verified live: the secondary has itself returned both hangs and HTTP
// 406/502 during testing, so it's a fallback, not something to spread
// routine load onto).
async function queryTile(bounds, options, signal) {
  const query = buildQuery(bounds, options);
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, { method: 'POST', body: query }, FETCH_TIMEOUT_MS, signal);
      if (!res.ok) throw new Error(`Overpass returned HTTP ${res.status}`);
      const data = await res.json();
      return data.elements || [];
    } catch (err) {
      lastError = err;
      // try the next mirror
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}

// A single request stays fast and reliable up to about this many square
// degrees. Above that, split the viewport into a grid of tiles fetched one
// at a time (see the module docstring for why sequential, not concurrent)
// — covers a larger area without any one request risking an Overpass-side
// timeout, or multiple requests colliding with the rate-limit recovery
// window.
const TILE_THRESHOLD_DEG = 14; // raised from 6 now that the default query is just the cheap camp_site lookup (state parks moved behind includeStateParks above)
const MAX_GRID = 2; // hard cap: at most 2x2 = 4 tiles total — keeps a full sequential search bounded to ~4x a single tile's time

function splitIntoTiles(bounds, area) {
  const n = Math.min(MAX_GRID, Math.max(1, Math.ceil(Math.sqrt(area / TILE_THRESHOLD_DEG))));
  if (n <= 1) return [bounds];
  const latStep = (bounds.north - bounds.south) / n;
  const lonStep = (bounds.east - bounds.west) / n;
  const tiles = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      tiles.push({
        south: bounds.south + i * latStep,
        north: bounds.south + (i + 1) * latStep,
        west: bounds.west + j * lonStep,
        east: bounds.west + (j + 1) * lonStep,
      });
    }
  }
  return tiles;
}

// onProgress(done, total) fires after each tile completes — lets the
// caller show "searching… (2/4)" instead of one long silent wait, since a
// worst-case sequential search can take a real 30-40s. Returns
// { ...categories, partial } — partial is true if at least one tile
// failed but at least one other succeeded, so a single bad tile doesn't
// throw away results the rest of the search already found. Only throws if
// every tile failed.
export async function queryArea(bounds, { includeWater = false, includeStateParks = false, onProgress, signal } = {}) {
  const area = boundsAreaDegrees(bounds);
  const tiles = splitIntoTiles(bounds, area);

  const seen = new Map();
  let failures = 0;
  let lastError;
  for (let i = 0; i < tiles.length; i++) {
    if (signal?.aborted) break; // caller no longer wants this (superseded by a newer search) — stop issuing more requests
    try {
      const elements = await queryTile(tiles[i], { includeWater, includeStateParks }, signal);
      for (const el of elements) {
        seen.set(`${el.type}/${el.id}`, el);
      }
    } catch (err) {
      if (signal?.aborted) break;
      failures++;
      lastError = err;
      console.error(`Tile ${i + 1}/${tiles.length} failed:`, err);
    }
    onProgress?.(i + 1, tiles.length);
  }
  if (signal?.aborted) throw new DOMException('Superseded by a newer search', 'AbortError');
  if (failures === tiles.length) throw lastError;
  return { ...classify(Array.from(seen.values())), partial: failures > 0 };
}

export function boundsAreaDegrees(bounds) {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west);
}
