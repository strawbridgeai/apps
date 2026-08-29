import './style.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import ShimmerText from './components/ShimmerText.jsx';
import { createMapController, LAYER_META, detailHtml } from './map.js';
import { queryArea, boundsAreaDegrees } from './overpass.js';
import { getNationalParks } from './nps.js';
import { queryCampgrounds } from './ridb.js';

// Guard against enormous/expensive queries against a shared free API — past
// this, tiling (see overpass.js) stops being enough and we ask the user to
// zoom in a bit instead of firing off a dozen+ parallel requests. Raised
// from 24 by user request, to let a routine search work a bit more zoomed
// out — still tiles into the same max of 4 requests (TILE_THRESHOLD_DEG x
// MAX_GRID in overpass.js), just with each tile covering a bit more ground
// (~10 sq deg worst case instead of ~6), which is fine now that both
// Overpass mirrors are healthy (see overpass.js's ENDPOINTS comment).
const MAX_QUERY_AREA_DEG = 40;

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
        <div id="title-mount"></div>
        <button id="locate-btn" class="ghost-btn" type="button" title="Center on my location">📍 My location</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="layer-toggles" id="layer-toggles"></div>
      <button id="search-btn" class="btn-primary shrink-0" type="button">Search this area</button>
      <span id="status" class="status" role="status"></span>
    </div>

    <div class="map-area">
      <div id="map"></div>
      <aside id="detail-panel" class="detail-panel">
        <button id="panel-close" class="panel-close" type="button" aria-label="Close">&times;</button>
        <div id="panel-content"></div>
      </aside>
    </div>

    <p class="disclaimer">
      Data comes from a mix of official sources (National Park Service, Recreation.gov) and crowdsourced
      <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> contributors — even the
      official sources can be outdated or incomplete, so nothing here is guaranteed accurate or current. Please always
      double-check fee, access, and road conditions with the local land manager (BLM / USFS / NPS / state park office)
      before you go somewhere.
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

// --- Detail panel: opened by a marker click, closed by its own button or
// by clicking empty map area. ---
const detailPanel = document.querySelector('#detail-panel');
const panelContent = document.querySelector('#panel-content');

function openPanel(layerKey, item) {
  panelContent.innerHTML = detailHtml(layerKey, item);
  detailPanel.classList.add('open');
}

function closePanel() {
  detailPanel.classList.remove('open');
}

document.querySelector('#panel-close').addEventListener('click', closePanel);

const controller = createMapController(document.querySelector('#map'), { onMarkerSelect: openPanel });
controller.map.on('click', closePanel);

function toggleChecked(key) {
  return toggleContainer.querySelector(`input[data-layer="${key}"]`)?.checked ?? false;
}

// Water, state parks, and paid campgrounds are all excluded from the
// routine search unless toggled on — water and state parks because their
// OSM query clauses are expensive (see overpass.js), paid campgrounds
// because it's a separate RIDB fetch — so turning any of them on for the
// first time needs its own fetch for the current view.
const ON_DEMAND_LAYERS = ['water', 'stateParks', 'paidCamping'];

toggleContainer.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-layer]');
  if (!input) return;
  controller.setLayerVisible(input.dataset.layer, input.checked);
  if (ON_DEMAND_LAYERS.includes(input.dataset.layer) && input.checked) {
    runSearch({ silent: true });
  }
});

createRoot(document.querySelector('#title-mount')).render(createElement(ShimmerText, { text: 'Camp Finder' }));

const searchBtn = document.querySelector('#search-btn');
searchBtn.addEventListener('click', () => runSearch({ silent: false }));

const statusEl = document.querySelector('#status');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('status-error', isError);
}

// A generation counter, not a boolean "in flight" lock — a lock meant a
// single hung request (e.g. Overpass silently sitting on a connection)
// would block every search after it forever, including panning somewhere
// completely different, since nothing ever reset the flag. Now every call
// to runSearch proceeds immediately; a search only applies its results if
// it's still the most recent one by the time it finishes, so a slow/stuck
// stale search just gets silently superseded instead of freezing the UI.
// It also gets its in-flight requests actively cancelled (not just
// ignored) so it stops wasting the free Overpass API's quota the moment
// it's superseded.
let searchGeneration = 0;
let currentAbortController = null;

// Per-request timeouts (fetchUtil.js) bound a single fetch, but
// overpass.js's sequential tile x mirror-fallback loop can still stack
// several of those back to back on a wide/unlucky search — worst case 4
// tiles x 2 mirrors x FETCH_TIMEOUT_MS (28s) is ~3.5 minutes of "Searching…"
// with no way out. This is the "stuck searching" a single request timeout
// doesn't cover: a hard ceiling on the whole search, not just each request
// inside it. Comfortably above a single tile's own worst case (both
// mirrors timing out, ~56s) so a legitimately slow-but-working single-tile
// search isn't cut off early, while still bounding a multi-tile pileup.
const SEARCH_DEADLINE_MS = 60000;

