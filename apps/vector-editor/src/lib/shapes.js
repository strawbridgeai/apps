import { uid } from './utils.js';

export const DEFAULT_STYLE = {
  fill: '#3f8f45',
  fillOpacity: 1,
  stroke: '#1b2a18',
  strokeWidth: 0,
  strokeOpacity: 1,
  opacity: 1,
};

// Every object shares x,y,width,height,rotation (degrees, about its own
// center) so move/resize/rotate logic is identical regardless of type.
// Type-specific geometry (line endpoints, pen points) is stored in local
// coordinates relative to the object's own (0,0)-(width,height) box, so it
// rescales for free whenever width/height change.
export function createShape(type, overrides = {}) {
  const base = {
    id: uid(type),
    type,
    name: overrides.name || defaultName(type),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    visible: true,
    locked: false,
    groupId: null,
    ...DEFAULT_STYLE,
  };

  switch (type) {
    case 'rect':
      return { ...base, rx: 0, ...overrides };
    case 'ellipse':
      return { ...base, ...overrides };
    case 'line':
      return {
        ...base,
        fill: 'none',
        stroke: '#1b2a18',
        strokeWidth: 3,
        x1: 0,
        y1: 0,
        x2: overrides.width ?? base.width,
        y2: overrides.height ?? base.height,
        ...overrides,
      };
    case 'path':
      return {
        ...base,
        fill: 'none',
        stroke: '#1b2a18',
        strokeWidth: 3,
        closed: false,
        points: overrides.points || [],
        ...overrides,
      };
    case 'text':
      return {
        ...base,
        width: 220,
        height: 40,
        fill: '#1b2a18',
        content: 'Double-click to edit',
        fontSize: 24,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 400,
        align: 'left',
        ...overrides,
      };
    case 'image':
      return {
        ...base,
        fill: 'none',
        strokeWidth: 0,
        src: overrides.src,
        ...overrides,
      };
    default:
      return { ...base, ...overrides };
  }
}

function defaultName(type) {
  return (
    {
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      line: 'Line',
      path: 'Path',
      text: 'Text',
      image: 'Image',
    }[type] || 'Layer'
  );
}

// Rotated bounding box corners in document space, for selection overlay
// and marquee/union calculations.
export function getCorners(obj) {
  const { x, y, width, height, rotation } = obj;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  return pts.map(([px, py]) => {
    const dx = px - cx;
    const dy = py - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  });
}

export function axisAlignedBounds(obj) {
  const corners = getCorners(obj);
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function unionBounds(list) {
  if (!list.length) return { x: 0, y: 0, width: 0, height: 0 };
  const boxes = list.map(axisAlignedBounds);
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Scale an object's local point-based geometry (line/path) when its
// width/height change, keeping the shape proportional inside the new box.
export function rescaleLocalGeometry(obj, oldW, oldH, newW, newH) {
  const sx = oldW === 0 ? 1 : newW / oldW;
  const sy = oldH === 0 ? 1 : newH / oldH;
  if (obj.type === 'line') {
    return { ...obj, x1: obj.x1 * sx, y1: obj.y1 * sy, x2: obj.x2 * sx, y2: obj.y2 * sy };
  }
  if (obj.type === 'path') {
    return { ...obj, points: obj.points.map(([px, py]) => [px * sx, py * sy]) };
  }
  return obj;
}

export function rotateVec(v, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
}

// World-space position of a point given in the object's own local
// (0,0)-(width,height) coordinate system, accounting for rotation about
// the box center.
export function worldPointFromLocal(obj, lx, ly) {
  const [dx, dy] = rotateVec([lx - obj.width / 2, ly - obj.height / 2], obj.rotation);
  return [obj.x + obj.width / 2 + dx, obj.y + obj.height / 2 + dy];
}

export const RESIZE_HANDLES = [
  { id: 'nw', fx: 0, fy: 0 },
  { id: 'n', fx: 0.5, fy: 0 },
  { id: 'ne', fx: 1, fy: 0 },
  { id: 'e', fx: 1, fy: 0.5 },
  { id: 'se', fx: 1, fy: 1 },
  { id: 's', fx: 0.5, fy: 1 },
  { id: 'sw', fx: 0, fy: 1 },
  { id: 'w', fx: 0, fy: 0.5 },
];

const MIN_SIZE = 6;

// Resize an object by dragging handle `handleId`, keeping the opposite
// corner/edge fixed in world space — works uniformly for rotated objects
// by doing the math in the object's own (unrotated) local axes.
export function resizeObject(orig, handleId, mouseWorld) {
  const handle = RESIZE_HANDLES.find((h) => h.id === handleId);
  const anchorFrac = { x: 1 - handle.fx, y: 1 - handle.fy };
  const anchorWorld = worldPointFromLocal(orig, anchorFrac.x * orig.width, anchorFrac.y * orig.height);
  const vWorld = [mouseWorld[0] - anchorWorld[0], mouseWorld[1] - anchorWorld[1]];
  const vLocal = rotateVec(vWorld, -orig.rotation);

  const changeW = handle.fx !== 0.5;
  const changeH = handle.fy !== 0.5;
  const newWidth = changeW ? Math.max(MIN_SIZE, Math.abs(vLocal[0])) : orig.width;
  const newHeight = changeH ? Math.max(MIN_SIZE, Math.abs(vLocal[1])) : orig.height;

  const anchorLocalNew = [anchorFrac.x * newWidth, anchorFrac.y * newHeight];
  const offsetFromAnchorToCenter = [newWidth / 2 - anchorLocalNew[0], newHeight / 2 - anchorLocalNew[1]];
  const [rx, ry] = rotateVec(offsetFromAnchorToCenter, orig.rotation);
  const centerWorld = [anchorWorld[0] + rx, anchorWorld[1] + ry];

  return {
    x: centerWorld[0] - newWidth / 2,
    y: centerWorld[1] - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
}

export function pointsBounds(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
