import { useEffect, useRef, useState } from 'react';
import { formatCssValue } from './designer/liveFormat.js';

export function redirectOn401(res) {
  if (res.status === 401) {
    window.location.href = '/login.html';
    return true;
  }
  return false;
}

// Keep IDLE_MS in sync with IDLE_TIMEOUT_MS in server.js — this is a
// client-side backstop that logs out (and kills the server session) the
// moment real user input stops, rather than waiting on the next API poll
// to notice the server-side idle expiry.
const IDLE_MS = 15 * 60 * 1000;

export function useIdleLogout(idleMs = IDLE_MS) {
  useEffect(() => {
    let timer;

    async function idleLogout() {
      try {
        await fetch('/api/logout', { method: 'POST', keepalive: true });
      } catch {
        // ignore - redirecting to /login.html either way
      }
      window.location.href = '/login.html';
    }

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(idleLogout, idleMs);
    }

    // Fires on navigating away or closing the tab/window (not on merely
    // switching to another tab while staying on this page) - this kills the
    // server-side session immediately, so a session left logged-in on a
    // shared/borrowed computer can't just be clicked back into later.
    function onPageHide() {
      navigator.sendBeacon('/api/logout');
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    window.addEventListener('pagehide', onPageHide);
    resetTimer();

    return () => {
      clearTimeout(timer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [idleMs]);
}

export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/metrics');
      if (redirectOn401(res)) return;
      const m = await res.json();
      if (!cancelled) setMetrics(m);
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return metrics;
}

export function useApps() {
  const [apps, setApps] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/apps');
      if (redirectOn401(res)) return;
      const { apps } = await res.json();
      if (!cancelled) setApps(apps);
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return apps;
}

export function useBotStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/bot/status');
      if (redirectOn401(res)) return;
      const s = await res.json();
      if (!cancelled) setStatus(s);
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const runCommand = async (action) => {
    await fetch('/api/bot/' + action, { method: 'POST' });
    setTimeout(async () => {
      const res = await fetch('/api/bot/status');
      if (redirectOn401(res)) return;
      setStatus(await res.json());
    }, 500);
  };

  return [status, runCommand];
}

export function useMemory(active) {
  const [entries, setEntries] = useState(undefined); // undefined = loading, null = error
  const load = useRef(async () => {
    try {
      const res = await fetch('/api/memory');
      if (redirectOn401(res)) return;
      const { entries } = await res.json();
      setEntries(entries || []);
    } catch {
      setEntries(null);
    }
  });

  useEffect(() => {
    if (!active) return;
    load.current();
    const id = setInterval(load.current, 20000);
    return () => clearInterval(id);
  }, [active]);

  return [entries, load.current];
}

function findField(schema, sectionId, objectId, fieldId) {
  const section = schema?.sections.find((s) => s.id === sectionId);
  const object = section?.objects.find((o) => o.id === objectId);
  return object?.fields.find((f) => f.id === fieldId);
}

// Builds the { targetKind, name/path/patchId, value, preset } payload
// DesignerBridge.jsx (landing side) expects for a live, no-rebuild update -
// mirrors the same target.kind switch the real engine's applyEdits() uses
// server-side (lib/cssVars.js / lib/config.js / lib/textPatch.js), just
// producing a message instead of a disk write.
function liveMessageFor(field, value) {
  const { target } = field;
  if (target.kind === 'cssVar') {
    const { value: formatted, preset } = formatCssValue(field, value);
    return { type: 'site-designer:live-set', targetKind: 'cssVar', name: target.name, value: formatted, preset };
  }
  if (target.kind === 'config') {
    return { type: 'site-designer:live-set', targetKind: 'config', path: target.path, value };
  }
  if (target.kind === 'textPatch') {
    return { type: 'site-designer:live-set', targetKind: 'textPatch', patchId: target.patchId, value };
  }
  return null;
}

// Values live purely in this hook's React state while editing - every
// change is relayed to the preview iframe instantly via postMessage (see
// liveMessageFor/DesignerBridge.jsx), with nothing written to disk and
// nothing to "discard." Publish is the one moment `values` actually gets
// written+built+deployed (previewEdits then publishDraft, back to back);
// Reset just snaps `values` back to `savedValues` and reloads the iframe
// fresh, clearing every live override at once.
export function useSiteDesigner() {
  const [schema, setSchema] = useState(null);
  const [values, setValues] = useState(null);
  const [savedValues, setSavedValues] = useState(null);
  const [status, setStatus] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const iframeRef = useRef(null);

  // Messages come from the site-designer-preview iframe's DesignerBridge
  // (landing/src/components/DesignerBridge.jsx) when the admin clicks a
  // tagged element on the live preview - same-origin (both served from
  // this dashboard's own Express app), so the origin check is exact-match,
  // not a wildcard.
  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'site-designer:select') setSelectedObjectId(e.data.objectId);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const loadAll = useRef(async () => {
    const [schemaRes, stateRes, statusRes] = await Promise.all([
      fetch('/api/site-designer/schema'),
      fetch('/api/site-designer/state'),
      fetch('/api/site-designer/publish-status'),
    ]);
    if (redirectOn401(schemaRes) || redirectOn401(stateRes) || redirectOn401(statusRes)) return;
    setSchema(await schemaRes.json());
    const { values: v } = await stateRes.json();
    setValues(v);
    setSavedValues(v);
    setStatus(await statusRes.json());
  });

  useEffect(() => {
    loadAll.current();
  }, []);

  // Shows what the page actually looks like right now, the moment the tab
  // opens, instead of an empty "make an edit first" placeholder — builds
  // with an empty edits[] (a no-op apply, so nothing on disk changes) just
  // to get a fresh dist/ to preview. Only runs once, and only when there's
  // no existing unpublished draft (in which case /site-designer-preview/'s
  // last build already reflects that draft correctly with no rebuild
  // needed).
  useEffect(() => {
    if (!status || status.hasDraft || previewUrl) return;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch('/api/site-designer/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edits: [] }),
        });
        if (redirectOn401(res)) return;
        const result = await res.json();
        if (result.ok) setPreviewUrl(result.previewUrl);
      } finally {
        setBusy(false);
      }
    })();
  }, [status]);

  function setFieldValue(sectionId, objectId, fieldId, value) {
    setError(null);
    setValues((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        [objectId]: { ...prev[sectionId][objectId], [fieldId]: value },
      },
    }));
    const field = findField(schema, sectionId, objectId, fieldId);
    const msg = field && liveMessageFor(field, value);
    if (msg) iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }

  const dirty = !!(values && savedValues && JSON.stringify(values) !== JSON.stringify(savedValues));

  function diffEdits() {
    const edits = [];
    for (const sectionId of Object.keys(values)) {
      for (const objectId of Object.keys(values[sectionId])) {
        for (const fieldId of Object.keys(values[sectionId][objectId])) {
          const next = values[sectionId][objectId][fieldId];
          const prev = savedValues[sectionId][objectId][fieldId];
          if (JSON.stringify(next) !== JSON.stringify(prev)) edits.push({ sectionId, objectId, fieldId, value: next });
        }
      }
    }
    return edits;
  }

  // One action instead of the old two-step Preview-then-Publish: writes the
  // accumulated in-memory edits to disk, builds, and deploys, all at once -
  // everything up to now was purely client-side (postMessage only), so this
  // is the first moment anything touches disk.
  async function publishAll() {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      const previewRes = await fetch('/api/site-designer/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits: diffEdits() }),
      });
      if (redirectOn401(previewRes)) return;
      const previewResult = await previewRes.json();
      if (!previewResult.ok) {
        setError(previewResult.error || 'Publish failed');
        return;
      }
      const publishRes = await fetch('/api/site-designer/publish', { method: 'POST' });
      if (redirectOn401(publishRes)) return;
      const publishResult = await publishRes.json();
      if (!publishResult.ok) {
        setError(publishResult.error || 'Publish failed');
        return;
      }
      setSavedValues(values);
      setPreviewUrl(previewResult.previewUrl); // iframe reloads from the freshly-published build, clearing all live overrides
      const statusRes = await fetch('/api/site-designer/publish-status');
      if (!redirectOn401(statusRes)) setStatus(await statusRes.json());
    } finally {
      setBusy(false);
    }
  }

  // Throws away in-memory edits (nothing was ever on disk to discard) and
  // reloads the iframe fresh, clearing every live override at once.
  function resetLocal() {
    setError(null);
    setValues(savedValues);
    iframeRef.current?.contentWindow?.location.reload();
  }

  return {
    schema,
    values,
    status,
    busy,
    error,
    dirty,
    previewUrl,
    selectedObjectId,
    iframeRef,
    setFieldValue,
    publishAll,
    resetLocal,
  };
}
