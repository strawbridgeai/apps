import { state } from '../state.js';
import { renderPageToCanvas } from '../pdf/pdfSetup.js';
import { detectPageNumber } from '../ocr/ocr.js';

export async function autoSortByPageNumber(onProgress) {
  const total = state.pages.length;
  let done = 0;
  for (const page of state.pages) {
    const doc = state.docs.get(page.docId);
    const canvas = document.createElement('canvas');
    await renderPageToCanvas(doc.pdfDoc, page.pageIndex, canvas, 1.2);
    try {
      page.detectedNumber = await detectPageNumber(canvas);
    } catch {
      page.detectedNumber = null;
    }
    done++;
    onProgress?.(done, total);
  }

  const withNum = state.pages.filter((p) => p.detectedNumber != null);
  const withoutNum = state.pages.filter((p) => p.detectedNumber == null);
  withNum.sort((a, b) => a.detectedNumber - b.detectedNumber);
  state.pages = withNum.concat(withoutNum);
  return { detected: withNum.length, total };
}
