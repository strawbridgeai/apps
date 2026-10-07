// Whole-image photo processing for image layers: a Lightroom/Camera Raw
// style "develop" pipeline (white balance, tone, levels, color), a
// histogram, one-shot filters (sharpen, blur, B&W, sepia, invert,
// posterize, vignette), and lossless flips/rotations. Everything here is
// a pure canvas/ImageData function; ImageAdjustPanel owns the UI, live
// preview and undo wiring.

export const DEVELOP_DEFAULT = {
  temperature: 0, // -100 (cool/blue) .. 100 (warm/yellow)
  tint: 0, // -100 (green) .. 100 (magenta)
  exposure: 0, // -100..100 -> -3..+3 EV, applied in linear light
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  levelsBlack: 0, // Levels input black point, 0..254
  levelsWhite: 255, // Levels input white point, 1..255
  levelsGamma: 1, // Levels midtone gamma, 0.1..3 (>1 brightens)
  vibrance: 0,
  saturation: 0,
  hue: 0, // -180..180 degrees
};

export function isDevelopNeutral(s) {
  return Object.keys(DEVELOP_DEFAULT).every((k) => s[k] === DEVELOP_DEFAULT[k]);
}

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const LIN_LUT_SIZE = 4096;
const LINEAR_TO_SRGB = new Float32Array(LIN_LUT_SIZE + 1);
for (let i = 0; i <= LIN_LUT_SIZE; i++) {
  const l = i / LIN_LUT_SIZE;
  LINEAR_TO_SRGB[i] = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}
function linToSrgb(l) {
  if (l <= 0) return 0;
  if (l >= 1) return 1;
  return LINEAR_TO_SRGB[(l * LIN_LUT_SIZE) | 0];
}

function smoothstep(e0, e1, x) {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
}

// Standard luminance-preserving hue rotation matrix (same one CSS
// hue-rotate() uses).
function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

// One pass over every pixel. Always reads from `src` (the untouched image
// at the start of the editing session) so slider moves recompute from the
// same starting point instead of compounding.
export function applyDevelop(src, out, s) {
  const a = src.data;
  const o = out.data;
  // White balance as per-channel gains in linear light, folded together
  // with exposure.
  const ev = Math.pow(2, (s.exposure / 100) * 3);
  const t = s.temperature / 100;
  const tn = s.tint / 100;
  const rGain = ev * (1 + 0.35 * t) * (1 + 0.1 * tn);
  const gGain = ev * (1 - 0.25 * tn);
  const bGain = ev * (1 - 0.35 * t) * (1 + 0.1 * tn);
  const contrast = 1 + s.contrast / 100;
  const hi = s.highlights / 100;
  const sh = s.shadows / 100;
  const wh = s.whites / 100;
  const bl = s.blacks / 100;
  const lvB = s.levelsBlack / 255;
  const lvRange = Math.max(1 / 255, s.levelsWhite / 255 - lvB);
  const invGamma = 1 / s.levelsGamma;
  const doLevels = s.levelsBlack !== 0 || s.levelsWhite !== 255 || s.levelsGamma !== 1;
  const sat = s.saturation / 100;
  const vib = s.vibrance / 100;
  const doHue = s.hue !== 0;
  const m = doHue ? hueMatrix(s.hue) : null;

  for (let i = 0; i < a.length; i += 4) {
    let r = linToSrgb(SRGB_TO_LINEAR[a[i]] * rGain);
    let g = linToSrgb(SRGB_TO_LINEAR[a[i + 1]] * gGain);
    let b = linToSrgb(SRGB_TO_LINEAR[a[i + 2]] * bGain);

    if (contrast !== 1) {
      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;
    }

    // Tone regions by luminance, each a soft mask so adjustments blend
    // into one another with no visible banding at the boundaries.
    if (hi || sh || wh || bl) {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const d =
        hi * 0.3 * smoothstep(0.45, 0.9, L) * (1 - 0.5 * smoothstep(0.9, 1, L)) +
        sh * 0.3 * (1 - smoothstep(0.1, 0.55, L)) * smoothstep(0, 0.08, L + 0.04) +
        wh * 0.25 * smoothstep(0.7, 1, L) +
        bl * 0.25 * (1 - smoothstep(0, 0.3, L));
      r += d;
      g += d;
      b += d;
    }

    if (doLevels) {
      r = (r - lvB) / lvRange;
      g = (g - lvB) / lvRange;
      b = (b - lvB) / lvRange;
      r = r <= 0 ? 0 : r >= 1 ? 1 : Math.pow(r, invGamma);
      g = g <= 0 ? 0 : g >= 1 ? 1 : Math.pow(g, invGamma);
      b = b <= 0 ? 0 : b >= 1 ? 1 : Math.pow(b, invGamma);
    }

    if (doHue) {
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr;
      g = ng;
      b = nb;
    }

    // Vibrance boosts muted colors more than already-saturated ones (and
    // so protects skin tones); saturation scales everything equally.
    if (sat || vib) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
      const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
      const k = 1 + sat + vib * (1 - Math.min(1, (mx - mn) * 1.5));
      r = gray + (r - gray) * k;
      g = gray + (g - gray) * k;
      b = gray + (b - gray) * k;
    }

    o[i] = r * 255 + 0.5;
    o[i + 1] = g * 255 + 0.5;
    o[i + 2] = b * 255 + 0.5;
    o[i + 3] = a[i + 3];
  }
}

