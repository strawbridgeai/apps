// Best Buy's official, documented developer API
// (https://bestbuyapis.github.io/api-documentation/) — the lowest-risk
// integration here, no ToS gray area. Requires a free API key from
// developer.bestbuy.com; only the account owner can create one, so this
// reads it from BESTBUY_API_KEY (see the systemd EnvironmentFile) rather
// than hardcoding anything. NOTE: written against the documented endpoint
// shapes, but not exercised against a real key during development (no key
// was available) - the first real run with a live key is the actual test;
// if a field name below turns out wrong, check the current docs at the
// URL above before assuming the whole approach is broken.
const BASE = 'https://api.bestbuy.com/v1';

function apiKey() {
  const key = process.env.BESTBUY_API_KEY;
  if (!key) throw new Error('BESTBUY_API_KEY not configured');
  return key;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Best Buy API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

// Keyword search -> a short list of { productId, name, imageUrl }.
async function searchProducts(query) {
  const url = `${BASE}/products(search=${encodeURIComponent(query)}&categoryPath.name=Trading Card Games)?apiKey=${apiKey()}&format=json&show=sku,name,image&pageSize=10`;
  const data = await getJson(url);
  return (data.products || []).map((p) => ({
    productId: String(p.sku),
    name: p.name,
    imageUrl: p.image,
  }));
}

// Nearby stores + this SKU's availability at each -> [{ storeId, storeName, lat, lon, inStock }]
async function getNearbyStock(productId, lat, lon, radiusMi) {
  const storesUrl = `${BASE}/stores(area(${lat},${lon},${radiusMi}))?apiKey=${apiKey()}&format=json&show=storeId,name,lat,lng&pageSize=50`;
  const storesData = await getJson(storesUrl);
  const stores = storesData.stores || [];
  if (!stores.length) return [];

  // Per-store availability for this one SKU, documented as
  // /v1/products/{sku}/stores.json — returns availability entries keyed by
  // storeId for the stores that carry it; treated as in-stock only when
  // explicitly marked so, out-of-stock (not "unknown") otherwise.
  const availUrl = `${BASE}/products/${encodeURIComponent(productId)}/stores.json?apiKey=${apiKey()}&area(${lat},${lon},${radiusMi})`;
  const availData = await getJson(availUrl).catch(() => ({ stores: [] }));
  const availByStore = new Map((availData.stores || []).map((s) => [String(s.storeId), s]));

  return stores.map((s) => {
    const avail = availByStore.get(String(s.storeId));
    return {
      storeId: String(s.storeId),
      storeName: s.name,
      lat: s.lat,
      lon: s.lng,
      inStock: !!(avail && (avail.lowStock === false || avail.storeAvailability > 0)),
    };
  });
}

module.exports = { name: 'bestbuy', searchProducts, getNearbyStock };
