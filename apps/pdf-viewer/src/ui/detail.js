import { getPage, getAnnotations, addAnnotation, removeAnnotation } from '../state.js';
import { state } from '../state.js';
import { renderPageToCanvas } from '../pdf/pdfSetup.js';
import { ocrPageWords, ocrPageText } from '../ocr/ocr.js';

const HIGHLIGHT_COLORS = ['#ffeb3b', '#a5d6a7', '#90caf9', '#f48fb1'];
const UNDERLINE_COLORS = ['#e53935', '#1e88e5', '#000000'];

let currentTool = null; // 'highlight' | 'underline' | null
let currentColor = HIGHLIGHT_COLORS[0];

export function openDetail(key, onClose) {
  const page = getPage(key);
  if (!page) return;
  const doc = state.docs.get(page.docId);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal detail-modal';
  overlay.appendChild(modal);

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<span>${doc.name} — page ${page.pageIndex + 1}</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.className = 'btn-sm';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    onClose?.();
  });
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'detail-toolbar';
  modal.appendChild(toolbar);

  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'btn-sm';
  rotateBtn.textContent = 'Rotate 90°';
  rotateBtn.addEventListener('click', () => {
    page.rotation = (page.rotation + 90) % 360;
    render();
  });
  toolbar.appendChild(rotateBtn);

  const toolGroup = document.createElement('span');
  toolGroup.className = 'tool-group';
  toolbar.appendChild(toolGroup);

  function makeToolButton(label, tool) {
    const b = document.createElement('button');
    b.className = 'btn-sm';
    b.textContent = label;
    b.addEventListener('click', () => {
      currentTool = currentTool === tool ? null : tool;
      updateToolButtons();
    });
    toolGroup.appendChild(b);
    return b;
  }
  const highlightBtn = makeToolButton('Highlight', 'highlight');
  const underlineBtn = makeToolButton('Underline', 'underline');
  function updateToolButtons() {
    highlightBtn.classList.toggle('active', currentTool === 'highlight');
    underlineBtn.classList.toggle('active', currentTool === 'underline');
    colorSwatches.style.display = currentTool ? 'inline-flex' : 'none';
    renderSwatches();
  }

  const colorSwatches = document.createElement('span');
  colorSwatches.className = 'swatches';
  toolbar.appendChild(colorSwatches);
  function renderSwatches() {
    colorSwatches.innerHTML = '';
    const colors = currentTool === 'underline' ? UNDERLINE_COLORS : HIGHLIGHT_COLORS;
    if (!colors.includes(currentColor)) currentColor = colors[0];
    for (const c of colors) {
      const sw = document.createElement('button');
      sw.className = 'swatch' + (c === currentColor ? ' active' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        currentColor = c;
        renderSwatches();
      });
      colorSwatches.appendChild(sw);
    }
  }

  const ocrBtn = document.createElement('button');
  ocrBtn.className = 'btn-sm';
  ocrBtn.textContent = 'Run OCR (copy text)';
  toolbar.appendChild(ocrBtn);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  modal.appendChild(canvasWrap);

  const canvas = document.createElement('canvas');
  canvasWrap.appendChild(canvas);

  const annOverlay = document.createElement('div');
  annOverlay.className = 'ann-overlay';
  canvasWrap.appendChild(annOverlay);

  const textOverlay = document.createElement('div');
  textOverlay.className = 'text-overlay';
  canvasWrap.appendChild(textOverlay);

  const annList = document.createElement('div');
  annList.className = 'ann-list';
  modal.appendChild(annList);

  const ocrPanel = document.createElement('div');
  ocrPanel.className = 'ocr-panel';
  ocrPanel.style.display = 'none';
  const ocrTextarea = document.createElement('textarea');
  ocrTextarea.readOnly = true;
  ocrTextarea.placeholder = 'Recognized text will appear here — select and copy, or select words directly on the page image above.';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-sm';
  copyBtn.textContent = 'Copy all text';
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(ocrTextarea.value);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy all text'), 1200);
  });
  ocrPanel.appendChild(ocrTextarea);
  ocrPanel.appendChild(copyBtn);
  modal.appendChild(ocrPanel);

  async function render() {
    const viewport = await renderPageToCanvas(doc.pdfDoc, page.pageIndex, canvas, 1.4);
    if (page.rotation) {
      // Re-render rotated by drawing to an offscreen canvas and swapping
      const tmp = document.createElement('canvas');
      const angle = (page.rotation * Math.PI) / 180;
      const swap = page.rotation % 180 !== 0;
      tmp.width = swap ? canvas.height : canvas.width;
      tmp.height = swap ? canvas.width : canvas.height;
      const ctx = tmp.getContext('2d');
      ctx.translate(tmp.width / 2, tmp.height / 2);
      ctx.rotate(angle);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
      canvas.width = tmp.width;
      canvas.height = tmp.height;
      canvas.getContext('2d').drawImage(tmp, 0, 0);
    }
    canvasWrap.style.width = canvas.width + 'px';
    canvasWrap.style.height = canvas.height + 'px';
    renderAnnotations();
  }

  function renderAnnotations() {
    annOverlay.innerHTML = '';
    const anns = getAnnotations(key);
    anns.forEach((a, i) => {
      const div = document.createElement('div');
      div.className = 'ann ann-' + a.type;
      div.style.left = a.x * 100 + '%';
      div.style.top = a.y * 100 + '%';
      div.style.width = a.w * 100 + '%';
      div.style.height = a.h * 100 + '%';
      div.style.background = a.type === 'highlight' ? a.color : 'transparent';
      if (a.type === 'highlight') div.style.opacity = '0.4';
      if (a.type === 'underline') {
        div.style.borderBottom = `4px solid ${a.color}`;
        div.style.height = '0';
      }
      annOverlay.appendChild(div);
    });
    renderAnnList(anns);
  }

  function renderAnnList(anns) {
    annList.innerHTML = '';
    if (!anns.length) return;
    const title = document.createElement('div');
    title.className = 'ann-list-title';
    title.textContent = 'Annotations on this page:';
    annList.appendChild(title);
    anns.forEach((a, i) => {
      const row = document.createElement('div');
      row.className = 'ann-row';
      const swatch = document.createElement('span');
      swatch.className = 'swatch-sm';
      swatch.style.background = a.color;
      row.appendChild(swatch);
      const label = document.createElement('span');
      label.textContent = a.type;
      row.appendChild(label);
      const del = document.createElement('button');
      del.className = 'btn-sm btn-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        removeAnnotation(key, i);
        renderAnnotations();
      });
      row.appendChild(del);
      annList.appendChild(row);
    });
  }

  // Drawing new annotations by drag
  let dragStart = null;
  let dragPreview = null;
  annOverlay.addEventListener('mousedown', (e) => {
    if (!currentTool) return;
    const rect = annOverlay.getBoundingClientRect();
    dragStart = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    dragPreview = document.createElement('div');
    dragPreview.className = 'ann ann-preview';
    annOverlay.appendChild(dragPreview);
  });
  annOverlay.addEventListener('mousemove', (e) => {
    if (!dragStart || !dragPreview) return;
    const rect = annOverlay.getBoundingClientRect();
    const cur = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    const x = Math.min(dragStart.x, cur.x);
    const y = Math.min(dragStart.y, cur.y);
    const w = Math.abs(cur.x - dragStart.x);
    const h = Math.abs(cur.y - dragStart.y);
    dragPreview.style.left = x * 100 + '%';
    dragPreview.style.top = y * 100 + '%';
    dragPreview.style.width = w * 100 + '%';
    dragPreview.style.height = (currentTool === 'underline' ? 0 : h * 100) + '%';
    if (currentTool === 'underline') dragPreview.style.borderBottom = `4px solid ${currentColor}`;
    else {
      dragPreview.style.background = currentColor;
      dragPreview.style.opacity = '0.4';
    }
    dragPreview.dataset.w = w;
    dragPreview.dataset.h = h;
    dragPreview.dataset.x = x;
    dragPreview.dataset.y = y;
  });
  window.addEventListener('mouseup', () => {
    if (!dragStart || !dragPreview) return;
    const { x, y, w, h } = dragPreview.dataset;
    if (parseFloat(w) > 0.005 && (currentTool === 'underline' || parseFloat(h) > 0.005)) {
      addAnnotation(key, {
        type: currentTool,
        x: parseFloat(x),
        y: parseFloat(y),
        w: parseFloat(w),
        h: currentTool === 'underline' ? 0.02 : parseFloat(h),
        color: currentColor,
      });
    }
    dragPreview.remove();
    dragPreview = null;
    dragStart = null;
    renderAnnotations();
  });

  ocrBtn.addEventListener('click', async () => {
    ocrBtn.disabled = true;
    ocrBtn.textContent = 'Running OCR…';
    textOverlay.innerHTML = '';
    try {
      const [words, text] = await Promise.all([ocrPageWords(canvas), ocrPageText(canvas)]);
      ocrPanel.style.display = 'block';
      ocrTextarea.value = text.trim();
      for (const w of words) {
        if (!w.text.trim()) continue;
        const span = document.createElement('span');
        span.textContent = w.text;
        span.style.left = (w.x0 / canvas.width) * 100 + '%';
        span.style.top = (w.y0 / canvas.height) * 100 + '%';
        span.style.width = ((w.x1 - w.x0) / canvas.width) * 100 + '%';
        span.style.height = ((w.y1 - w.y0) / canvas.height) * 100 + '%';
        span.style.fontSize = Math.max(8, (w.y1 - w.y0) * 0.85) + 'px';
        textOverlay.appendChild(span);
      }
    } catch (err) {
      ocrTextarea.value = 'OCR failed: ' + err.message;
      ocrPanel.style.display = 'block';
    } finally {
      ocrBtn.disabled = false;
      ocrBtn.textContent = 'Run OCR (copy text)';
    }
  });

  updateToolButtons();
  render();
  document.body.appendChild(overlay);
}
