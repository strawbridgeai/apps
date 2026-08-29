// Leaflet + markercluster — same libraries and pattern as
// apps/camping-locator/src/map.js, adapted for stock pins instead of
// static POIs: hovering a pin is the primary interaction here (not a
// click-to-open panel), since the whole point is seeing live/most-recent
// stock at a glance while scanning the map.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export const RETAILER_META = {
  bestbuy: { label: 'Best Buy', color: '#24968a' },
  target: { label: 'Target', color: '#b3ad1f' },
};

const PIN_SIZE = 34;
const OUT_OF_STOCK_COLOR = '#9aa89a';

function makeIcon(retailer, inStock) {
  const meta = RETAILER_META[retailer] || { color: '#7c8a74' };
  return L.divIcon({
    className: 'stock-marker',
    html: `<span class="stock-marker-dot" style="background:${inStock ? meta.color : OUT_OF_STOCK_COLOR}">${inStock ? '✓' : '·'}</span>`,
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
    popupAnchor: [0, -PIN_SIZE / 2],
  });
}

function timeAgo(ts) {
  if (!ts) return 'not checked yet';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tooltipHtml(store, product) {
  const retailerLabel = RETAILER_META[product.retailer]?.label || product.retailer;
  return `<div class="stock-tooltip">
    <strong>${escapeHtml(store.storeName)}</strong><br>
    ${escapeHtml(product.name)} &middot; ${retailerLabel}<br>
    <span class="${store.inStock ? 'in-stock' : 'out-of-stock'}">${store.inStock ? 'In stock' : 'Not in stock'}</span><br>
    <span class="checked-at">checked ${timeAgo(store.checkedAt)}</span>
  </div>`;
}

export function createMapController(container) {
  const map = L.map(container, { zoomControl: true }).setView([39.5, -98.35], 4); // center of contiguous US

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);

  // See camping-locator/map.js for why this is needed - Leaflet caches the
  // container's pixel size at construction and never re-measures on its
  // own, so getBounds()/pan/zoom math can silently use a stale size if the
  // container wasn't at its final layout size yet when the map was built.
  new ResizeObserver(() => map.invalidateSize()).observe(container);

  const group = L.markerClusterGroup({ maxClusterRadius: 45, disableClusteringAtZoom: 15, spiderfyOnMaxZoom: true });
  map.addLayer(group);

  let userMarker = null;
  function setUserLocation(lat, lon, { pan = true } = {}) {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lon], {
      radius: 7,
      color: '#3f8f45',
      weight: 2,
      fillColor: '#3f8f45',
      fillOpacity: 0.85,
    }).addTo(map);
    if (pan) map.setView([lat, lon], 9);
  }

  // markers: [{ store, product }]
  function render(markers) {
    group.clearLayers();
    for (const { store, product } of markers) {
      const marker = L.marker([store.lat, store.lon], { icon: makeIcon(product.retailer, store.inStock) });
      marker.bindTooltip(tooltipHtml(store, product), {
        direction: 'top',
        offset: [0, -PIN_SIZE / 2],
        opacity: 0.95,
        className: 'stock-tooltip-wrap',
      });
      group.addLayer(marker);
    }
  }

  return { map, render, setUserLocation };
}
