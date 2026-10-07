// Camera RAW import (Nikon NEF/NRW plus Canon, Sony, Fuji, Olympus,
// Panasonic, Pentax, DNG, …) via LibRaw compiled to WebAssembly. LibRaw
// runs in its own Web Worker, and the module (≈1.4MB of wasm) is only
// fetched the first time someone actually opens a RAW file.
//
// Browsers can't decode RAW formats natively, so these files must be
// routed here *before* the generic <img>-based image path — some browsers
// even report a RAW file's MIME type as image/x-nikon-nef, which would
// otherwise send it down that path and fail.

export const RAW_EXTENSIONS = [
  'nef', 'nrw', // Nikon
  'cr2', 'cr3', 'crw', // Canon
  'arw', 'srf', 'sr2', // Sony
  'dng', // Adobe / Leica / Pentax / phones
  'raf', // Fujifilm
  'orf', // Olympus / OM System
  'rw2', 'rwl', 'raw', // Panasonic / Leica
  'pef', // Pentax
  'srw', // Samsung
  'x3f', // Sigma
  '3fr', 'fff', // Hasselblad
  'iiq', // Phase One
  'mos', // Leaf
  'mrw', // Minolta
  'kdc', 'dcr', // Kodak
  'erf', // Epson
];

const RAW_EXT_RE = new RegExp(`\\.(${RAW_EXTENSIONS.join('|')})$`, 'i');

export const RAW_ACCEPT = RAW_EXTENSIONS.map((e) => `.${e}`).join(',');

// Matches the export ceiling in App.jsx — nothing larger could ever be
// exported, and full 45MP+ frames make every later pixel edit (each one
// re-encodes the whole image) noticeably sluggish.
export const MAX_RAW_EDGE = 6000;

export function isRawFile(file) {
  return RAW_EXT_RE.test(file.name);
}

function formatShutter(s) {
  if (!s) return null;
  return s >= 1 ? `${Math.round(s * 10) / 10}s` : `1/${Math.round(1 / s)}s`;
}

function summarizeMeta(meta) {
  if (!meta) return null;
  return {
    camera: [meta.camera_make, meta.camera_model].filter(Boolean).join(' ').trim() || null,
    iso: meta.iso_speed ? Math.round(meta.iso_speed) : null,
    shutter: formatShutter(meta.shutter),
    aperture: meta.aperture ? `ƒ/${Math.round(meta.aperture * 10) / 10}` : null,
    focal: meta.focal_len ? `${Math.round(meta.focal_len)}mm` : null,
  };
}

function rgbToCanvas({ width, height, colors, data }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);
  const px = out.data;
  const n = width * height;
  if (colors === 1) {
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      px[j] = px[j + 1] = px[j + 2] = data[i];
      px[j + 3] = 255;
    }
  } else {
    for (let i = 0, s = 0, j = 0; i < n; i++, s += colors, j += 4) {
      px[j] = data[s];
      px[j + 1] = data[s + 1];
      px[j + 2] = data[s + 2];
      px[j + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

async function jpegBytesToCanvas(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
}

function downscaleToFit(canvas, maxEdge) {
  const scale = maxEdge / Math.max(canvas.width, canvas.height);
  if (scale >= 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

// Embedded previews smaller than this are thumbnails, not worth showing
// as a stand-in for the photo — wait for the real decode instead.
const MIN_PREVIEW_EDGE = 1200;

// One RAW decode at a time: LibRaw is single-threaded wasm, and running
// several 20MP+ demosaics in parallel just multiplies peak memory.
let decodeQueue = Promise.resolve();

// Opens a RAW file in two stages, the way Lightroom/Photoshop's Camera Raw
// feel instant:
//   preview — the full-size JPEG the camera embeds in nearly every RAW,
//             extracted in well under a second (null if missing or tiny).
//   full    — a promise for the real demosaiced sensor data (as shot,
//             camera white balance, sRGB, 8-bit). On a slow CPU this can
//             take tens of seconds for a 24MP frame. If this LibRaw build
//             can't decode a particular compression variant it rejects,
//             and the preview is all there is.
export async function openRawFile(file, { maxEdge = MAX_RAW_EDGE } = {}) {
  const { default: LibRaw } = await import('libraw-wasm');
  const buffer = new Uint8Array(await file.arrayBuffer());
  const raw = new LibRaw();
  const run = async () => {
    await raw.open(buffer, {
      useCameraWb: true,
      outputBps: 8,
      outputColor: 1, // sRGB
      userQual: 3, // AHD demosaic
      userFlip: -1, // honor the camera's orientation tag
    });
    const meta = summarizeMeta(await raw.metadata().catch(() => null));
    let preview = null;
    const thumb = await raw.thumbnailData().catch(() => null);
    if (thumb?.format === 'jpeg' && thumb.data?.length) {
      const canvas = await jpegBytesToCanvas(thumb.data).catch(() => null);
      if (canvas && Math.max(canvas.width, canvas.height) >= MIN_PREVIEW_EDGE) {
        preview = downscaleToFit(canvas, maxEdge);
      }
    }
    const full = raw
      .imageData()
      .then((img) => {
        if (!img?.data?.length) throw new Error('Unsupported RAW file');
        return downscaleToFit(rgbToCanvas(img), maxEdge);
      })
      .finally(() => raw.dispose());
    return { meta, preview, full };
  };
  const result = decodeQueue.then(run, run);
  decodeQueue = result.then((r) => r.full, () => {}).catch(() => {});
  try {
    return await result;
  } catch (err) {
    raw.dispose();
    throw err;
  }
}
