import './style.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import FileUpload from './components/FileUpload.jsx';
import ShimmerText from './components/ShimmerText.jsx';

const API_BASE = `${location.protocol}//${location.hostname}:2011`;

const CATEGORY_LABELS = { audio: 'Audio', image: 'Image', document: 'Document' };
const CATEGORY_ARTICLE = { audio: 'an', image: 'an', document: 'a' };

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="header-inner">
        <a class="home-btn" href="/" title="Back to all apps">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9.5 12 3l9 6.5"></path>
            <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
          </svg>
        </a>
        <div id="title-mount"></div>
      </div>
    </header>
    <div class="card">
      <div class="field-row">
        <div class="field">
          <label for="category-select">File type</label>
          <select id="category-select">
            <option value="">Select a type…</option>
            <option value="audio">Audio</option>
            <option value="image">Image</option>
            <option value="document">Document</option>
          </select>
        </div>
        <div class="field">
          <label for="target-select">Convert to</label>
          <select id="target-select" disabled>
            <option value="">Select a file first…</option>
          </select>
        </div>
      </div>

      <div id="upload-mount"></div>

      <button class="btn-primary" id="convert-btn" disabled>Convert</button>

      <div class="progress-track" id="progress-track"><div class="progress-indicator"></div></div>
      <div class="status" id="status"></div>
      <div class="hint">Files are converted on the server and never stored — the converted file downloads straight to your device.</div>
    </div>
  </div>
`;

createRoot(document.querySelector('#title-mount')).render(createElement(ShimmerText, { text: 'File Converter' }));

const categorySelect = document.querySelector('#category-select');
const targetSelect = document.querySelector('#target-select');
const uploadMount = document.querySelector('#upload-mount');
const convertBtn = document.querySelector('#convert-btn');
const statusEl = document.querySelector('#status');
const progressTrack = document.querySelector('#progress-track');

let catalog = null;
let selectedFile = null;
let selectedExt = null;
let uploadRoot = null;

function setStatus(msg, kind) {
  statusEl.className = 'status' + (msg ? ' visible' : '') + (kind ? ' ' + kind : '');
  statusEl.textContent = msg || '';
}

// This box doesn't have a real domain pointed at it yet, so the API's TLS
// cert doesn't match the bare IP it's reached by. A direct page visit gets
// a normal click-through browser warning; a background fetch() to a
// different origin (this page is on :443, the API is on :2011) just fails
// silently with no warning dialog at all — so on that failure, guide the
// visitor to go accept the cert once rather than show an opaque error.
function setCertHelp() {
  statusEl.className = 'status visible error';
  statusEl.innerHTML =
    `Couldn't reach the conversion service — your browser doesn't trust its certificate yet (this server doesn't have a proper domain set up yet, so this is a one-time step). ` +
    `<a href="${API_BASE}/api/health" target="_blank" rel="noopener">Open this link</a>, click "Advanced" → "Proceed anyway" past the warning, then come back here and try again.`;
}

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

function sourceExtsForCategory(category) {
  if (!catalog || !category) return [];
  return catalog[category]?.sourceExts || [];
}

function targetsForSelection() {
  const category = categorySelect.value;
  if (!catalog || !category) return [];
  if (category === 'document') {
    const group = Object.values(catalog.document.groups).find((g) => g.exts.includes(selectedExt));
    return group ? group.targets : [];
  }
  return catalog[category]?.targets || [];
}

// FileUpload (components/FileUpload.jsx, from Kokonut UI) manages its own
// idle/dragging/picked-file state internally and doesn't watch prop
// changes reactively — remounting it with a fresh `key` whenever the
// category changes is the idiomatic way to reset it to a clean slate
// (matches this dropzone's old behavior of clearing on category change).
function renderFileUpload() {
  const category = categorySelect.value;
  if (!uploadRoot) uploadRoot = createRoot(uploadMount);

  if (!category) {
    uploadRoot.render(createElement('div', { className: 'upload-mount-empty' }, 'Choose a file type above first'));
    return;
  }

  const exts = sourceExtsForCategory(category);
  uploadRoot.render(
    createElement(FileUpload, {
      key: category,
      hintText: `${exts.map((e) => e.toUpperCase()).join(', ')} up to 100 MB`,
      acceptAttr: exts.map((e) => '.' + e).join(','),
      validateFile: (file) => {
        const ext = extOf(file.name);
        if (!exts.includes(ext)) {
          return {
            message: `"${file.name}" doesn't look like ${CATEGORY_ARTICLE[category]} ${CATEGORY_LABELS[category].toLowerCase()} file. Accepted: ${exts.map((e) => e.toUpperCase()).join(', ')}.`,
          };
        }
        return null;
      },
      onUploadSuccess: (file) => {
        selectedFile = file;
        selectedExt = extOf(file.name);
        setStatus('', null);
        updateTargetOptions();
        updateConvertEnabled();
      },
      onFileRemove: () => {
        selectedFile = null;
        selectedExt = null;
        updateTargetOptions();
        updateConvertEnabled();
      },
    })
  );
}

function updateTargetOptions() {
  const targets = targetsForSelection();
  if (!selectedFile || targets.length === 0) {
    targetSelect.innerHTML = '<option value="">Select a file first…</option>';
    targetSelect.disabled = true;
    return;
  }
  targetSelect.innerHTML =
    '<option value="">Choose a format…</option>' +
    targets.map((t) => `<option value="${t.key}">${t.label}</option>`).join('');
  targetSelect.disabled = false;
}

function updateConvertEnabled() {
  convertBtn.disabled = !(selectedFile && targetSelect.value);
}

categorySelect.addEventListener('change', () => {
  selectedFile = null;
  selectedExt = null;
  updateTargetOptions();
  updateConvertEnabled();
  renderFileUpload();
});

targetSelect.addEventListener('change', updateConvertEnabled);

convertBtn.addEventListener('click', async () => {
  if (!selectedFile || !targetSelect.value) return;
  const targetDef = targetsForSelection().find((t) => t.key === targetSelect.value);
  convertBtn.disabled = true;
  setStatus('Converting… this can take a few seconds, longer for documents.', 'info');
  progressTrack.classList.add('visible');

  const form = new FormData();
  // category/sourceExt/target MUST be appended before the file — the
  // backend relies on multipart field order to know the file's real
  // extension before it starts streaming the file to disk.
  form.append('category', categorySelect.value);
  form.append('sourceExt', selectedExt);
  form.append('target', targetSelect.value);
  form.append('file', selectedFile);

  try {
    const res = await fetch(`${API_BASE}/api/convert`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Conversion failed (${res.status}).`);
    }
    const blob = await res.blob();
    const base = selectedFile.name.replace(/\.[^.]+$/, '');
    const filename = `${base}.${targetDef.ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`Done — ${filename} downloaded.`, 'success');
  } catch (err) {
    if (err instanceof TypeError) setCertHelp();
    else setStatus(err.message || 'Conversion failed.', 'error');
  } finally {
    progressTrack.classList.remove('visible');
    updateConvertEnabled();
  }
});

async function loadCatalog() {
  const res = await fetch(`${API_BASE}/api/options`);
  catalog = await res.json();
}

renderFileUpload();
loadCatalog().then(renderFileUpload).catch(setCertHelp);
