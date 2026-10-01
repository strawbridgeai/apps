import './style.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import ShimmerText from './components/ShimmerText.jsx';
import { createMapController, LAYER_META, detailHtml } from './map.js';
import { queryArea, boundsAreaDegrees } from './overpass.js';
import { getNationalParks } from './nps.js';
import { queryCampgrounds } from './ridb.js';
import { meetingSummary, haversineMiles } from './meetingPoint.js';
import { routeEveryoneTo, routeColor, formatDuration, routeSpread } from './routing.js';

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

// Confirmed report: saved to the iOS home screen (standalone display mode —
// its own WKWebView, no Safari chrome, no tab history at all) and swiping
// back with nothing in the page's own history to go to freezes the whole
// page unresponsive, not just the map. This is a known WebKit standalone-
// mode gesture bug — the edge-swipe-back recognizer fires with nowhere real
// to navigate to and WebKit hangs instead of handling that gracefully. Not
// fixable by making our own code faster/more robust, since the freeze
// happens at the WebKit level, before any of our JS would even run. The
// standard workaround: keep a dummy history entry "behind" the current page
// at all times in standalone mode, so the gesture always has somewhere real
// to go and absorbs harmlessly instead of hitting a dead end. Regular
// Safari-tab visits (not standalone) are untouched — this only applies when
// launched from the home-screen icon.
//
// Scoped to iOS standalone specifically. `display-mode: standalone` also
// matches installed PWAs on Android and desktop, which have no such WebKit
// bug — there, re-pushing on every popstate just made the back button
// impossible to escape (confirmed: four presses, URL never changed), since
// the handler re-armed the guard unconditionally with no way out. The freeze
// being worked around is WebKit-only, so the guard now is too.
const isIosStandalone =
  window.navigator.standalone === true &&
  /iP(hone|ad|od)/.test(window.navigator.platform || window.navigator.userAgent);
if (isIosStandalone) {
  history.pushState({ campfinderTrap: true }, '', location.href);
  let lastPop = 0;
  window.addEventListener('popstate', () => {
    // Two back gestures in quick succession read as a deliberate "get me out
    // of here", so the second one is allowed through rather than re-armed.
    const now = Date.now();
    const deliberate = now - lastPop < 1200;
    lastPop = now;
    if (deliberate) return;
    history.pushState({ campfinderTrap: true }, '', location.href);
  });
}

// Session-scoped "remember where I was" state. On mobile, tapping a marker
// then hitting the browser back button has been reported to re-prompt for
// location and leave the map looking frozen — Leaflet + a geolocation call
// together seem to make some mobile browsers treat this page as ineligible
// for an instant bfcache restore, so back triggers a real reload instead,
// which naturally re-runs everything from scratch including the location
// prompt. Restoring from here instead of blindly re-locating turns that
// into an instant, seamless restore. sessionStorage (not localStorage) so
// this doesn't linger into an unrelated later visit — it's cleared when
// the tab actually closes, same lifetime as the history a back-navigation
// reload is working around.
const STORAGE_KEY = 'campfinder:session';

function loadSessionState() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSessionState(patch) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSessionState(), ...patch }));
  } catch {
    // Private-browsing quota or similar — not saving just means this
    // particular reload won't have anything to restore, same as today.
  }
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
        <div class="site-search">
          <input id="site-search-input" type="search" class="site-search-input" autocomplete="off"
                 placeholder="Search campgrounds on the map…" aria-label="Search places on the map"
                 role="combobox" aria-expanded="false" aria-controls="site-search-results">
          <ul id="site-search-results" class="site-search-results" role="listbox" hidden></ul>
        </div>
        <button id="locate-btn" class="ghost-btn" type="button" title="Center on my location">📍 My location</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="layer-toggles" id="layer-toggles"></div>
      <button id="search-btn" class="btn-primary shrink-0" type="button">Search this area</button>
      <button id="plot-mode-btn" class="ghost-btn shrink-0" type="button" aria-pressed="false">🏠 Add homes</button>
      <label class="radius-control shrink-0">
        <span class="radius-label">Radius</span>
        <select id="radius-select" aria-label="Show a radius around the focused location">
          <option value="0">Off</option>
          <option value="10">10 mi</option>
          <option value="25" selected>25 mi</option>
          <option value="50">50 mi</option>
          <option value="100">100 mi</option>
        </select>
      </label>
      <span id="status" class="status" role="status"></span>
    </div>

    <div class="map-area">
      <div id="map"></div>
      <aside id="meeting-panel" class="meeting-panel" hidden>
        <div class="meeting-head">
          <strong>Meeting point</strong>
          <button id="meeting-clear" class="meeting-clear" type="button">Clear all</button>
        </div>
        <ol id="meeting-list" class="meeting-list"></ol>
        <p id="meeting-summary" class="meeting-summary"></p>
        <div id="route-block" class="route-block" hidden>
          <div class="route-head">
            <strong id="route-dest">Everyone's drive</strong>
            <button id="route-clear" class="meeting-clear" type="button">Clear routes</button>
          </div>
          <ol id="route-list" class="route-list"></ol>
          <p id="route-summary" class="meeting-summary"></p>
        </div>
        <button id="route-meeting-btn" class="route-btn" type="button" hidden>🚗 Drive times to meeting point</button>
      </aside>
      <aside id="area-panel" class="area-panel" hidden>
        <div class="area-head"><strong id="area-title">In this area</strong><span id="area-radius" class="area-radius"></span></div>
        <ul id="area-list" class="area-list"></ul>
      </aside>
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

