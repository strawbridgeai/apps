// Background "live scrape and refresh" loop. Runs independently of any
// browser session - each tracked product carries its own ref_lat/ref_lon
// (captured when it was added) since there's no active "user" to ask.
//
// Polling interval is deliberately per-retailer, not one global cadence:
// Target's own community has documented IP blocking under aggressive
// polling (see providers/target.js), so it gets a longer interval than
// Best Buy's officially-supported API.
const { db } = require('./db.js');
const bestbuy = require('./providers/bestbuy.js');
const target = require('./providers/target.js');
const { restockEmail, sendMail, sightingEmail, newListingEmail } = require('./mailer.js');
const { fetchSightings } = require('./sources/reddit.js');

const PROVIDERS = { bestbuy, target };
const POLL_RADIUS_MI = Number(process.env.POLL_RADIUS_MI || 50);
const INTERVALS_MS = {
  bestbuy: Number(process.env.BESTBUY_POLL_MS || 3 * 60 * 1000), // 3 min
  target: Number(process.env.TARGET_POLL_MS || 8 * 60 * 1000), // 8 min - see note above
};
const ONLINE_WATCH_INTERVAL_MS = Number(process.env.WATCH_POLL_MS || 5 * 60 * 1000);

// "Restock is coming" signals, independent of the per-product tracking
// above - see db.js's comment for why these two exist as separate tables.
const REDDIT_FEEDS = (process.env.REDDIT_FEEDS || 'https://www.reddit.com/r/PokemonRestocks/new/.rss')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const REDDIT_POLL_INTERVAL_MS = Number(process.env.REDDIT_POLL_MS || 60 * 1000); // 1 min - free/public RSS
const CATALOG_WATCH_QUERIES = (process.env.CATALOG_WATCH_QUERIES || 'pokemon trading card,pokemon booster,pokemon elite trainer box')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Slow and conservative - this hits the same search endpoints as manual
// product search (plp_search_v2 for Target in particular), see the
// rate-limiting note in providers/target.js.
const CATALOG_WATCH_INTERVAL_MS = Number(process.env.CATALOG_WATCH_POLL_MS || 25 * 60 * 1000);

const updateProductUrl = db.prepare('UPDATE tracked_products SET product_url = ? WHERE id = ?');

const upsertSnapshot = db.prepare(`
  INSERT INTO stock_snapshots (tracked_product_id, store_id, store_name, lat, lon, in_stock, checked_at)
  VALUES (@tracked_product_id, @store_id, @store_name, @lat, @lon, @in_stock, @checked_at)
  ON CONFLICT(tracked_product_id, store_id) DO UPDATE SET
    store_name = excluded.store_name, lat = excluded.lat, lon = excluded.lon,
    in_stock = excluded.in_stock, checked_at = excluded.checked_at
`);
const getPriorSnapshot = db.prepare('SELECT in_stock FROM stock_snapshots WHERE tracked_product_id = ? AND store_id = ?');
const subsForProduct = db.prepare("SELECT * FROM subscriptions WHERE enabled = 1 AND ((target_type = 'product' AND target_id = ?) OR target_type = 'all')");
const unsubscribeUrl = (token) => `${process.env.PUBLIC_BASE_URL || 'https://strawbridgeai.com'}/apps/restock-tracker/api/unsubscribe?token=${token}`;

// The two new "restock is coming" signals aren't tied to any specific
// tracked product/watch, so - matching how the rest of this app already
// treats target_type='all' as a global subscription - they only ever
// notify 'all' subscribers rather than adding new per-item subscription
// granularity.
const subsForAll = db.prepare("SELECT * FROM subscriptions WHERE enabled = 1 AND target_type = 'all'");

