// Where image-layer pixels live. A layer's `src` is a blob: URL for
// anything created in this session (imports, edits) — binary PNG/JPEG
// bytes, encoded off the main thread by canvas.toBlob — rather than a
// base64 data URL. For a 24MP photo that's the difference between a ~70MB
// string that must be base64-encoded, copied and re-decoded on every edit,
// and a short URL string that undo snapshots can hold for free. Projects
// loaded from disk may still carry data: URLs; everything here accepts
// both. Exports and project saves inline blob: URLs back to data: URLs
// (see toPortableSrc), so saved files stay self-contained.

// Decoded pixels for recently produced/loaded srcs, so the app never
// re-decodes an image it just encoded. Small LRU: each 24MP entry is ~96MB.
const DECODED_MAX = 3;
const decoded = new Map(); // src -> canvas (private copy, never handed out)

// Blob URLs this module created, with their byte size and creation time,
// so unreferenced ones can be released (see releaseUnused).
const created = new Map(); // url -> { size, at }

function copyCanvas(source) {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  out.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0);
  return out;
}

function remember(src, canvas) {
  decoded.delete(src);
  decoded.set(src, canvas);
  while (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value);
}

export function blobToUrl(blob) {
  const url = URL.createObjectURL(blob);
  created.set(url, { size: blob.size, at: Date.now() });
  return url;
}

// Encodes a canvas as a lossless PNG blob URL. The canvas is snapshotted
// first, so callers may keep drawing on theirs afterwards.
export async function canvasToUrl(canvas) {
  const snapshot = copyCanvas(canvas);
  const blob = await new Promise((resolve, reject) =>
    snapshot.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), 'image/png')
  );
  const url = blobToUrl(blob);
  remember(url, snapshot);
  return url;
}

// A fresh, caller-owned canvas with the pixels of `src` at the given size.
export async function canvasFromSrc(src, width, height) {
  const hit = decoded.get(src);
  if (hit && hit.width === width && hit.height === height) {
    remember(src, hit);
    return copyCanvas(hit);
  }
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, width, height);
  remember(src, copyCanvas(canvas));
  return canvas;
}

export function srcByteSize(src) {
  if (!src) return 0;
  return created.get(src)?.size ?? src.length;
}

// blob: -> data: for anything leaving this browser tab (SVG export, the
// SVG-to-canvas rasterizer, which can't load external blob URLs, and
// saved project files).
export async function toPortableSrc(src) {
  if (!src || !src.startsWith('blob:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Revokes blob URLs no longer referenced by the document or its undo
// history. Recently created URLs are spared: an edit's new URL may not
// have reached React state yet when this runs.
export function releaseUnused(liveSrcs, graceMs = 60000) {
  const now = Date.now();
  for (const [url, info] of created) {
    if (liveSrcs.has(url) || now - info.at < graceMs) continue;
    URL.revokeObjectURL(url);
    created.delete(url);
    decoded.delete(url);
  }
}