// Everything currently rendered on the map, keyed by layer. The search box
// and the radius summary both have to answer questions about the pins the
// user can actually see, and neither the map controller nor the search
// routine kept the items around once they had been handed to Leaflet.
const loadedResults = {};
let selectedItem = null;
// Which of the two possible anchors the radius ring should follow. Fixed
// priority was wrong in both directions: with a pin always winning, adding
// homes never moved the ring off a campground selected minutes earlier; with
// the meeting point always winning, clicking a pin to ask "what's near this?"
// did nothing. Whichever the user touched last is the one they mean.
let focusSource = null; // 'pin' | 'meeting'

function openPanel(layerKey, item) {
  selectedItem = { layerKey, item };
  focusSource = 'pin';
  panelContent.innerHTML = detailHtml(layerKey, item);
  // Appended rather than baked into detailHtml: map.js builds that string
  // with no knowledge of home plots, and this button only means anything
  // once at least one home exists.
  if (plots.length) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'route-btn';
    btn.textContent = plots.length === 1 ? '🚗 Drive time from home' : `🚗 Drive times from all ${plots.length} homes`;
    btn.addEventListener('click', () => runRoutes(item.point, itemLabel(layerKey, item)));
    panelContent.appendChild(btn);
  }
  detailPanel.classList.add('open');
  document.querySelector('.map-area').classList.add('panel-open');
  saveSessionState({ panel: { layerKey, item } });
  refreshFocus();
}

function closePanel() {
  detailPanel.classList.remove('open');
  document.querySelector('.map-area').classList.remove('panel-open');
  selectedItem = null;
  if (focusSource === 'pin') focusSource = currentMeeting ? 'meeting' : null;
  saveSessionState({ panel: null });
  refreshFocus();
}

function itemLabel(layerKey, item) {
  return item.tags?.name || LAYER_META[layerKey].label.replace(/s$/, '');
}

document.querySelector('#panel-close').addEventListener('click', closePanel);

const controller = createMapController(document.querySelector('#map'), { onMarkerSelect: openPanel });

// --- Home plots + fair meeting point ---
const plotModeBtn = document.querySelector('#plot-mode-btn');
const meetingPanel = document.querySelector('#meeting-panel');
const meetingList = document.querySelector('#meeting-list');
const meetingSummaryEl = document.querySelector('#meeting-summary');

let plotMode = false;
let plots = loadSessionState().plots || [];
let currentMeeting = null;

function setPlotMode(on) {
  plotMode = on;
  plotModeBtn.setAttribute('aria-pressed', String(on));
  plotModeBtn.classList.toggle('is-active', on);
  document.querySelector('#map').classList.toggle('plot-cursor', on);
  plotModeBtn.textContent = on ? '🏠 Click the map…' : '🏠 Add homes';
}

