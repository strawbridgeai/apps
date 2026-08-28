import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Custom divIcon markers instead of Leaflet's default pin — sidesteps the
// well-known bundler asset-path issue with L.Icon.Default, and gives free
// per-category color coding.
export const LAYER_META = {
  freeCamping: { label: 'Free / Dispersed Camping', color: '#16a34a', glyph: '⛺', defaultOn: true },
  nationalParks: { label: 'National Parks', color: '#1d4ed8', glyph: '\u{1F332}', defaultOn: true },
  stateParks: { label: 'State Parks', color: '#0d9488', glyph: '\u{1F332}', defaultOn: true },
  water: { label: 'Potable Water', color: '#0ea5e9', glyph: '\u{1F4A7}', defaultOn: false },
  paidCamping: { label: 'Paid Campgrounds', color: '#6b7280', glyph: '⛺', defaultOn: false },
};

function makeIcon(meta) {
  return L.divIcon({
    className: 'camp-marker',
    html: `<span class="camp-marker-dot" style="background:${meta.color}">${meta.glyph}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

function osmLink(item) {
  return `https://www.openstreetmap.org/${item.id}`;
}

function gmapsLink(item) {
  return `https://www.google.com/maps?q=${item.point[0]},${item.point[1]}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function popupHtml(layerKey, item) {
  const t = item.tags;
  const meta = LAYER_META[layerKey];
  const name = t.name ? escapeHtml(t.name) : meta.label.replace(/s$/, '');
  const rows = [];

  if (layerKey === 'freeCamping' || layerKey === 'paidCamping') {
    if (layerKey === 'freeCamping') {
      rows.push(
        t.fee === 'no'
          ? '<span class="badge badge-free">Free (tagged)</span>'
          : '<span class="badge badge-unverified">Likely free — unverified, confirm locally</span>'
      );
    } else {
      rows.push('<span class="badge badge-paid">Fee required</span>');
    }
    if (t.operator) rows.push(`Operator: ${escapeHtml(t.operator)}`);
    if (t.access) rows.push(`Access: ${escapeHtml(t.access)}`);
    if (t.backcountry === 'yes') rows.push('Backcountry / walk-in site');
    if (t.capacity) rows.push(`Capacity: ${escapeHtml(t.capacity)}`);
  } else if (layerKey === 'nationalParks' || layerKey === 'stateParks') {
    if (t.operator) rows.push(`Operator: ${escapeHtml(t.operator)}`);
  } else if (layerKey === 'water') {
    if (t.access) rows.push(`Access: ${escapeHtml(t.access)}`);
    if (t.seasonal === 'yes') rows.push('Seasonal — may be shut off part of the year');
  }

  const wiki = t.wikipedia
    ? `<a href="https://${escapeHtml(t.wikipedia.split(':')[0])}.wikipedia.org/wiki/${encodeURIComponent(t.wikipedia.split(':').slice(1).join(':'))}" target="_blank" rel="noopener">Wikipedia</a>`
    : '';

  return `<div class="camp-popup">
    <strong>${name}</strong>
    ${rows.length ? `<div class="popup-rows">${rows.join('<br>')}</div>` : ''}
    <div class="popup-links">
      <a href="${gmapsLink(item)}" target="_blank" rel="noopener">Directions</a>
      <a href="${osmLink(item)}" target="_blank" rel="noopener">OSM source</a>
      ${wiki}
    </div>
  </div>`;
}

export function createMapController(container) {
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

  function clearAll() {
    for (const group of Object.values(groups)) group.clearLayers();
  }

  function renderResults(results) {
    clearAll();
    for (const [key, items] of Object.entries(results)) {
      const group = groups[key];
      if (!group) continue;
      for (const item of items) {
        const marker = L.marker(item.point, { icon: icons[key] });
        marker.bindPopup(popupHtml(key, item));
        group.addLayer(marker);
      }
    }
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

  return { map, groups, renderResults, setLayerVisible, getBounds };
}