export function developCanvas(source, settings) {
  const { width, height } = source;
  const sctx = source.getContext('2d', { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, width, height);
  const out = new ImageData(width, height);
  applyDevelop(src, out, settings);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(out, 0, 0);
  return canvas;
}

// Downscaled copy for live slider previews — the on-screen layer is
// rarely bigger than this, and it keeps a 24MP RAW responsive.
export function previewCopy(canvas, maxEdge = 1600) {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  if (scale === 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

// Per-channel + luminance histograms (256 bins), ignoring transparent pixels.
export function computeHistogram(canvas) {
  const { width, height } = canvas;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const l = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
    l[(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) | 0]++;
  }
  return { r, g, b, l };
}

// Photoshop "Auto Tone" + "Auto Color" in one: Levels black/white points
// at the 0.5% / 99.5% luminance percentiles, plus white balance estimated
// from near-neutral pixels only (low saturation, not too dark or bright).
// Plain gray-world averaging would read a frame full of foliage or sky as
// a color cast and wash it out with magenta or orange; if too few neutral
// pixels exist to judge, white balance is left alone.
export function autoDevelop(canvas) {
  const hist = computeHistogram(canvas);
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist.l[i];
  if (!total) return {};
  const pct = (p) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist.l[i];
      if (acc >= total * p) return i;
    }
    return 255;
  };
  const black = Math.min(pct(0.005), 80);
  const white = Math.max(pct(0.995), black + 40, 150);

  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx < 40 || mx > 245 || (mx - mn) / mx > 0.18) continue;
    sr += SRGB_TO_LINEAR[r];
    sg += SRGB_TO_LINEAR[g];
    sb += SRGB_TO_LINEAR[b];
    n++;
  }
  let temperature = 0;
  let tint = 0;
  if (n > total * 0.01) {
    // Invert applyDevelop's gains: (1 + 0.35t)·R = (1 − 0.35t)·B, and the
    // tint gain pulling G toward the R/B mean.
    temperature = ((sb - sr) / (0.35 * (sr + sb))) * 100;
    tint = ((sg - (sr + sb) / 2) / (0.25 * sg)) * 100;
  }
  const clampWb = (v) => Math.round(Math.max(-50, Math.min(50, v)));
  return {
    levelsBlack: black,
    levelsWhite: Math.min(255, white),
    temperature: clampWb(temperature),
    tint: clampWb(tint),
  };
}