function renderMeeting() {
  saveSessionState({ plots });
  controller.renderPlots(plots, {
    onPlotClick: (index, point) => {
      plots[index] = { ...plots[index], point };
      renderMeeting();
    },
  });

  const summary = plots.length >= 2 ? meetingSummary(plots.map((p) => p.point)) : null;
  const meetingMoved = Boolean(summary) && (!currentMeeting || currentMeeting.point[0] !== summary.point[0] || currentMeeting.point[1] !== summary.point[1]);
  currentMeeting = summary;
  if (meetingMoved) focusSource = 'meeting';
  else if (!summary && focusSource === 'meeting') focusSource = selectedItem ? 'pin' : null;
  controller.renderMeeting(summary, plots);
  document.querySelector('#route-meeting-btn').hidden = !summary;
  refreshFocus();

  meetingPanel.hidden = plots.length === 0;
  meetingList.innerHTML = plots
    .map(
      (p, i) => `<li>
        <span class="meeting-num">${i + 1}</span>
        <span class="meeting-label">${p.label}</span>
        <span class="meeting-dist">${summary ? `${summary.distances[i].toFixed(1)} mi` : ''}</span>
        <button class="meeting-remove" data-remove="${i}" type="button" aria-label="Remove ${p.label}">&times;</button>
      </li>`
    )
    .join('');

  if (!summary) {
    meetingSummaryEl.textContent =
      plots.length === 1 ? 'Add one more home to find the halfway point.' : '';
    return;
  }
  meetingSummaryEl.textContent = summary.exact
    ? `Exact halfway point — ${summary.max.toFixed(1)} mi each.`
    : `Geographic middle of ${plots.length} homes: ${summary.min.toFixed(1)}–${summary.max.toFixed(1)} mi away.`;
}

function addPlot(point) {
  plots.push({ point, label: `Home ${plots.length + 1}` });
  renderMeeting();
  if (plots.length === 2) controller.fitPlots(plots);
}

plotModeBtn.addEventListener('click', () => setPlotMode(!plotMode));

meetingList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  plots.splice(Number(btn.dataset.remove), 1);
  plots = plots.map((p, i) => ({ ...p, label: `Home ${i + 1}` }));
  renderMeeting();
});

document.querySelector('#meeting-clear').addEventListener('click', () => {
  plots = [];
  setPlotMode(false);
  renderMeeting();
});

controller.map.on('click', (e) => {
  if (plotMode) {
    addPlot([e.latlng.lat, e.latlng.lng]);
    return;
  }
  closePanel();
});

// --- Radius ring + "what's in this area" -------------------------------
//
// The ring anchors to whatever the map is currently focused on: a pin if one
// is selected, otherwise the meeting point the homes converge on. Anchoring
// it to only one of those would be wrong half the time - picking a campsite
// and asking "what else is near this?" is the same question as asking it
// about the spot everyone is driving to.
const radiusSelect = document.querySelector('#radius-select');
const areaPanel = document.querySelector('#area-panel');
const areaTitle = document.querySelector('#area-title');
const areaRadiusEl = document.querySelector('#area-radius');
const areaList = document.querySelector('#area-list');

let radiusMiles = Number(loadSessionState().radiusMiles ?? 25);
radiusSelect.value = String(radiusMiles);

function visibleLayerKeys() {
  return Object.keys(LAYER_META).filter(toggleChecked);
}

function focusAnchor() {
  const pin = selectedItem
    ? { point: selectedItem.item.point, label: itemLabel(selectedItem.layerKey, selectedItem.item) }
    : null;
  const meeting = currentMeeting ? { point: currentMeeting.point, label: 'Meeting point' } : null;
  if (focusSource === 'pin' && pin) return pin;
  if (focusSource === 'meeting' && meeting) return meeting;
  return pin || meeting;
}

function refreshFocus() {
  const anchor = focusAnchor();
  if (!anchor || !radiusMiles) {
    controller.renderRadius(null);
    areaPanel.hidden = true;
    return;
  }
  controller.renderRadius(anchor.point, radiusMiles);

  // Counted from the pins actually loaded and visible, not from a fresh
  // query - the ring describes what the user is looking at. That also means
  // it says "of the loaded pins", which is why the panel spells that out
  // rather than implying it is an exhaustive census of the area.
  const rows = [];
  for (const key of visibleLayerKeys()) {
    const items = loadedResults[key] || [];
    const inside = items.filter((it) => haversineMiles(anchor.point, it.point) <= radiusMiles);
    if (inside.length) rows.push({ key, count: inside.length });
  }
  areaTitle.textContent = anchor.label;
  areaRadiusEl.textContent = `within ${radiusMiles} mi`;
  areaList.innerHTML = rows.length
    ? rows
        .map(
          (r) => `<li><span class="dot" style="background:${LAYER_META[r.key].color}"></span>
            <span class="area-name">${LAYER_META[r.key].label}</span>
            <span class="area-count">${r.count}</span></li>`
        )
        .join('')
    : '<li class="area-empty">No loaded pins inside this radius.</li>';
  areaPanel.hidden = false;
}

