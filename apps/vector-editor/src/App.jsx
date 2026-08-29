import { useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  FilePlus2,
  FolderOpen,
  Download,
  ChevronDown,
} from 'lucide-react';
import { useDoc } from './state/DocumentContext.jsx';
import ShimmerText from './components/ShimmerText.jsx';
import ToolRail from './components/ToolRail.jsx';
import CanvasStage from './components/CanvasStage.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import NewDocumentModal from './components/NewDocumentModal.jsx';
import { downloadSvg, downloadPng, downloadJpeg, downloadPdf, downloadProjectJson } from './lib/exporters.js';
import { isImageFile, isProjectFile, imageFileToObject, parseProjectFile } from './lib/importers.js';

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export default function App() {
  const {
    doc,
    objects,
    groups,
    zoom,
    setZoom,
    undo,
    redo,
    canUndo,
    canRedo,
    toast,
    showToast,
    docSvgRef,
    addObjects,
    loadDocument,
  } = useDoc();

  const [tab, setTab] = useState('properties');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const stepZoom = (dir) => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom);
    const nextIdx = dir > 0 ? Math.min(ZOOM_STEPS.length - 1, idx + 1) : Math.max(0, idx - 1);
    setZoom(ZOOM_STEPS[nextIdx]);
  };

  const runExport = async (kind) => {
    setExportOpen(false);
    const svg = docSvgRef.current;
    if (!svg) return;
    try {
      if (kind === 'svg') downloadSvg(svg, doc);
      else if (kind === 'png') await downloadPng(svg, doc);
      else if (kind === 'jpeg') await downloadJpeg(svg, doc);
      else if (kind === 'pdf') await downloadPdf(svg, doc);
      else if (kind === 'project') downloadProjectJson(doc, objects, groups);
    } catch {
      showToast('Export failed');
    }
  };

  const openFiles = async (files) => {
    setBusy(true);
    try {
      for (const file of files) {
        if (isProjectFile(file)) {
          try {
            const data = await parseProjectFile(file);
            loadDocument(data);
            showToast('Project loaded');
            continue;
          } catch {
            /* fall through, try as image */
          }
        }
        if (isImageFile(file)) {
          const obj = await imageFileToObject(file, { cx: doc.width / 2, cy: doc.height / 2 });
          addObjects([obj], { select: true });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="home-btn" href="/" title="Back to all apps">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5 12 3l9 6.5"></path>
            <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>
          </svg>
        </a>
        <ShimmerText text="Vector Studio" className="app-title" />

        <div className="divider-v" />

        <button type="button" className="btn-sm" disabled={!canUndo} onClick={undo} title="Undo (Ctrl/Cmd+Z)">
          <Undo2 />
        </button>
        <button type="button" className="btn-sm" disabled={!canRedo} onClick={redo} title="Redo (Ctrl/Cmd+Shift+Z)">
          <Redo2 />
        </button>

        <div className="divider-v" />

        <div className="zoom-group">
          <button type="button" onClick={() => stepZoom(-1)} title="Zoom out"><ZoomOut /></button>
          <span className="zoom-val">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => stepZoom(1)} title="Zoom in"><ZoomIn /></button>
        </div>

        <div className="spacer" />

        <button type="button" className="btn-sm" onClick={() => setNewDocOpen(true)}>
          <FilePlus2 /> New
        </button>
        <button type="button" className="btn-sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          <FolderOpen /> {busy ? 'Loading…' : 'Open'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept="image/*,.json"
          onChange={(e) => {
            const files = [...e.target.files];
            e.target.value = '';
            if (files.length) openFiles(files);
          }}
        />

        <div style={{ position: 'relative' }}>
          <button type="button" className="btn-primary" onClick={() => setExportOpen((v) => !v)}>
            <Download /> Export <ChevronDown style={{ width: 12, height: 12 }} />
          </button>
          {exportOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setExportOpen(false)} />
              <div
                className="glass-panel"
                style={{
                  position: 'absolute',
                  top: '110%',
                  right: 0,
                  zIndex: 91,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  minWidth: 160,
                }}
              >
                {[
                  ['svg', 'SVG (vector)'],
                  ['png', 'PNG (transparent)'],
                  ['jpeg', 'JPEG'],
                  ['pdf', 'PDF'],
                  ['project', 'Project file (.json)'],
                ].map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => runExport(kind)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 12px',
                      fontSize: '0.8rem',
                      color: 'var(--text)',
                      background: 'none',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <div className="app-body">
        <ToolRail />
        <CanvasStage />
        <div className="right-panel">
          <div className="panel-tabs">
            <button type="button" className={`panel-tab ${tab === 'properties' ? 'active' : ''}`} onClick={() => setTab('properties')}>
              Properties
            </button>
            <button type="button" className={`panel-tab ${tab === 'layers' ? 'active' : ''}`} onClick={() => setTab('layers')}>
              Layers ({objects.length})
            </button>
          </div>
          {tab === 'properties' ? <PropertiesPanel /> : <LayersPanel />}
        </div>
      </div>

      {newDocOpen && <NewDocumentModal onClose={() => setNewDocOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
