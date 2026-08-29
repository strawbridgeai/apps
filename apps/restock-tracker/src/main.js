import './style.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import ShimmerText from './components/ShimmerText.jsx';
import { createMapController, RETAILER_META } from './map.js';

// Same-origin, proxied by the web server at /apps/restock-tracker/api/ ->
// the backend on 127.0.0.1:2013 - a relative path from the start (not a
// hardcoded ${location.hostname}:PORT), learned the hard way on the other
// two apps in this family when they broke the moment they were reached
// through the real domain instead of the bare VPS IP.
const API_BASE = '/apps/restock-tracker';

const EARTH_RADIUS_MILES = 3958.8;
function toRad(deg) { return (deg * Math.PI) / 180; }
function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="header-inner">
        <a class="home-btn" href="/" title="Back to all apps">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9.5 12 3l9 6.5"></path>
            <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
          </svg>
        </a>
        <div id="title-mount"></div>
        <button id="locate-btn" class="btn-ghost" type="button" title="Center on my location">📍 My location</button>
      </div>
    </header>

    <div class="tab-bar">
      <button class="tab-btn active" id="tab-map" type="button">Map</button>
      <button class="tab-btn" id="tab-watches" type="button">Online Watches</button>
    </div>

    <div class="toolbar" id="map-toolbar" style="position:relative;">
      <div class="search-row">
        <input type="text" id="search-input" placeholder="Search Best Buy + Target for a product to track…" autocomplete="off">
      </div>
      <div class="distance-slider">
        Within <strong id="radius-label">50</strong> mi
        <input type="range" id="radius-slider" min="5" max="200" step="5" value="50">
      </div>
      <span id="search-results" class="search-results" hidden></span>
    </div>
    <div class="tracked-list" id="tracked-list"></div>

    <div class="map-area" id="map-view">
      <div id="map"></div>
    </div>

    <div class="watches-view" id="watches-view" hidden>
      <div class="watches-list" id="watches-list"></div>
      <div class="toolbar" style="margin-top:16px;border-radius:10px;border:1px solid var(--border);">
        <div class="search-row">
          <input type="text" id="watch-label" placeholder="Label (e.g. Scarlet & Violet ETB)">
        </div>
        <div class="search-row">
          <input type="url" id="watch-url" placeholder="Product page URL to watch">
        </div>
        <button class="btn-primary" id="watch-add-btn" type="button">Watch this link</button>
      </div>
    </div>

    <div class="subscribe-panel">
      <div class="search-row" style="max-width:280px;">
        <input type="email" id="subscribe-email" placeholder="you@email.com">
      </div>
      <button class="btn-primary" id="subscribe-btn" type="button">Email me every restock</button>
      <span class="subscribe-status" id="subscribe-status"></span>
    </div>

    <p class="disclaimer">
      Alerts you when tracked items look back in stock so you can go buy them yourself — this never places
      an order automatically. Best Buy's stock comes from its official API; Target's comes from the same
      internal endpoint its own site uses (not an official developer API), so it can be less reliable and is
      checked less often to avoid being rate-limited. Online-link watches use a simple page check and won't
      work on every site. Always double-check on the retailer's own site/app before making a trip.
    </p>
  </div>
