import { downloadBlob, loadImage } from './utils.js';

// All exports work straight off the live content-only <svg> DOM node (the
// canvas stage keeps selection handles in a separate overlay <div>, so this
// node is always a clean, exportable document) — one source of truth for
// both on-screen rendering and every export format.
export function svgNodeToString(svgNode, { width, height, background }) {
  const clone = svgNode.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  clone.removeAttribute('class');
  if (background) {
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', background);
    clone.insertBefore(bgRect, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svgNode, doc) {
  const str = svgNodeToString(svgNode, { width: doc.width, height: doc.height, background: doc.background });
  downloadBlob(new Blob([str], { type: 'image/svg+xml' }), `${doc.name || 'artwork'}.svg`);
}

async function rasterize(svgNode, doc, { scale = 2, transparent = false } = {}) {
  const str = svgNodeToString(svgNode, {
    width: doc.width,
    height: doc.height,
    background: transparent ? null : doc.background,
  });
  const blob = new Blob([str], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(doc.width * scale);
    canvas.height = Math.round(doc.height * scale);
    const ctx = canvas.getContext('2d');
    if (!transparent) {
      ctx.fillStyle = doc.background || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(svgNode, doc, { scale = 2, transparent = true } = {}) {
  const canvas = await rasterize(svgNode, doc, { scale, transparent });
  canvas.toBlob((blob) => downloadBlob(blob, `${doc.name || 'artwork'}.png`), 'image/png');
}

export async function downloadJpeg(svgNode, doc, { scale = 2, quality = 0.92 } = {}) {
  const canvas = await rasterize(svgNode, doc, { scale, transparent: false });
  canvas.toBlob(
    (blob) => downloadBlob(blob, `${doc.name || 'artwork'}.jpg`),
    'image/jpeg',
    quality
  );
}

export async function downloadPdf(svgNode, doc, { scale = 2 } = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const canvas = await rasterize(svgNode, doc, { scale, transparent: false });
  const pngBytes = await new Promise((resolve) => {
    canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png');
  });
  const pdfDoc = await PDFDocument.create();
  const png = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([doc.width, doc.height]);
  page.drawImage(png, { x: 0, y: 0, width: doc.width, height: doc.height });
  const bytes = await pdfDoc.save();
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${doc.name || 'artwork'}.pdf`);
}

export function downloadProjectJson(doc, objects, groups) {
  const data = { kind: 'vector-studio-project', version: 1, doc, objects, groups };
  downloadBlob(
    new Blob([JSON.stringify(data)], { type: 'application/json' }),
    `${doc.name || 'project'}.vsproj.json`
  );
}
