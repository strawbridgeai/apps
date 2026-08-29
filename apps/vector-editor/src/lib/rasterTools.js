// Pixel-level editing for image objects: brush, blur, burn, eraser, crop,
// and color-key background removal. Each image object's `src` (a data URL)
// is the source of truth between strokes; while a stroke is in progress we
// mutate an offscreen canvas directly (cheap) and only write back to
// `src` — and therefore to undo history — once, on pointer-up.

export async function canvasFromDataUrl(src, pixelWidth, pixelHeight) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);
  return canvas;
}

export function blankCanvas(pixelWidth, pixelHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  return canvas;
}

export function canvasToDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}

export function paintBrushDab(ctx, x, y, { size, color, opacity = 1, hardness = 0.7 }) {
  const r = size / 2;
  ctx.save();
  ctx.globalAlpha = opacity;
  const grad = ctx.createRadialGradient(x, y, r * hardness, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, hexWithAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function eraseDab(ctx, x, y, size) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const r = size / 2;
  const grad = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function burnDab(ctx, x, y, { size, strength = 0.35 }) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const r = size / 2;
  const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function dodgeDab(ctx, x, y, { size, strength = 0.35 }) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const r = size / 2;
  const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
  grad.addColorStop(0, `rgba(255,255,255,${strength})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Localized blur: box-blur the square region under the dab and paint it
// back with soft round edges, cheap enough to run per dab at brush scale.
export function blurDab(ctx, x, y, size, passes = 2) {
  const r = Math.max(4, Math.round(size / 2));
  const sx = Math.max(0, Math.floor(x - r));
  const sy = Math.max(0, Math.floor(y - r));
  const w = Math.min(ctx.canvas.width - sx, r * 2);
  const h = Math.min(ctx.canvas.height - sy, r * 2);
  if (w <= 0 || h <= 0) return;
  const imgData = ctx.getImageData(sx, sy, w, h);
  boxBlurInPlace(imgData, passes);

  // Composite the blurred patch back through a soft round mask so the
  // brush has a feathered edge instead of a hard square.
  const patch = document.createElement('canvas');
  patch.width = w;
  patch.height = h;
  const pctx = patch.getContext('2d');
  pctx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.beginPath();
  const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(patch, sx, sy);
  ctx.restore();
}

function boxBlurInPlace(imageData, passes) {
  const { data, width, height } = imageData;
  for (let p = 0; p < passes; p++) {
    blurPass(data, width, height, true);
    blurPass(data, width, height, false);
  }
}

function blurPass(data, width, height, horizontal) {
  const radius = 2;
  const copy = new Uint8ClampedArray(data);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  for (let o = 0; o < outer; o++) {
    for (let i = 0; i < inner; i++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let k = -radius; k <= radius; k++) {
        const ii = i + k;
        if (ii < 0 || ii >= inner) continue;
        const x = horizontal ? ii : o;
        const y = horizontal ? o : ii;
        const idx = (y * width + x) * 4;
        r += copy[idx];
        g += copy[idx + 1];
        b += copy[idx + 2];
        a += copy[idx + 3];
        count++;
      }
      const x = horizontal ? i : o;
      const y = horizontal ? o : i;
      const idx = (y * width + x) * 4;
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
      data[idx + 3] = a / count;
    }
  }
}

function hexWithAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function samplePixel(ctx, x, y) {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
}

// Average the four corner pixels as a cheap background-color guess for the
// one-click "Remove background" action.
export function detectBackgroundColor(ctx) {
  const { width, height } = ctx.canvas;
  const pts = [
    [1, 1],
    [width - 2, 1],
    [1, height - 2],
    [width - 2, height - 2],
  ];
  let r = 0, g = 0, b = 0;
  pts.forEach(([x, y]) => {
    const p = samplePixel(ctx, x, y);
    r += p.r;
    g += p.g;
    b += p.b;
  });
  return { r: r / 4, g: g / 4, b: b / 4 };
}

// Color-key background removal (chroma-key style, not ML segmentation):
// any pixel within `tolerance` color distance of the target is made
// transparent, with a short feather band so edges don't look cut out.
export function removeBackgroundByColor(ctx, target, tolerance = 40, feather = 20) {
  const { width, height } = ctx.canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - target.r;
    const dg = data[i + 1] - target.g;
    const db = data[i + 2] - target.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tolerance) {
      data[i + 3] = 0;
    } else if (dist < tolerance + feather) {
      const f = (dist - tolerance) / feather;
      data[i + 3] = Math.round(data[i + 3] * f);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export function cropCanvas(source, rectPx) {
  const { x, y, width, height } = rectPx;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(width));
  out.height = Math.max(1, Math.round(height));
  const ctx = out.getContext('2d');
  ctx.drawImage(source, -x, -y);
  return out;
}
