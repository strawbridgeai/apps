// SQLite (better-sqlite3 — synchronous, zero-config, no separate DB
// service) under a dedicated writable data dir, parallel to
// file-converter's TMP_ROOT pattern. Everything else this service reads
// (certs) stays read-only per its systemd unit; this is the one path that
// needs to be writable.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/var/lib/restock-tracker/data';
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'restock.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tracked_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer TEXT NOT NULL,           -- 'bestbuy' | 'target'
    product_id TEXT NOT NULL,         -- SKU (Best Buy) or TCIN (Target)
    name TEXT NOT NULL,
    image_url TEXT,
    -- The poller runs independently of any browser session, so it needs
    -- its own reference point to search "nearby" stores from - captured
    -- from the adding browser's geolocation at add-time (the map view
    -- already has this), not re-derived later.
    ref_lat REAL NOT NULL,
    ref_lon REAL NOT NULL,
    added_at INTEGER NOT NULL,
    UNIQUE(retailer, product_id)
  );

  CREATE TABLE IF NOT EXISTS stock_snapshots (
    tracked_product_id INTEGER NOT NULL,
    store_id TEXT NOT NULL,
    store_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    in_stock INTEGER NOT NULL,        -- 0 | 1
    checked_at INTEGER NOT NULL,
    PRIMARY KEY (tracked_product_id, store_id),
    FOREIGN KEY (tracked_product_id) REFERENCES tracked_products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS online_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    label TEXT NOT NULL,
    in_stock_text TEXT,                -- optional override of the default heuristic
    last_status TEXT NOT NULL DEFAULT 'unknown', -- 'in-stock' | 'out-of-stock' | 'unknown'
    last_checked_at INTEGER,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    target_type TEXT NOT NULL,         -- 'product' | 'watch' | 'all'
    target_id INTEGER,                 -- tracked_products.id or online_watches.id; null for 'all'
    enabled INTEGER NOT NULL DEFAULT 1,
    unsubscribe_token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_subscriptions_target ON subscriptions(target_type, target_id);
`);

// SQLite has no "ADD COLUMN IF NOT EXISTS" - added after the table already
// existed in production, so guard with try/catch instead of a version-
// tracked migration system this app is too small to need.
try {
  db.exec('ALTER TABLE tracked_products ADD COLUMN product_url TEXT');
} catch (err) {
  if (!/duplicate column name/i.test(err.message)) throw err;
}

// Target's store list (nearby_stores_v1) gives an address but no lat/lon -
// this caches one-time geocodes of store addresses (see providers/target.js)
// so repeated polls of the same nearby stores don't re-hit Nominatim, which
// requires no more than ~1 request/sec and a real identifying User-Agent.
db.exec(`
  CREATE TABLE IF NOT EXISTS store_geocode (
    address TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    cached_at INTEGER NOT NULL
  );
`);

// Two "restock is coming" signal sources, independent of the per-product
// tracked_products/stock_snapshots flow above:
//  - reddit_sightings: community-reported drops from r/PokemonRestocks,
//    the only practical Walmart signal (Walmart's own site is behind an
//    active PerimeterX "press and hold" human-verification challenge that
//    blocks even a real headless browser on the first request — not
//    something this app scrapes directly).
//  - catalog_seen: brand-new Target/Best Buy product listings appearing in
//    search results, which often predates the actual on-sale/restock date.
db.exec(`
  CREATE TABLE IF NOT EXISTS reddit_sightings (
    post_id TEXT PRIMARY KEY,
    retailer TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    matched_keyword TEXT NOT NULL,
    posted_at INTEGER NOT NULL,
    alerted_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS catalog_seen (
    retailer TEXT NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    alerted INTEGER NOT NULL DEFAULT 0,
    UNIQUE(retailer, product_id)
  );
`);

module.exports = { db, DATA_DIR };