radiusSelect.addEventListener('change', () => {
  radiusMiles = Number(radiusSelect.value);
  saveSessionState({ radiusMiles });
  refreshFocus();
  const anchor = focusAnchor();
  if (anchor && radiusMiles) controller.fitRadius(anchor.point, radiusMiles);
});

// --- Search over the pins on the map -----------------------------------
//
// Deliberately searches only what is already loaded, because that is what
// the request was: match the names of what pops up on the map. A geocoder
// would happily return a campground three states away that has no pin,
// which is a different and more confusing feature.
const searchInput = document.querySelector('#site-search-input');
const searchResults = document.querySelector('#site-search-results');
const MAX_SEARCH_RESULTS = 12;

let searchMatches = [];
let searchActiveIndex = -1;

function currentMatches(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const center = controller.map.getCenter();
  const from = [center.lat, center.lng];
  const out = [];
  for (const key of visibleLayerKeys()) {
    for (const item of loadedResults[key] || []) {
      const name = item.tags?.name;
      if (!name || !name.toLowerCase().includes(q)) continue;
      out.push({ key, item, name, distance: haversineMiles(from, item.point) });
    }
  }
  // Nearest first: with a common name like "Lakeview Campground" the one in
  // view is almost always the one meant.
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, MAX_SEARCH_RESULTS);
}