`;

createRoot(document.querySelector('#title-mount')).render(createElement(ShimmerText, { text: 'Restock Radar' }));

const mapController = createMapController(document.querySelector('#map'));

let trackedProducts = [];
let userLocation = null; // { lat, lon }
let radiusMi = 50;

function setStatus(_msg) {
  // Reserved for future use (e.g. surfacing search/add errors inline);
  // errors are alert()'d directly today, matching this app's small scope.
}

function renderMarkers() {
  if (!userLocation) {
    // No location yet - show everything we know about (already only ever
    // fetched within POLL_RADIUS_MI of each product's own ref point), just
    // without a distance filter.
    const markers = [];
    for (const product of trackedProducts) {
      for (const store of product.stores) markers.push({ store, product });
    }
    mapController.render(markers);
    return;
  }
  const markers = [];
  for (const product of trackedProducts) {
    for (const store of product.stores) {
      const distance = haversineMiles(userLocation.lat, userLocation.lon, store.lat, store.lon);
      if (distance <= radiusMi) markers.push({ store, product });
    }
  }
  mapController.render(markers);
}

function renderTrackedList() {
  const el = document.querySelector('#tracked-list');
  el.innerHTML = trackedProducts
    .map(
      (p) => `
      <span class="tracked-chip">
        <span class="retailer-tag ${p.retailer}">${RETAILER_META[p.retailer]?.label || p.retailer}</span>
        ${escapeHtml(p.name)}
        <button data-remove="${p.id}" title="Stop tracking">&times;</button>
      </span>`
    )
    .join('');
  el.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`${API_BASE}/api/products/${btn.dataset.remove}`, { method: 'DELETE' });
      await loadProducts();
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadProducts() {
  const res = await fetch(`${API_BASE}/api/products`);
  const data = await res.json();
  trackedProducts = data.products || [];
  renderTrackedList();
  renderMarkers();
}

// --- Product search ---
const searchInput = document.querySelector('#search-input');
const searchResultsEl = document.querySelector('#search-results');
let searchDebounce = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) {
    searchResultsEl.hidden = true;
    return;
  }
  searchDebounce = setTimeout(async () => {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const results = data.results || [];
    searchResultsEl.hidden = results.length === 0;
    searchResultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="search-result-item">
          <span><span class="retailer-tag ${r.retailer}">${RETAILER_META[r.retailer]?.label || r.retailer}</span> ${escapeHtml(r.name)}</span>
          <button class="btn-ghost" data-track="${i}">Track</button>
        </div>`
      )
      .join('');
    searchResultsEl.querySelectorAll('[data-track]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = results[Number(btn.dataset.track)];
        if (!userLocation) {
          alert('Click "My location" first so this can find nearby stores.');
          return;
        }
        const res2 = await fetch(`${API_BASE}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            retailer: r.retailer,
            productId: r.productId,
            name: r.name,
            imageUrl: r.imageUrl,
            lat: userLocation.lat,
            lon: userLocation.lon,
          }),
        });
        if (!res2.ok) {
          const body = await res2.json().catch(() => ({}));
          alert(body.error || 'Could not track this product.');
          return;
        }
        searchInput.value = '';
        searchResultsEl.hidden = true;
        await loadProducts();
      });
    });
  }, 350);
});

// --- Distance slider ---
const radiusSlider = document.querySelector('#radius-slider');
const radiusLabel = document.querySelector('#radius-label');
radiusSlider.addEventListener('input', () => {
  radiusMi = Number(radiusSlider.value);
  radiusLabel.textContent = String(radiusMi);
  renderMarkers();
});

// --- Geolocation (same acquire/safety double-timeout as camping-locator's
// main.js - getCurrentPosition's own timeout only counts down once
// acquisition actually starts, not while a permission prompt is up, so a
// second independent JS-level ceiling covering the whole call is what
// guarantees this always finishes one way or the other). ---
const LOCATE_ACQUIRE_MS = 8000;
const LOCATE_SAFETY_MS = 15000;

function locate({ onDone } = {}) {
  if (!navigator.geolocation) { onDone?.(false); return; }
  let settled = false;
  const finish = (ok, pos) => {
    if (settled) return;
    settled = true;
    if (ok) {
      userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      mapController.setUserLocation(userLocation.lat, userLocation.lon);
      renderMarkers();
    }
    onDone?.(ok);
  };
  const safetyTimer = setTimeout(() => finish(false), LOCATE_SAFETY_MS);
  navigator.geolocation.getCurrentPosition(
    (pos) => { clearTimeout(safetyTimer); finish(true, pos); },
    () => { clearTimeout(safetyTimer); finish(false); },
    { timeout: LOCATE_ACQUIRE_MS }
  );
}

document.querySelector('#locate-btn').addEventListener('click', () => locate());

// --- Tabs ---
const tabMap = document.querySelector('#tab-map');
const tabWatches = document.querySelector('#tab-watches');
const mapToolbar = document.querySelector('#map-toolbar');
const trackedListEl = document.querySelector('#tracked-list');
const mapView = document.querySelector('#map-view');
const watchesView = document.querySelector('#watches-view');

function showTab(tab) {
  const isMap = tab === 'map';
  tabMap.classList.toggle('active', isMap);
  tabWatches.classList.toggle('active', !isMap);
  mapToolbar.hidden = !isMap;
  trackedListEl.hidden = !isMap;
  mapView.hidden = !isMap;
  watchesView.hidden = isMap;
  if (isMap) setTimeout(() => mapController.map.invalidateSize(), 50);
}
tabMap.addEventListener('click', () => showTab('map'));
tabWatches.addEventListener('click', () => showTab('watches'));

// --- Online watches tab ---
async function loadWatches() {
  const res = await fetch(`${API_BASE}/api/watches`);
  const data = await res.json();
  const watches = data.watches || [];
  document.querySelector('#watches-list').innerHTML = watches.length
    ? watches
        .map(
          (w) => `
        <div class="watch-row">
          <div class="watch-info">
            <div class="watch-label">${escapeHtml(w.label)}</div>
            <div class="watch-url">${escapeHtml(w.url)}</div>
          </div>
          <span class="watch-status ${w.last_status}">${w.last_status.replace('-', ' ')}</span>
          <button class="btn-ghost" data-remove-watch="${w.id}">Remove</button>
        </div>`
        )
        .join('')
    : '<p style="color:var(--text-faint);text-align:center;">No online watches yet — add a product page URL below.</p>';
  document.querySelectorAll('[data-remove-watch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`${API_BASE}/api/watches/${btn.dataset.removeWatch}`, { method: 'DELETE' });
      await loadWatches();
    });
  });
}

document.querySelector('#watch-add-btn').addEventListener('click', async () => {
  const label = document.querySelector('#watch-label').value.trim();
  const url = document.querySelector('#watch-url').value.trim();
  if (!label || !url) { alert('Label and URL are both required.'); return; }
  const res = await fetch(`${API_BASE}/api/watches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Could not add that watch.');
    return;
  }
  document.querySelector('#watch-label').value = '';
  document.querySelector('#watch-url').value = '';
  await loadWatches();
});

// --- Email subscribe (subscribes to every tracked product + watch) ---
document.querySelector('#subscribe-btn').addEventListener('click', async () => {
  const email = document.querySelector('#subscribe-email').value.trim();
  const statusEl = document.querySelector('#subscribe-status');
  const res = await fetch(`${API_BASE}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, targetType: 'all' }),
  });
  const body = await res.json().catch(() => ({}));
  statusEl.textContent = res.ok ? 'Subscribed — check your inbox for future restock alerts.' : body.error || 'Could not subscribe.';
});

// --- Init ---
loadProducts();
loadWatches();
locate();
// Live refresh: picks up the background poller's results without a full
// reload - the actual "live scrape and refresh" happens server-side
// (poller.js); this just keeps the map in sync with it.
setInterval(loadProducts, 60000);
setInterval(loadWatches, 60000);
