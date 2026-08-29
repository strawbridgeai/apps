import { createContext, useContext, useMemo, useRef, useState, useCallback } from 'react';
import { uid } from '../lib/utils.js';
import { unionBounds, axisAlignedBounds } from '../lib/shapes.js';

const DocumentCtx = createContext(null);

const DEFAULT_DOC = { name: 'Untitled', width: 1080, height: 1080, background: '#ffffff' };

function clone(v) {
  return JSON.parse(JSON.stringify(v));
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

  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [historyTick, setHistoryTick] = useState(0);
  const docSvgRef = useRef(null);

  const getSnapshot = useCallback(
    () => clone({ doc, objects, groups }),
    [doc, objects, groups]
  );

  const pushUndoPoint = useCallback((snap) => {
    pastRef.current.push(snap);
    if (pastRef.current.length > 100) pastRef.current.shift();
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
  };

  return <DocumentCtx.Provider value={value}>{children}</DocumentCtx.Provider>;
}

export function useDoc() {
  const ctx = useContext(DocumentCtx);
  if (!ctx) throw new Error('useDoc must be used inside DocumentProvider');
  return ctx;
}
