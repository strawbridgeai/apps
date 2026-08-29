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

// Nearby stores + this TCIN's availability -> [{ storeId, storeName, lat, lon, inStock }].
// Omitting store_id/store_positions_store_id (vs. the single-store shape
// some writeups show) is what asks Target's own aggregation for whichever
// stores are nearest the given lat/lon, per the "check_store_availability
// ... returns real-time pickup data for up to 5 nearby stores" behavior
// documented by the community - if this instead comes back scoped to only
// one store, that's the first thing to re-check against current writeups.
async function getNearbyStock(productId, lat, lon, _radiusMi) {
  const url =
    `${BASE}/pdp_fulfillment_v1?key=${PUBLIC_KEY}&tcin=${encodeURIComponent(productId)}` +
    `&latitude=${lat}&longitude=${lon}&has_store_positions_store_id=false&has_pricing_store_id=false&is_bot=false`;
  const data = await getJson(url);
  const options = data?.data?.product?.fulfillment?.store_options || [];
  return options.map((s) => ({
    storeId: String(s.location_id),
    storeName: s.location_name,
    lat: s.location_geo_coordinates?.latitude ?? lat,
    lon: s.location_geo_coordinates?.longitude ?? lon,
    inStock: s.order_pickup?.availability_status === 'IN_STOCK',
  }));
}

// Target's plain "/p/-/A-{tcin}" product URL redirects to the full
// slugged page and never expires (confirmed live, 2026-08-29) - no API
// call needed, unlike Best Buy's expiring click-tracking link.
async function getProductUrl(productId) {
  return `https://www.target.com/p/-/A-${encodeURIComponent(productId)}`;
}

module.exports = { name: 'target', searchProducts, getNearbyStock, getProductUrl };
