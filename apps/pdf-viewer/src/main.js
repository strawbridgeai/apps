import './style.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import ShimmerText from './components/ShimmerText.jsx';
import { Badge } from './components/ui/badge.jsx';
import { loadPdf } from './pdf/pdfSetup.js';
import { state, addDoc } from './state.js';
import { renderSidebar } from './ui/sidebar.js';
import { renderMainView, renderEmptyMainView } from './ui/mainView.js';
import { openWatermarkPanel } from './ui/watermarkPanel.js';
import { autoSortByPageNumber } from './ui/autoSort.js';
import { buildPdfBytes, downloadBytes } from './pdf/exportPdf.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="header-left">
        <a class="home-btn" href="/" title="Back to all apps">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9.5 12 3l9 6.5"></path>
            <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
          </svg>
        </a>
        <div id="title-mount"></div>
        <div id="page-count-mount"></div>
      </div>
      <div class="header-actions">
        <label class="btn-primary file-btn">
          Add PDF(s)
          <input type="file" id="file-input" accept="application/pdf" multiple hidden />
        </label>
        <button class="btn-sm" id="autosort-btn">Auto-sort by page number</button>
        <button class="btn-sm" id="watermark-btn">Watermark…</button>
        <button class="btn-sm" id="extract-btn">Extract selected</button>
        <button class="btn-primary" id="export-btn">Export PDF</button>
      </div>
    </header>
    <div class="status-bar" id="status-bar"></div>
    <div class="workspace">
      <aside class="sidebar" id="sidebar"></aside>
      <section class="main-view" id="main-view"></section>
    </div>
  </div>
`;

createRoot(document.querySelector('#title-mount')).render(createElement(ShimmerText, { text: 'PDF Toolkit' }));

const pageCountRoot = createRoot(document.querySelector('#page-count-mount'));
function renderPageCount() {
  const n = state.pages.length;
  if (n === 0) {
    pageCountRoot.render(null);
    return;
  }
  pageCountRoot.render(createElement(Badge, { variant: 'muted' }, `${n} page${n === 1 ? '' : 's'}`));
}

const sidebarEl = document.querySelector('#sidebar');
const mainViewEl = document.querySelector('#main-view');
const statusBar = document.querySelector('#status-bar');
const fileInput = document.querySelector('#file-input');
const autosortBtn = document.querySelector('#autosort-btn');
const watermarkBtn = document.querySelector('#watermark-btn');
const extractBtn = document.querySelector('#extract-btn');
const exportBtn = document.querySelector('#export-btn');

function setStatus(msg) {
  statusBar.textContent = msg || '';
}

function refreshMainView() {
  if (state.activeKey) renderMainView(mainViewEl, state.activeKey);
  else renderEmptyMainView(mainViewEl);
}

function onActivate() {
  refreshMainView();
}

function refreshAll() {
  renderSidebar(sidebarEl, { onSelectionChange: updateExtractLabel, onActivate });
  refreshMainView();
  updateExtractLabel();
  renderPageCount();
}

function updateExtractLabel() {
  extractBtn.textContent = `Extract selected (${state.selected.size})`;
  extractBtn.disabled = state.selected.size === 0;
}

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  fileInput.value = '';
  for (const file of files) {
    setStatus(`Loading ${file.name}…`);
    const bytes = await file.arrayBuffer();
    const pdfDoc = await loadPdf(bytes);
    addDoc(file.name, bytes, pdfDoc);
  }
  setStatus('');
  refreshAll();
});

autosortBtn.addEventListener('click', async () => {
  if (state.pages.length === 0) return;
  autosortBtn.disabled = true;
  const result = await autoSortByPageNumber((done, total) => {
    setStatus(`Scanning pages for numbers… ${done}/${total}`);
  });
  autosortBtn.disabled = false;
  setStatus(`Detected page numbers on ${result.detected}/${result.total} pages. Drag any leftovers into place.`);
  refreshAll();
});

watermarkBtn.addEventListener('click', () => openWatermarkPanel());

extractBtn.addEventListener('click', async () => {
  const pages = state.pages.filter((p) => state.selected.has(p.key));
  if (!pages.length) return;
  setStatus('Building PDF…');
  const bytes = await buildPdfBytes(pages);
  downloadBytes(bytes, 'extracted.pdf');
  setStatus('');
});

exportBtn.addEventListener('click', async () => {
  if (!state.pages.length) return;
  setStatus('Building PDF…');
  exportBtn.disabled = true;
  try {
    const bytes = await buildPdfBytes(state.pages);
    downloadBytes(bytes, 'document.pdf');
  } finally {
    exportBtn.disabled = false;
    setStatus('');
  }
});

updateExtractLabel();
refreshAll();
