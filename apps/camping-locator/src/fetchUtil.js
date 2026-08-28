// Shared fetch-with-timeout — every external call in this app (Overpass,
// NPS, RIDB) goes through this. A fetch with no timeout can hang a search
// forever if the remote end accepts a connection but never responds,
// which is exactly what happened before this existed: ridb.js and nps.js
// had no timeout at all, so one hung request could freeze "Searching…"
// indefinitely and (combined with main.js's old in-flight guard) block
// every search after it too.
// externalSignal (optional) lets a caller cancel a request it no longer
// needs — e.g. main.js aborts a search's in-flight requests the moment a
// newer search supersedes it, instead of leaving it to run to completion
// wastefully in the background against a free shared API.
export async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([timeoutController.signal, externalSignal]) : timeoutController.signal;
  try {
    return await fetch(url, { ...options, signal });
  } finally {
    clearTimeout(timer);
  }
}
