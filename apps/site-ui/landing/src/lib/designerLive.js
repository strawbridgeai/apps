// Live-preview runtime for the Site Designer tab — active only inside the
// `?designer=1` preview iframe (see DesignerBridge.jsx), completely inert
// on the real published site (nothing here ever runs there). Lets a field
// edit in the admin panel show up instantly in this already-loaded page,
// with zero rebuild and nothing written to disk: `cssVar`-targeted fields
// are applied by directly setting the custom property on :root (which
// every component already reads via `var(--x)`, so this needs no component
// changes at all); `config`-targeted fields go through the tiny pub-sub
// store below, which components read via `useLiveConfig` instead of the
// static landing.config.json import; `textPatch`-targeted fields patch the
// relevant DOM node's text directly.
import { useSyncExternalStore } from 'react';

const overrides = {};
const listeners = new Set();

function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let cur = obj;
  for (const p of parts) {
    if (typeof cur[p] !== 'object' || cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  cur[last] = value;
}

export function setConfigOverride(path, value) {
  setByPath(overrides, path, value);
  listeners.forEach((fn) => fn());
}

export function resetConfigOverrides() {
  for (const k of Object.keys(overrides)) delete overrides[k];
  listeners.forEach((fn) => fn());
}

// Falls back to the real built value (the static landing.config.json
// import each component already has) until this exact path is overridden -
// values here are always primitives (booleans/numbers/strings), so a fresh
// lookup on every call is fine for useSyncExternalStore's Object.is check,
// no memoization needed.
export function useLiveConfig(path, fallback) {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => {
      const v = getByPath(overrides, path);
      return v === undefined ? fallback : v;
    }
  );
}

export function applyCssVarLive(name, value) {
  document.documentElement.style.setProperty(name, value);
}

// Narrowly targeted at the same two text patches the real engine supports
// (lib/textPatch.js) - matches its patchId vocabulary exactly.
export function applyTextPatchLive(patchId, value) {
  if (patchId === 'hero.words') {
    const container = document.querySelector('[data-designer-id="hero.headline"]');
    if (!container) return;
    const words = Array.isArray(value) ? value : [];
    const spans = Array.from(container.children);
    words.forEach((word, i) => {
      if (spans[i]) spans[i].textContent = word;
      else {
        const span = document.createElement('span');
        span.textContent = word;
        container.appendChild(span);
      }
    });
    for (let i = words.length; i < spans.length; i++) spans[i].remove();
  } else if (patchId === 'footer.text') {
    const p = document.querySelector('[data-designer-id="footer.text"] p');
    if (p) p.textContent = value;
  }
}
