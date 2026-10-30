import { createContext, useContext, useRef, useState, useCallback } from 'react';
import { LayoutGroup } from 'motion/react';
import { uid, clamp } from '../lib/utils.js';
import { rasterize } from '../lib/exporters.js';
import { canvasToImageObject } from '../lib/importers.js';
import { DocumentProvider } from './DocumentContext.jsx';

// Each open file gets its own tab with its own DocumentProvider — its own
// document, layers, undo history, zoom and tool settings — so editing one
// never touches another. Every tab stays mounted (inactive ones are just
// hidden) so background work like a RAW decode keeps landing in the right
// document. The only way content crosses tabs is an explicit drag of one
// tab onto another (see transferTab).

const WorkspaceCtx = createContext(null);

// MIME-ish type for tab drags, so drop targets can tell them apart from
// files dragged in from the desktop.
export const TAB_DRAG_TYPE = 'application/x-vector-studio-tab';

function newTab(extra = {}) {
  return { id: uid('tab'), title: 'Untitled', ...extra };
}

export function WorkspaceProvider({ children }) {
  const [tabs, setTabs] = useState(() => [newTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  // tabId -> handle registered by that tab's DocumentProvider: live
  // getters for its document plus a receive() to add objects to it.
  const handlesRef = useRef(new Map());
  const draggingRef = useRef(null);

  const registerTab = useCallback((id, handle) => {
    handlesRef.current.set(id, handle);
    return () => handlesRef.current.delete(id);
  }, []);

  const setTabTitle = useCallback((id, title) => {
    setTabs((prev) => prev.map((t) => (t.id === id && t.title !== title ? { ...t, title } : t)));
  }, []);

  // One new tab per file; a tab with pending files imports them as soon as
  // it mounts, so the first image becomes that tab's document.
  const openFilesInNewTabs = useCallback((files) => {
    if (!files.length) return;
    const created = files.map((f) => newTab({ title: f.name.replace(/\.[^.]+$/, ''), pendingFiles: [f] }));
    setTabs((prev) => [...prev, ...created]);
    setActiveId(created[created.length - 1].id);
  }, []);

  const openNewTab = useCallback((config) => {
    const tab = newTab({ title: config?.name || 'Untitled', pendingConfig: config });
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  const closeTab = useCallback(
    (id) => {
      const handle = handlesRef.current.get(id);
      if (handle?.getObjects().length && !window.confirm(`Close "${handle.getDoc().name}"? Unsaved edits in this tab will be lost.`)) {
        return;
      }
      const idx = tabs.findIndex((t) => t.id === id);
      let next = tabs.filter((t) => t.id !== id);
      if (!next.length) next = [newTab()];
      setTabs(next);
      if (id === activeId || !next.some((t) => t.id === activeId)) setActiveId(next[Math.min(idx, next.length - 1)].id);
    },
    [tabs, activeId]
  );

  // Drops the source tab's artwork onto the target tab as a new layer,
  // centered on `at` (target document coordinates) or the document center,
  // scaled down to fit if it's larger than the target. A tab holding a
  // single image moves across as that image layer (still editable at full
  // resolution); anything more complex is flattened to one image first.
  // The target records it as one undoable step; the source is untouched.
  const transferTab = useCallback(async (fromId, toId, at = null) => {
    const from = handlesRef.current.get(fromId);
    const to = handlesRef.current.get(toId);
    if (!from || !to || fromId === toId) return;
    const objects = from.getObjects().filter((o) => o.visible !== false);
    if (!objects.length) {
      to.showToast('That tab is empty — nothing to drop');
      return;
    }
    const srcDoc = from.getDoc();
    let layer;
    if (objects.length === 1 && objects[0].type === 'image') {
      layer = { ...objects[0], id: uid('image'), groupId: null, locked: false };
    } else {
      const svg = from.getSvg();
      if (!svg) return;
      to.showToast(`Flattening "${srcDoc.name}"…`);
      const canvas = await rasterize(svg, srcDoc, { scale: 1, transparent: true });
      layer = await canvasToImageObject(canvas, { name: srcDoc.name, cx: 0, cy: 0, fit: { width: srcDoc.width, height: srcDoc.height } });
    }
    const target = to.getDoc();
    const s = Math.min(1, target.width / layer.width, target.height / layer.height);
    const width = Math.max(1, Math.round(layer.width * s));
    const height = Math.max(1, Math.round(layer.height * s));
    const cx = at ? clamp(at[0], 0, target.width) : target.width / 2;
    const cy = at ? clamp(at[1], 0, target.height) : target.height / 2;
    to.receive({ ...layer, name: layer.name || srcDoc.name, width, height, x: Math.round(cx - width / 2), y: Math.round(cy - height / 2) });
    to.showToast(`Added "${srcDoc.name}" as a new layer`);
  }, []);

  const value = {
    tabs,
    activeId,
    setActiveId,
    registerTab,
    setTabTitle,
    openFilesInNewTabs,
    openNewTab,
    closeTab,
    transferTab,
    draggingRef,
    getHandle: (id) => handlesRef.current.get(id),
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

// Renders every tab's editor; only the active one is displayed.
export function WorkspaceTabs({ children }) {
  const { tabs, activeId } = useWorkspace();
  return tabs.map((tab) => (
    <div key={tab.id} style={{ display: tab.id === activeId ? 'contents' : 'none' }}>
      <LayoutGroup id={tab.id}>
        <DocumentProvider tab={tab} active={tab.id === activeId}>
          {children}
        </DocumentProvider>
      </LayoutGroup>
    </div>
  ));
}
