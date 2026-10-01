/**
 * New York primitive campsites and lean-tos, straight from NYS DEC's own
 * ArcGIS REST services — the same data behind DEC's DECinfo Locator
 * (gisservices.dec.ny.gov/gis/dil/). OSM only has a fraction of these
 * (e.g. the Catskills' designated sites), and DEC's copy is authoritative.
 *
 * No API key, and the server echoes the request Origin in
 * Access-Control-Allow-Origin, so the browser calls it directly — no
 * backend proxy needed (unlike nps.js / ridb.js).
 *
 * Not a documented public API: these are the viewer's backing services and
 * DEC renames/copies them occasionally (there are dated "_tbd_" copies
 * alongside some). Callers must treat a failure as "no NY results", never
 * as a failed search.
 */
import { fetchWithTimeout } from './fetchUtil.js';

const DEC_BASE = 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil';
const LAYERS = {
  nyPrimitive: `${DEC_BASE}/dil_land_assets_prm_cmp/MapServer/0/query`,
  nyLeanTo: `${DEC_BASE}/dil_land_assets_lean_to/MapServer/0/query`,
};
const FETCH_TIMEOUT_MS = 15000;
const PAGE_SIZE = 1000; // the services' maxRecordCount
const MAX_PAGES = 5; // ~2.1k primitive sites statewide, so 3 pages covers everything

// Generous box around New York State. Anywhere outside it, skip the request
// entirely instead of asking DEC for an empty answer on every pan.
const NY_BOUNDS = { south: 40.4, west: -79.9, north: 45.1, east: -71.8 };

export function boundsTouchNewYork(b) {
  return b.north >= NY_BOUNDS.south && b.south <= NY_BOUNDS.north && b.east >= NY_BOUNDS.west && b.west <= NY_BOUNDS.east;
}

// DEC pads empty text fields with a single space.
function clean(value) {
  const s = typeof value === 'string' ? value.trim() : value;
  return s ? s : undefined;
}

async function queryLayer(key, bounds, signal) {
  const items = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: "PUBLICUSE='Y'",
      geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outSR: '4326',
      outFields: 'OBJECTID,FACILITY,NAME,DESCRIP,NOTES,ACCESSIBLE',
      orderByFields: 'OBJECTID',
      resultOffset: String(page * PAGE_SIZE),
      resultRecordCount: String(PAGE_SIZE),
      f: 'json',
    });
    const res = await fetchWithTimeout(`${LAYERS[key]}?${params}`, {}, FETCH_TIMEOUT_MS, signal);
    if (!res.ok) throw new Error(`NYS DEC ${key} returned HTTP ${res.status}`);
    const data = await res.json();
    // ArcGIS reports errors as HTTP 200 with an {error} body.
    if (data.error) throw new Error(`NYS DEC ${key}: ${data.error.message}`);
    for (const f of data.features || []) {
      const a = f.attributes;
      if (!f.geometry) continue;
      items.push({
        id: `nydec/${key}/${a.OBJECTID}`,
        point: [f.geometry.y, f.geometry.x],
        tags: {
          name: clean(a.NAME),
          facility: clean(a.FACILITY),
          description: clean(a.DESCRIP),
          notes: clean(a.NOTES),
          accessible: a.ACCESSIBLE === 'Y',
        },
      });
    }
    if (!data.exceededTransferLimit) break;
  }
  return items;
}

// Returns { nyPrimitive, nyLeanTo } for whichever keys are requested.
// Each layer fails independently so one renamed service doesn't hide the other.
export async function queryNyDec(bounds, keys, signal) {
  const out = Object.fromEntries(keys.map((k) => [k, []]));
  if (!keys.length || !boundsTouchNewYork(bounds)) return out;
  await Promise.all(
    keys.map(async (key) => {
      try {
        out[key] = await queryLayer(key, bounds, signal);
      } catch (err) {
        if (err?.name !== 'AbortError') console.error(`NYS DEC ${key} fetch failed:`, err);
        // An abort from a superseded search must still propagate as "nothing"
        // here — main.js discards superseded results on its own.
      }
    }),
  );
  return out;
}