async function pollProduct(product) {
  const provider = PROVIDERS[product.retailer];
  if (!provider) return;
  let results;
  try {
    results = await provider.getNearbyStock(product.product_id, product.ref_lat, product.ref_lon, POLL_RADIUS_MI);
  } catch (err) {
    console.error(`[poller] ${product.retailer}/${product.product_id} check failed:`, err.message);
    return;
  }
  const now = Date.now();
  const restockedStores = [];
  for (const store of results) {
    const prior = getPriorSnapshot.get(product.id, store.storeId);
    const wasOutOfStock = !prior || prior.in_stock === 0;
    upsertSnapshot.run({
      tracked_product_id: product.id,
      store_id: store.storeId,
      store_name: store.storeName,
      lat: store.lat,
      lon: store.lon,
      in_stock: store.inStock ? 1 : 0,
      checked_at: now,
    });
    if (wasOutOfStock && store.inStock) restockedStores.push(store);
  }
  if (!restockedStores.length) return;

  // Only worth the extra request (and, for Best Buy, extra API-quota use)
  // when there's actually a restock to email about - the link's only
  // consumer today is that email, not the map view.
  const buyUrl = await provider.getProductUrl(product.product_id).catch(() => null);
  if (buyUrl) updateProductUrl.run(buyUrl, product.id);
  const subs = subsForProduct.all(product.id);
  for (const store of restockedStores) {
    for (const sub of subs) {
      restockEmail({
        to: sub.email,
        productName: product.name,
        storeName: store.storeName,
        retailer: product.retailer,
        buyUrl,
        unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token),
      }).catch((err) => console.error('[poller] email send failed:', err.message));
    }
  }
}

async function pollAllForRetailer(retailer) {
  const products = db.prepare('SELECT * FROM tracked_products WHERE retailer = ?').all(retailer);
  for (const product of products) {
    await pollProduct(product);
  }
}

// Default heuristic for the online-watch tab: absence of common
// out-of-stock phrasing = probably in stock. Best-effort, plain-fetch only
// (no headless browser - see the plan's resource-constraint note), so this
// won't work on pages that render their availability state client-side in
// JS. A per-watch `in_stock_text` override can require a specific phrase
// instead of relying on this heuristic.
const DEFAULT_OOS_PATTERNS = [/sold\s*out/i, /out\s*of\s*stock/i, /currently unavailable/i, /notify me/i];

const subsForWatch = db.prepare("SELECT * FROM subscriptions WHERE enabled = 1 AND ((target_type = 'watch' AND target_id = ?) OR target_type = 'all')");
const updateWatch = db.prepare('UPDATE online_watches SET last_status = ?, last_checked_at = ? WHERE id = ?');

async function pollOnlineWatches() {
  const watches = db.prepare('SELECT * FROM online_watches').all();
  for (const watch of watches) {
    let status = 'unknown';
    try {
      const res = await fetch(watch.url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (restock-tracker watcher; personal use)' },
      });
      const html = await res.text();
      if (watch.in_stock_text) {
        status = html.includes(watch.in_stock_text) ? 'in-stock' : 'out-of-stock';
      } else {
        status = DEFAULT_OOS_PATTERNS.some((re) => re.test(html)) ? 'out-of-stock' : 'in-stock';
      }
    } catch (err) {
      console.error(`[poller] watch ${watch.id} check failed:`, err.message);
    }
    const wasOutOfStock = watch.last_status !== 'in-stock';
    updateWatch.run(status, Date.now(), watch.id);
    if (wasOutOfStock && status === 'in-stock') {
      const subs = subsForWatch.all(watch.id);
      for (const sub of subs) {
        sendMail({
          to: sub.email,
          subject: `Restock: ${watch.label}`,
          text:
            `${watch.label} looks like it's back in stock:\n${watch.url}\n\n` +
            `This is an alert only - nothing was purchased on your behalf.\n\n` +
            `Stop alerts for this item: ${unsubscribeUrl(sub.unsubscribe_token)}`,
        }).catch((err) => console.error('[poller] email send failed:', err.message));
      }
    }
  }
}

const insertSighting = db.prepare(`
  INSERT OR IGNORE INTO reddit_sightings (post_id, retailer, title, url, matched_keyword, posted_at, alerted_at)
  VALUES (@post_id, @retailer, @title, @url, @matched_keyword, @posted_at, @alerted_at)
`);

