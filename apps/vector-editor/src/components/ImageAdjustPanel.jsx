import { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Sparkles,
  Wand2,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Undo,
  Focus,
  Droplets,
  Contrast,
  Palette,
  Grid2x2,
  CircleDot,
} from 'lucide-react';
import { useDoc } from '../state/DocumentContext.jsx';
import { RangeField } from './ui/field.jsx';
import CurvesEditor from './CurvesEditor.jsx';
import { developRemote, dropRemote } from '../lib/developClient.js';
import { canvasFromDataUrl, canvasToUrl, reduceNoise, applyBokeh } from '../lib/rasterTools.js';
import {
  DEVELOP_DEFAULT,
  isDevelopNeutral,
  previewCopy,
  computeHistogram,
  autoDevelop,
  unsharpMask,
  gaussianBlur,
  grayscale,
  sepia,
  invert,
  posterize,
  vignette,
  flipCanvas,
  rotateCanvas90,
} from '../lib/photoFilters.js';

const signed = (v) => (v > 0 ? `+${v}` : `${v}`);

const DEVELOP_GROUPS = [
  ['White balance', [
    ['temperature', 'Temp', -100, 100, 1, signed],
    ['tint', 'Tint', -100, 100, 1, signed],
  ]],
  ['Tone', [
    ['exposure', 'Exposure', -100, 100, 1, (v) => `${v > 0 ? '+' : ''}${((v / 100) * 3).toFixed(1)}EV`],
    ['contrast', 'Contrast', -100, 100, 1, signed],
    ['highlights', 'Highlights', -100, 100, 1, signed],
    ['shadows', 'Shadows', -100, 100, 1, signed],
    ['whites', 'Whites', -100, 100, 1, signed],
    ['blacks', 'Blacks', -100, 100, 1, signed],
  ]],
  ['Levels', [
    ['levelsBlack', 'Black pt', 0, 254, 1, (v) => v],
    ['levelsGamma', 'Midtones', 0.1, 3, 0.01, (v) => v.toFixed(2)],
    ['levelsWhite', 'White pt', 1, 255, 1, (v) => v],
  ]],
  ['Color', [
    ['vibrance', 'Vibrance', -100, 100, 1, signed],
    ['saturation', 'Saturation', -100, 100, 1, signed],
    ['hue', 'Hue', -180, 180, 1, (v) => `${v}°`],
  ]],
];

function drawHistogram(canvasEl, hist) {
  if (!canvasEl || !hist) return;
  const w = (canvasEl.width = 256);
  const h = (canvasEl.height = 72);
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  // Normalize to the 99.5th-percentile bin so one spike (pure white sky,
  // a black border) doesn't flatten the rest of the graph.
  const all = [...hist.r, ...hist.g, ...hist.b].sort((a, b) => a - b);
  const peak = Math.max(1, all[Math.floor(all.length * 0.995)]);
  const fill = (bins, color) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) ctx.lineTo(i, h - Math.min(1, bins[i] / peak) * (h - 2));
    ctx.lineTo(255, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  fill(hist.l, 'rgba(82, 98, 74, 0.28)');
  fill(hist.r, 'rgba(214, 60, 50, 0.32)');
  fill(hist.g, 'rgba(63, 143, 69, 0.32)');
  fill(hist.b, 'rgba(40, 90, 200, 0.32)');
}

let sessionSeq = 0;

