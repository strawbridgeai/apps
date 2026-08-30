// Target's "Redsky" API — the same one target.com's own frontend calls,
// not an officially published/supported developer API. No per-user key is
// needed (the `key` value below is a long-standing public identifier
// shared by the whole community of tools using this endpoint), but this
// is meaningfully higher-risk than the Best Buy provider:
//   - Undocumented: field/endpoint names below are reverse-engineered from
//     public writeups, not an official spec, and can change without notice.
//   - Target's own community has reported this box's IP getting rate-
//     limited/blocked after aggressive polling - poller.js deliberately
//     keeps Target's polling interval longer than Best Buy's for this
//     reason (see poller.js).
//   - Not exercised against live traffic during development - the first
//     real run is the actual test. If parsing breaks, check current
//     community writeups (search "target redsky api") before assuming the
//     whole approach is dead; these endpoints have shifted names before.
const crypto = require('crypto');
const { db } = require('../db.js');

const BASE = 'https://redsky.target.com/redsky_aggregations/v1/web';
const PUBLIC_KEY = 'ff457966e64d5e877fdbad070f276d18ecec4a0';

// plp_search_v2 now rejects requests with no visitor_id (confirmed live,
// 2026-08-29: "Variable 'visitor_id' has coerced Null value for NonNull
// type 'String!'") - target.com's frontend normally persists one per
// browser in a cookie, but the field isn't validated against anything real,
// so a random 32-hex-char value (the same shape) per process is enough.
const VISITOR_ID = crypto.randomBytes(16).toString('hex');

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Mozilla/5.0 (restock-tracker; contact via strawbridgeai.com)' },
  });
  if (!res.ok) throw new Error(`Target API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

// Keyword search -> a short list of { productId (tcin), name, imageUrl }.
async function searchProducts(query) {
  const url =
    `${BASE}/plp_search_v2?key=${PUBLIC_KEY}&keyword=${encodeURIComponent(query)}` +
    `&channel=WEB&count=10&offset=0&page=%2Fs%2F${encodeURIComponent(query)}&platform=desktop&pricing_store_id=3991` +
    `&visitor_id=${VISITOR_ID}`;
  const data = await getJson(url);
  const items = data?.data?.search?.products || [];
  return items.map((p) => ({
    productId: String(p.tcin),
    name: p.item?.product_description?.title?.replace(/<[^>]+>/g, '') || `TCIN ${p.tcin}`,
    imageUrl: p.item?.enrichment?.images?.primary_image_url || null,
  }));
}

// pdp_fulfillment_v1 (the endpoint this used originally) now returns a flat
// 410 Gone - confirmed live, 2026-08-30, while building the map-pin feature
// this was supposed to power. Target's site now does this as two separate
// calls instead of one, so this does the same:
//   1. nearby_stores_v1 - stores near a point (address only, no lat/lon)
//   2. product_summary_with_fulfillment_v1 with a specific store_id - that
//      one store's pickup/in-store availability for this tcin (confirmed
//      live: comma-joining multiple store_ids in one call is rejected with
//      "must be a valid physical store", so this is one request per store)

const getGeocodeCache = db.prepare('SELECT lat, lon FROM store_geocode WHERE address = ?');
const setGeocodeCache = db.prepare('INSERT OR REPLACE INTO store_geocode (address, lat, lon, cached_at) VALUES (?, ?, ?, ?)');
let lastNominatimCall = 0;

// Nominatim's usage policy caps public requests at ~1/sec and requires a
// real identifying User-Agent - only hit it on a cache miss (repeat polls
// of the same stores are then free), and space out any misses that land in
// the same poll cycle.
async function geocodeAddress(address) {
  const cached = getGeocodeCache.get(address);
  if (cached) return cached;
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'restock-tracker (personal use; contact via strawbridgeai.com)' },
  });
  const results = await res.json();
  const hit = results?.[0];
  if (!hit) return null;
  const geo = { lat: Number(hit.lat), lon: Number(hit.lon) };
  setGeocodeCache.run(address, geo.lat, geo.lon, Date.now());
  return geo;
}

async function nearbyStores(lat, lon, radiusMi) {
  const url = `${BASE}/nearby_stores_v1?key=${PUBLIC_KEY}&place=${lat},${lon}&limit=10&visitor_id=${VISITOR_ID}`;
  const data = await getJson(url);
  const stores = data?.data?.nearby_stores?.stores || [];
  return stores.filter((s) => typeof s.distance !== 'number' || s.distance <= radiusMi);
}

async function storeAvailability(productId, storeId) {
  const url = `${BASE}/product_summary_with_fulfillment_v1?key=${PUBLIC_KEY}&tcins=${encodeURIComponent(productId)}&store_id=${encodeURIComponent(storeId)}&visitor_id=${VISITOR_ID}`;
  const data = await getJson(url);
  const opt = data?.data?.product_summaries?.[0]?.fulfillment?.store_options?.[0];
  if (!opt) return false;
  return [opt.order_pickup, opt.in_store_only, opt.ship_to_store].some((f) => f?.availability_status === 'IN_STOCK');
}

// Nearby stores + this TCIN's availability -> [{ storeId, storeName, lat, lon, inStock }].
async function getNearbyStock(productId, lat, lon, radiusMi) {
  const stores = await nearbyStores(lat, lon, radiusMi);
  const out = [];
  for (const s of stores) {
    const addr = s.mailing_address;
    const fullAddress = addr ? `${addr.address_line1}, ${addr.city}, ${addr.region} ${addr.postal_code}` : null;
    const geo = fullAddress ? await geocodeAddress(fullAddress).catch(() => null) : null;
    if (!geo) continue; // no pin without coordinates
    let inStock = false;
    try {
      inStock = await storeAvailability(productId, s.store_id);
    } catch (err) {
      console.error(`[target] storeAvailability(${productId}, ${s.store_id}) failed:`, err.message);
    }
    out.push({ storeId: String(s.store_id), storeName: s.location_name, lat: geo.lat, lon: geo.lon, inStock });
  }
  return out;
}

// product_summary_with_fulfillment_v1's own enrichment.buy_url is the real,
// full slugged product page (confirmed live, 2026-08-30) - falls back to
// the plain "/p/-/A-{tcin}" pattern (also confirmed to redirect correctly)
// if that field is ever missing, same idea as the Best Buy provider's
// fallback.
async function getProductUrl(productId) {
  const fallback = `https://www.target.com/p/-/A-${encodeURIComponent(productId)}`;
  try {
    const url = `${BASE}/product_summary_with_fulfillment_v1?key=${PUBLIC_KEY}&tcins=${encodeURIComponent(productId)}&visitor_id=${VISITOR_ID}`;
    const data = await getJson(url);
    return data?.data?.product_summaries?.[0]?.item?.enrichment?.buy_url || fallback;
  } catch (err) {
    console.error(`[target] getProductUrl(${productId}) failed:`, err.message);
    return fallback;
  }
}

module.exports = { name: 'target', searchProducts, getNearbyStock, getProductUrl };
