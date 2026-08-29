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
const { restockEmail, sendMail } = require('./mailer.js');

const PROVIDERS = { bestbuy, target };
const POLL_RADIUS_MI = Number(process.env.POLL_RADIUS_MI || 50);
const INTERVALS_MS = {
  bestbuy: Number(process.env.BESTBUY_POLL_MS || 3 * 60 * 1000), // 3 min
  target: Number(process.env.TARGET_POLL_MS || 8 * 60 * 1000), // 8 min - see note above
};
const ONLINE_WATCH_INTERVAL_MS = Number(process.env.WATCH_POLL_MS || 5 * 60 * 1000);

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
    if (wasOutOfStock && store.inStock) {
      const subs = subsForProduct.all(product.id);
      for (const sub of subs) {
        restockEmail({
          to: sub.email,
          productName: product.name,
          storeName: store.storeName,
          retailer: product.retailer,
          unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token),
        }).catch((err) => console.error('[poller] email send failed:', err.message));
      }
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

function start() {
  for (const retailer of Object.keys(INTERVALS_MS)) {
    setInterval(() => pollAllForRetailer(retailer).catch((e) => console.error(`[poller] ${retailer} cycle failed:`, e)), INTERVALS_MS[retailer]).unref();
  }
  setInterval(() => pollOnlineWatches().catch((e) => console.error('[poller] watch cycle failed:', e)), ONLINE_WATCH_INTERVAL_MS).unref();
}

module.exports = { start, pollProduct, pollOnlineWatches };
