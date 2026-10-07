import { createContext, useContext, useMemo, useRef, useState, useCallback } from 'react';
import { uid, clamp } from '../lib/utils.js';
import { unionBounds, axisAlignedBounds } from '../lib/shapes.js';
import { isImageFile, isProjectFile, imageFileToObject, parseProjectFile, canvasToImageObject } from '../lib/importers.js';
import { isRawFile, openRawFile } from '../lib/rawImport.js';
import { canvasToUrl, srcByteSize, releaseUnused } from '../lib/pixelStore.js';

const DocumentCtx = createContext(null);

const DEFAULT_DOC = { name: 'Untitled', width: 1080, height: 1080, background: '#ffffff' };

// Snapshots share structure with live state instead of deep-copying it:
// every update in this file replaces objects immutably (spread, never
// mutate), so holding references is safe — and a deep copy would duplicate
// every photo's multi-megabyte data URL on every single undo step.
function snapshotOf(doc, objects, groups) {
  return { doc, objects, groups };
}

// Undo depth shrinks when the document holds large photos, so retained
// image versions can't grow to gigabytes (an overestimate: unchanged
// images are shared between snapshots and only counted once in reality).
const HISTORY_BYTE_BUDGET = 1.5e9;
const HISTORY_MAX = 100;
const HISTORY_MIN = 15;
function historyLimit(snap) {
  const bytes = snap.objects.reduce((n, o) => n + srcByteSize(o.src), 0);
  return bytes ? clamp(Math.floor(HISTORY_BYTE_BUDGET / bytes), HISTORY_MIN, HISTORY_MAX) : HISTORY_MAX;
}

function collectSrcs(set, snap) {
  snap.objects.forEach((o) => o.src && set.add(o.src));
}

