// camping-locator backend: a thin, read-only proxy in front of two
// government APIs (NPS, Recreation.gov/RIDB) so their API keys never reach
// the browser. Public, unauthenticated by design like the rest of the apps
// on this landing page (matches file-converter's posture) — every route is
// a GET-only pass-through with no user input beyond simple numeric params.
const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = 2012;
const NPS_API_KEY = process.env.NPS_API_KEY;
const RIDB_API_KEY = process.env.RIDB_API_KEY;

if (!NPS_API_KEY || !RIDB_API_KEY) {
  console.error('Missing NPS_API_KEY or RIDB_API_KEY in environment');
  process.exit(1);
}

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- National Parks (NPS) ---
// Only ~474 NPS units nationwide total — small enough to fetch in full
// once and cache, rather than querying per map viewport like everything
// else. Refreshed periodically in case NPS adds/updates a unit; a failed
// refresh just keeps serving whatever's already cached.
let parksCache = { data: [], fetchedAt: 0 };
const PARKS_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchAllParks() {
  const all = [];
  let start = 0;
  const limit = 200;
  for (;;) {
    const res = await fetch(
      `https://developer.nps.gov/api/v1/parks?limit=${limit}&start=${start}`,
      { headers: { 'X-Api-Key': NPS_API_KEY } },
    );
    if (!res.ok) throw new Error(`NPS API returned HTTP ${res.status}`);
    const body = await res.json();
    for (const p of body.data) {
      const lat = parseFloat(p.latitude);
      const lon = parseFloat(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // "designation" distinguishes true National Parks from the many
      // other NPS unit types (Monument, Historic Site, Recreation Area,
      // Seashore, etc.) — only actual national parks belong on this layer.
      if (!/national park/i.test(p.designation || '')) continue;
      all.push({ id: p.id, name: p.fullName, lat, lon, url: p.url, states: p.states });
    }
    start += limit;
    if (start >= parseInt(body.total, 10)) break;
  }
  return all;
}

async function getParks() {
  const age = Date.now() - parksCache.fetchedAt;
  if (parksCache.data.length > 0 && age < PARKS_TTL_MS) return parksCache.data;
  try {
    const data = await fetchAllParks();
    parksCache = { data, fetchedAt: Date.now() };
  } catch (err) {
    console.error('NPS fetch failed, serving stale/empty cache:', err.message);
    if (parksCache.data.length === 0) throw err;
  }
  return parksCache.data;
}

app.get('/api/parks', async (req, res) => {
  try {
    res.json(await getParks());
  } catch (err) {
    res.status(502).json({ error: 'Failed to load National Park data' });
  }
});

// --- Paid campgrounds (Recreation.gov / RIDB) ---
// RIDB is Recreation.gov's reservation database — verified live against
// real requests that it's almost entirely fee-based developed campgrounds,
// not informal/dispersed free camping (which stays on OpenStreetMap).
// radius is in miles; RIDB has no rectangular-bbox search, only
// point+radius, so the frontend sends the current view's center.
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/api/campgrounds', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = Math.min(parseFloat(req.query.radius) || 25, 60);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  try {
    const url = `https://ridb.recreation.gov/api/v1/facilities?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=200`;
    const ridbRes = await fetch(url, { headers: { apikey: RIDB_API_KEY } });
    if (!ridbRes.ok) throw new Error(`RIDB API returned HTTP ${ridbRes.status}`);
    const body = await ridbRes.json();

    const items = (body.RECDATA || [])
      .filter((f) => f.FacilityTypeDescription === 'Campground' && f.Enabled)
      .map((f) => ({
        id: f.FacilityID,
        name: f.FacilityName || 'Campground',
        lat: f.FacilityLatitude,
        lon: f.FacilityLongitude,
        reservable: !!f.Reservable,
        feeText: stripHtml(f.FacilityUseFeeDescription).slice(0, 200),
        phone: f.FacilityPhone || '',
        url: f.FacilityReservationURL || (f.FacilityID ? `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}` : ''),
      }))
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));

    res.json(items);
  } catch (err) {
    console.error('RIDB fetch failed:', err.message);
    res.status(502).json({ error: 'Failed to load campground data' });
  }
});

// --- TLS: served directly on PORT (the frontend loads over https, so this
// must too — otherwise the browser blocks it as mixed content), reusing
// Webuzo's existing cert like file-converter does. The systemd unit copies
// it into a location this unprivileged user can read. ---
const CERT_DIR = '/var/lib/camping-locator/certs';
const options = {
  cert: fs.readFileSync(path.join(CERT_DIR, 'webuzo.crt')),
  key: fs.readFileSync(path.join(CERT_DIR, 'webuzo.key')),
};

// Loopback-only: Apache reverse-proxies strawbridgeai.com/apps/
// camping-locator/api/ to 127.0.0.1 here (see the vhost conf), so this
// never needs to accept a connection over the public interface directly.
https.createServer(options, app).listen(PORT, '127.0.0.1', () => {
  console.log(`camping-locator-api listening on https://127.0.0.1:${PORT}`);
});
