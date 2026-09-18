// Fills the store directory with real stores near wherever someone is
// standing, from OpenStreetMap via the Overpass API.
//
// Before this, `stores` was six hardcoded demo rows: one Target, one Best
// Buy, one Walmart, one Dollar General and two invented hobby shops with
// 555 phone numbers, all within a few miles of Union Square. /api/stores
// distance-filtered those six, so six was the hard ceiling no matter where
// the user was or how wide they set the radius - and outside New York the
// panel was simply empty.
//
// Overpass was chosen because it is the only source that covers all four
// chains at once, anywhere, with no API key: Target, Walmart, Best Buy and
// Dollar General all carry brand:wikidata tags, and local game shops come
// along from shop=games. Target's own Redsky endpoint returns better data
// for Target specifically (authoritative phone numbers), but it is the same
// API that rate-limits this host into a ten-minute block after ~20 requests
// (see retail-watch.js), which makes it unusable for something that has to
// answer a user request.
//
// Overpass is a donated community service, so this is written to ask it as
// little as possible: one request per uncovered area, results cached for a
// month, a global minimum gap between calls, and the previous contents
// served unchanged if it is slow or down.
const { db } = require('./db.js');

// Overpass is donated capacity and the main instance returns 504 when busy
// (hit on the very first out-of-area test), so fall through to a mirror
// rather than leaving someone with an empty directory.
// Just the main instance. Both obvious mirrors were tried and rejected on
// evidence: overpass.kumi.systems does not respond from this host at all (it
// hangs rather than refusing, so every failover burned a full timeout), and
// overpass.osm.ch is a SWITZERLAND-ONLY extract - it answers a US query with
// HTTP 200 and zero elements, while returning 157 results for Zurich. That
// second one is worse than an outage: it looks like a healthy success and
// silently cached "there are no stores near you" over a town that has a
// Walmart. Any mirror added here must be checked on US results, not on its
// status code.
const OVERPASS_ENDPOINTS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter')
  .split(',').map((u) => u.trim()).filter(Boolean);

const CACHE_TTL_MS = Number(process.env.STORE_CACHE_TTL_MS) || 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS) || 40000;
// Fetch a slightly wider circle than asked for, so nudging the radius slider
// does not trigger another network call. Kept modest on purpose: Overpass
// cost grows with area and with how dense the area is, and a 45-mile circle
// over New York returns 504 while the same query at 25 miles answers in 15s
// with 235 results. Rural areas would tolerate far more, but the ceiling has
// to hold for the worst case, and a too-large radius fails the users in the
// densest places - who have the most stores to show.
const FETCH_MARGIN_MI = 5;
const MIN_FETCH_RADIUS_MI = 15;
const MAX_FETCH_RADIUS_MI = 30;
// How long a user request will wait for a first-time lookup before being
// answered with whatever is already known. The lookup itself keeps running
// and fills the table for the next request - a first visit to a new area
// should feel slow-ish, never broken, and 60s of dead air is broken.
const USER_WAIT_MS = Number(process.env.STORE_LOOKUP_WAIT_MS) || 12000;
// Overpass asks for one query at a time from a given client.
const MIN_GAP_MS = Number(process.env.OVERPASS_MIN_GAP_MS) || 10000;

const BRANDS = [
  { wikidata: 'Q1046951', chain: 'target' },
  { wikidata: 'Q483551', chain: 'walmart' },
  { wikidata: 'Q533415', chain: 'best_buy' },
  { wikidata: 'Q145168', chain: 'dollar_general' },
];

// Departments and kiosks inside a store carry their own OSM node - a Target
// with a pharmacy and an optical counter is three nodes. Without this the
// directory lists the same building three times and tells someone to phone
// the vision centre about booster boxes.
const SUB_VENUE = /\b(photo|vision|optical|pharmacy|auto care|garden|fuel|gas|petrol|tire|nail|salon|cafe|café|starbucks|deli|bakery|express|kiosk|mobile|connection center)\b/i;

