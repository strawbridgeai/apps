// Runs the develop pipeline off the main thread so dragging a slider or a
// curve point never waits on the per-pixel loop. Keeps a few session base
// images by key so each request only has to send the settings.
import { applyDevelop, histogramOf } from './photoFilters.js';

const bases = new Map();
const MAX_BASES = 4;

self.onmessage = ({ data: m }) => {
  if (m.type === 'load') {
    bases.delete(m.key);
    bases.set(m.key, { data: new Uint8ClampedArray(m.buffer), width: m.width, height: m.height });
    while (bases.size > MAX_BASES) bases.delete(bases.keys().next().value);
  } else if (m.type === 'drop') {
    bases.delete(m.key);
  } else if (m.type === 'develop') {
    const base = bases.get(m.key);
    if (!base) {
      self.postMessage({ id: m.id, missing: true });
      return;
    }
    const out = new Uint8ClampedArray(base.data.length);
    applyDevelop(base, { data: out }, m.settings);
    const hist = m.hist ? histogramOf(out) : null;
    self.postMessage({ id: m.id, buffer: out.buffer, width: base.width, height: base.height, hist }, [out.buffer]);
  }
};
