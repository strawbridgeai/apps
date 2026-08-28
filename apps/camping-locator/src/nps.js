/**
 * National Parks, via this app's own backend (server/server.js) which
 * proxies the official NPS API — keeps the API key server-side and avoids
 * CORS. There are only ~474 NPS units nationwide, so the backend fetches
 * and caches the whole list once; the frontend does the same here rather
 * than re-fetching per map viewport — this layer never needs a "search
 * this area" query at all, unlike everything else on the map.
 */
const API_BASE = `${location.protocol}//${location.hostname}:2012`;

let cache = null;

export async function getNationalParks() {
  if (cache) return cache;
  const res = await fetch(`${API_BASE}/api/parks`);
  if (!res.ok) throw new Error(`Parks API returned HTTP ${res.status}`);
  const data = await res.json();
  cache = data.map((p) => ({
    id: `nps/${p.id}`,
    point: [p.lat, p.lon],
    tags: { name: p.name, operator: 'National Park Service', website: p.url },
  }));
  return cache;
}
