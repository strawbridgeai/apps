import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Custom divIcon markers instead of Leaflet's default pin — sidesteps the
// well-known bundler asset-path issue with L.Icon.Default, and gives free
// per-category color coding. State Parks defaults off now, same reasoning
// as Water: its OSM query clause is the single most expensive part of a
// search (a regex tag lookup, not a simple key=value match — see
// overpass.js), so it's opt-in rather than part of every routine search.
export const LAYER_META = {
  freeCamping: { label: 'Free / Dispersed Camping', color: '#16a34a', glyph: '⛺', defaultOn: true },
  nationalParks: { label: 'National Parks', color: '#1d4ed8', glyph: '\u{1F332}', defaultOn: true },
  stateParks: { label: 'State Parks', color: '#0d9488', glyph: '\u{1F332}', defaultOn: false },
  water: { label: 'Potable Water', color: '#0ea5e9', glyph: '\u{1F4A7}', defaultOn: false },
  paidCamping: { label: 'Paid Campgrounds', color: '#6b7280', glyph: '⛺', defaultOn: false },
};

const PIN_SIZE = 38;

function makeIcon(meta) {
  return L.divIcon({
    className: 'camp-marker',
    html: `<span class="camp-marker-dot" style="background:${meta.color}">${meta.glyph}</span>`,
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
    popupAnchor: [0, -PIN_SIZE / 2],
  });
}

function isOsmId(id) {
  return /^(node|way|relation)\//.test(id);
}

function gmapsLink(item) {
  return `https://www.google.com/maps?q=${item.point[0]},${item.point[1]}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function itemName(layerKey, item) {
  return item.tags.name ? escapeHtml(item.tags.name) : LAYER_META[layerKey].label.replace(/s$/, '');
}

// Short hover tooltip — just enough to identify the pin without a click.
export function tooltipHtml(layerKey, item) {
  const t = item.tags;
  const name = itemName(layerKey, item);
  let sub = '';
  if (layerKey === 'freeCamping') sub = t.fee === 'no' ? 'Free (tagged)' : 'Likely free — unverified';
  else if (layerKey === 'paidCamping') sub = 'Fee required';
  else if (layerKey === 'water') sub = 'Potable water';
  else sub = LAYER_META[layerKey].label;
  return `<div class="camp-tooltip"><strong>${name}</strong><br>${sub}</div>`;
}

// Full detail content for the side panel (see main.js) — same information
// the old click-popup used to show, just laid out for a docked panel
// instead of a small map-anchored bubble.
export function detailHtml(layerKey, item) {
  const t = item.tags;
  const meta = LAYER_META[layerKey];
  const name = itemName(layerKey, item);
  const rows = [];

  if (layerKey === 'freeCamping') {
    rows.push(
      t.fee === 'no'
        ? '<span class="badge badge-free">Free (tagged)</span>'
        : '<span class="badge badge-unverified">Likely free — unverified, confirm locally</span>'
    );
    if (t.operator) rows.push(`Operator: ${escapeHtml(t.operator)}`);
    if (t.access) rows.push(`Access: ${escapeHtml(t.access)}`);
    if (t.backcountry === 'yes') rows.push('Backcountry / walk-in site');
    if (t.capacity) rows.push(`Capacity: ${escapeHtml(t.capacity)}`);
  } else if (layerKey === 'paidCamping') {
    rows.push('<span class="badge badge-paid">Fee required</span>');
    if (t.feeText) rows.push(escapeHtml(t.feeText));
    if (t.reservable) rows.push('Reservable online');
    if (t.phone) rows.push(`Phone: <a href="tel:${escapeHtml(t.phone)}">${escapeHtml(t.phone)}</a>`);
  } else if (layerKey === 'nationalParks' || layerKey === 'stateParks') {
    if (t.operator) rows.push(`Operator: ${escapeHtml(t.operator)}`);
  } else if (layerKey === 'water') {
    if (t.access) rows.push(`Access: ${escapeHtml(t.access)}`);
    if (t.seasonal === 'yes') rows.push('Seasonal — may be shut off part of the year');
  }

  const wiki = t.wikipedia
    ? `<a href="https://${escapeHtml(t.wikipedia.split(':')[0])}.wikipedia.org/wiki/${encodeURIComponent(t.wikipedia.split(':').slice(1).join(':'))}" target="_blank" rel="noopener">Wikipedia</a>`
    : '';
  const website = t.website
    ? `<a href="${escapeHtml(t.website)}" target="_blank" rel="noopener">${layerKey === 'paidCamping' ? 'Reserve / info' : 'Website'}</a>`
    : '';
  const osmSource = isOsmId(item.id)
    ? `<a href="https://www.openstreetmap.org/${item.id}" target="_blank" rel="noopener">OSM source</a>`
    : '';

  return `
    <div class="panel-category" style="color:${meta.color}">${meta.glyph} ${meta.label}</div>
    <h2 class="panel-title">${name}</h2>
    ${rows.length ? `<div class="panel-rows">${rows.join('<br>')}</div>` : ''}
    <div class="panel-links">
      <a href="${gmapsLink(item)}" target="_blank" rel="noopener" class="panel-link-btn">Directions</a>
      ${website ? `<a href="${escapeHtml(t.website)}" target="_blank" rel="noopener" class="panel-link-btn">${layerKey === 'paidCamping' ? 'Reserve / info' : 'Website'}</a>` : ''}
    </div>
    <div class="panel-extra-links">
      ${osmSource}
      ${wiki}
    </div>
  `;
}

export function createMapController(container, { onMarkerSelect } = {}) {
  const map = L.map(container, { zoomControl: true }).setView([39.5, -98.35], 4); // center of contiguous US

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);

  const groups = {};
  const icons = {};
  for (const [key, meta] of Object.entries(LAYER_META)) {
    icons[key] = makeIcon(meta);
    const group = L.markerClusterGroup({ maxClusterRadius: 45, disableClusteringAtZoom: 15, spiderfyOnMaxZoom: true });
    groups[key] = group;
    if (meta.defaultOn) map.addLayer(group);
  }

  // National Parks is loaded once (see nps.js — ~474 units total, no
  // per-viewport querying) and must survive every subsequent search, so it
  // is deliberately excluded from the clear-and-repopulate cycle below.
  const SEARCH_LAYERS = Object.keys(LAYER_META).filter((k) => k !== 'nationalParks');

  function populateGroup(key, items) {
    const group = groups[key];
    if (!group) return;
    group.clearLayers();
    for (const item of items) {
      const marker = L.marker(item.point, { icon: icons[key] });
      marker.bindTooltip(tooltipHtml(key, item), {
        direction: 'top',
        offset: [0, -PIN_SIZE / 2],
        opacity: 0.95,
        className: 'camp-tooltip-wrap',
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e); // don't let it also fire the map's own click (which closes the panel)
        onMarkerSelect?.(key, item);
      });
      group.addLayer(marker);
    }
  }

  function renderResults(results) {
    for (const key of SEARCH_LAYERS) {
      populateGroup(key, results[key] || []);
    }
  }

  function setNationalParks(items) {
    populateGroup('nationalParks', items);
  }

  function setLayerVisible(key, visible) {
    const group = groups[key];
    if (!group) return;
    if (visible) map.addLayer(group);
    else map.removeLayer(group);
  }

  function getBounds() {
    const b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }

  return { map, groups, renderResults, setNationalParks, setLayerVisible, getBounds };
}
