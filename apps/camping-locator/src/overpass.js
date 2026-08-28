/**
 * Data source: OpenStreetMap, queried live via the Overpass API — free, no
 * API key, no account. Public Overpass instances are a shared community
 * resource, so this only ever queries the user's current map viewport (see
 * boundsAreaDegrees + the caller's zoom guard), never the whole country at
 * once, and falls back across mirrors rather than hammering one endpoint.
 * A viewport past TILE_THRESHOLD_DEG is split into a grid of smaller tiles
 * fetched in parallel (see splitIntoTiles) instead of one large request —
 * lets the caller allow a bigger search area without risking a slow/timed
 * out single query.
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
 *    across mappers. National parks and paid/reservable campgrounds are
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

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY_TIMEOUT_S = 25;
const FETCH_TIMEOUT_MS = 45000;

// Public Overpass instances cap concurrent requests per client to a
// handful (anonymous users get ~2 parallel query slots) — firing every
// tile at once causes the excess ones to queue server-side and blow past
// any reasonable client timeout. Cap in-flight requests and round-robin
// the two mirrors so no single instance ever sees more than one of ours
// at a time.
const TILE_CONCURRENCY = 2;

function buildQuery(bounds, { includeWater }) {
  const b = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(` +
    `node["tourism"="camp_site"](${b});` +
    `way["tourism"="camp_site"](${b});` +
    (includeWater ? `node["amenity"="drinking_water"](${b});` : '') +
    `way["boundary"="protected_area"]["protection_title"~"State Park",i](${b});` +
    `relation["boundary"="protected_area"]["protection_title"~"State Park",i](${b});` +
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// One bbox, small enough to be a single safe Overpass request.
// endpointOffset picks which mirror to try first (used to round-robin
// tiles across mirrors), falling back to the other(s) on failure.
async function queryTile(bounds, options, endpointOffset = 0) {
  const query = buildQuery(bounds, options);
  let lastError;
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const endpoint = ENDPOINTS[(endpointOffset + i) % ENDPOINTS.length];
    try {
      const res = await fetchWithTimeout(endpoint, { method: 'POST', body: query }, FETCH_TIMEOUT_MS);
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

// Runs `worker` over `items` with at most `limit` in flight at once.
async function withConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runNext() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

// A single request stays fast and reliable up to about this many square
// degrees. Above that, split the viewport into a grid of tiles fetched a
// few at a time — covers a much larger area without any one request
// risking an Overpass-side timeout.
const TILE_THRESHOLD_DEG = 6;
const MAX_GRID = 3; // hard cap: at most 3x3 = 9 tiles total

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

export async function queryArea(bounds, { includeWater = false } = {}) {
  const area = boundsAreaDegrees(bounds);
  const tiles = splitIntoTiles(bounds, area);
  // Always try the primary mirror first for every tile — mirrors vary a lot
  // in reliability moment-to-moment (verified live: the secondary has
  // returned both hangs and HTTP 406 during testing), so actively spreading
  // load onto a flaky one is worse than just leaning on concurrency limits
  // against the one that's actually been reliable. Per-tile fallback to the
  // secondary still kicks in on a real failure (see queryTile).
  const tileResults = await withConcurrencyLimit(tiles, TILE_CONCURRENCY, (tile) =>
    queryTile(tile, { includeWater }),
  );

  // Merge + dedupe (a way/relation centroid can only fall in one grid cell,
  // but dedupe by id anyway as cheap insurance).
  const seen = new Map();
  for (const elements of tileResults) {
    for (const el of elements) {
      seen.set(`${el.type}/${el.id}`, el);
    }
  }
  return classify(Array.from(seen.values()));
}

export function boundsAreaDegrees(bounds) {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west);
}