// silent=true is used for automatic triggers (load/pan/zoom) — an
// over-budget area or a transient failure there is just a quiet hint, not
// an alarming red error, since the user didn't explicitly ask for it.
async function runSearch({ silent = false } = {}) {
  const bounds = controller.getBounds();
  if (boundsAreaDegrees(bounds) > MAX_QUERY_AREA_DEG) {
    setStatus('Zoom in a bit more to load pins for this area.', !silent);
    return;
  }

  currentAbortController?.abort();
  const abortController = new AbortController();
  currentAbortController = abortController;
  const myGeneration = ++searchGeneration;
  const isCurrent = () => myGeneration === searchGeneration;
  const deadlineTimer = setTimeout(() => abortController.abort(), SEARCH_DEADLINE_MS);

  searchBtn.disabled = true;
  setStatus('Searching…');
  try {
    const wantPaidCamping = toggleChecked('paidCamping');
    const [osmResults, paidCamping] = await Promise.all([
      queryArea(bounds, {
        includeWater: toggleChecked('water'),
        includeStateParks: toggleChecked('stateParks'),
        signal: abortController.signal,
        // A wide search can take several sequential tile requests (see
        // overpass.js for why sequential) — without this it'd look like a
        // long silent hang instead of visible progress.
        onProgress: (done, total) => {
          if (total > 1 && isCurrent()) setStatus(`Searching… (${done}/${total})`);
        },
      }),
      // A RIDB hiccup shouldn't sink the whole search — OSM results (free
      // camping, state parks, water) still show even if this one fails.
      wantPaidCamping
        ? queryCampgrounds(bounds, abortController.signal).catch((err) => {
            if (!isCurrent()) return [];
            console.error('RIDB campgrounds fetch failed:', err);
            return [];
          })
        : Promise.resolve([]),
    ]);

    if (!isCurrent()) return; // superseded by a newer search while this one was in flight — discard

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
    if (!isCurrent()) return;
    console.error(err);
    // Reaching here with isCurrent() still true rules out "superseded by a
    // newer search" (that always bumps the generation first) — an
    // AbortError at this point can only be the deadline timer above.
    setStatus(
      err?.name === 'AbortError'
        ? 'Search timed out — the data source is slow right now. Try again in a moment.'
        : 'Search failed — the data source may be busy. Try again in a moment.',
      !silent,
    );
  } finally {
    clearTimeout(deadlineTimer);
    if (isCurrent()) searchBtn.disabled = false;
  }
}

// Auto-search as the map settles after a pan/zoom, so results load without
// ever needing to press the button.
let moveTimer = null;
controller.map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => runSearch({ silent: true }), MOVE_DEBOUNCE_MS);
});

// getCurrentPosition's own `timeout` option only counts down once the
// browser actually starts acquiring a position — verified live that Chrome
// and Firefox both pause that clock entirely while the permission prompt is
// still up. So if the user doesn't answer the prompt within the timeout,
// neither the success nor the error callback ever fires, onDone never runs,
// and the caller's "Finding your area…" status is left stuck forever.
// LOCATE_ACQUIRE_MS bounds that browser-side acquisition phase (once it
// actually starts); LOCATE_SAFETY_MS is a separate, independent JS-level
// ceiling covering the *whole* call, prompt-wait included, which guarantees
// onDone fires exactly once no matter what the browser is doing internally.
// These must NOT share one short value: an earlier version used 6s for
// both, which meant ordinary human time spent reading/clicking the prompt
// (a few seconds is completely normal) already ate most of the budget,
// leaving too little left for a real, successful position fix to land
// before the safety timer gave up and fell back to the default region.
const LOCATE_ACQUIRE_MS = 8000;
const LOCATE_SAFETY_MS = 15000;

function locate({ onDone } = {}) {
  if (!navigator.geolocation) {
    onDone?.(false);
    return;
  }
  let settled = false;
  const finish = (ok, pos) => {
    if (settled) return;
    settled = true;
    if (ok) controller.map.setView([pos.coords.latitude, pos.coords.longitude], 11);
    onDone?.(ok);
  };
  const safetyTimer = setTimeout(() => finish(false), LOCATE_SAFETY_MS);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      clearTimeout(safetyTimer);
      finish(true, pos);
    },
    () => {
      clearTimeout(safetyTimer);
      finish(false);
    },
    { timeout: LOCATE_ACQUIRE_MS },
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