async function pollRedditSightings() {
  let sightings;
  try {
    sightings = await fetchSightings(REDDIT_FEEDS);
  } catch (err) {
    console.error('[poller] reddit sightings fetch failed:', err.message);
    return;
  }
  const subs = subsForAll.all();
  for (const s of sightings) {
    const info = insertSighting.run({
      post_id: s.postId,
      retailer: s.retailer,
      title: s.title,
      url: s.url,
      matched_keyword: s.matchedKeyword,
      posted_at: s.postedAt,
      alerted_at: Date.now(),
    });
    if (!info.changes) continue; // already alerted on this post+retailer before
    for (const sub of subs) {
      sightingEmail({
        to: sub.email,
        retailer: s.retailer,
        title: s.title,
        url: s.url,
        unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token),
      }).catch((err) => console.error('[poller] sighting email send failed:', err.message));
    }
  }
}

const getCatalogItem = db.prepare('SELECT 1 FROM catalog_seen WHERE retailer = ? AND product_id = ?');
const countCatalogForRetailer = db.prepare('SELECT COUNT(*) AS n FROM catalog_seen WHERE retailer = ?');
const insertCatalogItem = db.prepare(`
  INSERT OR IGNORE INTO catalog_seen (retailer, product_id, name, first_seen_at, alerted)
  VALUES (@retailer, @product_id, @name, @first_seen_at, @alerted)
`);

async function pollNewListings() {
  const subs = subsForAll.all();
  for (const retailer of Object.keys(PROVIDERS)) {
    const provider = PROVIDERS[retailer];
    // Never alert on a retailer's very first run - that would flood every
    // already-existing catalog item as "new". Only genuinely new rows
    // after this initial seed get emailed.
    const isFirstRun = countCatalogForRetailer.get(retailer).n === 0;
    let seen = [];
    for (const query of CATALOG_WATCH_QUERIES) {
      try {
        const items = await provider.searchProducts(query);
        seen.push(...items);
      } catch (err) {
        console.error(`[poller] ${retailer} catalog search (${query}) failed:`, err.message);
      }
    }
    for (const item of seen) {
      if (getCatalogItem.get(retailer, item.productId)) continue;
      const info = insertCatalogItem.run({
        retailer,
        product_id: item.productId,
        name: item.name,
        first_seen_at: Date.now(),
        alerted: isFirstRun ? 1 : 0,
      });
      if (!info.changes || isFirstRun) continue;
      for (const sub of subs) {
        newListingEmail({
          to: sub.email,
          retailer,
          name: item.name,
          unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token),
        }).catch((err) => console.error('[poller] new-listing email send failed:', err.message));
      }
    }
  }
}

function start() {
  for (const retailer of Object.keys(INTERVALS_MS)) {
    setInterval(() => pollAllForRetailer(retailer).catch((e) => console.error(`[poller] ${retailer} cycle failed:`, e)), INTERVALS_MS[retailer]).unref();
  }
  setInterval(() => pollOnlineWatches().catch((e) => console.error('[poller] watch cycle failed:', e)), ONLINE_WATCH_INTERVAL_MS).unref();
  setInterval(() => pollRedditSightings().catch((e) => console.error('[poller] reddit sightings cycle failed:', e)), REDDIT_POLL_INTERVAL_MS).unref();
  setInterval(() => pollNewListings().catch((e) => console.error('[poller] new-listings cycle failed:', e)), CATALOG_WATCH_INTERVAL_MS).unref();
  // Run once immediately rather than waiting a full interval for the first
  // real data - matches the pattern server.js already uses for a freshly
  // added product/watch (poller.pollProduct / pollOnlineWatches on add).
  pollRedditSightings().catch((e) => console.error('[poller] initial reddit sightings poll failed:', e));
  pollNewListings().catch((e) => console.error('[poller] initial new-listings poll failed:', e));
}

module.exports = { start, pollProduct, pollOnlineWatches, pollRedditSightings, pollNewListings };