function imageDataOf(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

function dropSession(key) {
  if (!key) return;
  dropRemote(`${key}-p`);
  dropRemote(`${key}-f`);
}

function decodeSrc(src) {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

// Develop (white balance / tone / curves / levels / color), filters,
// transforms, noise reduction and bokeh for the selected image layer.
//
// Develop settings are non-compounding within a session: they always
// re-render from `base`, the image as it was when the session began.
// While dragging, a ≤1600px preview is developed in a worker and painted
// straight into a live canvas the stage shows in place of the layer — no
// encoding and no document update per frame, so the slider never waits on
// the pixels. On release the full-resolution result is developed in a
// second worker and committed as a single undo step. Any edit made
// elsewhere (a brush stroke, crop, filter, undo) starts a fresh session
// with neutral settings.
export default function ImageAdjustPanel({ image }) {
  const { doc, setDoc, objects, patchObjectsLive, setLiveLayer, updateObjects, getSnapshot, pushUndoPoint, showToast } = useDoc();

  const sessionRef = useRef({ id: null, key: null, base: null, preview: null, baseSrc: null, live: null });
  // src -> develop settings for every result this panel committed (plus
  // the session's starting image), so the reset effect can tell our own
  // commit apart from "the image changed under us" — and so undo and redo
  // within a session put the sliders back where they were.
  const ownSrcsRef = useRef(new Map());
  const preRef = useRef(null);
  // genRef bumps on every settings change. paintedGenRef is the newest
  // generation on screen (a preview older than a landed commit must not
  // cover it); committingGenRef stops pointerup + keyup double commits.
  const genRef = useRef(0);
  const paintedGenRef = useRef(0);
  const committingGenRef = useRef(-1);
  const previewBusyRef = useRef(false);
  const previewWantedRef = useRef(false);
  const histCanvasRef = useRef(null);

  const [develop, setDevelop] = useState(DEVELOP_DEFAULT);
  const developRef = useRef(DEVELOP_DEFAULT);
  const [hist, setHist] = useState(null);
  const [denoiseStrength, setDenoiseStrength] = useState(30);
  const [bokeh, setBokeh] = useState({ focusX: 50, focusY: 50, radius: 45, feather: 60, strength: 55 });
  const [sharpen, setSharpen] = useState({ amount: 60, radius: 2 });
  const [blurRadius, setBlurRadius] = useState(6);
  const [posterLevels, setPosterLevels] = useState(5);
  const [vignetteAmount, setVignetteAmount] = useState(45);
  const [busy, setBusy] = useState(null);

  function clearLive(id) {
    setLiveLayer((l) => (l && l.id === id ? null : l));
  }

  useEffect(() => {
    const known = ownSrcsRef.current.get(image.src);
    if (known) {
      if (known !== developRef.current) {
        developRef.current = known;
        setDevelop(known);
      }
      return;
    }
    let cancelled = false;
    dropSession(sessionRef.current.key);
    const key = `dev-${++sessionSeq}`;
    genRef.current++;
    paintedGenRef.current = genRef.current;
    clearLive(image.id);
    sessionRef.current = { id: image.id, key, base: null, preview: null, baseSrc: image.src, live: null };
    ownSrcsRef.current = new Map([[image.src, DEVELOP_DEFAULT]]);
    developRef.current = DEVELOP_DEFAULT;
    setDevelop(DEVELOP_DEFAULT);
    canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight).then((canvas) => {
      if (cancelled) return;
      const preview = previewCopy(canvas);
      const live = document.createElement('canvas');
      live.width = preview.width;
      live.height = preview.height;
      sessionRef.current = { id: image.id, key, base: canvas, preview, baseSrc: image.src, live };
      setHist(computeHistogram(preview));
    });
    return () => {
      cancelled = true;
    };
  }, [image.id, image.src]);

  useEffect(() => () => dropSession(sessionRef.current.key), []);

  useEffect(() => drawHistogram(histCanvasRef.current, hist), [hist]);

  function writeOwnSrc(src, settings) {
    if (!ownSrcsRef.current.has(src)) ownSrcsRef.current.set(src, settings);
    patchObjectsLive([image.id], () => ({ src }));
  }

  // At most one preview in flight; whatever the settings are when it
  // returns is what gets rendered next, so fast drags skip stale frames
  // instead of queueing them.
  async function pumpPreview() {
    const s = sessionRef.current;
    if (previewBusyRef.current || !previewWantedRef.current || !s.preview) return;
    previewWantedRef.current = false;
    previewBusyRef.current = true;
    const gen = genRef.current;
    let res = null;
    try {
      res = await developRemote('preview', `${s.key}-p`, () => imageDataOf(s.preview), developRef.current, { hist: true });
    } finally {
      previewBusyRef.current = false;
    }
    if (sessionRef.current === s && gen > paintedGenRef.current) {
      paintedGenRef.current = gen;
      s.live.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.buffer), res.width, res.height), 0, 0);
      setLiveLayer((l) => (l && l.id === s.id && l.canvas === s.live ? l : { id: s.id, canvas: s.live }));
      setHist(res.hist);
    }
    pumpPreview();
  }

  function requestPreview() {
    previewWantedRef.current = true;
    pumpPreview();
  }

  function beginEdit() {
    if (!preRef.current) preRef.current = getSnapshot();
  }

  async function commitFull() {
    const s = sessionRef.current;
    if (!s.base || !preRef.current) return;
    const gen = genRef.current;
    if (committingGenRef.current === gen) return;
    committingGenRef.current = gen;
    const settings = developRef.current;
    const stale = () => gen !== genRef.current || sessionRef.current !== s;
    let src = s.baseSrc;
    if (!isDevelopNeutral(settings)) {
      const res = await developRemote('full', `${s.key}-f`, () => imageDataOf(s.base), settings);
      if (stale()) return;
      const out = document.createElement('canvas');
      out.width = res.width;
      out.height = res.height;
      out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.buffer), res.width, res.height), 0, 0);
      src = await canvasToUrl(out);
      if (stale()) return;
      // Swap the live preview out only once the full image can paint, so
      // the layer never flashes empty between the two.
      await decodeSrc(src);
      if (stale()) return;
    }
    paintedGenRef.current = gen;
    writeOwnSrc(src, settings);
    pushUndoPoint(preRef.current);
    preRef.current = null;
    clearLive(s.id);
  }

  function setDevelopValue(key, value) {
    beginEdit();
    genRef.current++;
    const next = { ...developRef.current, [key]: value };
    developRef.current = next;
    setDevelop(next);
    requestPreview();
  }

  function applyDevelopPreset(next) {
    beginEdit();
    genRef.current++;
    developRef.current = next;
    setDevelop(next);
    requestPreview();
    commitFull();
  }

  function runAuto() {
    const { preview } = sessionRef.current;
    if (!preview) return;
    applyDevelopPreset({ ...DEVELOP_DEFAULT, ...autoDevelop(preview) });
    showToast('Auto tone & color applied');
  }

  // One-shot full-resolution operation, committed as one undo step.
  async function runPixelOp(key, op, label) {
    setBusy(key);
    await new Promise((r) => setTimeout(r, 16));
    try {
      const canvas = await canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight);
      const result = op(canvas) || canvas;
      const src = await canvasToUrl(result);
      updateObjects([image.id], () => ({
        src,
        pixelWidth: result.width,
        pixelHeight: result.height,
      }));
      if (label) showToast(label);
    } finally {
      setBusy(null);
    }
  }

  // Rotating swaps the layer's on-canvas box around its center. When the
  // photo *is* the document (opened into an empty canvas), the document
  // turns with it, like Photoshop's Image › Image Rotation.
  async function rotate(clockwise) {
    setBusy(clockwise ? 'rotcw' : 'rotccw');
    try {
      const canvas = await canvasFromDataUrl(image.src, image.pixelWidth, image.pixelHeight);
      const out = rotateCanvas90(canvas, clockwise);
      const src = await canvasToUrl(out);
      const isDocPhoto =
        objects.length === 1 && image.x === 0 && image.y === 0 && image.width === doc.width && image.height === doc.height;
      const pre = getSnapshot();
      if (isDocPhoto) {
        setDoc((d) => ({ ...d, width: d.height, height: d.width }));
        patchObjectsLive([image.id], () => ({
          src, x: 0, y: 0, width: image.height, height: image.width, pixelWidth: out.width, pixelHeight: out.height,
        }));
      } else {
        const cx = image.x + image.width / 2;
        const cy = image.y + image.height / 2;
        patchObjectsLive([image.id], () => ({
          src,
          x: cx - image.height / 2,
          y: cy - image.width / 2,
          width: image.height,
          height: image.width,
          pixelWidth: out.width,
          pixelHeight: out.height,
        }));
      }
      pushUndoPoint(pre);
    } finally {
      setBusy(null);
    }
  }

  async function applyDenoise() {
    await runPixelOp('denoise', (c) => reduceNoise(c.getContext('2d', { willReadFrequently: true }), denoiseStrength), 'Noise reduced');
  }

  async function applyBokehEffect() {
    await runPixelOp('bokeh', (base) => {
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
      return working;
    }, 'Bokeh applied');
  }

  // Filter radii are given relative to a 1000px image, so a filter looks
  // the same on a phone snapshot and on a 6000px RAW.
  const pxScale = Math.max(1, Math.max(image.pixelWidth, image.pixelHeight) / 1000);

  const dragHandlers = { onPointerUp: commitFull, onKeyUp: commitFull };
  const meta = image.rawMeta;
  const rawStatusText = {
    decoding: 'Showing camera preview — decoding RAW sensor data…',
    raw: 'Decoded from RAW sensor data',
    'preview-only': "Using the camera's embedded preview (this RAW variant can't be decoded)",
    'preview-edited': 'Edited on the camera preview (edits kept)',
  }[image.rawStatus];
  const btn = { width: '100%', justifyContent: 'center', marginBottom: 8 };

  return (
    <>
      {image.rawFormat && (
        <div className="raw-badge">
          <strong>{image.rawFormat} RAW</strong>
          {[meta?.camera, meta?.iso && `ISO ${meta.iso}`, meta?.shutter, meta?.aperture, meta?.focal]
            .filter(Boolean)
            .map((t) => <span key={t}>{t}</span>)}
          {rawStatusText && <span className="raw-status">{rawStatusText}</span>}
        </div>
      )}

      <div className="panel-section-title">Develop</div>
      <canvas ref={histCanvasRef} className="histogram" aria-label="Histogram" />
      <div className="panel-btn-row">
        <button type="button" className="btn-sm" onClick={runAuto} title="Auto tone (levels) and auto color (white balance)">
          <Wand2 /> Auto
        </button>
        <button type="button" className="btn-sm" disabled={isDevelopNeutral(develop)}
          onClick={() => applyDevelopPreset(DEVELOP_DEFAULT)} title="Reset all develop sliders">
          <Undo /> Reset
        </button>
      </div>
      {DEVELOP_GROUPS.map(([group, fields]) => (
        <div key={group}>
          <div className="subsection-label">{group}</div>
          {fields.map(([key, label, min, max, step, format]) => (
            <RangeField key={key} label={label} value={develop[key]} min={min} max={max} step={step} format={format}
              onChange={(v) => setDevelopValue(key, v)}
              onDoubleClick={() => { setDevelopValue(key, DEVELOP_DEFAULT[key]); commitFull(); }}
              title="Double-click to reset"
              {...dragHandlers} />
          ))}
          {group === 'Tone' && (
            <>
              <div className="subsection-label">Curves</div>
              <CurvesEditor curves={develop.curves} hist={hist}
                onChange={(c) => setDevelopValue('curves', c)} onCommit={commitFull} />
            </>
          )}
        </div>
      ))}

      <div className="panel-section-title">Transform</div>
      <div className="grid-2">
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => rotate(false)}><RotateCcw /> Rotate left</button>
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => rotate(true)}><RotateCw /> Rotate right</button>
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => runPixelOp('fliph', (c) => flipCanvas(c, 'h'))}><FlipHorizontal2 /> Flip H</button>
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => runPixelOp('flipv', (c) => flipCanvas(c, 'v'))}><FlipVertical2 /> Flip V</button>
      </div>

      <div className="panel-section-title">Filters</div>
      <div className="subsection-label">Sharpen (unsharp mask)</div>
      <RangeField label="Amount" value={sharpen.amount} min={10} max={200} format={(v) => `${v}%`}
        onChange={(v) => setSharpen((s) => ({ ...s, amount: v }))} />
      <RangeField label="Radius" value={sharpen.radius} min={0.5} max={8} step={0.5} format={(v) => `${v}px`}
        onChange={(v) => setSharpen((s) => ({ ...s, radius: v }))} />
      <button type="button" className="btn-sm" style={btn} disabled={!!busy}
        onClick={() => runPixelOp('sharpen', (c) => unsharpMask(c, { amount: sharpen.amount / 100, radius: sharpen.radius * Math.sqrt(pxScale) }), 'Sharpened')}>
        <Focus /> {busy === 'sharpen' ? 'Sharpening…' : 'Sharpen'}
      </button>

      <div className="subsection-label">Gaussian blur</div>
      <RangeField label="Radius" value={blurRadius} min={1} max={50} format={(v) => `${v}px`} onChange={setBlurRadius} />
      <button type="button" className="btn-sm" style={btn} disabled={!!busy}
        onClick={() => runPixelOp('gblur', (c) => gaussianBlur(c, blurRadius * pxScale), 'Blurred')}>
        <Droplets /> {busy === 'gblur' ? 'Blurring…' : 'Blur image'}
      </button>

      <div className="subsection-label">Effects</div>
      <div className="btn-grid-3">
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => runPixelOp('bw', grayscale, 'Converted to black & white')}><Contrast /> B&amp;W</button>
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => runPixelOp('sepia', sepia, 'Sepia applied')}><Palette /> Sepia</button>
        <button type="button" className="btn-sm" disabled={!!busy} onClick={() => runPixelOp('invert', invert, 'Inverted')}><Contrast /> Invert</button>
      </div>
      <RangeField label="Levels" value={posterLevels} min={2} max={16} onChange={setPosterLevels} />
      <button type="button" className="btn-sm" style={btn} disabled={!!busy}
        onClick={() => runPixelOp('poster', (c) => posterize(c, posterLevels), 'Posterized')}>
        <Grid2x2 /> Posterize
      </button>
      <RangeField label="Vignette" value={vignetteAmount} min={5} max={95} format={(v) => `${v}%`} onChange={setVignetteAmount} />
      <button type="button" className="btn-sm" style={btn} disabled={!!busy}
        onClick={() => runPixelOp('vignette', (c) => vignette(c, vignetteAmount / 100), 'Vignette applied')}>
        <CircleDot /> Add vignette
      </button>

      <div className="panel-section-title">Reduce noise</div>
      <RangeField label="Strength" value={denoiseStrength} min={0} max={100} onChange={setDenoiseStrength} format={(v) => `${v}%`} />
      <button type="button" className="btn-sm" style={btn} disabled={!!busy} onClick={applyDenoise}>
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
      <button type="button" className="btn-sm" style={btn} disabled={!!busy} onClick={applyBokehEffect}>
        <Aperture /> {busy === 'bokeh' ? 'Applying…' : 'Apply bokeh blur'}
      </button>
      <p className="empty-hint" style={{ padding: '4px 0' }}>
        Keeps a soft focus circle sharp and blurs the rest — not subject-aware, so center the focus point on your subject first.
      </p>
    </>
  );
}
