// restock-tracker backend: replaces the earlier automated Target/Best Buy
// polling + email-alert model with a community-submitted stock-report board
// plus a static store-calling directory, ported from a Replit prototype
// ("Pokémon Restock Radar", artifacts/api-server/src/routes/restock.ts).
// No automated retailer polling, no email alerts, no subscriptions - this
// is intentionally simpler than what it replaced. Public, unauthenticated
// by design, same as every other app on this landing page.
const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('./db.js');
const { seedIfEmpty } = require('./seed.js');

const PORT = 2013;

const app = express();
// Apache reverse-proxies here from loopback only (see systemd unit) and
// sets X-Forwarded-For - without this, express-rate-limit can't safely use
// it to tell requests apart. 'loopback' (not `true`) so a header spoofed by
// anyone who somehow reached this process directly isn't blindly trusted.
app.set('trust proxy', 'loopback');
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const readLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

function badRequest(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

const EARTH_RADIUS_MI = 3958.8;
function distanceMiles(fromLat, fromLng, toLat, toLng) {
  const latDelta = ((toLat - fromLat) * Math.PI) / 180;
  const lngDelta = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.sin(lngDelta / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function callWorthiness(chain, distance) {
  if (chain === 'local') return 'high';
  if (distance <= 8 && chain !== 'dollar_general') return 'medium';
  return 'low';
}

function parseLocationQuery(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radius = Number(query.radius);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) return null;
  return { lat, lng, radius };
}

function storeResponse(store, distance) {
  return {
    id: store.id,
    name: store.name,
    chain: store.chain,
    address: store.address,
    city: store.city,
    state: store.state,
    phone: store.phone,
    lat: store.lat,
    lng: store.lng,
    distanceMiles: Number(distance.toFixed(1)),
    callWorthiness: callWorthiness(store.chain, distance),
    notes: store.notes,
  };
}

function reportResponse(r) {
  return {
    id: String(r.id),
    setId: r.set_id,
    storeId: r.store_id,
    status: r.status,
    productType: r.product_type,
    reportedAt: new Date(r.reported_at).toISOString(),
    source: r.source,
    confidence: r.confidence,
    note: r.note,
    reporter: r.reporter ?? undefined,
  };
}

// ---------- set catalog ----------
app.get('/api/sets', readLimiter, (req, res) => {
  const rows = db.prepare('SELECT * FROM pokemon_sets').all();
  res.json(rows.map((s) => ({
    id: s.id,
    name: s.name,
    series: s.series,
    releaseDate: s.release_date,
    productTypes: JSON.parse(s.product_types),
    accent: s.accent,
  })));
});

// ---------- store directory ----------
app.get('/api/stores', readLimiter, (req, res) => {
  const loc = parseLocationQuery(req.query);
  if (!loc) return res.status(400).json({ error: 'Invalid location or radius.' });
  const stores = db.prepare('SELECT * FROM stores').all();
  const result = stores
    .map((s) => storeResponse(s, distanceMiles(loc.lat, loc.lng, s.lat, s.lng)))
    .filter((s) => s.distanceMiles <= loc.radius)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  res.json(result);
});

// ---------- stock reports ----------
function reportsNear(setId, loc) {
  const rows = db
    .prepare(
      `SELECT sr.*, st.lat AS store_lat, st.lng AS store_lng
       FROM stock_reports sr JOIN stores st ON st.id = sr.store_id
       WHERE sr.set_id = ? ORDER BY sr.reported_at DESC`
    )
    .all(setId);
  return rows
    .map((r) => ({ report: r, distance: distanceMiles(loc.lat, loc.lng, r.store_lat, r.store_lng) }))
    .filter(({ distance }) => distance <= loc.radius);
}

app.get('/api/reports', readLimiter, (req, res) => {
  const setId = String(req.query.setId || '');
  const loc = parseLocationQuery(req.query);
  const limit = Number(req.query.limit) || 20;
  if (!setId || !loc) return res.status(400).json({ error: 'Invalid set, location, or radius.' });
  const rows = reportsNear(setId, loc);
  res.json(rows.slice(0, limit).map(({ report }) => reportResponse(report)));
});

app.post('/api/reports', writeLimiter, (req, res) => {
  try {
    const { setId, storeId, status, productType, note, reporter } = req.body || {};
    if (!setId || !storeId || !status || !productType || !note) throw badRequest('Please complete the stock report.');
    if (!['in_stock', 'limited', 'sold_out', 'unknown'].includes(status)) throw badRequest('Invalid status.');

    const set = db.prepare('SELECT id FROM pokemon_sets WHERE id = ?').get(setId);
    const store = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
    if (!set || !store) throw badRequest('That set or store could not be found.');

    const reportedAt = Date.now();
    const info = db
      .prepare('INSERT INTO stock_reports (set_id, store_id, status, product_type, reported_at, source, confidence, note, reporter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(setId, storeId, status, productType, reportedAt, 'community', 72, note, reporter || null);
    const created = db.prepare('SELECT * FROM stock_reports WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(reportResponse(created));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ---------- radar summary ----------
const ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;

app.get('/api/radar', readLimiter, (req, res) => {
  const setId = String(req.query.setId || '');
  const loc = parseLocationQuery(req.query);
  if (!setId || !loc) return res.status(400).json({ error: 'Invalid set, location, or radius.' });

  const rows = reportsNear(setId, loc);
  const now = Date.now();
  const active = rows.filter(({ report }) => now - report.reported_at <= ACTIVE_WINDOW_MS);
  const confirmed = active.filter(({ report }) => report.status === 'in_stock' || report.status === 'limited');
  const top = confirmed.sort(
    (a, b) => b.report.confidence - a.report.confidence || b.report.reported_at - a.report.reported_at
  )[0];

  let topSignal = null;
  if (top) {
    const store = db.prepare('SELECT name FROM stores WHERE id = ?').get(top.report.store_id);
    const minutes = Math.max(1, Math.round((now - top.report.reported_at) / 60000));
    topSignal = `${store?.name || 'Nearby store'} · ${top.distance.toFixed(1)} mi · ${minutes}m ago`;
  }

  res.json({
    setId,
    updatedAt: new Date().toISOString(),
    activeReports: active.length,
    inStockCount: active.filter(({ report }) => report.status === 'in_stock').length,
    limitedCount: active.filter(({ report }) => report.status === 'limited').length,
    soldOutCount: active.filter(({ report }) => report.status === 'sold_out').length,
    lastConfirmedAt: top ? new Date(top.report.reported_at).toISOString() : null,
    topSignal,
  });
});

// ---------- TLS: matches camping-locator/file-converter exactly ----------
const CERT_DIR = '/var/lib/restock-tracker/certs';
const options = {
  cert: fs.readFileSync(path.join(CERT_DIR, 'webuzo.crt')),
  key: fs.readFileSync(path.join(CERT_DIR, 'webuzo.key')),
};

seedIfEmpty();

https.createServer(options, app).listen(PORT, '127.0.0.1', () => {
  console.log(`restock-tracker-api listening on https://127.0.0.1:${PORT}`);
});
