import { PDFDocument, StandardFonts, degrees, rgb, LineCapStyle } from 'pdf-lib';
import { state, getAnnotations } from '../state.js';

function hexToRgb01(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

async function loadSourceDocs(pages) {
  const cache = new Map();
  for (const p of pages) {
    if (!cache.has(p.docId)) {
      const { bytes } = state.docs.get(p.docId);
      const src = await PDFDocument.load(bytes);
      cache.set(p.docId, src);
    }
  }
  return cache;
}

// Freehand highlight/pencil strokes are stored as a series of normalized
// points; render them as connected line segments with round caps/joins so
// consecutive segments blend into one continuous stroke, matching the SVG
// preview drawn on screen.
function drawFreehandStroke(pdfPage, a, w, h) {
  const color = hexToRgb01(a.color);
  const thickness = Math.max(1, a.size * w);
  const opacity = a.type === 'highlight' ? 0.45 : 1;
  for (let i = 1; i < a.points.length; i++) {
    const p0 = a.points[i - 1];
    const p1 = a.points[i];
    pdfPage.drawLine({
      start: { x: p0.x * w, y: h - p0.y * h },
      end: { x: p1.x * w, y: h - p1.y * h },
      thickness,
      color,
      opacity,
      lineCap: LineCapStyle.Round,
    });
  }
}

function drawAnnotations(pdfPage, key) {
  const anns = getAnnotations(key);
  const w = pdfPage.getWidth();
  const h = pdfPage.getHeight();
  for (const a of anns) {
    if (a.type === 'underline') {
      const x = a.x * w;
      const boxW = a.w * w;
      const boxH = a.h * h;
      const y = h - a.y * h - boxH; // flip to bottom-left origin
      const lineH = Math.max(2, boxH * 0.15);
      pdfPage.drawRectangle({
        x,
        y,
        width: boxW,
        height: lineH,
        color: hexToRgb01(a.color),
        opacity: 1,
      });
    } else {
      drawFreehandStroke(pdfPage, a, w, h);
    }
  }
}

function drawWatermark(pdfPage, font, wm) {
  const w = pdfPage.getWidth();
  const h = pdfPage.getHeight();
  const textWidth = font.widthOfTextAtSize(wm.text, wm.fontSize);
  pdfPage.drawText(wm.text, {
    x: w / 2 - textWidth / 2,
    y: h / 2,
    size: wm.fontSize,
    font,
    color: hexToRgb01(wm.color),
    opacity: wm.opacity,
    rotate: degrees(wm.rotation),
  });
}

// pagesList: array of page entries from state.pages (already in desired order)
export async function buildPdfBytes(pagesList) {
  const out = await PDFDocument.create();
  const srcCache = await loadSourceDocs(pagesList);

  for (const p of pagesList) {
    const src = srcCache.get(p.docId);
    const [copied] = await out.copyPages(src, [p.pageIndex]);
    if (p.rotation) {
      const current = copied.getRotation().angle || 0;
      copied.setRotation(degrees(current + p.rotation));
    }
    out.addPage(copied);
    drawAnnotations(copied, p.key);
  }

  if (state.watermark.enabled) {
    const wmFont = await out.embedFont(StandardFonts.HelveticaBold);
    for (const page of out.getPages()) {
      drawWatermark(page, wmFont, state.watermark);
    }
  }

  return out.save();
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
