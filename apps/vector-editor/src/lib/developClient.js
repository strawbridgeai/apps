// Main-thread side of developWorker.js. Two workers — one for live
// previews, one for full-resolution commits — so a multi-second 24MP
// commit never stalls the preview of the next slider drag. Falls back to
// running on the main thread if workers aren't available.
import { applyDevelop, histogramOf } from './photoFilters.js';

const workers = {};
const pending = new Map();
let nextId = 1;
let disabled = typeof Worker === 'undefined';

function getWorker(slot) {
  if (workers[slot]) return workers[slot];
  const w = new Worker(new URL('./developWorker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    p.resolve(data);
  };
  w.onerror = () => {
    disabled = true;
    for (const [id, p] of pending) {
      if (p.worker === w) {
        pending.delete(id);
        p.reject(new Error('develop worker failed'));
      }
    }
  };
  workers[slot] = w;
  return w;
}

function call(w, msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, worker: w });
    w.postMessage({ ...msg, id });
  });
}

function runLocal(base, settings, hist) {
  const out = new Uint8ClampedArray(base.data.length);
  applyDevelop(base, { data: out }, settings);
  return { buffer: out.buffer, width: base.width, height: base.height, hist: hist ? histogramOf(out) : null };
}

// `getBase()` returns a fresh ImageData of the session's starting image;
// it's only called the first time a worker sees `key` (its buffer is
// transferred away).
export async function developRemote(slot, key, getBase, settings, { hist = false } = {}) {
  if (!disabled) {
    try {
      const w = getWorker(slot);
      let res = await call(w, { type: 'develop', key, settings, hist });
      if (res.missing) {
        const b = getBase();
        w.postMessage({ type: 'load', key, width: b.width, height: b.height, buffer: b.data.buffer }, [b.data.buffer]);
        res = await call(w, { type: 'develop', key, settings, hist });
      }
      return res;
    } catch {
      disabled = true;
    }
  }
  return runLocal(getBase(), settings, hist);
}

export function dropRemote(key) {
  for (const w of Object.values(workers)) w.postMessage({ type: 'drop', key });
}