function renderSearchResults() {
  if (!searchMatches.length) {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    searchInput.setAttribute('aria-expanded', 'false');
    return;
  }
  searchResults.innerHTML = searchMatches
    .map(
      (m, i) => `<li role="option" data-index="${i}" class="${i === searchActiveIndex ? 'is-active' : ''}" aria-selected="${i === searchActiveIndex}">
        <span class="dot" style="background:${LAYER_META[m.key].color}"></span>
        <span class="search-name">${escapeForAttr(m.name)}</span>
        <span class="search-dist">${m.distance.toFixed(0)} mi</span>
      </li>`
    )
    .join('');
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

function escapeForAttr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function refreshSearch() {
  if (!searchInput.value.trim()) return;
  searchMatches = currentMatches(searchInput.value);
  searchActiveIndex = searchMatches.length ? 0 : -1;
  renderSearchResults();
}

function chooseMatch(index) {
  const match = searchMatches[index];
  if (!match) return;
  controller.focusPoint(match.item.point);
  openPanel(match.key, match.item);
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.blur();
}

searchInput.addEventListener('input', () => {
  searchMatches = currentMatches(searchInput.value);
  searchActiveIndex = searchMatches.length ? 0 : -1;
  renderSearchResults();
  if (searchInput.value.trim().length >= 2 && !searchMatches.length) {
    searchResults.innerHTML = '<li class="search-empty">No loaded pin matches that name. Try searching this area first.</li>';
    searchResults.hidden = false;
  }
});

searchInput.addEventListener('keydown', (e) => {
  if (searchResults.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    searchActiveIndex = (searchActiveIndex + delta + searchMatches.length) % searchMatches.length;
    renderSearchResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    chooseMatch(searchActiveIndex);
  } else if (e.key === 'Escape') {
    searchResults.hidden = true;
  }
});

searchResults.addEventListener('mousedown', (e) => {
  // mousedown, not click: the input's blur would hide this list first.
  const li = e.target.closest('[data-index]');
  if (!li) return;
  e.preventDefault();
  chooseMatch(Number(li.dataset.index));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.site-search')) searchResults.hidden = true;
});

// --- Everyone's drive to one destination -------------------------------
const routeBlock = document.querySelector('#route-block');
const routeList = document.querySelector('#route-list');
const routeDest = document.querySelector('#route-dest');
const routeSummaryEl = document.querySelector('#route-summary');
let routeAbort = null;

async function runRoutes(destination, label) {
  if (!plots.length) return;
  routeAbort?.abort();
  routeAbort = new AbortController();
  const signal = routeAbort.signal;

  meetingPanel.hidden = false;
  routeBlock.hidden = false;
  routeDest.textContent = `Drive to ${label}`;
  routeSummaryEl.textContent = 'Getting routes…';
  routeList.innerHTML = '';

  try {
    const results = await routeEveryoneTo(plots, destination, {
      signal,
      onProgress: (done, total) => {
        if (!signal.aborted) routeSummaryEl.textContent = `Getting routes… (${done}/${total})`;
      },
    });
    if (signal.aborted) return;

    controller.renderRoutes(plots, destination, results, routeColor);
    controller.fitRoutes(results, destination);

    routeList.innerHTML = plots
      .map((plot, i) => {
        const r = results[i];
        const detail = r?.ok
          ? `<span class="route-time">${formatDuration(r.seconds)}</span><span class="route-miles">${r.miles.toFixed(0)} mi</span>`
          : `<span class="route-time route-failed">${escapeForAttr(r?.error || 'No route')}</span><span class="route-miles">${r?.miles ? `${r.miles.toFixed(0)} mi direct` : ''}</span>`;
        return `<li>
          <span class="route-swatch" style="background:${routeColor(i)}"></span>
          <span class="route-name">${escapeForAttr(plot.label)}</span>
          ${detail}
        </li>`;
      })
      .join('');

    const spread = routeSpread(results);
    const failed = results.filter((r) => !r?.ok).length;
    const parts = [];
    if (spread) {
      parts.push(
        spread.spread < 60
          ? `Within ${formatDuration(spread.spread)} of each other.`
          : `${plots[spread.longestIndex]?.label || 'Someone'} drives ${formatDuration(spread.spread)} longer than the shortest trip.`
      );
    }
    if (failed) parts.push(`${failed} route${failed > 1 ? 's' : ''} unavailable.`);
    routeSummaryEl.textContent = parts.join(' ') || 'Routes shown on the map.';
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error('Routing failed:', err);
    routeSummaryEl.textContent = 'Could not reach the routing service. Try again in a moment.';
  }
}

document.querySelector('#route-meeting-btn').addEventListener('click', () => {
  if (currentMeeting) runRoutes(currentMeeting.point, 'the meeting point');
});

document.querySelector('#route-clear').addEventListener('click', () => {
  routeAbort?.abort();
  controller.clearRoutes();
  routeBlock.hidden = true;
});

// Deliberately after the radius/search/route wiring above: renderMeeting now
// calls refreshFocus, which reads those const element handles, and running it
// any earlier threw a temporal-dead-zone ReferenceError before the map had
// drawn anything at all.
renderMeeting();

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
    Object.assign(loadedResults, results);
    refreshFocus();
    refreshSearch();
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
controller.map.on('moveend', () => {
  const c = controller.map.getCenter();
  saveSessionState({ view: { lat: c.lat, lon: c.lng, zoom: controller.map.getZoom() } });
});

// Some mobile browsers restore this page from bfcache on a back-navigation
// instead of doing a fresh reload — when that happens, Leaflet can render
// broken/blank because it last measured its container's size before the
// page was backgrounded. invalidateSize() forces a fresh measurement.
// event.persisted is how a bfcache restore is told apart from a normal
// load (which already sizes correctly on its own, so this is a no-op then).
window.addEventListener('pageshow', (e) => {
  if (e.persisted) controller.map.invalidateSize();
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
  .then((items) => {
    controller.setNationalParks(items);
    loadedResults.nationalParks = items;
    refreshFocus();
    refreshSearch();
  })
  .catch((err) => console.error('Failed to load National Parks:', err));

// --- Populate pins on startup, no interaction required ---
// Prefer restoring exactly where this tab session already was (see
// STORAGE_KEY above) over re-requesting geolocation — most relevant right
// after a mobile back-navigation reload, but harmless on any other reload
// within the same tab too. Only falls through to a fresh geolocation
// request when there's nothing to restore, same as a first-ever visit.
const savedState = loadSessionState();
if (savedState.view) {
  controller.map.setView([savedState.view.lat, savedState.view.lon], savedState.view.zoom);
  if (savedState.panel) openPanel(savedState.panel.layerKey, savedState.panel.item);
} else {
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
}
