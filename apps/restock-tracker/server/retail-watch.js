// Watches retailer product listings for the sets in our catalog, to catch the
// moment a restock becomes visible in a retailer's data - which is earlier,
// and finer-grained, than what the storefront shows a person refreshing a
// product page.
//
// WALMART IS NOT HERE ON PURPOSE. www.walmart.com answers this host with
// HTTP 307 "blocked - redirecting" on the very first unauthenticated request:
// their bot defense rejects datacenter IPs outright, so there is no polite
// request rate that works. Walmart does run an official affiliate/marketplace
// API, but it needs an approved developer key; until someone holds one,
// anything Walmart-shaped here would be a feature that silently never fires.
// Same reason Best Buy is absent - BESTBUY_API_KEY in api.env is still empty.
//
// TARGET IS RATE-LIMITED HARDER THAN IT LOOKS. Redsky answers happily for
// the first handful of calls and then returns HTTP 435 for *every* endpoint
// from that IP, search included, for a long cooldown - measured on this host
// at ~20 requests inside 3 minutes, and the block outlasted a 6.5-minute
// probe. That single fact drives the whole design below: a tiny fixed budget
// per cycle, real spacing between calls, and a circuit breaker that backs off
// hard rather than hammering a door that has already closed.
const { db, getMeta, setMeta } = require('./db.js');

const REDSKY = 'https://redsky.target.com/redsky_aggregations/v1/web';
// Target's public web key, the one their own storefront JS ships to every
// visitor. Not a credential and not tied to an account - it identifies the
// web channel, which is why it can sit in source.
const TARGET_KEY = process.env.TARGET_WEB_KEY || '9f36aeafbe60771e321a7cc95a78140772ab3e96';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const ENABLED = process.env.RETAIL_WATCH_ENABLED !== '0';
const CYCLE_MS = Number(process.env.RETAIL_WATCH_INTERVAL_MS) || 15 * 60 * 1000;
// One catalog search plus this many per-product probes per cycle. Three
// requests per 15 minutes averages one request every five minutes, an order
// of magnitude under the burst that tripped the block.
const PROBES_PER_CYCLE = Number(process.env.RETAIL_WATCH_PROBES) || 2;
const REQUEST_SPACING_MS = Number(process.env.RETAIL_WATCH_SPACING_MS) || 8000;
const REQUEST_TIMEOUT_MS = 15000;
const SEARCH_TERM = process.env.RETAIL_WATCH_QUERY || 'pokemon trading card';
// A set released inside this window is "hot" - still being restocked and
// still being chased. Older sets keep getting checked, just less often.
const HOT_SET_DAYS = Number(process.env.RETAIL_WATCH_HOT_DAYS) || 45;
// Where "online" stock is quoted from. A physical store id is required -
// Redsky rejects the digital store (3991) with a DataFetchingException - and
// it also sets which store's pickup availability comes back.
const STORE_ID = process.env.RETAIL_WATCH_STORE_ID || '3380';
const STORE_ZIP = process.env.RETAIL_WATCH_ZIP || '10003';
const STORE_LAT = process.env.RETAIL_WATCH_LAT || '40.7359';
const STORE_LNG = process.env.RETAIL_WATCH_LNG || '-73.9911';

// 435 is Target's bot rejection. 429/403 are the conventional ones. Any of
// them means stop asking for a while, not retry.
const BLOCK_CODES = new Set([403, 429, 435]);
const COOLDOWN_STEPS_MS = [15, 30, 60, 120].map((m) => m * 60 * 1000);

