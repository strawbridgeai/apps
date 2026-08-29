/**
 * National Parks, via this app's own backend (server/server.js) which
 * proxies the official NPS API — keeps the API key server-side and avoids
 * CORS. There are only ~474 NPS units nationwide, so the backend fetches
 * and caches the whole list once; the frontend does the same here rather
 * than re-fetching per map viewport — this layer never needs a "search
 * this area" query at all, unlike everything else on the map.
 */
import { fetchWithTimeout } from './fetchUtil.js';

// Same-origin, proxied by the web server at /apps/camping-locator/api/ ->
// the camping-locator-api backend on 127.0.0.1:2012 (see the vhost conf) —
// not a cross-origin `${location.hostname}:2012` call, which broke once
// this app started being reached through a real domain (strawbridgeai.com)
// instead of the bare VPS IP: Cloudflare's proxy only forwards standard
// web ports, so a hardcoded :2012 fetch from a Cloudflare-proxied page
// origin had nowhere to go (same bug and same fix as file-converter).
const API_BASE = '/apps/camping-locator';
// A cold backend cache paginates ~474 NPS units server-side (measured
// ~3-4s) before it can answer — give that real headroom, still bounded.
const FETCH_TIMEOUT_MS = 20000;

let cache = null;

export async function getNationalParks() {
  if (cache) return cache;
  const res = await fetchWithTimeout(`${API_BASE}/api/parks`, {}, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Parks API returned HTTP ${res.status}`);
  const data = await res.json();
  cache = data.map((p) => ({
    id: `nps/${p.id}`,
    point: [p.lat, p.lon],
    tags: { name: p.name, operator: 'National Park Service', website: p.url },
  }));
  return cache;
}
