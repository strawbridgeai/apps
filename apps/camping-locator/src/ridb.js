/**
 * Paid/reservable campgrounds, via this app's own backend (server/server.js)
 * which proxies Recreation.gov's RIDB API — keeps the API key server-side
 * and avoids CORS. RIDB has no rectangular-bbox search, only point+radius,
 * so callers pass the current view's center and a radius that covers it.
 *
 * Verified live against real RIDB results (searched broadly around Moab,
 * UT — a well-known free/dispersed camping area): every single campground
 * result had a nightly fee. RIDB is Recreation.gov's reservation database,
 * so it's a good, fast, authoritative source for paid/developed
 * campgrounds specifically, but NOT a substitute for OSM's free/dispersed
 * camping layer.
 */
import { fetchWithTimeout } from './fetchUtil.js';

const API_BASE = `${location.protocol}//${location.hostname}:2012`;
const FETCH_TIMEOUT_MS = 15000; // our own backend, on the same VPS — should always be fast; a hang here means the service is down, not slow

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMiles([lat1, lon1], [lat2, lon2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Center + a radius (miles) reaching the farthest corner of the bounds —
// over-covers the rectangle a bit (a circle around a rectangle's center
// doesn't exactly match its corners) but that's fine here: extra pins just
// outside the visible edge are harmless, missing ones at the edge aren't.
export function boundsToCenterRadius(bounds) {
  const center = [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2];
  const radius = Math.min(Math.ceil(haversineMiles(center, [bounds.north, bounds.east])), 60);
  return { center, radius };
}

export async function queryCampgrounds(bounds, signal) {
  const { center, radius } = boundsToCenterRadius(bounds);
  const url = `${API_BASE}/api/campgrounds?lat=${center[0]}&lon=${center[1]}&radius=${radius}`;
  const res = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS, signal);
  if (!res.ok) throw new Error(`Campgrounds API returned HTTP ${res.status}`);
  const data = await res.json();
  return data.map((c) => ({
    id: `ridb/${c.id}`,
    point: [c.lat, c.lon],
    tags: {
      name: c.name,
      feeText: c.feeText,
      phone: c.phone,
      reservable: c.reservable,
      website: c.url,
    },
  }));
}
