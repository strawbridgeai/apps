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

  -- Verdict cache for the upstream set feed (see set-sync.js). One row per
  -- upstream set id ever seen, holding the fields the accept/reject rules
  -- need, so a run only fetches set detail for ids it has never evaluated -
  -- steady state is a single list request. Re-evaluating the date window
  -- (which moves as time passes, and as TBA sets get real dates) reads from
  -- here instead of going back over the network.
  CREATE TABLE IF NOT EXISTS set_sync_log (
    upstream_id TEXT PRIMARY KEY,
    upstream_name TEXT NOT NULL,
    serie_id TEXT,
    serie_name TEXT,
    release_iso TEXT,                 -- 'YYYY-MM-DD', NULL when upstream has no date yet
    card_count INTEGER,
    verdict TEXT NOT NULL,            -- 'added' | 'existing' | 'rejected'
    reason TEXT NOT NULL,
    local_id TEXT,
    checked_at INTEGER NOT NULL       -- ms epoch of the last detail fetch
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// pokemon_sets predates the auto-sync, so widen it in place rather than
// asking for a wipe: these apps hold real community reports that reference
// set ids by foreign key. ADD COLUMN is the only ALTER SQLite supports here,
// and it can't take a computed default, hence the nullable columns + backfill
// below.
const setColumns = new Set(db.prepare('PRAGMA table_info(pokemon_sets)').all().map((c) => c.name));
const addSetColumn = (name, decl) => {
  if (!setColumns.has(name)) db.exec(`ALTER TABLE pokemon_sets ADD COLUMN ${name} ${decl}`);
};
// Sortable form of release_date, which is human text ('September 26, 2025')
// because the UI prints it verbatim. Needed to order the catalog so a
// just-released set lands at the top instead of wherever SQLite returns it.
addSetColumn('release_iso', 'TEXT');
addSetColumn('upstream_id', 'TEXT');
addSetColumn('source', "TEXT NOT NULL DEFAULT 'seed'");   // 'seed' | 'tcgdex' | 'manual'
addSetColumn('added_at', 'INTEGER');                      // ms epoch; drives the "New" badge
addSetColumn('card_count', 'INTEGER');

// The stores table was six hardcoded demo rows - one Target, one Best Buy,
// one Walmart, one Dollar General and two invented hobby shops, all in
// Manhattan. store-lookup.js fills it from OpenStreetMap now, so these
// columns record where a row came from and let a real store be told apart
// from (and deduped against) the original demo data.
const storeColumns = new Set(db.prepare('PRAGMA table_info(stores)').all().map((c) => c.name));
const addStoreColumn = (name, decl) => {
  if (!storeColumns.has(name)) db.exec(`ALTER TABLE stores ADD COLUMN ${name} ${decl}`);
};
addStoreColumn('source', "TEXT NOT NULL DEFAULT 'seed'");   // 'seed' | 'osm'
addStoreColumn('osm_id', 'TEXT');
addStoreColumn('website', 'TEXT');
addStoreColumn('fetched_at', 'INTEGER');

db.exec(`
  -- Which geographic circles have already been pulled from Overpass. A
  -- request is only allowed to hit the network when its whole search circle
  -- falls outside every circle already fetched, which keeps a free community
  -- API from being queried on every page load.
  CREATE TABLE IF NOT EXISTS store_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    radius_mi REAL NOT NULL,
    fetched_at INTEGER NOT NULL,
    store_count INTEGER NOT NULL
  );
`);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// 'September 26, 2025' -> '2025-09-26'. Deliberately not Date.parse: that
// reads the string in the server's local zone and can slip a day.
function humanDateToIso(human) {
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(String(human || '').trim());
  if (!match) return null;
  const month = MONTHS.findIndex((m) => m.toLowerCase() === match[1].toLowerCase());
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

// '2026-09-16' -> 'September 16, 2026', matching the seed rows' formatting.
// Built by hand rather than toLocaleDateString so the output does not depend
// on the service's locale/ICU build.
function isoToHumanDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!match) return null;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function backfillReleaseIso() {
  const rows = db.prepare('SELECT id, release_date FROM pokemon_sets WHERE release_iso IS NULL').all();
  if (rows.length === 0) return;
  const update = db.prepare('UPDATE pokemon_sets SET release_iso = ? WHERE id = ?');
  db.transaction(() => {
    for (const row of rows) {
      const iso = humanDateToIso(row.release_date);
      if (iso) update.run(iso, row.id);
    }
  })();
}
backfillReleaseIso();

// Rows that existed before `added_at` did are seed rows, not new arrivals -
// stamp them in the past so none of them light up as "New" on first deploy.
db.prepare('UPDATE pokemon_sets SET added_at = 0 WHERE added_at IS NULL').run();

const getMeta = (key) => db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key)?.value ?? null;
const setMeta = (key, value) => db.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

module.exports = { db, DATA_DIR, humanDateToIso, isoToHumanDate, getMeta, setMeta };
