import './style.css';
import { createMapController, LAYER_META } from './map.js';
import { queryArea, boundsAreaDegrees } from './overpass.js';

// Guard against enormous/expensive queries against a shared free API —
// forces the user to zoom in before searching a huge area.
const MAX_QUERY_AREA_DEG = 6;

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

toggleContainer.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-layer]');
  if (!input) return;
  controller.setLayerVisible(input.dataset.layer, input.checked);
});

const statusEl = document.querySelector('#status');
const searchBtn = document.querySelector('#search-btn');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('status-error', isError);
}

async function searchThisArea() {
  const bounds = controller.getBounds();
  if (boundsAreaDegrees(bounds) > MAX_QUERY_AREA_DEG) {
    setStatus('Zoom in a bit more — this area is too large to search all at once.', true);
    return;
  }
  searchBtn.disabled = true;
  setStatus('Searching…');
  try {
    const results = await queryArea(bounds);
    controller.renderResults(results);
    const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
    setStatus(total > 0 ? `Found ${total} points in this area.` : 'Nothing found here — try a different area.');
  } catch (err) {
    console.error(err);
    setStatus('Search failed — the data source may be busy. Try again in a moment.', true);
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener('click', searchThisArea);

document.querySelector('#locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not available in this browser.', true);
    return;
  }
  setStatus('Locating…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      controller.map.setView([pos.coords.latitude, pos.coords.longitude], 12);
      setStatus('Centered on your location — tap "Search this area" to load nearby spots.');
    },
    () => setStatus('Could not get your location — check browser location permissions.', true),
  );
});
