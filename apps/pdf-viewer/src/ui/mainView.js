import { getPage, getAnnotations, addAnnotation, removeAnnotation } from '../state.js';
import { state } from '../state.js';
import { renderPageToCanvas } from '../pdf/pdfSetup.js';
import { ocrPageWords, ocrPageText } from '../ocr/ocr.js';

const HIGHLIGHT_COLORS = ['#ffeb3b', '#a5d6a7', '#90caf9', '#f48fb1', '#ffb74d', '#ce93d8', '#80deea', '#ef9a9a'];
const UNDERLINE_COLORS = ['#e53935', '#1e88e5', '#000000'];
const PENCIL_COLORS = ['#000000', '#e53935', '#1e88e5', '#2e7d32', '#f57c00', '#8e24aa'];
const SVG_NS = 'http://www.w3.org/2000/svg';

// Stroke widths as a fraction of the page's pixel width, so marks stay the
// same relative thickness regardless of render scale or PDF export size.
const HIGHLIGHT_SIZE_RANGE = { min: 0.008, max: 0.035, default: 0.018 };
const PENCIL_SIZE_RANGE = { min: 0.0015, max: 0.012, default: 0.0035 };

// Tool state persists across re-renders (e.g. switching pages) so the user
// doesn't have to reselect a tool/color/size for every page.
let currentTool = null; // 'highlight' | 'underline' | 'pencil' | null
let currentColor = HIGHLIGHT_COLORS[0];
let highlightSize = HIGHLIGHT_SIZE_RANGE.default;
let pencilSize = PENCIL_SIZE_RANGE.default;