// ---------------- one-shot filters (operate in place on a canvas) ----------------

// Separable sliding-window box blur, O(pixels) regardless of radius;
// three passes approximate a gaussian.
function boxBlurRGBA(data, width, height, radius) {
  const tmp = new Uint8ClampedArray(data.length);
  const pass = (src, dst, w, h, stride, step) => {
    const div = radius * 2 + 1;
    for (let line = 0; line < h; line++) {
      const base = line * stride;
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const idx = Math.min(w - 1, Math.max(0, k));
          acc += src[base + idx * step + c];
        }
        for (let x = 0; x < w; x++) {
          dst[base + x * step + c] = acc / div;
          const addIdx = Math.min(w - 1, x + radius + 1);
          const subIdx = Math.max(0, x - radius);
          acc += src[base + addIdx * step + c] - src[base + subIdx * step + c];
        }
      }
    }
  };
  pass(data, tmp, width, height, width * 4, 4); // horizontal
  pass(tmp, data, height, width, 4, width * 4); // vertical
}

export function gaussianBlurImageData(imageData, radius) {
  const r = Math.max(1, Math.round(radius / 1.7));
  for (let i = 0; i < 3; i++) boxBlurRGBA(imageData.data, imageData.width, imageData.height, r);
  return imageData;
}

function withImageData(canvas, fn) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  fn(img);
  ctx.putImageData(img, 0, 0);
}

export function gaussianBlur(canvas, radius) {
  withImageData(canvas, (img) => gaussianBlurImageData(img, radius));
}

// Unsharp mask: original + amount × (original − blurred).
export function unsharpMask(canvas, { amount = 0.8, radius = 2, threshold = 2 }) {
  withImageData(canvas, (img) => {
    const blurred = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    gaussianBlurImageData(blurred, radius);
    const d = img.data;
    const bd = blurred.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const diff = d[i + c] - bd[i + c];
        if (Math.abs(diff) >= threshold) d[i + c] = d[i + c] + diff * amount;
      }
    }
  });
}

export function grayscale(canvas) {
  withImageData(canvas, ({ data: d }) => {
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = l;
    }
  });
}

export function sepia(canvas) {
  withImageData(canvas, ({ data: d }) => {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = 0.393 * r + 0.769 * g + 0.189 * b;
      d[i + 1] = 0.349 * r + 0.686 * g + 0.168 * b;
      d[i + 2] = 0.272 * r + 0.534 * g + 0.131 * b;
    }
  });
}

export function invert(canvas) {
  withImageData(canvas, ({ data: d }) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
  });
}

export function posterize(canvas, levels = 5) {
  const n = Math.max(2, Math.round(levels)) - 1;
  withImageData(canvas, ({ data: d }) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (Math.round((d[i] / 255) * n) / n) * 255;
      d[i + 1] = (Math.round((d[i + 1] / 255) * n) / n) * 255;
      d[i + 2] = (Math.round((d[i + 2] / 255) * n) / n) * 255;
    }
  });
}

// Darkens toward the corners with a soft radial falloff; transparent
// pixels stay transparent (source-atop).
export function vignette(canvas, amount = 0.5) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const r = Math.hypot(w, h) / 2;
  const grad = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, amount)})`);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------------- transforms (return a new canvas) ----------------

export function flipCanvas(source, axis) {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (axis === 'h') ctx.setTransform(-1, 0, 0, 1, source.width, 0);
  else ctx.setTransform(1, 0, 0, -1, 0, source.height);
  ctx.drawImage(source, 0, 0);
  return out;
}

export function rotateCanvas90(source, clockwise = true) {
  const out = document.createElement('canvas');
  out.width = source.height;
  out.height = source.width;
  const ctx = out.getContext('2d');
  if (clockwise) ctx.setTransform(0, 1, -1, 0, source.height, 0);
  else ctx.setTransform(0, -1, 1, 0, 0, source.width);
  ctx.drawImage(source, 0, 0);
  return out;
}