const EARTH_RADIUS_MI = 3958.8;
function distanceMiles(fromLat, fromLng, toLat, toLng) {
  const latDelta = ((toLat - fromLat) * Math.PI) / 180;
  const lngDelta = ((toLng - fromLng) * Math.PI) / 180;
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.sin(lngDelta / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildQuery(lat, lng, radiusMi) {
  const metres = Math.round(radiusMi * 1609.34);
  const around = `(around:${metres},${lat.toFixed(5)},${lng.toFixed(5)})`;
  const brandClauses = BRANDS.map((b) => `  nwr["brand:wikidata"="${b.wikidata}"]${around};`).join('\n');
  // Local card shops are the highest-value entry here - they rank "call
  // first" - and a chain-brand query misses them entirely. Both tags are
  // needed and neither is trustworthy alone: shop=games is full of billiards
  // retailers ("Billiard Factory", "Glaus Billiards"), while shop=collector,
  // despite sounding like antiques, is where the actual card shops live
  // ("Hot Corner Sports Cards", "Showtime Sports Cards & Gaming"). The name
  // does the discriminating, in isCardShop below.
  const localClauses = [
    `  nwr["shop"="games"]${around};`,
    `  nwr["shop"="collector"]${around};`,
  ].join('\n');
  return `[out:json][timeout:${Math.round(REQUEST_TIMEOUT_MS / 1000)}];\n(\n${brandClauses}\n${localClauses}\n);\nout center tags;`;
}

let lastCallAt = 0;
let inFlight = null;

async function askOverpass(lat, lng, radiusMi) {
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCallAt));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
  const body = buildQuery(lat, lng, radiusMi);
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'restock-radar/1.0 (+https://strawbridgeai.com)' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`${endpoint} responded ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      console.warn(`[store-lookup] ${err.message}; trying next mirror`);
    }
  }
  throw lastError || new Error('no overpass endpoint available');
}

// Sorting real card shops out of the two noisy OSM tags. Marking a billiards
// showroom or a rare-coin dealer as "local" would not be a cosmetic slip:
// callWorthiness() ranks every local shop "call first", i.e. top of the list
// and the first number someone actually dials.
const CARD_SHOP_NAME = /\b(cards?|game|games|gaming|gamers|comic|comics|collect\w*|hobby|tcg|pok[e\u00e9]mon|trading)\b/i;
const NOT_CARD_SHOP = /\b(billiards?|pool table|snooker|coins?|bullion|casino|arcade|golf|escape room|dart)\b/i;

function isCardShop(name) {
  return CARD_SHOP_NAME.test(name) && !NOT_CARD_SHOP.test(name);
}

function chainFor(tags) {
  const wikidata = tags['brand:wikidata'];
  const brand = BRANDS.find((b) => b.wikidata === wikidata);
  if (brand) return brand.chain;
  if (tags.shop === 'games' || tags.shop === 'collector') {
    return isCardShop(String(tags.name || '')) ? 'local' : null;
  }
  return null;
}

function addressOf(tags) {
  const number = tags['addr:housenumber'];
  const street = tags['addr:street'];
  return [number, street].filter(Boolean).join(' ');
}

// OSM writes phones in several shapes ("+1 614-384-5413", "(614) 384-5413").
// The UI builds a tel: link from this, which tolerates either, so only
// obvious junk is rejected.
function phoneOf(tags) {
  const raw = tags.phone || tags['contact:phone'] || '';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? raw.trim() : '';
}

function noteFor(chain, tags) {
  if (chain === 'local') return 'Local shop - staff can usually confirm exactly what is on the shelf.';
  if (chain === 'dollar_general') return 'Selection is inconsistent, but sealed blisters sometimes arrive with seasonal freight.';
  if (chain === 'target') return 'Trading cards are usually near electronics or guest services.';
  if (chain === 'best_buy') return 'Online pickup inventory can lag shelf stock; calling first is worth it.';
  if (chain === 'walmart') return 'Check the trading card endcap and the electronics counter.';
  return tags.opening_hours ? `Hours: ${tags.opening_hours}` : '';
}

const selectNearbySameChain = db.prepare(`
  SELECT id, lat, lng FROM stores WHERE chain = ? AND source = 'seed'
`);
const upsertStore = db.prepare(`
  INSERT INTO stores (id, name, chain, address, city, state, phone, lat, lng, notes, source, osm_id, website, fetched_at)
  VALUES (@id, @name, @chain, @address, @city, @state, @phone, @lat, @lng, @notes, 'osm', @osmId, @website, @now)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, address = excluded.address, city = excluded.city, state = excluded.state,
    phone = excluded.phone, lat = excluded.lat, lng = excluded.lng, website = excluded.website,
    fetched_at = excluded.fetched_at
`);
const insertArea = db.prepare('INSERT INTO store_areas (lat, lng, radius_mi, fetched_at, store_count) VALUES (?, ?, ?, ?, ?)');

// Covered means the whole requested circle sits inside a circle already
// fetched, not merely that its centre does - otherwise a request near the
// edge of a cached area silently returns a directory that stops halfway.
//
// The second clause exists because strict containment alone caused every
// single request to re-run the lookup: a dense area falls back to a 15-mile
// fetch, the page asks for 25, 0 + 25 <= 15 is false, so it was never
// "covered" and each page load paid the full wait again. Having just fetched
// this exact spot, asking again immediately would only produce the same
// smaller circle - so treat a recent attempt here as done, and let it be
// retried later in case the service is less busy.
const REATTEMPT_GAP_MS = Number(process.env.STORE_REATTEMPT_GAP_MS) || 6 * 60 * 60 * 1000;
const SAME_SPOT_MI = 2;

function isCovered(lat, lng, radiusMi) {
  const now = Date.now();
  const areas = db.prepare('SELECT lat, lng, radius_mi, fetched_at, store_count FROM store_areas WHERE fetched_at >= ?')
    .all(now - CACHE_TTL_MS);
  // store_count > 0 guards against an endpoint that returns success with no
  // data (see the osm.ch note above) freezing an empty directory in place
  // for the full cache lifetime. A genuinely empty area still gets its row,
  // so the short re-attempt guard below stops it being re-queried in a loop,
  // but it is never promoted to "fully covered".
  const fullyCovered = areas.some((a) => a.store_count > 0
    && distanceMiles(lat, lng, a.lat, a.lng) + radiusMi <= a.radius_mi);
  if (fullyCovered) return true;
  return areas.some((a) => distanceMiles(lat, lng, a.lat, a.lng) <= SAME_SPOT_MI
    && now - a.fetched_at < REATTEMPT_GAP_MS);
}

function ingest(elements, now) {
  let added = 0;
  const seen = new Set();
  for (const el of elements) {
    const tags = el.tags || {};
    const chain = chainFor(tags);
    if (!chain) continue;
    const name = String(tags.name || '').trim();
    if (!name || SUB_VENUE.test(name)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const id = `osm-${el.type}-${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // The six demo rows are real places too (Target Union Square really is
    // at Union Square), so an OSM copy of one would show the same shop twice
    // a few metres apart. Keep the seeded row and skip the duplicate.
    const dupe = selectNearbySameChain.all(chain)
      .some((s) => distanceMiles(lat, lng, s.lat, s.lng) < 0.2);
    if (dupe) continue;

    upsertStore.run({
      id, name, chain,
      address: addressOf(tags),
      city: tags['addr:city'] || '',
      state: tags['addr:state'] || '',
      phone: phoneOf(tags),
      lat, lng,
      notes: noteFor(chain, tags),
      osmId: `${el.type}/${el.id}`,
      website: tags.website || tags['contact:website'] || null,
      now,
    });
    added += 1;
  }
  return added;
}

