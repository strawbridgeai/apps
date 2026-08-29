import { readFileAsDataURL, loadImage, clamp } from './utils.js';
import { createShape } from './shapes.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

export function isImageFile(file) {
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
  const dataUrl = await readFileAsDataURL(file);
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
