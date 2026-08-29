// restock-tracker backend: tracks nearby-store stock for a small set of
// Best Buy/Target products plus arbitrary online-restock-link watches,
// alerting by email on restock. Public, unauthenticated by design (matches
// the rest of the apps on this landing page) - there's no login here, just
// an email address per subscription with an unsubscribe token, same model
// a mailing list uses.
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('./db.js');
const bestbuy = require('./providers/bestbuy.js');
const target = require('./providers/target.js');
const poller = require('./poller.js');

const PORT = 2013;
const PROVIDERS = { bestbuy, target };
const POLL_RADIUS_MI = Number(process.env.POLL_RADIUS_MI || 50);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const searchLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

function badRequest(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

// ---------- product search ----------
app.get('/api/search', searchLimiter, async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'q is required' });
  const results = await Promise.allSettled(Object.values(PROVIDERS).map((p) => p.searchProducts(query)));
  const combined = [];
  Object.keys(PROVIDERS).forEach((retailer, i) => {
    if (results[i].status === 'fulfilled') {
      for (const item of results[i].value) combined.push({ retailer, ...item });
    } else {
      console.error(`[search] ${retailer} failed:`, results[i].reason?.message);
    }
  });
  res.json({ results: combined });
});

// ---------- tracked products ----------
const insertProduct = db.prepare(`
  INSERT INTO tracked_products (retailer, product_id, name, image_url, ref_lat, ref_lon, added_at)
  VALUES (@retailer, @product_id, @name, @image_url, @ref_lat, @ref_lon, @added_at)
  ON CONFLICT(retailer, product_id) DO NOTHING
`);

app.post('/api/products', writeLimiter, async (req, res) => {
  try {
    const { retailer, productId, name, imageUrl, lat, lon } = req.body || {};
    if (!PROVIDERS[retailer]) throw badRequest('Unknown retailer');
    if (!productId || !name) throw badRequest('productId and name are required');
    if (typeof lat !== 'number' || typeof lon !== 'number') throw badRequest('lat/lon are required');

    insertProduct.run({ retailer, product_id: String(productId), name, image_url: imageUrl || null, ref_lat: lat, ref_lon: lon, added_at: Date.now() });
    const product = db.prepare('SELECT * FROM tracked_products WHERE retailer = ? AND product_id = ?').get(retailer, String(productId));

    // Kick off an immediate poll rather than waiting for the next cycle,
    // so adding a product shows real data right away.
    poller.pollProduct(product).catch((e) => console.error('[api] initial poll failed:', e.message));

    res.json({ ok: true, product });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM tracked_products ORDER BY added_at DESC').all();
  const snapshotsFor = db.prepare('SELECT store_id, store_name, lat, lon, in_stock, checked_at FROM stock_snapshots WHERE tracked_product_id = ?');
  res.json({
    products: products.map((p) => ({
      id: p.id,
      retailer: p.retailer,
      productId: p.product_id,
      name: p.name,
      imageUrl: p.image_url,
      refLat: p.ref_lat,
      refLon: p.ref_lon,
      stores: snapshotsFor.all(p.id).map((s) => ({
        storeId: s.store_id,
        storeName: s.store_name,
        lat: s.lat,
        lon: s.lon,
        inStock: !!s.in_stock,
        checkedAt: s.checked_at,
      })),
    })),
  });
});

app.delete('/api/products/:id', writeLimiter, (req, res) => {
  db.prepare('DELETE FROM tracked_products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- online watches ----------
app.get('/api/watches', (req, res) => {
  res.json({ watches: db.prepare('SELECT * FROM online_watches ORDER BY added_at DESC').all() });
});

app.post('/api/watches', writeLimiter, (req, res) => {
  try {
    const { url, label, inStockText } = req.body || {};
    if (!url || !label) throw badRequest('url and label are required');
    new URL(url); // throws on malformed input
    const info = db
      .prepare('INSERT INTO online_watches (url, label, in_stock_text, added_at) VALUES (?, ?, ?, ?)')
      .run(url, label, inStockText || null, Date.now());
    const watch = db.prepare('SELECT * FROM online_watches WHERE id = ?').get(info.lastInsertRowid);
    poller.pollOnlineWatches().catch((e) => console.error('[api] initial watch poll failed:', e.message));
    res.json({ ok: true, watch });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message || 'invalid url' });
  }
});

app.delete('/api/watches/:id', writeLimiter, (req, res) => {
  db.prepare('DELETE FROM online_watches WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- subscriptions ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/subscribe', writeLimiter, (req, res) => {
  try {
    const { email, targetType, targetId } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) throw badRequest('Valid email is required');
    if (!['product', 'watch', 'all'].includes(targetType)) throw badRequest('Invalid targetType');
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO subscriptions (email, target_type, target_id, unsubscribe_token, created_at) VALUES (?, ?, ?, ?, ?)').run(
      email,
      targetType,
      targetType === 'all' ? null : targetId,
      token,
      Date.now()
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.get('/api/unsubscribe', (req, res) => {
  const token = String(req.query.token || '');
  const result = db.prepare('UPDATE subscriptions SET enabled = 0 WHERE unsubscribe_token = ?').run(token);
  res.setHeader('Content-Type', 'text/html');
  res.send(
    result.changes
      ? '<p>You have been unsubscribed. You can close this tab.</p>'
      : '<p>That unsubscribe link is not valid (already used, or malformed).</p>'
  );
});

// ---------- TLS: matches camping-locator/file-converter exactly ----------
const CERT_DIR = '/var/lib/restock-tracker/certs';
const options = {
  cert: fs.readFileSync(path.join(CERT_DIR, 'webuzo.crt')),
  key: fs.readFileSync(path.join(CERT_DIR, 'webuzo.key')),
};

https.createServer(options, app).listen(PORT, '127.0.0.1', () => {
  console.log(`restock-tracker-api listening on https://127.0.0.1:${PORT}`);
  poller.start();
});
