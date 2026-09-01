import { useEffect, useRef, useState } from 'react';
import { Aperture, Sparkles } from 'lucide-react';
import { useDoc } from '../state/DocumentContext.jsx';
import { RangeField } from './ui/field.jsx';
import {
  canvasFromDataUrl,
  canvasToDataUrl,
  applyTonalAdjustments,
  reduceNoise,
  applyBokeh,
} from '../lib/rasterTools.js';

const TONAL_DEFAULT = { exposure: 0, highlights: 0, blacks: 0 };

// Exposure/highlights/blacks/bokeh/denoise for the selected image. These
// are panel-driven (not click-on-canvas tools like crop/paint) since they
// operate on the whole image rather than a stroke or a drag region.
export default function ImageAdjustPanel({ image }) {
  const { patchObjectsLive, updateObjects, getSnapshot, pushUndoPoint, showToast } = useDoc();

  // Unmodified snapshot of the image for the current tonal editing
  // session, so repeated slider drags recompute a delta from the same
  // starting point instead of compounding onto already-adjusted pixels.
  const baseRef = useRef({ id: null, canvas: null });
  // Data URL this component itself last wrote via live preview, so the
  // reset effect below can tell "the image changed under us" (crop, undo,
  // another apply) apart from "we just previewed a slider move".
  const selfSrcRef = useRef(null);
  const dragPreRef = useRef(null);

  const [tonal, setTonal] = useState(TONAL_DEFAULT);
  const [denoiseStrength, setDenoiseStrength] = useState(30);
  const [bokeh, setBokeh] = useState({ focusX: 50, focusY: 50, radius: 45, feather: 60, strength: 55 });
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (image.src === selfSrcRef.current) return;
    let cancelled = false;
    canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight).then((canvas) => {
      if (!cancelled) baseRef.current = { id: image.id, canvas };
    });
    setTonal(TONAL_DEFAULT);
    return () => {
      cancelled = true;
    };
  }, [image.id, image.src]);

  async function ensureBase() {
    if (baseRef.current.id === image.id && baseRef.current.canvas) return baseRef.current.canvas;
    const canvas = await canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight);
    baseRef.current = { id: image.id, canvas };
    return canvas;
  }

  function beginTonalDrag() {
    dragPreRef.current = getSnapshot();
  }

  function commitTonalDrag() {
    if (!dragPreRef.current) return;
    pushUndoPoint(dragPreRef.current);
    dragPreRef.current = null;
    baseRef.current = { id: null, canvas: null }; // reload fresh base next touch
    setTonal(TONAL_DEFAULT);
  }

  async function updateTonal(key, value) {
    const next = { ...tonal, [key]: value };
    setTonal(next);
    const base = await ensureBase();
    const working = document.createElement('canvas');
    working.width = base.width;
    working.height = base.height;
    applyTonalAdjustments(working.getContext('2d'), base, next);
    const dataUrl = canvasToDataUrl(working);
    selfSrcRef.current = dataUrl;
    patchObjectsLive([image.id], () => ({ src: dataUrl }));
  }

  async function applyDenoise() {
    setBusy('denoise');
    try {
      const base = await canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight);
      reduceNoise(base.getContext('2d', { willReadFrequently: true }), denoiseStrength);
      updateObjects([image.id], () => ({ src: canvasToDataUrl(base) }));
      showToast('Noise reduced');
    } finally {
      setBusy(null);
    }
  }

  async function applyBokehEffect() {
    setBusy('bokeh');
    try {
      const base = await canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight);
      const working = document.createElement('canvas');
      working.width = base.width;
      working.height = base.height;
      const shortSide = Math.min(base.width, base.height);
      const radiusPx = (bokeh.radius / 100) * shortSide;
      applyBokeh(working.getContext('2d'), base, {
        focusX: (bokeh.focusX / 100) * base.width,
        focusY: (bokeh.focusY / 100) * base.height,
        radius: radiusPx,
        feather: (bokeh.feather / 100) * radiusPx,
        strength: bokeh.strength,
      });
      updateObjects([image.id], () => ({ src: canvasToDataUrl(working) }));
      showToast('Bokeh applied');
    } finally {
      setBusy(null);
    }
  }

  const dragHandlers = {
    onPointerDown: beginTonalDrag,
    onPointerUp: commitTonalDrag,
    onBlur: commitTonalDrag,
  };

  return (
    <>
      <div className="panel-section-title">Adjust</div>
      <RangeField label="Exposure" value={tonal.exposure} min={-100} max={100}
        onChange={(v) => updateTonal('exposure', v)} format={(v) => (v > 0 ? `+${v}` : `${v}`)} {...dragHandlers} />
      <RangeField label="Highlights" value={tonal.highlights} min={-100} max={100}
        onChange={(v) => updateTonal('highlights', v)} format={(v) => (v > 0 ? `+${v}` : `${v}`)} {...dragHandlers} />
      <RangeField label="Blacks" value={tonal.blacks} min={-100} max={100}
        onChange={(v) => updateTonal('blacks', v)} format={(v) => (v > 0 ? `+${v}` : `${v}`)} {...dragHandlers} />

      <div className="panel-section-title">Reduce noise</div>
      <RangeField label="Strength" value={denoiseStrength} min={0} max={100} onChange={setDenoiseStrength} format={(v) => `${v}%`} />
      <button type="button" className="btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
        disabled={busy === 'denoise'} onClick={applyDenoise}>
        <Sparkles /> {busy === 'denoise' ? 'Reducing…' : 'Reduce grain / noise'}
      </button>

      <div className="panel-section-title">Bokeh background</div>
      <RangeField label="Focus X" value={bokeh.focusX} min={0} max={100} format={(v) => `${v}%`}
        onChange={(v) => setBokeh((b) => ({ ...b, focusX: v }))} />
      <RangeField label="Focus Y" value={bokeh.focusY} min={0} max={100} format={(v) => `${v}%`}
        onChange={(v) => setBokeh((b) => ({ ...b, focusY: v }))} />
      <RangeField label="Focus size" value={bokeh.radius} min={10} max={80} format={(v) => `${v}%`}
        onChange={(v) => setBokeh((b) => ({ ...b, radius: v }))} />
      <RangeField label="Feather" value={bokeh.feather} min={0} max={100} format={(v) => `${v}%`}
        onChange={(v) => setBokeh((b) => ({ ...b, feather: v }))} />
      <RangeField label="Blur strength" value={bokeh.strength} min={5} max={100} format={(v) => `${v}%`}
        onChange={(v) => setBokeh((b) => ({ ...b, strength: v }))} />
      <button type="button" className="btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
        disabled={busy === 'bokeh'} onClick={applyBokehEffect}>
        <Aperture /> {busy === 'bokeh' ? 'Applying…' : 'Apply bokeh blur'}
      </button>
      <p className="empty-hint" style={{ padding: '4px 0' }}>
        Keeps a soft focus circle sharp and blurs the rest — not subject-aware, so center the focus point on your subject first.
      </p>
    </>
  );
}
