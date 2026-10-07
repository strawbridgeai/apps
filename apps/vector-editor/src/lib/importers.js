import { loadImage, clamp } from './utils.js';
import { blobToUrl, canvasToUrl } from './pixelStore.js';
import { createShape } from './shapes.js';
import { isRawFile } from './rawImport.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

// RAW files are excluded here even when the browser labels them image/* —
// <img> can't decode them; they go through rawImport.js instead.
export function isImageFile(file) {
  if (isRawFile(file)) return false;
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

export function isProjectFile(file) {
  return file.name.endsWith('.json') || file.type === 'application/json';
}

export async function parseProjectFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.objects) || !data.doc) {
    throw new Error('Not a recognized project file');
  }
  return data;
}

// Accepts any raster type plus .svg (placed as an <image> — simplest way to
// support SVG import without writing a full path/shape parser).
export async function imageFileToObject(file, { cx, cy, maxDim = 480 } = {}) {
  const dataUrl = blobToUrl(file);
  const img = await loadImage(dataUrl);
  const nw = img.naturalWidth || img.width || 200;
  const nh = img.naturalHeight || img.height || 200;
  const scale = clamp(maxDim / Math.max(nw, nh), 0.02, 1);
  const width = Math.round(nw * scale);
  const height = Math.round(nh * scale);
  return createShape('image', {
    src: dataUrl,
    name: file.name.replace(/\.[^.]+$/, ''),
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
    width,
    height,
    // Pixel edits (brush/blur/burn/crop/bg-removal) work at native
    // resolution even though the object is displayed smaller on canvas.
    pixelWidth: nw,
    pixelHeight: nh,
  });
}

// Same object shape as imageFileToObject, from an already-decoded canvas
// (the RAW import path). `fit` places it over the whole document instead
// of scaling it down to a centered thumbnail-sized layer.
export async function canvasToImageObject(canvas, { name, cx, cy, maxDim = 480, fit = null, extra = {} }) {
  const nw = canvas.width;
  const nh = canvas.height;
  let box;
  if (fit) {
    box = { x: 0, y: 0, width: fit.width, height: fit.height };
  } else {
    const scale = clamp(maxDim / Math.max(nw, nh), 0.02, 1);
    const width = Math.round(nw * scale);
    const height = Math.round(nh * scale);
    box = { x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height };
  }
  return createShape('image', {
    src: await canvasToUrl(canvas),
    name,
    ...box,
    pixelWidth: nw,
    pixelHeight: nh,
    ...extra,
  });
}
