let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
  }
  return workerPromise;
}

export async function terminateOcr() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

function cropCanvas(sourceCanvas, sx, sy, sw, sh) {
  const crop = document.createElement('canvas');
  crop.width = sw;
  crop.height = sh;
  crop.getContext('2d').drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop;
}

// Full-page OCR returning recognized words with pixel bounding boxes
// relative to the given canvas, for building a selectable text overlay.
export async function ocrPageWords(canvas, onProgress) {
  const worker = await getWorker();
  if (onProgress) worker.setProgressHandler?.(onProgress);
  const { data } = await worker.recognize(canvas);
  return (data.words || []).map((w) => ({
    text: w.text,
    x0: w.bbox.x0,
    y0: w.bbox.y0,
    x1: w.bbox.x1,
    y1: w.bbox.y1,
  }));
}

export async function ocrPageText(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return data.text;
}

function parsePageNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  let m = cleaned.match(/page\s+(\d{1,4})\s*(?:of\s+\d{1,4})?/i);
  if (m) return parseInt(m[1], 10);
  m = cleaned.match(/^-?\s*(\d{1,4})\s*-?$/);
  if (m) return parseInt(m[1], 10);
  const all = cleaned.match(/\d{1,4}/g);
  if (all && all.length) return parseInt(all[all.length - 1], 10);
  return null;
}

// Try to detect a printed page number by OCR-ing the footer strip, then the
// header strip, of a rendered page canvas. Returns an integer or null.
export async function detectPageNumber(canvas) {
  const footerH = Math.round(canvas.height * 0.12);
  const footer = cropCanvas(canvas, 0, canvas.height - footerH, canvas.width, footerH);
  const footerText = await ocrPageText(footer);
  const fromFooter = parsePageNumber(footerText);
  if (fromFooter != null) return fromFooter;

  const headerH = Math.round(canvas.height * 0.1);
  const header = cropCanvas(canvas, 0, 0, canvas.width, headerH);
  const headerText = await ocrPageText(header);
  return parsePageNumber(headerText);
}