db.exec(`
  CREATE TABLE IF NOT EXISTS retail_listings (
    retailer TEXT NOT NULL,
    product_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    set_id TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    last_checked_at INTEGER,
    last_status TEXT,
    last_qty REAL,
    last_pickup TEXT,
    PRIMARY KEY (retailer, product_id)
  );

  -- The instrument that actually answers "does the listing move before the
  -- storefront does": every transition with the wall-clock time we saw it.
  CREATE TABLE IF NOT EXISTS retail_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retailer TEXT NOT NULL,
    product_id TEXT NOT NULL,
    set_id TEXT,
    title TEXT NOT NULL,
    url TEXT,
    kind TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    detected_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_retail_events_set ON retail_events(set_id, detected_at DESC);
`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BlockedError extends Error {
  constructor(status) { super(`retailer returned ${status}`); this.status = status; }
}

async function redsky(path, params) {
  const qs = new URLSearchParams({ key: TARGET_KEY, ...params });
  const res = await fetch(`${REDSKY}${path}?${qs}`, {
    headers: { 'User-Agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (BLOCK_CODES.has(res.status)) throw new BlockedError(res.status);
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

// Matching a retailer title to one of our sets is the part that quietly
// goes wrong. Two signals, strongest first.
//
// 1. The set code. Target titles carry it ("Pokemon ME5 Mega Evolution Pitch
//    Black Elite Trainer Box", "Pokemon SV8.5 ... Prismatic Evolutions"), and
//    it maps straight onto the upstream_id the catalog sync already stores -
//    ME5 -> me05, ME2.5 -> me02.5, SV8.5 -> sv08.5. Exact, and immune to
//    marketing text.
//
// 2. The set name as a whole phrase, longest match wins - but with the
//    series name demoted. Plain longest-match put "Pitch Black", "Perfect
//    Order" and "Chaos Rising" ALL on me-mega-evolution, because "Mega
//    Evolution" is both a series and a set in its own right, appears in every
//    ME title as branding, and is longer than any of them. A set whose name
//    is also its series name only wins when nothing more specific matched.
const normalize = (s) => String(s || '')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let setCache = { at: 0, rows: [] };
function cachedSets() {
  if (Date.now() - setCache.at > 60_000) {
    setCache = { at: Date.now(), rows: db.prepare('SELECT id, name, series, upstream_id FROM pokemon_sets').all() };
  }
  return setCache.rows;
}

// 'ME5' -> 'me05', 'ME2.5' -> 'me02.5', 'SV10' -> 'sv10'. The integer part is
// what upstream zero-pads; any decimal suffix rides along untouched.
function codeToUpstreamId(prefix, number) {
  const [whole, fraction] = String(number).split('.');
  const padded = whole.padStart(2, '0');
  return `${prefix.toLowerCase()}${padded}${fraction ? `.${fraction}` : ''}`;
}

function matchSetId(title) {
  const sets = cachedSets();
  const raw = String(title || '').replace(/&[a-z]+;|&#\d+;/gi, ' ');

  const code = /\b(ME|SV|SWSH)\s?(\d{1,2}(?:\.\d)?)\b/i.exec(raw);
  if (code) {
    const wanted = codeToUpstreamId(code[1], code[2]);
    const hit = sets.find((s) => String(s.upstream_id || '').toLowerCase() === wanted);
    if (hit) return hit.id;
  }

  const hay = ` ${normalize(raw)} `;
  let best = null;
  for (const s of sets) {
    const needle = ` ${normalize(s.name)} `;
    if (!hay.includes(needle)) continue;
    // A bare-number set name ("151") turns up inside card counts and years,
    // so it only counts as the standalone token the whole-phrase check
    // already requires - but never as a two-character fragment.
    if (needle.trim().length < 3) continue;
    const generic = normalize(s.name) === normalize(s.series);
    const rank = [generic ? 0 : 1, needle.length];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) {
      best = { id: s.id, rank };
    }
  }
  return best?.id || null;
}

const selectListing = db.prepare('SELECT * FROM retail_listings WHERE retailer = ? AND product_id = ?');
const insertListing = db.prepare(`
  INSERT INTO retail_listings (retailer, product_id, title, url, set_id, first_seen_at, last_seen_at)
  VALUES (@retailer, @productId, @title, @url, @setId, @now, @now)
`);
const touchListing = db.prepare('UPDATE retail_listings SET last_seen_at = @now, title = @title, url = COALESCE(@url, url), set_id = COALESCE(@setId, set_id) WHERE retailer = @retailer AND product_id = @productId');
const recordProbe = db.prepare('UPDATE retail_listings SET last_checked_at = @now, last_status = @status, last_qty = @qty, last_pickup = @pickup WHERE retailer = @retailer AND product_id = @productId');
const insertEvent = db.prepare(`
  INSERT INTO retail_events (retailer, product_id, set_id, title, url, kind, from_value, to_value, detected_at)
  VALUES (@retailer, @productId, @setId, @title, @url, @kind, @fromValue, @toValue, @now)
`);

function targetUrl(p) {
  const raw = p?.item?.enrichment?.buy_url;
  return raw || `https://www.target.com/p/-/A-${p?.tcin}`;
}

// Job 1: has a listing appeared that was not in the catalog before? This is
// the earliest observable signal - a product page exists, and is being
// indexed, before it is purchasable.
async function catalogWatch(summary) {
  const data = await redsky('/plp_search_v2', {
    keyword: SEARCH_TERM, channel: 'WEB', count: '24', offset: '0',
    page: '/s/pokemon', pricing_store_id: STORE_ID,
    visitor_id: `0192B3D4E5F6${String(Date.now() % 10000).padStart(4, '0')}`,
  });
  summary.requests += 1;
  const products = data?.data?.search?.products || [];
  summary.searched = products.length;
  const now = Date.now();

  for (const p of products) {
    const productId = String(p?.tcin || '');
    if (!productId) continue;
    const title = String(p?.item?.product_description?.title || '').replace(/<[^>]+>/g, '').trim();
    const url = targetUrl(p);
    const setId = matchSetId(title);
    const existing = selectListing.get('target', productId);
    const row = { retailer: 'target', productId, title, url, setId, now };
    if (!existing) {
      db.transaction(() => {
        insertListing.run(row);
        insertEvent.run({ ...row, kind: 'listing_appeared', fromValue: null, toValue: 'listed' });
      })();
      summary.newListings.push({ productId, title, setId });
      console.log(`[retail-watch] new target listing ${productId} - ${title.slice(0, 70)}${setId ? ` -> ${setId}` : ''}`);
    } else {
      touchListing.run(row);
    }
  }
}

// Job 2: for a couple of listings per cycle, ask what the retailer's own
// fulfillment data says. available_to_promise_quantity is the part the
// storefront never shows - it reads as a plain "in stock", while the number
// behind it moves.
async function probeListings(summary) {
  // With a budget this small, WHICH listings get probed is the whole feature:
  // 24 tracked listings at 2 probes per cycle is a three-hour lap, so a plain
  // stalest-first rotation would check a 2023 set's blister pack while the
  // set that dropped this week goes unwatched.
  //
  // Split the budget instead. Half goes to listings for recently-released
  // sets - the ones actually being hunted - and the rest to the global
  // stalest-first rotation, so focus does not turn into starvation for
  // everything else. Ordering purely by release date would have meant the
  // newest set's listings monopolised every cycle forever.
  const hotCutoff = new Date(Date.now() - HOT_SET_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hotSlots = Math.max(1, Math.floor(PROBES_PER_CYCLE / 2));
  const hot = db.prepare(`
    SELECT rl.* FROM retail_listings rl
    JOIN pokemon_sets ps ON ps.id = rl.set_id
    WHERE rl.retailer = 'target' AND COALESCE(ps.release_iso, '0000-00-00') >= ?
    ORDER BY COALESCE(rl.last_checked_at, 0) ASC
    LIMIT ?
  `).all(hotCutoff, hotSlots);

  const picked = new Set(hot.map((r) => r.product_id));
  const rest = db.prepare(`
    SELECT * FROM retail_listings
    WHERE retailer = 'target'
    ORDER BY (set_id IS NULL), COALESCE(last_checked_at, 0) ASC
    LIMIT ?
  `).all(PROBES_PER_CYCLE + hot.length)
    .filter((r) => !picked.has(r.product_id))
    .slice(0, PROBES_PER_CYCLE - hot.length);

  const candidates = [...hot, ...rest];

  for (const listing of candidates) {
    await sleep(REQUEST_SPACING_MS);
    const data = await redsky('/product_fulfillment_v1', {
      tcin: listing.product_id, store_id: STORE_ID, zip: STORE_ZIP, state: 'NY',
      latitude: STORE_LAT, longitude: STORE_LNG,
      required_store_id: STORE_ID, has_required_store_id: 'true',
    });
    summary.requests += 1;
    const ff = data?.data?.product?.fulfillment || {};
    const ship = ff.shipping_options || {};
    const store = (ff.store_options || [])[0] || {};
    const status = ship.availability_status || null;
    const qty = typeof ship.available_to_promise_quantity === 'number' ? ship.available_to_promise_quantity : null;
    const pickup = store.order_pickup?.availability_status || null;
    const now = Date.now();
    const base = {
      retailer: 'target', productId: listing.product_id, setId: listing.set_id,
      title: listing.title, url: listing.url, now,
    };

    // Only a transition is worth recording. Writing a row every cycle would
    // bury the two or three moments that actually matter under thousands of
    // "still the same" rows.
    // The FIRST reading of a listing is a baseline, not a transition. Emitting
    // it recorded a null -> OUT_OF_STOCK "change" for every product on the
    // first pass - about fifty rows of noise on cycle one, burying the two or
    // three that mean something. listing_appeared already marks "first seen".
    const events = [];
    if (status && listing.last_status && status !== listing.last_status) {
      const restock = status === 'IN_STOCK' && listing.last_status !== 'IN_STOCK';
      events.push({ kind: restock ? 'restock' : 'status_change', fromValue: listing.last_status, toValue: status });
    }
    if (pickup && listing.last_pickup && pickup !== listing.last_pickup) {
      events.push({ kind: 'pickup_change', fromValue: listing.last_pickup, toValue: pickup });
    }
    // A quantity climbing from nothing is a replenishment landing, even while
    // the status string stays put.
    if (qty != null && listing.last_qty != null && qty !== listing.last_qty && (qty === 0 || listing.last_qty === 0)) {
      events.push({ kind: 'quantity_change', fromValue: String(listing.last_qty), toValue: String(qty) });
    }
    db.transaction(() => {
      recordProbe.run({ retailer: 'target', productId: listing.product_id, now, status, qty, pickup });
      for (const e of events) insertEvent.run({ ...base, ...e });
    })();
    for (const e of events) {
      summary.transitions.push({ productId: listing.product_id, ...e });
      console.log(`[retail-watch] ${listing.product_id} ${e.kind}: ${e.fromValue} -> ${e.toValue} (${listing.title.slice(0, 50)})`);
    }
  }
}

function inCooldown() {
  const until = Number(getMeta('retail_watch_cooldown_until') || 0);
  return until > Date.now() ? until : 0;
}

function tripBreaker(status) {
  const strikes = Number(getMeta('retail_watch_strikes') || 0) + 1;
  const wait = COOLDOWN_STEPS_MS[Math.min(strikes - 1, COOLDOWN_STEPS_MS.length - 1)];
  setMeta('retail_watch_strikes', strikes);
  setMeta('retail_watch_cooldown_until', Date.now() + wait);
  setMeta('retail_watch_last_block', `${status} at ${new Date().toISOString()}`);
  console.warn(`[retail-watch] blocked (${status}); backing off ${wait / 60000}m (strike ${strikes})`);
}

async function runCycle() {
  const summary = { ok: true, requests: 0, searched: 0, newListings: [], transitions: [], skipped: null, error: null };
  const until = inCooldown();
  if (until) {
    summary.skipped = `cooling down until ${new Date(until).toISOString()}`;
    return summary;
  }
  try {
    await catalogWatch(summary);
    await probeListings(summary);
    // A clean cycle clears the penalty box, so an isolated block does not
    // leave the watcher permanently timid.
    setMeta('retail_watch_strikes', 0);
    setMeta('retail_watch_last_success_at', Date.now());
  } catch (err) {
    summary.ok = false;
    summary.error = err.message;
    if (err instanceof BlockedError) tripBreaker(err.status);
    else console.error(`[retail-watch] cycle failed: ${err.message}`);
  }
  setMeta('retail_watch_last_run_at', Date.now());
  setMeta('retail_watch_last_status', summary.ok ? 'ok' : (summary.error || 'error'));
  return summary;
}

function watchStatus() {
  const lastRun = Number(getMeta('retail_watch_last_run_at') || 0) || null;
  const lastOk = Number(getMeta('retail_watch_last_success_at') || 0) || null;
  const until = Number(getMeta('retail_watch_cooldown_until') || 0);
  return {
    enabled: ENABLED,
    retailers: {
      // Stated plainly so the UI never implies coverage that does not exist.
      target: 'polling',
      walmart: 'unavailable - bot-blocked without an official API key',
      best_buy: 'unavailable - no BESTBUY_API_KEY configured',
    },
    intervalMinutes: Math.round(CYCLE_MS / 60000),
    lastRunAt: lastRun ? new Date(lastRun).toISOString() : null,
    lastSuccessAt: lastOk ? new Date(lastOk).toISOString() : null,
    lastStatus: getMeta('retail_watch_last_status'),
    lastBlock: getMeta('retail_watch_last_block'),
    cooldownUntil: until > Date.now() ? new Date(until).toISOString() : null,
    trackedListings: db.prepare("SELECT COUNT(*) n FROM retail_listings WHERE retailer='target'").get().n,
    events: db.prepare('SELECT COUNT(*) n FROM retail_events').get().n,
  };
}

function recentSignals(setId, limit = 10) {
  const rows = setId
    ? db.prepare('SELECT * FROM retail_events WHERE set_id = ? ORDER BY detected_at DESC LIMIT ?').all(setId, limit)
    : db.prepare('SELECT * FROM retail_events ORDER BY detected_at DESC LIMIT ?').all(limit);
  return rows.map((r) => ({
    id: String(r.id), retailer: r.retailer, productId: r.product_id, setId: r.set_id,
    title: r.title, url: r.url, kind: r.kind, from: r.from_value, to: r.to_value,
    detectedAt: new Date(r.detected_at).toISOString(),
  }));
}

function startRetailWatch() {
  if (!ENABLED) { console.log('[retail-watch] disabled via RETAIL_WATCH_ENABLED=0'); return; }
  const run = () => runCycle().catch((err) => console.error(`[retail-watch] unhandled: ${err.message}`));
  // Offset from the set-sync boot run so the two never fire together.
  setTimeout(run, 3 * 60 * 1000).unref?.();
  setInterval(run, CYCLE_MS);
  console.log(`[retail-watch] target watch every ${Math.round(CYCLE_MS / 60000)}m (${1 + PROBES_PER_CYCLE} requests/cycle)`);
}

module.exports = { runCycle, watchStatus, recentSignals, startRetailWatch, matchSetId };
