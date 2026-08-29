import { useEffect, useRef, useState, useCallback } from 'react';
import { useDoc } from '../state/DocumentContext.jsx';
import ObjectRenderer from './ObjectRenderer.jsx';
import {
  getCorners,
  axisAlignedBounds,
  rescaleLocalGeometry,
  resizeObject,
  worldPointFromLocal,
  RESIZE_HANDLES,
  createShape,
} from '../lib/shapes.js';
import {
  canvasFromDataUrl,
  blankCanvas,
  canvasToDataUrl,
  paintBrushDab,
  eraseDab,
  blurDab,
  burnDab,
  dodgeDab,
  samplePixel,
  detectBackgroundColor,
  removeBackgroundByColor,
  cropCanvas,
} from '../lib/rasterTools.js';
import { isImageFile, isProjectFile, imageFileToObject, parseProjectFile } from '../lib/importers.js';

const PAINT_TOOLS = ['brush', 'eraser', 'blur', 'burn', 'dodge'];

export default function CanvasStage() {
  const {
    doc,
    objects,
    selectedIds,
    selectObjects,
    setSelectedIds,
    selectedObjects,
    activeTool,
    setActiveTool,
    zoom,
    setZoom,
    patchObjectsLive,
    updateObjects,
    addObjects,
    removeObjects,
    getSnapshot,
    pushUndoPoint,
    showToast,
    docSvgRef,
    loadDocument,
    undo,
    redo,
    duplicateSelected,
    brushSize,
    brushColor,
    brushOpacity,
    brushHardness,
    brushStrength,
    bgTolerance,
  } = useDoc();

  const stageRef = useRef(null);
  const interactionRef = useRef(null);
  const rasterCacheRef = useRef(new Map());
  const [marquee, setMarquee] = useState(null);
  const [pendingPath, setPendingPath] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [cropRect, setCropRect] = useState(null);
  const [isDropTarget, setDropTarget] = useState(false);
  const [brushCursor, setBrushCursor] = useState(null);
  const spaceHeldRef = useRef(false);

  const single = selectedObjects.length === 1 ? selectedObjects[0] : null;

  // ---- coordinate helpers ----
  const toDoc = useCallback(
    (e) => {
      const rect = docSvgRef.current.getBoundingClientRect();
      return [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
    },
    [zoom, docSvgRef]
  );

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editingTextId) {
        if (e.key === 'Escape') finishTextEdit(false);
        return;
      }
      if (e.code === 'Space') spaceHeldRef.current = true;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length) {
          e.preventDefault();
          removeObjects(selectedIds);
        }
      }
      if (e.key === 'Escape') {
        setPendingPath(null);
        setSelectedIds([]);
        setCropRect(null);
        setActiveTool('select');
      }
      if (e.key === 'Enter' && pendingPath && pendingPath.length > 1) {
        finalizePath(false);
      }
      if (e.key === 'Enter' && activeTool === 'crop' && cropRect) {
        applyCrop();
      }
      const arrowMap = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (arrowMap[e.key] && selectedIds.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = arrowMap[e.key];
        const pre = getSnapshot();
        patchObjectsLive(selectedIds, (o) => ({ x: o.x + dx * step, y: o.y + dy * step }));
        pushUndoPoint(pre);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedIds, editingTextId, pendingPath, activeTool, cropRect]);

  // Enter crop tool -> seed crop rect to the selected image's full bounds.
  useEffect(() => {
    if (activeTool === 'crop' && single?.type === 'image') {
      setCropRect({ x: single.x, y: single.y, width: single.width, height: single.height });
    } else {
      setCropRect(null);
    }
  }, [activeTool, single?.id]);

  // ---- raster canvas cache ----
  async function getRasterCanvas(obj) {
    const cached = rasterCacheRef.current.get(obj.id);
    if (cached && cached.src === obj.src) return cached;
    const canvas = obj.src
      ? await canvasFromDataUrl(obj.src, obj.pixelWidth, obj.pixelHeight)
      : blankCanvas(obj.pixelWidth, obj.pixelHeight);
    const entry = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), src: obj.src };
    rasterCacheRef.current.set(obj.id, entry);
    return entry;
  }

  // ================= pointer handling =================

  const handleStagePointerDown = async (e) => {
    if (e.button === 1 || spaceHeldRef.current || activeTool === 'pan') {
      interactionRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, scrollL: stageRef.current.parentElement.scrollLeft, scrollT: stageRef.current.parentElement.scrollTop };
      return;
    }

    const [x, y] = toDoc(e);
    const hitG = e.target.closest?.('[data-obj-id]');
    const hitId = hitG?.dataset.objId;

    if (activeTool === 'select') {
      if (hitId) {
        const alreadySelected = selectedIds.includes(hitId);
        if (e.shiftKey) {
          selectObjects(alreadySelected ? selectedIds.filter((id) => id !== hitId) : [...selectedIds, hitId]);
        } else if (!alreadySelected) {
          selectObjects([hitId]);
        }
        const idsToMove = e.shiftKey ? selectedIds : alreadySelected ? selectedIds : [hitId];
        const pre = getSnapshot();
        const origin = new Map(objects.map((o) => [o.id, { x: o.x, y: o.y }]));
        interactionRef.current = { kind: 'move', startX: x, startY: y, ids: idsToMove.length ? idsToMove : [hitId], origin, pre };
      } else {
        setSelectedIds([]);
        interactionRef.current = { kind: 'marquee', startX: x, startY: y };
        setMarquee({ x, y, width: 0, height: 0 });
      }
      return;
    }

    if (['rect', 'ellipse', 'line'].includes(activeTool)) {
      const obj = createShape(activeTool, { x, y, width: 1, height: 1 });
      const pre = getSnapshot();
      addObjects([obj], { select: true });
      interactionRef.current = { kind: 'draw', id: obj.id, startX: x, startY: y, pre, tool: activeTool };
      return;
    }

    if (activeTool === 'text') {
      const obj = createShape('text', { x, y: y - 20, width: 240, height: 48 });
      addObjects([obj], { select: true });
      setActiveTool('select');
      setTimeout(() => beginTextEdit(obj), 0);
      return;
    }

    if (activeTool === 'pen') {
      setPendingPath((prev) => {
        if (!prev) return { startObjX: x, startObjY: y, points: [[x, y]] };
        const first = prev.points[0];
        const dist = Math.hypot(x - first[0], y - first[1]);
        if (prev.points.length > 1 && dist < 10 / zoom) {
          finalizePath(true, prev);
          return null;
        }
        return { ...prev, points: [...prev.points, [x, y]] };
      });
      return;
    }

    if (activeTool === 'bg-eyedropper' && single?.type === 'image') {
      const { ctx } = await getRasterCanvas(single);
      const lx = ((x - single.x) / single.width) * single.pixelWidth;
      const ly = ((y - single.y) / single.height) * single.pixelHeight;
      const color = samplePixel(ctx, lx, ly);
      removeBackgroundByColor(ctx, color, bgTolerance);
      const pre = getSnapshot();
      updateObjects([single.id], () => ({ src: canvasToDataUrl(ctx.canvas) }));
      setActiveTool('select');
      return;
    }

    if (PAINT_TOOLS.includes(activeTool)) {
      let target = hitId ? objects.find((o) => o.id === hitId) : single;
      if (!target || target.type !== 'image') {
        if (activeTool !== 'brush') {
          showToast('Select an image layer first');
          return;
        }
        target = createShape('image', {
          name: 'Drawing',
          x: 0,
          y: 0,
          width: doc.width,
          height: doc.height,
          pixelWidth: doc.width,
          pixelHeight: doc.height,
          src: null,
        });
        addObjects([target], { select: true });
      } else if (!selectedIds.includes(target.id)) {
        selectObjects([target.id]);
      }
      const { ctx } = await getRasterCanvas(target);
      const pre = getSnapshot();
      const lx = ((x - target.x) / target.width) * target.pixelWidth;
      const ly = ((y - target.y) / target.height) * target.pixelHeight;
      paintAt(ctx, activeTool, lx, ly);
      interactionRef.current = {
        kind: 'paint',
        id: target.id,
        ctx,
        pre,
        last: [lx, ly],
        lastFlush: 0,
      };
      flushPaint(target.id, ctx);
      return;
    }
  };

  function paintAt(ctx, tool, lx, ly) {
    if (tool === 'brush') paintBrushDab(ctx, lx, ly, { size: brushSize, color: brushColor, opacity: brushOpacity, hardness: brushHardness });
    if (tool === 'eraser') eraseDab(ctx, lx, ly, brushSize);
    if (tool === 'blur') blurDab(ctx, lx, ly, brushSize);
    if (tool === 'burn') burnDab(ctx, lx, ly, { size: brushSize, strength: brushStrength });
    if (tool === 'dodge') dodgeDab(ctx, lx, ly, { size: brushSize, strength: brushStrength });
  }

  function flushPaint(id, ctx) {
    patchObjectsLive([id], () => ({ src: canvasToDataUrl(ctx.canvas) }));
  }

  const handleStagePointerMove = (e) => {
    const interaction = interactionRef.current;
    if (!interaction) {
      if (PAINT_TOOLS.includes(activeTool)) {
        const rect = stageRef.current.getBoundingClientRect();
        setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, size: brushSize * zoom });
      }
      return;
    }
    const [x, y] = toDoc(e);

    if (interaction.kind === 'pan') {
      const dx = e.clientX - interaction.startX;
      const dy = e.clientY - interaction.startY;
      const parent = stageRef.current.parentElement;
      parent.scrollLeft = interaction.scrollL - dx;
      parent.scrollTop = interaction.scrollT - dy;
      return;
    }

    if (interaction.kind === 'marquee') {
      const nx = Math.min(interaction.startX, x);
      const ny = Math.min(interaction.startY, y);
      const w = Math.abs(x - interaction.startX);
      const h = Math.abs(y - interaction.startY);
      setMarquee({ x: nx, y: ny, width: w, height: h });
      const ids = objects
        .filter((o) => {
          const b = axisAlignedBounds(o);
          return b.x < nx + w && b.x + b.width > nx && b.y < ny + h && b.y + b.height > ny;
        })
        .map((o) => o.id);
      setSelectedIds(ids);
      return;
    }

    if (interaction.kind === 'move') {
      const dx = x - interaction.startX;
      const dy = y - interaction.startY;
      patchObjectsLive(interaction.ids, (o) => ({
        x: interaction.origin.get(o.id).x + dx,
        y: interaction.origin.get(o.id).y + dy,
      }));
      return;
    }

    if (interaction.kind === 'draw') {
      const x0 = Math.min(interaction.startX, x);
      const y0 = Math.min(interaction.startY, y);
      const w = Math.max(1, Math.abs(x - interaction.startX));
      const h = Math.max(1, Math.abs(y - interaction.startY));
      patchObjectsLive([interaction.id], (o) => {
        const patch = { x: x0, y: y0, width: w, height: h };
        if (o.type === 'line') {
          const flipX = x < interaction.startX;
          const flipY = y < interaction.startY;
          patch.x1 = flipX ? w : 0;
          patch.y1 = flipY ? h : 0;
          patch.x2 = flipX ? 0 : w;
          patch.y2 = flipY ? 0 : h;
        }
        return patch;
      });
      return;
    }

    if (interaction.kind === 'resize') {
      const patch = resizeObject(interaction.orig, interaction.handle, [x, y]);
      patchObjectsLive([interaction.id], (o) =>
        rescaleLocalGeometry({ ...o, ...patch }, interaction.orig.width, interaction.orig.height, patch.width, patch.height)
      );
      return;
    }

    if (interaction.kind === 'rotate') {
      const cx = interaction.orig.x + interaction.orig.width / 2;
      const cy = interaction.orig.y + interaction.orig.height / 2;
      let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      patchObjectsLive([interaction.id], () => ({ rotation: deg }));
      return;
    }

    if (interaction.kind === 'paint') {
      const target = objects.find((o) => o.id === interaction.id);
      if (!target) return;
      const lx = ((x - target.x) / target.width) * target.pixelWidth;
      const ly = ((y - target.y) / target.height) * target.pixelHeight;
      const [lastX, lastY] = interaction.last;
      const dist = Math.hypot(lx - lastX, ly - lastY);
      const spacing = Math.max(2, brushSize / 5);
      const steps = Math.max(1, Math.floor(dist / spacing));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        paintAt(interaction.ctx, activeTool, lastX + (lx - lastX) * t, lastY + (ly - lastY) * t);
      }
      interaction.last = [lx, ly];
      const now = performance.now();
      if (now - interaction.lastFlush > 45) {
        flushPaint(interaction.id, interaction.ctx);
        interaction.lastFlush = now;
      }
      const rect = stageRef.current.getBoundingClientRect();
      setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, size: brushSize * zoom });
      return;
    }

    if (interaction.kind === 'crop-drag') {
      const dx = x - interaction.startX;
      const dy = y - interaction.startY;
      setCropRect(clampCropRect({ ...interaction.orig, x: interaction.orig.x + dx, y: interaction.orig.y + dy }, single));
      return;
    }

    if (interaction.kind === 'crop-resize') {
      const handle = RESIZE_HANDLES.find((h) => h.id === interaction.handle);
      const r = interaction.orig;
      let { x: rx, y: ry, width: rw, height: rh } = r;
      if (handle.fx === 0) { rw = r.x + r.width - x; rx = x; }
      if (handle.fx === 1) { rw = x - r.x; }
      if (handle.fy === 0) { rh = r.y + r.height - y; ry = y; }
      if (handle.fy === 1) { rh = y - r.y; }
      setCropRect(clampCropRect({ x: rx, y: ry, width: Math.max(8, rw), height: Math.max(8, rh) }, single));
      return;
    }
  };

  const handleStagePointerUp = () => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (['move', 'draw', 'resize', 'rotate'].includes(interaction.kind)) {
      if (interaction.kind === 'draw') {
        const obj = objects.find((o) => o.id === interaction.id);
        if (obj && obj.width < 4 && obj.height < 4) {
          patchObjectsLive([obj.id], () => ({ x: obj.x - 50, y: obj.y - 50, width: 100, height: 100, ...(obj.type === 'line' ? { x2: 100, y2: 100 } : {}) }));
        }
        setActiveTool('select');
      }
      pushUndoPoint(interaction.pre);
    }
    if (interaction.kind === 'paint') {
      flushPaint(interaction.id, interaction.ctx);
      pushUndoPoint(interaction.pre);
    }
    interactionRef.current = null;
  };

  // ---- handle (resize/rotate) pointer-down, attached to overlay divs ----
  const startHandleDrag = (e, kind, handle) => {
    e.stopPropagation();
    e.preventDefault();
    if (!single) return;
    const pre = getSnapshot();
    interactionRef.current = { kind, id: single.id, handle, orig: { ...single }, pre };
  };

  const startCropHandleDrag = (e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    interactionRef.current = { kind: 'crop-resize', handle, orig: cropRect };
  };
  const startCropBodyDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const [x, y] = toDoc(e);
    interactionRef.current = { kind: 'crop-drag', startX: x, startY: y, orig: cropRect };
  };

  function clampCropRect(rect, img) {
    if (!img) return rect;
    const x = Math.max(img.x, Math.min(rect.x, img.x + img.width - 8));
    const y = Math.max(img.y, Math.min(rect.y, img.y + img.height - 8));
    const width = Math.min(rect.width, img.x + img.width - x);
    const height = Math.min(rect.height, img.y + img.height - y);
    return { x, y, width, height };
  }

  async function applyCrop() {
    if (!single || !cropRect) return;
    const { ctx } = await getRasterCanvas(single);
    const lx = ((cropRect.x - single.x) / single.width) * single.pixelWidth;
    const ly = ((cropRect.y - single.y) / single.height) * single.pixelHeight;
    const lw = (cropRect.width / single.width) * single.pixelWidth;
    const lh = (cropRect.height / single.height) * single.pixelHeight;
    const cropped = cropCanvas(ctx.canvas, { x: lx, y: ly, width: lw, height: lh });
    const pre = getSnapshot();
    updateObjects([single.id], () => ({
      src: canvasToDataUrl(cropped),
      x: cropRect.x,
      y: cropRect.y,
      width: cropRect.width,
      height: cropRect.height,
      pixelWidth: cropped.width,
      pixelHeight: cropped.height,
    }));
    rasterCacheRef.current.delete(single.id);
    setActiveTool('select');
  }

  async function runRemoveBackground() {
    if (!single || single.type !== 'image') return;
    const { ctx } = await getRasterCanvas(single);
    const target = detectBackgroundColor(ctx);
    removeBackgroundByColor(ctx, target, bgTolerance);
    updateObjects([single.id], () => ({ src: canvasToDataUrl(ctx.canvas) }));
  }

  // expose a couple of actions PropertiesPanel needs without prop drilling
  useEffect(() => {
    window.__vectorStudio = { runRemoveBackground, applyCrop };
  });

  // ---- text editing ----
  function beginTextEdit(obj) {
    setEditingTextId(obj.id);
    setEditingDraft(obj.content);
  }
  function finishTextEdit(commitChange = true) {
    if (!editingTextId) return;
    if (commitChange) {
      updateObjects([editingTextId], () => ({ content: editingDraft || ' ' }));
    }
    setEditingTextId(null);
  }

  function finalizePath(closed, override) {
    const draft = override || pendingPath;
    if (!draft || draft.points.length < 2) {
      setPendingPath(null);
      return;
    }
    const xs = draft.points.map((p) => p[0]);
    const ys = draft.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const obj = createShape('path', {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      closed,
      points: draft.points.map(([px, py]) => [px - minX, py - minY]),
    });
    addObjects([obj], { select: true });
    setPendingPath(null);
    setActiveTool('select');
  }

  // ---- drag & drop / paste import ----
  async function importFiles(files) {
    const rect = docSvgRef.current.getBoundingClientRect();
    const cx = doc.width / 2;
    const cy = doc.height / 2;
    const images = [];
    for (const file of files) {
      if (isProjectFile(file)) {
        try {
          const data = await parseProjectFile(file);
          loadDocument(data);
          showToast('Project loaded');
          return;
        } catch {
          /* fall through and try as image */
        }
      }
      if (isImageFile(file)) {
        images.push(await imageFileToObject(file, { cx, cy }));
      }
    }
    if (images.length) {
      images.forEach((img, i) => {
        img.x += i * 24;
        img.y += i * 24;
      });
      addObjects(images, { select: true });
      showToast(`Added ${images.length} image${images.length > 1 ? 's' : ''}`);
    }
  }

  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) importFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [doc.width, doc.height]);

  const onDrop = (e) => {
    e.preventDefault();
    setDropTarget(false);
    const files = [...e.dataTransfer.files];
    if (files.length) importFiles(files);
  };

  // ---- render ----
  const svgW = doc.width * zoom;
  const svgH = doc.height * zoom;

  return (
    <div
      className={`canvas-area ${isDropTarget ? 'dropzone-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={onDrop}
    >
      <div
        className={`canvas-stage ${interactionRef.current?.kind === 'pan' ? 'panning' : ''}`}
        ref={stageRef}
        style={{ width: svgW, height: svgH, cursor: PAINT_TOOLS.includes(activeTool) ? 'none' : undefined }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerLeave={() => setBrushCursor(null)}
      >
        <svg
          ref={docSvgRef}
          className="doc-svg"
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${doc.width} ${doc.height}`}
        >
          <rect width={doc.width} height={doc.height} fill={doc.background} />
          {objects.map((obj) => (
            <ObjectRenderer key={obj.id} obj={obj} editingTextId={editingTextId} />
          ))}
          {pendingPath && (
            <polyline
              points={pendingPath.points.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="#24968a"
              strokeWidth={2 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
          )}
        </svg>

        {/* ---- selection overlay (screen space) ---- */}
        <div className="overlay-layer">
          {marquee && (
            <div
              className="marquee-box"
              style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.width * zoom, height: marquee.height * zoom }}
            />
          )}

          {selectedObjects.length === 1 && activeTool === 'select' && (
            <SelectionBox obj={single} zoom={zoom} onHandleDown={startHandleDrag} />
          )}
          {selectedObjects.length > 1 && activeTool === 'select' && (
            <MultiSelectionBox objs={selectedObjects} zoom={zoom} />
          )}

          {activeTool === 'crop' && cropRect && (
            <CropOverlay rect={cropRect} zoom={zoom} onBodyDown={startCropBodyDrag} onHandleDown={startCropHandleDrag} />
          )}

          {brushCursor && PAINT_TOOLS.includes(activeTool) && (
            <div
              style={{
                position: 'absolute',
                left: brushCursor.x - brushCursor.size / 2,
                top: brushCursor.y - brushCursor.size / 2,
                width: brushCursor.size,
                height: brushCursor.size,
                borderRadius: '50%',
                border: '1.5px solid #1b2a18',
                background: 'rgba(27,42,24,0.08)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {editingTextId && single?.type === 'text' && (
          <textarea
            autoFocus
            className="text-edit-overlay"
            style={{
              left: single.x * zoom,
              top: single.y * zoom,
              width: single.width * zoom,
              height: single.height * zoom,
              fontSize: single.fontSize * zoom,
              fontFamily: single.fontFamily,
              fontWeight: single.fontWeight,
              color: single.fill,
              textAlign: single.align,
            }}
            value={editingDraft}
            onChange={(e) => setEditingDraft(e.target.value)}
            onBlur={() => finishTextEdit(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') finishTextEdit(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SelectionBox({ obj, zoom, onHandleDown }) {
  const corners = getCorners(obj).map(([x, y]) => [x * zoom, y * zoom]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const box = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  const rotateAnchor = worldPointFromLocal(obj, obj.width / 2, -28 / zoom);

  return (
    <>
      <div
        className="select-box"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          transform: obj.rotation ? undefined : undefined,
        }}
      />
      {!obj.locked &&
        RESIZE_HANDLES.map((h) => {
          const [wx, wy] = worldPointFromLocal(obj, h.fx * obj.width, h.fy * obj.height);
          return (
            <div
              key={h.id}
              className="handle"
              style={{ left: wx * zoom, top: wy * zoom, cursor: `${h.id}-resize` }}
              onPointerDown={(e) => onHandleDown(e, 'resize', h.id)}
            />
          );
        })}
      {!obj.locked && (
        <div
          className="handle rotate"
          style={{ left: rotateAnchor[0] * zoom, top: rotateAnchor[1] * zoom }}
          onPointerDown={(e) => onHandleDown(e, 'rotate', null)}
        />
      )}
    </>
  );
}

function MultiSelectionBox({ objs, zoom }) {
  const b = axisAlignedBoundsUnion(objs);
  return (
    <div
      className="select-box"
      style={{ left: b.x * zoom, top: b.y * zoom, width: b.width * zoom, height: b.height * zoom, borderStyle: 'dashed' }}
    />
  );
}
function axisAlignedBoundsUnion(objs) {
  const boxes = objs.map(axisAlignedBounds);
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function CropOverlay({ rect, zoom, onBodyDown, onHandleDown }) {
  return (
    <>
      <div
        className="select-box"
        style={{ left: rect.x * zoom, top: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom, borderColor: '#24968a', pointerEvents: 'auto', cursor: 'move' }}
        onPointerDown={onBodyDown}
      />
      {RESIZE_HANDLES.map((h) => (
        <div
          key={h.id}
          className="handle"
          style={{ left: (rect.x + h.fx * rect.width) * zoom, top: (rect.y + h.fy * rect.height) * zoom, cursor: `${h.id}-resize` }}
          onPointerDown={(e) => onHandleDown(e, h.id)}
        />
      ))}
    </>
  );
}
