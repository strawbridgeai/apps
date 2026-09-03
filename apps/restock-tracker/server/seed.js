// Demo seed data, ported verbatim (values only) from the Replit prototype's
// artifacts/api-server/src/routes/restock.ts - a NYC watch zone so the app
// has a meaningful first preview before any real community reports exist.
// Only runs once: skipped whenever pokemon_sets already has rows.
const { db } = require('./db.js');

const SETS = [
  { id: 'me-ascended-heroes', name: 'Ascended Heroes', series: 'Mega Evolution', releaseDate: 'January 30, 2026', productTypes: ['Elite Trainer Box', 'Mini Tin', 'Poster Collection'], accent: '#7cf5c4' },
  { id: 'me-pitch-black', name: 'Pitch Black', series: 'Mega Evolution', releaseDate: 'July 17, 2026', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle'], accent: '#4b4b5c' },
  { id: 'me-chaos-rising', name: 'Chaos Rising', series: 'Mega Evolution', releaseDate: 'May 22, 2026', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Special Illustration Collection'], accent: '#c65bff' },
  { id: 'me-perfect-order', name: 'Perfect Order', series: 'Mega Evolution', releaseDate: 'March 27, 2026', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle'], accent: '#5bd6ff' },
  { id: 'me-phantasmal-flames', name: 'Phantasmal Flames', series: 'Mega Evolution', releaseDate: 'November 14, 2025', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Binder Collection'], accent: '#ff6b6b' },
  { id: 'me-mega-evolution', name: 'Mega Evolution', series: 'Mega Evolution', releaseDate: 'September 26, 2025', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Mini Tin'], accent: '#ffb703' },
  { id: 'sv-white-flare', name: 'White Flare', series: 'Scarlet & Violet', releaseDate: 'July 18, 2025', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle'], accent: '#fff275' },
  { id: 'sv-black-bolt', name: 'Black Bolt', series: 'Scarlet & Violet', releaseDate: 'July 18, 2025', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle'], accent: '#2b2d42' },
  { id: 'sv-prismatic-evolutions', name: 'Prismatic Evolutions', series: 'Scarlet & Violet', releaseDate: 'January 17, 2025', productTypes: ['Elite Trainer Box', 'Booster Bundle', 'Mini Tin'], accent: '#e9b5ff' },
  { id: 'sv-destined-rivals', name: 'Destined Rivals', series: 'Scarlet & Violet', releaseDate: 'May 30, 2025', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Team Rocket Box'], accent: '#ff7a45' },
  { id: 'sv-journey-together', name: 'Journey Together', series: 'Scarlet & Violet', releaseDate: 'March 28, 2025', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle'], accent: '#78d7c7' },
  { id: 'sv-surging-sparks', name: 'Surging Sparks', series: 'Scarlet & Violet', releaseDate: 'November 8, 2024', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Binder Collection'], accent: '#ffd166' },
  { id: 'sv-stellar-crown', name: 'Stellar Crown', series: 'Scarlet & Violet', releaseDate: 'September 13, 2024', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Poster Collection'], accent: '#8bb8ff' },
  { id: 'sv-twilight-masquerade', name: 'Twilight Masquerade', series: 'Scarlet & Violet', releaseDate: 'May 24, 2024', productTypes: ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle'], accent: '#b9a0ff' },
  { id: 'sv-151', name: '151', series: 'Scarlet & Violet', releaseDate: 'September 22, 2023', productTypes: ['Elite Trainer Box', 'Booster Bundle', 'Poster Collection'], accent: '#ff9eb5' },
];

const STORES = [
  { id: 'target-union-square', name: 'Target Union Square', chain: 'target', address: '10 Union Square South', city: 'New York', state: 'NY', phone: '(212) 253-0625', lat: 40.7359, lng: -73.9911, notes: 'Trading cards are usually near guest services; ask for the collectibles restock.' },
  { id: 'best-buy-flatiron', name: 'Best Buy Flatiron', chain: 'best_buy', address: '60 W 23rd St', city: 'New York', state: 'NY', phone: '(212) 366-1212', lat: 40.7421, lng: -73.9938, notes: 'Online pickup inventory can lag shelf stock. Calling before a trip is recommended.' },
  { id: 'walmart-brooklyn', name: 'Walmart Supercenter Brooklyn', chain: 'walmart', address: '850 3rd Ave', city: 'Brooklyn', state: 'NY', phone: '(718) 832-7811', lat: 40.6564, lng: -74.0062, notes: 'Check the front seasonal aisle and electronics counter.' },
  { id: 'dollar-general-jersey', name: 'Dollar General Jersey City', chain: 'dollar_general', address: '205 Ocean Ave', city: 'Jersey City', state: 'NJ', phone: '(201) 451-8250', lat: 40.6952, lng: -74.0871, notes: 'Selection is inconsistent, but sealed blisters sometimes arrive with seasonal freight.' },
  { id: 'the-card-corner', name: 'The Card Corner', chain: 'local', address: '146 W 26th St', city: 'New York', state: 'NY', phone: '(646) 555-0182', lat: 40.7467, lng: -73.9936, notes: 'Local hobby shop with staff who will confirm the exact product on hand.' },
  { id: 'brooklyn-collectibles', name: 'Brooklyn Collectibles', chain: 'local', address: '225 Bedford Ave', city: 'Brooklyn', state: 'NY', phone: '(718) 555-0144', lat: 40.7162, lng: -73.9613, notes: 'Worth calling for older sealed sets and restock windows.' },
];

function minutesAgo(n) {
  return Date.now() - n * 60 * 1000;
}

const REPORTS = [
  { setId: 'sv-prismatic-evolutions', storeId: 'target-union-square', status: 'limited', productType: 'Elite Trainer Box', reportedAt: minutesAgo(18), source: 'community', confidence: 82, note: 'Two ETBs seen in the locked case by guest services.', reporter: 'Mia R.' },
  { setId: 'sv-prismatic-evolutions', storeId: 'the-card-corner', status: 'in_stock', productType: 'Booster Bundle', reportedAt: minutesAgo(42), source: 'store_call', confidence: 94, note: 'Staff confirmed sealed bundles still available at the counter.', reporter: 'Store call' },
  { setId: 'sv-prismatic-evolutions', storeId: 'best-buy-flatiron', status: 'sold_out', productType: 'Booster Pack', reportedAt: minutesAgo(120), source: 'community', confidence: 77, note: 'Empty peg hooks; associate said the morning shipment was gone.', reporter: 'Jordan K.' },
  { setId: 'sv-prismatic-evolutions', storeId: 'brooklyn-collectibles', status: 'in_stock', productType: 'Mini Tin', reportedAt: minutesAgo(240), source: 'store_call', confidence: 91, note: 'A small restock came in with the afternoon shipment.', reporter: 'Store call' },
  { setId: 'sv-destined-rivals', storeId: 'walmart-brooklyn', status: 'limited', productType: 'Booster Pack', reportedAt: minutesAgo(55), source: 'retailer_signal', confidence: 68, note: 'Pickup toggle briefly showed available; shelf check recommended.', reporter: 'Retailer signal' },
  { setId: 'me-pitch-black', storeId: 'target-union-square', status: 'in_stock', productType: 'Booster Pack', reportedAt: minutesAgo(25), source: 'community', confidence: 85, note: 'Full shelf of packs by the registers this morning.', reporter: 'Sam T.' },
  { setId: 'me-pitch-black', storeId: 'the-card-corner', status: 'limited', productType: 'Elite Trainer Box', reportedAt: minutesAgo(90), source: 'store_call', confidence: 88, note: 'Two ETBs left behind the counter.', reporter: 'Store call' },
  { setId: 'me-chaos-rising', storeId: 'best-buy-flatiron', status: 'sold_out', productType: 'Special Illustration Collection', reportedAt: minutesAgo(150), source: 'community', confidence: 74, note: 'Sold out within an hour of the restock.', reporter: 'Priya N.' },
  { setId: 'me-chaos-rising', storeId: 'walmart-brooklyn', status: 'limited', productType: 'Booster Pack', reportedAt: minutesAgo(35), source: 'retailer_signal', confidence: 66, note: 'Pickup toggle showed limited availability.', reporter: 'Retailer signal' },
  { setId: 'me-perfect-order', storeId: 'brooklyn-collectibles', status: 'in_stock', productType: 'Booster Bundle', reportedAt: minutesAgo(60), source: 'store_call', confidence: 92, note: 'Staff confirmed a fresh case just unboxed.', reporter: 'Store call' },
  { setId: 'me-perfect-order', storeId: 'dollar-general-jersey', status: 'unknown', productType: 'Booster Pack', reportedAt: minutesAgo(200), source: 'community', confidence: 55, note: 'Seasonal aisle had an empty display, unclear if restocking.', reporter: 'Alex W.' },
  { setId: 'me-phantasmal-flames', storeId: 'target-union-square', status: 'limited', productType: 'Binder Collection', reportedAt: minutesAgo(70), source: 'community', confidence: 80, note: 'One binder spotted on the endcap.', reporter: 'Jordan K.' },
  { setId: 'me-phantasmal-flames', storeId: 'the-card-corner', status: 'in_stock', productType: 'Elite Trainer Box', reportedAt: minutesAgo(15), source: 'store_call', confidence: 90, note: 'Shop has several ETBs on the shelf right now.', reporter: 'Store call' },
  { setId: 'me-mega-evolution', storeId: 'best-buy-flatiron', status: 'in_stock', productType: 'Mini Tin', reportedAt: minutesAgo(45), source: 'community', confidence: 84, note: 'Tins restocked near the trading card case.', reporter: 'Mia R.' },
  { setId: 'me-mega-evolution', storeId: 'walmart-brooklyn', status: 'sold_out', productType: 'Booster Pack', reportedAt: minutesAgo(300), source: 'retailer_signal', confidence: 70, note: 'Pickup has shown unavailable for two days straight.', reporter: 'Retailer signal' },
  { setId: 'me-ascended-heroes', storeId: 'brooklyn-collectibles', status: 'limited', productType: 'Elite Trainer Box', reportedAt: minutesAgo(20), source: 'store_call', confidence: 89, note: 'Just two ETBs left after the morning rush.', reporter: 'Store call' },
  { setId: 'me-ascended-heroes', storeId: 'dollar-general-jersey', status: 'unknown', productType: 'Mini Tin', reportedAt: minutesAgo(180), source: 'community', confidence: 58, note: 'Seasonal endcap looked freshly stocked but tins were unclear.', reporter: 'Alex W.' },
  { setId: 'sv-white-flare', storeId: 'target-union-square', status: 'sold_out', productType: 'Booster Pack', reportedAt: minutesAgo(400), source: 'community', confidence: 72, note: 'Peg hooks empty since launch weekend.', reporter: 'Jordan K.' },
  { setId: 'sv-white-flare', storeId: 'the-card-corner', status: 'in_stock', productType: 'Elite Trainer Box', reportedAt: minutesAgo(50), source: 'store_call', confidence: 93, note: 'Shop kept a small reserve behind the counter.', reporter: 'Store call' },
  { setId: 'sv-black-bolt', storeId: 'best-buy-flatiron', status: 'limited', productType: 'Booster Bundle', reportedAt: minutesAgo(95), source: 'community', confidence: 79, note: 'A couple bundles left on the bottom shelf.', reporter: 'Priya N.' },
  { setId: 'sv-black-bolt', storeId: 'walmart-brooklyn', status: 'sold_out', productType: 'Booster Pack', reportedAt: minutesAgo(500), source: 'retailer_signal', confidence: 65, note: 'Pickup toggle has read unavailable all week.', reporter: 'Retailer signal' },
  { setId: 'sv-journey-together', storeId: 'brooklyn-collectibles', status: 'in_stock', productType: 'Booster Bundle', reportedAt: minutesAgo(130), source: 'store_call', confidence: 90, note: 'Still a few bundles in the back stock.', reporter: 'Store call' },
  { setId: 'sv-surging-sparks', storeId: 'dollar-general-jersey', status: 'unknown', productType: 'Binder Collection', reportedAt: minutesAgo(600), source: 'community', confidence: 50, note: 'Seasonal freight included a binder last week, unclear if more are coming.', reporter: 'Alex W.' },
  { setId: 'sv-stellar-crown', storeId: 'target-union-square', status: 'sold_out', productType: 'Poster Collection', reportedAt: minutesAgo(720), source: 'community', confidence: 68, note: 'Poster collection cleared out weeks ago.', reporter: 'Mia R.' },
  { setId: 'sv-twilight-masquerade', storeId: 'the-card-corner', status: 'in_stock', productType: 'Elite Trainer Box', reportedAt: minutesAgo(1000), source: 'store_call', confidence: 87, note: 'Shop still has a couple ETBs from an old case.', reporter: 'Store call' },
  { setId: 'sv-151', storeId: 'brooklyn-collectibles', status: 'sold_out', productType: 'Booster Bundle', reportedAt: minutesAgo(2000), source: 'community', confidence: 60, note: 'Long sold out locally; still worth calling before a trip.', reporter: 'Jordan K.' },
];

function seedIfEmpty() {
  const existing = db.prepare('SELECT id FROM pokemon_sets LIMIT 1').get();
  if (existing) return;

  const insertSet = db.prepare('INSERT INTO pokemon_sets (id, name, series, release_date, product_types, accent) VALUES (@id, @name, @series, @releaseDate, @productTypes, @accent)');
  const insertStore = db.prepare('INSERT INTO stores (id, name, chain, address, city, state, phone, lat, lng, notes) VALUES (@id, @name, @chain, @address, @city, @state, @phone, @lat, @lng, @notes)');
  const insertReport = db.prepare('INSERT INTO stock_reports (set_id, store_id, status, product_type, reported_at, source, confidence, note, reporter) VALUES (@setId, @storeId, @status, @productType, @reportedAt, @source, @confidence, @note, @reporter)');

  const seedAll = db.transaction(() => {
    for (const s of SETS) insertSet.run({ ...s, productTypes: JSON.stringify(s.productTypes) });
    for (const s of STORES) insertStore.run(s);
    for (const r of REPORTS) insertReport.run(r);
  });
  seedAll();
}

module.exports = { seedIfEmpty };
