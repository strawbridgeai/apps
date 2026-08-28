import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function loadPdf(arrayBuffer) {
  // pdfjs detaches/transfers the buffer; keep a copy for pdf-lib re-use later
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
  return loadingTask.promise;
}

export async function renderPageToCanvas(pdfDoc, pageIndex, canvas, scale) {
  const page = await pdfDoc.getPage(pageIndex + 1); // pdfjs is 1-indexed
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return viewport;
}

export async function getPageAspect(pdfDoc, pageIndex) {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}