function sizeForTool(tool) {
  return tool === 'highlight' ? highlightSize : pencilSize;
}
function setSizeForTool(tool, size) {
  if (tool === 'highlight') highlightSize = size;
  else pencilSize = size;
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function renderEmptyMainView(container) {
  container.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'main-view-empty';
  empty.textContent = 'Select a page on the left to view, highlight, or underline it here.';
  container.appendChild(empty);
}

export function renderMainView(container, key) {
  const page = getPage(key);
  if (!page) {
    renderEmptyMainView(container);
    return;
  }
  const doc = state.docs.get(page.docId);

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'view-header';
  const title = document.createElement('span');
  title.textContent = `${doc.name} — page ${page.pageIndex + 1}`;
  header.appendChild(title);
  container.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'detail-toolbar';
  container.appendChild(toolbar);

  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'btn-sm';
  rotateBtn.textContent = 'Rotate 90°';
  rotateBtn.addEventListener('click', () => {
    page.rotation = (page.rotation + 90) % 360;
    render();
  });
  toolbar.appendChild(rotateBtn);

  const ocrBtn = document.createElement('button');
  ocrBtn.className = 'btn-sm';
  ocrBtn.textContent = 'Run OCR (copy text)';
  toolbar.appendChild(ocrBtn);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  container.appendChild(canvasWrap);

  const canvas = document.createElement('canvas');
  canvasWrap.appendChild(canvas);

  const annOverlay = document.createElement('div');
  annOverlay.className = 'ann-overlay';
  canvasWrap.appendChild(annOverlay);

  // Persistent layer for freehand highlight/pencil strokes. Underline marks
  // stay simple divs (a straight border-bottom line), same as before.
  const svgDraw = document.createElementNS(SVG_NS, 'svg');
  svgDraw.setAttribute('class', 'ann-draw');
  annOverlay.appendChild(svgDraw);

  const textOverlay = document.createElement('div');
  textOverlay.className = 'text-overlay';
  canvasWrap.appendChild(textOverlay);

  const annList = document.createElement('div');
  annList.className = 'ann-list';
  container.appendChild(annList);

  const ocrPanel = document.createElement('div');
  ocrPanel.style.display = 'none';
  ocrPanel.className = 'ocr-panel';
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
  container.appendChild(ocrPanel);

  // ---------- floating tool tray ----------
  const trayDock = document.createElement('div');
  trayDock.className = 'tool-tray-dock';
  container.appendChild(trayDock);

  const tray = document.createElement('div');
  tray.className = 'tool-tray';
  trayDock.appendChild(tray);

  const trayTools = document.createElement('span');
  trayTools.className = 'tray-tools';
  tray.appendChild(trayTools);

  function makeToolButton(label, tool) {
    const b = document.createElement('button');
    b.className = 'tray-btn';
    b.textContent = label;
    b.addEventListener('click', () => {
      currentTool = currentTool === tool ? null : tool;
      updateToolButtons();
    });
    trayTools.appendChild(b);
    return b;
  }
  const highlightBtn = makeToolButton('Highlighter', 'highlight');
  const underlineBtn = makeToolButton('Underliner', 'underline');
  const pencilBtn = makeToolButton('Pencil', 'pencil');

  const traySwatches = document.createElement('span');
  traySwatches.className = 'tray-swatches';
  tray.appendChild(traySwatches);

  function paletteForTool(tool) {
    if (tool === 'highlight') return HIGHLIGHT_COLORS;
    if (tool === 'pencil') return PENCIL_COLORS;
    return UNDERLINE_COLORS;
  }

  function renderSwatches() {
    traySwatches.innerHTML = '';
    const colors = paletteForTool(currentTool);
    if (!colors.includes(currentColor)) currentColor = colors[0];
    for (const c of colors) {
      const sw = document.createElement('button');
      sw.className = 'swatch' + (c === currentColor ? ' active' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        currentColor = c;
        renderSwatches();
      });
      traySwatches.appendChild(sw);
    }
  }

  const traySize = document.createElement('span');
  traySize.className = 'tray-size';
  tray.appendChild(traySize);

  const sizeDot = document.createElement('span');
  sizeDot.className = 'tray-size-dot';
  traySize.appendChild(sizeDot);

  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.className = 'tray-slider';
  sizeSlider.step = '0.0005';
  traySize.appendChild(sizeSlider);

  function updateSizeDot() {
    const range = currentTool === 'highlight' ? HIGHLIGHT_SIZE_RANGE : PENCIL_SIZE_RANGE;
    const t = (sizeForTool(currentTool) - range.min) / (range.max - range.min);
    sizeDot.style.width = sizeDot.style.height = (4 + t * 14).toFixed(1) + 'px';
  }

  sizeSlider.addEventListener('input', () => {
    setSizeForTool(currentTool, parseFloat(sizeSlider.value));
    updateSizeDot();
  });

  function updateToolButtons() {
    highlightBtn.classList.toggle('active', currentTool === 'highlight');
    underlineBtn.classList.toggle('active', currentTool === 'underline');
    pencilBtn.classList.toggle('active', currentTool === 'pencil');
    traySwatches.style.display = currentTool ? 'flex' : 'none';
    renderSwatches();
    const isFreehand = currentTool === 'highlight' || currentTool === 'pencil';
    traySize.style.display = isFreehand ? 'flex' : 'none';
    if (isFreehand) {
      const range = currentTool === 'highlight' ? HIGHLIGHT_SIZE_RANGE : PENCIL_SIZE_RANGE;
      sizeSlider.min = range.min;
      sizeSlider.max = range.max;
      sizeSlider.value = sizeForTool(currentTool);
      updateSizeDot();
    }
    // While a draw tool is active, the annotation layer needs to own every
    // pointer event on the page — otherwise the OCR word overlay (when
    // present) steals the mousedown/pointerdown before it reaches us.
    annOverlay.style.cursor = currentTool ? 'crosshair' : '';
    annOverlay.style.touchAction = currentTool ? 'none' : '';
    textOverlay.classList.toggle('tool-active', !!currentTool);
  }

  async function render() {
    await renderPageToCanvas(doc.pdfDoc, page.pageIndex, canvas, 1.8);
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
    // The svg's coordinate space is locked to the canvas's own pixel size
    // (not 0..1) so a circular stroke tip stays circular even though a PDF
    // page usually isn't square.
    svgDraw.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    renderAnnotations();
  }

  function pathD(points) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x * canvas.width).toFixed(2)} ${(p.y * canvas.height).toFixed(2)}`)
      .join(' ');
  }

  function styleStrokePath(path, type, color, size) {
    path.setAttribute('stroke', color);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', Math.max(1, size * canvas.width));
    if (type === 'highlight') {
      path.setAttribute('opacity', '0.45');
      path.style.mixBlendMode = 'multiply';
    } else {
      path.setAttribute('opacity', '1');
    }
  }

  function renderAnnotations() {
    annOverlay.querySelectorAll('.ann:not(.ann-preview)').forEach((el) => el.remove());
    svgDraw.querySelectorAll('path').forEach((el) => el.remove());
    const anns = getAnnotations(key);
    anns.forEach((a) => {
      if (a.type === 'underline') {
        const div = document.createElement('div');
        div.className = 'ann ann-underline';
        div.style.left = a.x * 100 + '%';
        div.style.top = a.y * 100 + '%';
        div.style.width = a.w * 100 + '%';
        div.style.height = '0';
        div.style.borderBottom = `4px solid ${a.color}`;
        annOverlay.appendChild(div);
      } else {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', pathD(a.points));
        styleStrokePath(path, a.type, a.color, a.size);
        svgDraw.appendChild(path);
      }
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

  // Drawing new annotations. Uses Pointer Events (rather than mouse-only
  // events) so mouse, trackpad, touch, and pen all behave the same, and uses
  // pointer capture so the drag keeps tracking even if the pointer briefly
  // leaves the overlay bounds during a fast movement.
  //
  // Underline is still a straight click-and-drag: the y coordinate is locked
  // to wherever the drag started, so vertical mouse movement is ignored
  // entirely and the line can never bow into a rectangle.
  //
  // Highlight and pencil are freehand: every pointermove appends a new point
  // (once the pointer has moved far enough to matter) and the preview stroke
  // is redrawn through all of them, so the mark follows the pointer tip and
  // leaves the trail it just passed over.
  let dragStart = null;
  let dragPreview = null;
  let freehandPoints = null;
  let previewPath = null;
  let activePointerId = null;

  function pointFromEvent(e) {
    const rect = annOverlay.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }

  function updateUnderlinePreview(cur) {
    const y = dragStart.y; // locked — vertical movement never affects the line
    const x = Math.min(dragStart.x, cur.x);
    const w = Math.abs(cur.x - dragStart.x);
    dragPreview.style.left = x * 100 + '%';
    dragPreview.style.top = y * 100 + '%';
    dragPreview.style.width = w * 100 + '%';
    dragPreview.style.height = '0';
    dragPreview.style.borderBottom = `4px solid ${currentColor}`;
    dragPreview.dataset.x = x;
    dragPreview.dataset.y = y;
    dragPreview.dataset.w = w;
  }

  annOverlay.addEventListener('pointerdown', (e) => {
    if (!currentTool) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return; // left button only
    activePointerId = e.pointerId;
    annOverlay.setPointerCapture(e.pointerId);
    const start = pointFromEvent(e);

    if (currentTool === 'underline') {
      dragStart = start;
      dragPreview = document.createElement('div');
      dragPreview.className = 'ann ann-preview';
      annOverlay.appendChild(dragPreview);
      updateUnderlinePreview(start);
    } else {
      const size = sizeForTool(currentTool);
      freehandPoints = [start];
      previewPath = document.createElementNS(SVG_NS, 'path');
      previewPath.classList.add('ann-preview-path');
      styleStrokePath(previewPath, currentTool, currentColor, size);
      previewPath.setAttribute('d', pathD(freehandPoints));
      svgDraw.appendChild(previewPath);
    }
    e.preventDefault();
  });

  annOverlay.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    if (dragStart) {
      updateUnderlinePreview(pointFromEvent(e));
    } else if (freehandPoints) {
      const p = pointFromEvent(e);
      const last = freehandPoints[freehandPoints.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.0015) {
        freehandPoints.push(p);
        previewPath.setAttribute('d', pathD(freehandPoints));
      }
    }
  });

  function finishDrag(e) {
    if (e.pointerId !== activePointerId) return;
    if (dragPreview) {
      const { x, y, w } = dragPreview.dataset;
      if (parseFloat(w) > 0.005) {
        addAnnotation(key, {
          type: 'underline',
          x: parseFloat(x),
          y: parseFloat(y),
          w: parseFloat(w),
          h: 0.02,
          color: currentColor,
        });
      }
      dragPreview.remove();
      dragPreview = null;
      dragStart = null;
    } else if (freehandPoints) {
      if (freehandPoints.length >= 2) {
        addAnnotation(key, {
          type: currentTool,
          points: freehandPoints,
          color: currentColor,
          size: sizeForTool(currentTool),
        });
      }
      if (previewPath) previewPath.remove();
      previewPath = null;
      freehandPoints = null;
    }
    try {
      annOverlay.releasePointerCapture(activePointerId);
    } catch {
      // already released
    }
    activePointerId = null;
    renderAnnotations();
  }

  annOverlay.addEventListener('pointerup', finishDrag);
  annOverlay.addEventListener('pointercancel', finishDrag);

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
}
