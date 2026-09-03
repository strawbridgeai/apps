// SQLite (better-sqlite3) under a dedicated writable data dir - this app
// was ported from a Replit prototype that used Postgres/Drizzle, but this
// VPS has no Postgres service and provisioning one is out of proportion to
// a 3-table hobby app; the schema has nothing Postgres-specific (no arrays
// used anywhere but productTypes, stored here as JSON-encoded TEXT).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/var/lib/restock-tracker/data';
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'restock.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pokemon_sets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    series TEXT NOT NULL,
    release_date TEXT NOT NULL,
    product_types TEXT NOT NULL,      -- JSON-encoded array
    accent TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chain TEXT NOT NULL,              -- 'target' | 'best_buy' | 'walmart' | 'dollar_general' | 'local'
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    phone TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    notes TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id TEXT NOT NULL REFERENCES pokemon_sets(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    status TEXT NOT NULL,             -- 'in_stock' | 'limited' | 'sold_out' | 'unknown'
    product_type TEXT NOT NULL,
    reported_at INTEGER NOT NULL,     -- ms epoch
    source TEXT NOT NULL,             -- 'community' | 'store_call' | 'retailer_signal'
    confidence INTEGER NOT NULL,
    note TEXT NOT NULL,
    reporter TEXT
  );
`);

module.exports = { db, DATA_DIR };
