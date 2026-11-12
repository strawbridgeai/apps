import { useEffect, useMemo, useRef, useState } from 'react';
import { Undo } from 'lucide-react';
import { curveSampler, isCurveNeutral } from '../lib/photoFilters.js';

const CHANNELS = [
  ['rgb', 'RGB', 'var(--text)', 'l'],
  ['r', 'Red', '#d63c32', 'r'],
  ['g', 'Green', '#3f8f45', 'g'],
  ['b', 'Blue', '#285ac8', 'b'],
];
const IDENTITY = [[0, 0], [255, 255]];
const HIT_PX = 10;
// Dragging an interior point this far outside the box removes it, like
// Photoshop's Curves.
const REMOVE_PX = 28;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function histPath(bins) {
  if (!bins) return null;
  const sorted = [...bins].sort((a, b) => a - b);
  const peak = Math.max(1, sorted[Math.floor(sorted.length * 0.995)]);
  let d = 'M0 256';
  for (let i = 0; i < 256; i++) d += ` L${i} ${256 - Math.min(1, bins[i] / peak) * 256}`;
  return `${d} L255 256 Z`;
}

// Tone curve: a square graph with the identity diagonal. Click to add a
// point, drag points to bend the curve, double-click or drag a point off
// the graph to remove it. `onChange` fires on every move (live preview);
// `onCommit` once the drag ends.
export default function CurvesEditor({ curves, hist, onChange, onCommit }) {
  const [channel, setChannel] = useState('rgb');
  const [activeIdx, setActiveIdx] = useState(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  const pts = curves[channel] || IDENTITY;
  const [, , color, histKey] = CHANNELS.find((c) => c[0] === channel);

  // Undo/redo or a reset swaps the points out from under a selection.
  useEffect(() => {
    if (!dragRef.current) setActiveIdx(null);
  }, [pts]);

  const curvePath = useMemo(() => {
    const f = curveSampler(pts);
    let d = '';
    for (let x = 0; x <= 255; x += 3) d += `${d ? ' L' : 'M'}${x} ${255 - clamp(f(x), 0, 255)}`;
    return `${d} L255 ${255 - clamp(f(255), 0, 255)}`;
  }, [pts]);
  const histD = useMemo(() => histPath(hist?.[histKey]), [hist, histKey]);

  function toCurve(e) {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 255,
      y: (1 - (e.clientY - r.top) / r.height) * 255,
      scale: r.width / 255,
      outside: Math.max(r.left - e.clientX, e.clientX - r.right, r.top - e.clientY, e.clientY - r.bottom),
    };
  }

  function setPts(next) {
    onChange({ ...curves, [channel]: next });
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x, y, scale } = toCurve(e);
    let idx = -1;
    let best = HIT_PX;
    pts.forEach(([px, py], i) => {
      const dist = Math.hypot(px - x, py - y) * scale;
      if (dist < best) {
        best = dist;
        idx = i;
      }
    });
    if (idx === -1) {
      const nx = Math.round(clamp(x, 1, 254));
      if (pts.some(([px]) => px === nx)) return;
      const next = [...pts, [nx, Math.round(clamp(y, 0, 255))]].sort((a, b) => a[0] - b[0]);
      idx = next.findIndex(([px]) => px === nx);
      setPts(next);
    }
    svgRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { idx };
    setActiveIdx(idx);
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag || drag.idx < 0) return;
    const { x, y, outside } = toCurve(e);
    const { idx } = drag;
    const last = pts.length - 1;
    if (idx > 0 && idx < last && outside > REMOVE_PX) {
      setPts(pts.filter((_, i) => i !== idx));
      dragRef.current = { idx: -1 };
      setActiveIdx(null);
      return;
    }
    const lo = idx === 0 ? 0 : pts[idx - 1][0] + 1;
    const hi = idx === last ? 255 : pts[idx + 1][0] - 1;
    const next = pts.slice();
    next[idx] = [Math.round(clamp(x, lo, hi)), Math.round(clamp(y, 0, 255))];
    setPts(next);
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onCommit();
  }

  function onDoubleClick(e) {
    const { x, y, scale } = toCurve(e);
    const idx = pts.findIndex(([px, py]) => Math.hypot(px - x, py - y) * scale < HIT_PX);
    if (idx > 0 && idx < pts.length - 1) {
      setPts(pts.filter((_, i) => i !== idx));
      setActiveIdx(null);
      onCommit();
    }
  }

  function resetChannel() {
    setPts(IDENTITY);
    setActiveIdx(null);
    onCommit();
  }

  const active = activeIdx !== null ? pts[activeIdx] : null;

  return (
    <div className="curves">
      <div className="curves-head">
        <div className="curves-channels" role="tablist" aria-label="Curve channel">
          {CHANNELS.map(([key, label, c]) => (
            <button key={key} type="button" role="tab" aria-selected={channel === key}
              className={channel === key ? 'active' : ''} style={{ '--chan': c }}
              onClick={() => { setChannel(key); setActiveIdx(null); }}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="curves-reset" title={`Reset ${channel.toUpperCase()} curve`}
          disabled={isCurveNeutral(pts)} onClick={resetChannel}>
          <Undo />
        </button>
      </div>
      <svg
        ref={svgRef}
        className="curves-graph"
        viewBox="-7 -7 269 269"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        aria-label="Tone curve — click to add a point, drag to adjust, double-click a point to remove it"
      >
        {histD && <path d={histD} className="curves-hist" style={{ fill: color }} />}
        {[64, 128, 192].map((v) => (
          <g key={v} className="curves-grid">
            <line x1={v} y1={0} x2={v} y2={255} />
            <line x1={0} y1={v} x2={255} y2={v} />
          </g>
        ))}
        <rect x={0} y={0} width={255} height={255} className="curves-frame" />
        <line x1={0} y1={255} x2={255} y2={0} className="curves-diagonal" />
        <path d={curvePath} className="curves-line" style={{ stroke: color }} />
        {pts.map(([px, py], i) => (
          <circle key={i} cx={px} cy={255 - py} r={i === activeIdx ? 5.5 : 4.5}
            className={i === activeIdx ? 'curves-pt active' : 'curves-pt'} style={{ '--chan': color }} />
        ))}
      </svg>
      <div className="curves-readout">
        {active ? (
          <>
            <span>Input <b>{active[0]}</b></span>
            <span>Output <b>{active[1]}</b></span>
          </>
        ) : (
          <span>Click the line to add a point</span>
        )}
      </div>
    </div>
  );
}
