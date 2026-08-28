/**
 * Data source: OpenStreetMap, queried live via the Overpass API — free, no
 * API key, no account. Public Overpass instances are a shared community
 * resource, so this only ever queries the user's current map viewport (see
 * boundsAreaDegrees + the caller's zoom guard), never the whole country at
 * once, and falls back across mirrors rather than hammering one endpoint.
 *
 * Tag conventions (verified against real data, not assumed):
 *  - Campsites: tourism=camp_site. Most genuinely free/dispersed sites in
 *    OSM are NOT tagged fee=no explicitly — they're just untagged or
 *    marked backcountry=yes. Reliable "this costs money or is restricted"
 *    signals are fee=yes, access=private/customers/permit, or
 *    reservation=required — anything else is treated as free/dispersed.
 *  - Drinking water: amenity=drinking_water.
 *  - National/state parks: boundary=protected_area with a `protection_title`
 *    of "National Park" / "State Park" (e.g. Arches NP, Utahraptor State
 *    Park both use this exact field) — protect_class alone is NOT reliable,
 *    it's inconsistently applied across mappers.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY_TIMEOUT_S = 25;
const FETCH_TIMEOUT_MS = 30000;

function buildQuery(bounds) {
  const b = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(` +
    `node["tourism"="camp_site"](${b});` +
    `way["tourism"="camp_site"](${b});` +
    `node["amenity"="drinking_water"](${b});` +
    `way["boundary"="protected_area"]["protection_title"~"National Park",i](${b});` +
    `relation["boundary"="protected_area"]["protection_title"~"National Park",i](${b});` +
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

function classify(elements) {
  const result = { freeCamping: [], paidCamping: [], water: [], nationalParks: [], stateParks: [] };
  for (const el of elements) {
    const tags = el.tags || {};
    const point = pointOf(el);
    if (!point) continue;
    const item = { id: `${el.type}/${el.id}`, point, tags };

    if (tags.tourism === 'camp_site') {
      (isReliablyNotFree(tags) ? result.paidCamping : result.freeCamping).push(item);
    } else if (tags.amenity === 'drinking_water') {
      result.water.push(item);
    } else if (tags.boundary === 'protected_area' && /national park/i.test(tags.protection_title || '')) {
      result.nationalParks.push(item);
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

export async function queryArea(bounds) {
  const query = buildQuery(bounds);
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, { method: 'POST', body: query }, FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error(`Overpass returned HTTP ${res.status}`);
      const data = await res.json();
      return classify(data.elements || []);
    } catch (err) {
      lastError = err;
      // try the next mirror
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}

export function boundsAreaDegrees(bounds) {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west);
}