export function DocumentProvider({ children }) {
  const [doc, setDoc] = useState(DEFAULT_DOC);
  const [objects, setObjects] = useState([]); // z-order: index 0 = back
  const [groups, setGroups] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTool, setActiveTool] = useState('select');
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState(null);

  // Brush-family tool settings (not document data, so not part of
  // undo/redo history) shared by the brush/blur/burn/dodge/eraser tools.
  const [brushSize, setBrushSize] = useState(32);
  const [brushColor, setBrushColor] = useState('#3f8f45');
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [brushHardness, setBrushHardness] = useState(0.7);
  const [brushStrength, setBrushStrength] = useState(0.35);
  const [bgTolerance, setBgTolerance] = useState(40);
  const [cloneAligned, setCloneAligned] = useState(true);

  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [historyTick, setHistoryTick] = useState(0);
  const docSvgRef = useRef(null);

  // Latest objects for async work (RAW decodes finishing in the
  // background) that must not act on a stale render's closure.
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const docRef = useRef(doc);
  docRef.current = doc;

  const getSnapshot = useCallback(
    () => snapshotOf(doc, objects, groups),
    [doc, objects, groups]
  );

  const pushUndoPoint = useCallback((snap) => {
    pastRef.current.push(snap);
    const limit = historyLimit(snap);
    while (pastRef.current.length > limit) pastRef.current.shift();
    // Free image versions that fell out of history (or were discarded
    // redo branches) once nothing references them any more.
    const live = new Set();
    collectSrcs(live, { objects: objectsRef.current });
    pastRef.current.forEach((s) => collectSrcs(live, s));
    releaseUnused(live);
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const applySnapshot = (snap) => {
    setDoc(snap.doc);
    setObjects(snap.objects);
    setGroups(snap.groups);
  };

  const commit = useCallback(
    (mutator) => {
      const pre = getSnapshot();
      mutator();
      pushUndoPoint(pre);
    },
    [getSnapshot, pushUndoPoint]
  );

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const pre = pastRef.current.pop();
    futureRef.current.push(getSnapshot());
    applySnapshot(pre);
    setHistoryTick((t) => t + 1);
  }, [getSnapshot]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current.pop();
    pastRef.current.push(getSnapshot());
    applySnapshot(next);
    setHistoryTick((t) => t + 1);
  }, [getSnapshot]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  // ---- selection helpers ----
  const expandForGroups = useCallback(
    (ids) => {
      const set = new Set(ids);
      ids.forEach((id) => {
        const obj = objects.find((o) => o.id === id);
        if (obj?.groupId) {
          objects.forEach((o) => {
            if (o.groupId === obj.groupId) set.add(o.id);
          });
        }
      });
      return [...set];
    },
    [objects]
  );

  const selectObjects = useCallback(
    (ids) => setSelectedIds(expandForGroups(ids)),
    [expandForGroups]
  );

  const selectedObjects = useMemo(
    () => objects.filter((o) => selectedIds.includes(o.id)),
    [objects, selectedIds]
  );

  // ---- mutation actions (all history-committing) ----
  const addObjects = useCallback(
    (newObjs, { select = true } = {}) => {
      commit(() => setObjects((prev) => [...prev, ...newObjs]));
      if (select) selectObjects(newObjs.map((o) => o.id));
    },
    [commit, selectObjects]
  );

  // Non-committing live patch, used while dragging/resizing/typing for a
  // smooth preview; callers pair this with pushUndoPoint(preSnapshot) once
  // the interaction ends so undo captures one step, not every frame.
  const patchObjectsLive = useCallback((ids, patchFn) => {
    setObjects((prev) =>
      prev.map((o) => (ids.includes(o.id) ? { ...o, ...patchFn(o) } : o))
    );
  }, []);

  const updateObjects = useCallback(
    (ids, patchFn) => {
      commit(() =>
        setObjects((prev) =>
          prev.map((o) => (ids.includes(o.id) ? { ...o, ...patchFn(o) } : o))
        )
      );
    },
    [commit]
  );

  const removeObjects = useCallback(
    (ids) => {
      commit(() => setObjects((prev) => prev.filter((o) => !ids.includes(o.id))));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    },
    [commit]
  );

  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const idMap = {};
    const copies = objects
      .filter((o) => selectedIds.includes(o.id))
      .map((o) => {
        const newId = uid(o.type);
        idMap[o.id] = newId;
        return { ...o, id: newId, name: o.name + ' copy', x: o.x + 16, y: o.y + 16 };
      });
    copies.forEach((c) => {
      if (c.groupId) c.groupId = idMap[c.groupId] || c.groupId;
    });
    commit(() => setObjects((prev) => [...prev, ...copies]));
    selectObjects(copies.map((c) => c.id));
  }, [objects, selectedIds, commit, selectObjects]);

  const reorderAll = useCallback(
    (newOrderIds) => {
      commit(() =>
        setObjects((prev) => {
          const byId = Object.fromEntries(prev.map((o) => [o.id, o]));
          return newOrderIds.map((id) => byId[id]).filter(Boolean);
        })
      );
    },
    [commit]
  );

  const zOrderMove = useCallback(
    (ids, dir) => {
      // dir: 'front' | 'back' | 'forward' | 'backward'
      commit(() =>
        setObjects((prev) => {
          const sel = prev.filter((o) => ids.includes(o.id));
          const rest = prev.filter((o) => !ids.includes(o.id));
          if (dir === 'front') return [...rest, ...sel];
          if (dir === 'back') return [...sel, ...rest];
          if (dir === 'forward' || dir === 'backward') {
            const arr = [...prev];
            const step = dir === 'forward' ? 1 : -1;
            const indices = ids
              .map((id) => arr.findIndex((o) => o.id === id))
              .sort((a, b) => (step > 0 ? b - a : a - b));
            indices.forEach((idx) => {
              const swapWith = idx + step;
              if (swapWith >= 0 && swapWith < arr.length) {
                [arr[idx], arr[swapWith]] = [arr[swapWith], arr[idx]];
              }
            });
            return arr;
          }
          return prev;
        })
      );
    },
    [commit]
  );

  const groupSelected = useCallback(() => {
    if (selectedIds.length < 2) return;
    const gid = uid('group');
    commit(() => {
      setGroups((prev) => ({ ...prev, [gid]: { id: gid, name: 'Group' } }));
      setObjects((prev) =>
        prev.map((o) => (selectedIds.includes(o.id) ? { ...o, groupId: gid } : o))
      );
    });
  }, [selectedIds, commit]);

  const ungroupSelected = useCallback(() => {
    const gids = [...new Set(selectedObjects.map((o) => o.groupId).filter(Boolean))];
    if (!gids.length) return;
    commit(() => {
      setObjects((prev) =>
        prev.map((o) => (gids.includes(o.groupId) ? { ...o, groupId: null } : o))
      );
      setGroups((prev) => {
        const next = { ...prev };
        gids.forEach((g) => delete next[g]);
        return next;
      });
    });
  }, [selectedObjects, commit]);

  const alignSelected = useCallback(
    (mode) => {
      if (selectedObjects.length < 2) return;
      const union = unionBounds(selectedObjects);
      commit(() =>
        setObjects((prev) =>
          prev.map((o) => {
            if (!selectedIds.includes(o.id)) return o;
            const b = axisAlignedBounds(o);
            let dx = 0;
            let dy = 0;
            if (mode === 'left') dx = union.x - b.x;
            if (mode === 'right') dx = union.x + union.width - (b.x + b.width);
            if (mode === 'centerH') dx = union.x + union.width / 2 - (b.x + b.width / 2);
            if (mode === 'top') dy = union.y - b.y;
            if (mode === 'bottom') dy = union.y + union.height - (b.y + b.height);
            if (mode === 'centerV') dy = union.y + union.height / 2 - (b.y + b.height / 2);
            return { ...o, x: o.x + dx, y: o.y + dy };
          })
        )
      );
    },
    [selectedObjects, selectedIds, commit]
  );

  const newDocument = useCallback(
    (config) => {
      const pre = getSnapshot();
      setDoc({ ...DEFAULT_DOC, ...config });
      setObjects([]);
      setGroups({});
      setSelectedIds([]);
      pushUndoPoint(pre);
    },
    [getSnapshot, pushUndoPoint]
  );

  const loadDocument = useCallback(
    (data) => {
      const pre = getSnapshot();
      setDoc(data.doc || DEFAULT_DOC);
      setObjects(data.objects || []);
      setGroups(data.groups || {});
      setSelectedIds([]);
      pushUndoPoint(pre);
    },
    [getSnapshot, pushUndoPoint]
  );

  const zoomToFit = useCallback((w, h) => {
    const area = document.querySelector('.canvas-area');
    if (!area) return;
    const z = Math.min((area.clientWidth - 64) / w, (area.clientHeight - 64) / h, 1);
    setZoom(Math.max(0.02, Math.floor(z * 100) / 100));
  }, []);

  // Swap a RAW layer's instant camera preview for the real demosaiced
  // sensor data once the background decode finishes — but only if the
  // preview hasn't been edited in the meantime, so no edits are lost.
  // Undo/redo snapshots are patched too, so undoing past this point
  // doesn't resurrect the preview.
  const finishRawDecode = useCallback(
    async (id, previewSrc, canvas) => {
      const current = objectsRef.current.find((o) => o.id === id);
      if (!current) return;
      if (current.src !== previewSrc) {
        setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, rawStatus: 'preview-edited' } : o)));
        showToast('RAW decode finished — kept your edits on the camera preview');
        return;
      }
      const src = await canvasToUrl(canvas);
      if (objectsRef.current.find((o) => o.id === id)?.src !== previewSrc) return;
      // The decoded frame can differ by a few pixels from the camera's
      // preview (e.g. 3664×2742 vs 3648×2736), so adopt its true size: a
      // photo that *is* the document resizes the document with it; any
      // other layer keeps its width and corrects its height to the aspect.
      const cw = canvas.width;
      const ch = canvas.height;
      const swap = (snap) => {
        let nextDoc = snap.doc;
        const nextObjects = snap.objects.map((o) => {
          if (o.id !== id || o.src !== previewSrc) return o;
          const isDocPhoto = o.x === 0 && o.y === 0 && o.width === nextDoc.width && o.height === nextDoc.height;
          let box = { height: (o.width * ch) / cw };
          if (isDocPhoto) {
            box = { width: cw, height: ch };
            nextDoc = { ...nextDoc, width: cw, height: ch };
          }
          return { ...o, ...box, src, pixelWidth: cw, pixelHeight: ch, rawStatus: 'raw' };
        });
        return { ...snap, doc: nextDoc, objects: nextObjects };
      };
      const present = swap({ doc: docRef.current, objects: objectsRef.current });
      setObjects(present.objects);
      if (present.doc !== docRef.current) setDoc(present.doc);
      pastRef.current = pastRef.current.map(swap);
      futureRef.current = futureRef.current.map(swap);
      showToast('Full RAW data loaded');
    },
    [showToast]
  );

  // Single entry point for the Open button, drag-and-drop, and paste.
  // The first photo opened into an empty document becomes the document
  // (sized to the photo's pixels, zoomed to fit), like opening a file in
  // Photoshop or GIMP; later ones are added as layers.
  const importFiles = useCallback(
    async (files) => {
      let placedCount = 0;
      let lastAdded = [];
      const place = (obj) => {
        const asDocument = objectsRef.current.length === 0 && placedCount === 0;
        if (asDocument) {
          const w = obj.pixelWidth;
          const h = obj.pixelHeight;
          const full = { ...obj, x: 0, y: 0, width: w, height: h };
          commit(() => {
            setDoc((d) => ({ ...d, name: obj.name, width: w, height: h }));
            setObjects((prev) => [...prev, full]);
          });
          zoomToFit(w, h);
          lastAdded = [full];
        } else {
          const off = placedCount * 24;
          const moved = { ...obj, x: obj.x + off, y: obj.y + off };
          commit(() => setObjects((prev) => [...prev, moved]));
          lastAdded = [...lastAdded, moved];
        }
        placedCount++;
        setSelectedIds(lastAdded.map((o) => o.id));
      };
      const center = { cx: doc.width / 2, cy: doc.height / 2 };

      for (const file of files) {
        const name = file.name.replace(/\.[^.]+$/, '');
        if (isProjectFile(file)) {
          try {
            loadDocument(await parseProjectFile(file));
            showToast('Project loaded');
            return;
          } catch {
            /* fall through and try as image */
          }
        }
        if (isRawFile(file)) {
          const ext = file.name.split('.').pop().toUpperCase();
          showToast(`Opening ${ext} file…`);
          let opened;
          try {
            opened = await openRawFile(file);
          } catch {
            showToast(`Couldn't read ${file.name} as a RAW file`);
            continue;
          }
          const { meta, preview, full } = opened;
          const extra = { rawFormat: ext, rawMeta: meta };
          if (preview) {
            const obj = await canvasToImageObject(preview, { name, ...center, extra: { ...extra, rawStatus: 'decoding' } });
            place(obj);
            showToast('Showing camera preview — decoding RAW sensor data…');
            full
              .then((canvas) => finishRawDecode(obj.id, obj.src, canvas))
              .catch(() => {
                setObjects((prev) => prev.map((o) => (o.id === obj.id ? { ...o, rawStatus: 'preview-only' } : o)));
                showToast(`This ${ext} variant can't be decoded — using the camera's embedded preview`);
              });
          } else {
            showToast(`Decoding ${ext} sensor data — large files can take a while…`);
            try {
              const canvas = await full;
              place(await canvasToImageObject(canvas, { name, ...center, extra: { ...extra, rawStatus: 'raw' } }));
            } catch {
              showToast(`Couldn't decode ${file.name}`);
            }
          }
          continue;
        }
        if (isImageFile(file)) {
          try {
            place(await imageFileToObject(file, center));
          } catch {
            showToast(`Couldn't open ${file.name}`);
          }
          continue;
        }
        showToast(`${file.name} isn't a supported file`);
      }
      if (placedCount > 1) showToast(`Added ${placedCount} images`);
    },
    [doc.width, doc.height, commit, zoomToFit, loadDocument, finishRawDecode, showToast]
  );

  const value = {
    doc,
    setDoc,
    objects,
    groups,
    selectedIds,
    setSelectedIds,
    selectObjects,
    selectedObjects,
    activeTool,
    setActiveTool,
    zoom,
    setZoom,
    toast,
    showToast,
    addObjects,
    patchObjectsLive,
    updateObjects,
    removeObjects,
    duplicateSelected,
    reorderAll,
    zOrderMove,
    groupSelected,
    ungroupSelected,
    alignSelected,
    newDocument,
    loadDocument,
    importFiles,
    zoomToFit,
    getSnapshot,
    pushUndoPoint,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    historyTick,
    docSvgRef,
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushOpacity,
    setBrushOpacity,
    brushHardness,
    setBrushHardness,
    brushStrength,
    setBrushStrength,
    bgTolerance,
    setBgTolerance,
    cloneAligned,
    setCloneAligned,
  };

  return <DocumentCtx.Provider value={value}>{children}</DocumentCtx.Provider>;
}

export function useDoc() {
  const ctx = useContext(DocumentCtx);
  if (!ctx) throw new Error('useDoc must be used inside DocumentProvider');
  return ctx;
}
