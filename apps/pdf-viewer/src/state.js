// Central app state. A "workspace" is a flat, ordered list of pages pulled
// from one or more loaded PDF files. Reordering, extracting, watermarking,
// and annotating all operate on this one list, which is exported as the
// final PDF.

export const state = {
  // docId -> { name, bytes: ArrayBuffer, pdfDoc: pdfjs document proxy }
  docs: new Map(),
  nextDocId: 1,

  // ordered list of pages currently in the workspace
  // { key, docId, pageIndex (0-based), rotation, detectedNumber }
  pages: [],

  // key -> array of annotation objects { type: 'highlight'|'underline', x,y,w,h (0..1 normalized), color }
  annotations: new Map(),

  watermark: {
    enabled: false,
    text: 'DRAFT',
    opacity: 0.35,
    rotation: -45,
    fontSize: 48,
    color: '#808080',
  },

  selected: new Set(), // selected page keys in the grid
};

export function pageKey(docId, pageIndex) {
  return `${docId}:${pageIndex}`;
}

export function addDoc(name, bytes, pdfDoc) {
  const docId = state.nextDocId++;
  state.docs.set(docId, { name, bytes, pdfDoc });
  const pages = [];
  for (let i = 0; i < pdfDoc.numPages; i++) {
    pages.push({
      key: pageKey(docId, i),
      docId,
      pageIndex: i,
      rotation: 0,
      detectedNumber: null,
    });
  }
  state.pages.push(...pages);
  return docId;
}

export function removePage(key) {
  state.pages = state.pages.filter((p) => p.key !== key);
  state.annotations.delete(key);
  state.selected.delete(key);
}

export function getPage(key) {
  return state.pages.find((p) => p.key === key);
}

export function getAnnotations(key) {
  return state.annotations.get(key) || [];
}

export function addAnnotation(key, annotation) {
  const list = state.annotations.get(key) || [];
  list.push(annotation);
  state.annotations.set(key, list);
}

export function removeAnnotation(key, index) {
  const list = state.annotations.get(key);
  if (!list) return;
  list.splice(index, 1);
}

export function reorderPages(fromIndex, toIndex) {
  const [moved] = state.pages.splice(fromIndex, 1);
  state.pages.splice(toIndex, 0, moved);
}
