import './style.css';
import { createMapController, LAYER_META } from './map.js';
import { queryArea, boundsAreaDegrees } from './overpass.js';
import { getNationalParks } from './nps.js';
import { queryCampgrounds } from './ridb.js';

// Guard against enormous/expensive queries against a shared free API — past
// this, tiling (see overpass.js) stops being enough and we ask the user to
// zoom in a bit instead of firing off a dozen+ parallel requests.
const MAX_QUERY_AREA_DEG = 24;

// How long to let the map settle after a pan/zoom before auto-searching.
const MOVE_DEBOUNCE_MS = 700;

// Fallback view used on load if geolocation isn't granted/available —
// central Colorado, a reasonably camp-site-dense area, at a zoom level
// that's comfortably within budget so pins always appear on startup with
// no interaction required either way.
const FALLBACK_CENTER = [39, -106];
const FALLBACK_ZOOM = 9; // kept conservative so it stays in-budget even on a wide desktop window

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
        <h1>Camp Finder</h1>
        <button id="locate-btn" class="ghost-btn" type="button" title="Center on my location">📍 My location</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="layer-toggles" id="layer-toggles"></div>
      <button id="search-btn" class="primary-btn" type="button">Search this area</button>
      <span id="status" class="status" role="status"></span>
    </div>

    <div id="map"></div>

    <p class="disclaimer">
      Data from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> contributors —
      crowdsourced, not guaranteed accurate or current. Always confirm fee, access, and road conditions with the local
      land manager (BLM / USFS / NPS / state park office) before you go.
    </p>
  </div>
`;

const toggleContainer = document.querySelector('#layer-toggles');
for (const [key, meta] of Object.entries(LAYER_META)) {
  const label = document.createElement('label');
  label.className = 'layer-toggle';
  label.innerHTML = `<input type="checkbox" data-layer="${key}" ${meta.defaultOn ? 'checked' : ''}>
    <span class="dot" style="background:${meta.color}"></span>${meta.label}`;
  toggleContainer.appendChild(label);
}

const controller = createMapController(document.querySelector('#map'));

function toggleChecked(key) {
  return toggleContainer.querySelector(`input[data-layer="${key}"]`)?.checked ?? false;
}

toggleContainer.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-layer]');
  if (!input) return;
  controller.setLayerVisible(input.dataset.layer, input.checked);
  // Water and paid campgrounds are both excluded from the routine
  // search unless toggled on (water for query-weight reasons, see
  // overpass.js; paid campgrounds because it's a separate RIDB fetch) —
  // turning either on for the first time needs its own fetch for the
  // current view.
  if ((input.dataset.layer === 'water' || input.dataset.layer === 'paidCamping') && input.checked) {
    runSearch({ silent: true });
  }
});

const statusEl = document.querySelector('#status');
const searchBtn = document.querySelector('#search-btn');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('status-error', isError);
}

let searchInFlight = false;

// silent=true is used for automatic triggers (load/pan/zoom) — an
// over-budget area or a transient failure there is just a quiet hint, not
// an alarming red error, since the user didn't explicitly ask for it.
async function runSearch({ silent = false } = {}) {
  if (searchInFlight) return;

  const bounds = controller.getBounds();
  if (boundsAreaDegrees(bounds) > MAX_QUERY_AREA_DEG) {
    setStatus('Zoom in a bit more to load pins for this area.', !silent);
    return;
  }

  searchInFlight = true;
  searchBtn.disabled = true;
  setStatus('Searching…');
  try {
    const wantPaidCamping = toggleChecked('paidCamping');
    const [osmResults, paidCamping] = await Promise.all([
      queryArea(bounds, {
        includeWater: toggleChecked('water'),
        // A wide search can take several sequential tile requests (see
        // overpass.js for why sequential) — without this it'd look like a
        // long silent hang instead of visible progress.
        onProgress: (done, total) => {
          if (total > 1) setStatus(`Searching… (${done}/${total})`);
        },
      }),
      // A RIDB hiccup shouldn't sink the whole search — OSM results (free
      // camping, state parks, water) still show even if this one fails.
      wantPaidCamping
        ? queryCampgrounds(bounds).catch((err) => {
            console.error('RIDB campgrounds fetch failed:', err);
            return [];
          })
        : Promise.resolve([]),
    ]);
    const { partial, ...categories } = osmResults;
    const results = { ...categories, paidCamping };
    controller.renderResults(results);
    const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
    if (total === 0) {
      setStatus('Nothing found here — try a different area.');
    } else if (partial) {
      setStatus(`Found ${total} points (part of this area couldn't be searched — try again).`, !silent);
    } else {
      setStatus(`Found ${total} points in this area.`);
    }
  } catch (err) {
    console.error(err);
    setStatus('Search failed — the data source may be busy. Try again in a moment.', !silent);
  } finally {
    searchInFlight = false;
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener('click', () => runSearch({ silent: false }));

// Auto-search as the map settles after a pan/zoom, so results load without
// ever needing to press the button.
let moveTimer = null;
controller.map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => runSearch({ silent: true }), MOVE_DEBOUNCE_MS);
});

function locate({ onDone } = {}) {
  if (!navigator.geolocation) {
    onDone?.(false);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      controller.map.setView([pos.coords.latitude, pos.coords.longitude], 11);
      onDone?.(true);
    },
    () => onDone?.(false),
    { timeout: 6000 },
  );
}

document.querySelector('#locate-btn').addEventListener('click', () => {
  setStatus('Locating…');
  locate({
    onDone: (ok) => {
      if (!ok) setStatus('Could not get your location — check browser location permissions.', true);
      // on success, the moveend listener fires the search automatically
    },
  });
});

// --- National Parks: loaded once, globally, independent of the map view
// or the search cycle (see nps.js/map.js — only ~474 units nationwide, so
// there's no reason to ever re-query this per viewport). ---
getNationalParks()
  .then((items) => controller.setNationalParks(items))
  .catch((err) => console.error('Failed to load National Parks:', err));

// --- Populate pins on startup, no interaction required ---
// Try geolocation first (respects layer toggles as-is — renderResults only
// ever populates the marker groups; visibility is still governed by which
// groups are on the map). Falls back to a fixed region if location isn't
// granted/available so the map is never empty on load.
setStatus('Finding your area…');
locate({
  onDone: (ok) => {
    // Either way, setView fires 'moveend' once the map settles, and the
    // listener above triggers the search — no direct call needed here.
    if (!ok) controller.map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
  },
});