// Fills in stores around a point. Resolves after at most USER_WAIT_MS so a
// request is never held hostage to a third-party map service, while the
// fetch itself carries on in the background and is picked up by the next
// request. Never throws: an incomplete directory beats a failed endpoint.
async function ensureStoresNear(lat, lng, radiusMi) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const wanted = Math.min(Math.max(radiusMi || 25, 1), MAX_FETCH_RADIUS_MI);
  if (isCovered(lat, lng, wanted)) return null;

  if (!inFlight) {
    const fetchRadius = Math.min(MAX_FETCH_RADIUS_MI, Math.max(MIN_FETCH_RADIUS_MI, wanted + FETCH_MARGIN_MI));
    inFlight = runLookup(lat, lng, fetchRadius).finally(() => { inFlight = null; });
  }
  // Several tabs missing at once share the one in-flight lookup rather than
  // each starting their own.
  const pending = inFlight;
  let timer;
  try {
    return await Promise.race([
      pending.catch(() => null),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), USER_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runLookup(lat, lng, fetchRadius) {
  // A dense metro can 504 at a radius a rural area answers instantly, and
  // which is which is not knowable up front - so on failure, try again over
  // a smaller circle rather than leaving the area empty.
  for (const radius of [fetchRadius, Math.max(8, Math.round(fetchRadius / 2))]) {
    try {
      const now = Date.now();
      const data = await askOverpass(lat, lng, radius);
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const added = db.transaction(() => ingest(elements, now))();
      insertArea.run(lat, lng, radius, now, added);
      console.log(`[store-lookup] ${elements.length} OSM elements near ${lat.toFixed(3)},${lng.toFixed(3)} (r=${radius}mi) -> ${added} stores`);
      // Zero elements over a populated radius usually means the endpoint,
      // not the map, is wrong - so try the next rung before believing it.
      if (elements.length === 0) continue;
      return { elements: elements.length, added, radiusMi: radius };
    } catch (err) {
      console.error(`[store-lookup] r=${radius}mi failed: ${err.message}`);
    }
  }
  return null;
}

function lookupStatus() {
  const areas = db.prepare('SELECT COUNT(*) n, MAX(fetched_at) last FROM store_areas').get();
  const byChain = db.prepare('SELECT chain, COUNT(*) n FROM stores GROUP BY chain').all();
  return {
    areasFetched: areas.n,
    lastFetchAt: areas.last ? new Date(areas.last).toISOString() : null,
    totalStores: db.prepare('SELECT COUNT(*) n FROM stores').get().n,
    fromOsm: db.prepare("SELECT COUNT(*) n FROM stores WHERE source='osm'").get().n,
    byChain: Object.fromEntries(byChain.map((r) => [r.chain, r.n])),
  };
}

module.exports = { ensureStoresNear, lookupStatus, distanceMiles };
