import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Copy,
  Trash2,
  Group,
  Ungroup,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Crop,
  Wand2,
} from 'lucide-react';
import { useDoc } from '../state/DocumentContext.jsx';

const PAINT_TOOLS = ['brush', 'eraser', 'blur', 'burn', 'dodge'];
const FONTS = ['system-ui, sans-serif', 'Georgia, serif', '"Courier New", monospace', 'Impact, sans-serif'];

function Field({ label, children }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

function RangeField({ label, value, min, max, step = 1, onChange, format = (v) => v }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="field-val">{format(value)}</span>
    </div>
  );
}

export default function PropertiesPanel() {
  const {
    doc,
    setDoc,
    selectedIds,
    selectedObjects,
    activeTool,
    updateObjects,
    removeObjects,
    duplicateSelected,
    zOrderMove,
    groupSelected,
    ungroupSelected,
    alignSelected,
    setActiveTool,
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
  } = useDoc();

  if (PAINT_TOOLS.includes(activeTool)) {
    return (
      <div className="panel-scroll">
        <div className="panel-section-title">{activeTool} settings</div>
        <RangeField label="Size" value={brushSize} min={2} max={200} onChange={setBrushSize} />
        {activeTool === 'brush' && (
          <>
            <Field label="Color">
              <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} />
            </Field>
            <RangeField label="Opacity" value={brushOpacity} min={0.05} max={1} step={0.05} onChange={setBrushOpacity} format={(v) => `${Math.round(v * 100)}%`} />
            <RangeField label="Hardness" value={brushHardness} min={0} max={1} step={0.05} onChange={setBrushHardness} format={(v) => `${Math.round(v * 100)}%`} />
          </>
        )}
        {(activeTool === 'burn' || activeTool === 'dodge') && (
          <RangeField label="Strength" value={brushStrength} min={0.05} max={1} step={0.05} onChange={setBrushStrength} format={(v) => `${Math.round(v * 100)}%`} />
        )}
        <p className="empty-hint">Paint on an image layer. Pick an image first, or start brushing on empty canvas to create one.</p>
      </div>
    );
  }

  if (activeTool === 'bg-eyedropper') {
    return (
      <div className="panel-scroll">
        <div className="panel-section-title">Background removal</div>
        <RangeField label="Tolerance" value={bgTolerance} min={5} max={120} onChange={setBgTolerance} />
        <p className="empty-hint">Click a pixel on the selected image to key out that color as transparent.</p>
      </div>
    );
  }

  if (selectedObjects.length === 0) {
    return (
      <div className="panel-scroll">
        <div className="panel-section-title">Document</div>
        <Field label="Name">
          <input type="text" value={doc.name} onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))} />
        </Field>
        <div className="grid-2">
          <Field label="Width">
            <input type="number" min="1" value={doc.width} onChange={(e) => setDoc((d) => ({ ...d, width: Math.max(1, Number(e.target.value)) }))} />
          </Field>
          <Field label="Height">
            <input type="number" min="1" value={doc.height} onChange={(e) => setDoc((d) => ({ ...d, height: Math.max(1, Number(e.target.value)) }))} />
          </Field>
        </div>
        <Field label="Background">
          <input type="color" value={doc.background} onChange={(e) => setDoc((d) => ({ ...d, background: e.target.value }))} />
        </Field>
        <p className="empty-hint">Nothing selected.<br />Pick a tool from the left rail, or click a layer to edit it.</p>
      </div>
    );
  }

  const single = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const patch = (p) => updateObjects(selectedIds, () => p);

  return (
    <div className="panel-scroll">
      {single && (
        <>
          <div className="panel-section-title">{single.name}</div>
          <Field label="Name">
            <input
              type="text"
              value={single.name}
              onChange={(e) => updateObjects([single.id], () => ({ name: e.target.value }))}
            />
          </Field>
        </>
      )}
      {!single && <div className="panel-section-title">{selectedObjects.length} objects selected</div>}

      <div className="grid-2">
        <Field label="X">
          <input type="number" value={Math.round(single ? single.x : selectedObjects[0].x)} disabled={!single}
            onChange={(e) => single && updateObjects([single.id], () => ({ x: Number(e.target.value) }))} />
        </Field>
        <Field label="Y">
          <input type="number" value={Math.round(single ? single.y : selectedObjects[0].y)} disabled={!single}
            onChange={(e) => single && updateObjects([single.id], () => ({ y: Number(e.target.value) }))} />
        </Field>
        <Field label="W">
          <input type="number" min="1" value={Math.round(single ? single.width : selectedObjects[0].width)} disabled={!single}
            onChange={(e) => single && updateObjects([single.id], () => ({ width: Math.max(1, Number(e.target.value)) }))} />
        </Field>
        <Field label="H">
          <input type="number" min="1" value={Math.round(single ? single.height : selectedObjects[0].height)} disabled={!single}
            onChange={(e) => single && updateObjects([single.id], () => ({ height: Math.max(1, Number(e.target.value)) }))} />
        </Field>
      </div>

      {single && (
        <RangeField label="Rotate" value={Math.round(single.rotation)} min={0} max={359}
          onChange={(v) => updateObjects([single.id], () => ({ rotation: v }))} format={(v) => `${v}°`} />
      )}
      <RangeField label="Opacity" value={single ? single.opacity : 1} min={0} max={1} step={0.05}
        onChange={(v) => patch({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />

      {single && single.type === 'text' && (
        <>
          <div className="panel-section-title">Text</div>
          <Field label="Content">
            <textarea rows={2} value={single.content} onChange={(e) => updateObjects([single.id], () => ({ content: e.target.value }))} />
          </Field>
          <div className="grid-2">
            <Field label="Size">
              <input type="number" min="4" value={single.fontSize} onChange={(e) => updateObjects([single.id], () => ({ fontSize: Number(e.target.value) }))} />
            </Field>
            <Field label="Weight">
              <select value={single.fontWeight} onChange={(e) => updateObjects([single.id], () => ({ fontWeight: Number(e.target.value) }))}>
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
                <option value={900}>Black</option>
              </select>
            </Field>
          </div>
          <Field label="Font">
            <select value={single.fontFamily} onChange={(e) => updateObjects([single.id], () => ({ fontFamily: e.target.value }))}>
              {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}
            </select>
          </Field>
          <Field label="Align">
            <select value={single.align} onChange={(e) => updateObjects([single.id], () => ({ align: e.target.value }))}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Color">
            <input type="color" value={single.fill} onChange={(e) => updateObjects([single.id], () => ({ fill: e.target.value }))} />
          </Field>
        </>
      )}

      {single && single.type === 'image' && (
        <>
          <div className="panel-section-title">Image</div>
          <p className="empty-hint" style={{ padding: '4px 0' }}>
            {single.pixelWidth} × {single.pixelHeight}px source
          </p>
          <button type="button" className="btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={() => setActiveTool('crop')}>
            <Crop /> Crop
          </button>
          <button type="button" className="btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={() => window.__vectorStudio?.runRemoveBackground()}>
            <Wand2 /> Remove background (auto)
          </button>
        </>
      )}

      {single && ['rect', 'ellipse', 'path'].includes(single.type) && (
        <>
          <div className="panel-section-title">Fill</div>
          <div className="grid-2">
            <Field label="Color">
              <input type="color" value={single.fill === 'none' ? '#000000' : single.fill}
                onChange={(e) => updateObjects([single.id], () => ({ fill: e.target.value }))} />
            </Field>
            <Field label="Opacity">
              <input type="range" min={0} max={1} step={0.05} value={single.fillOpacity}
                onChange={(e) => updateObjects([single.id], () => ({ fillOpacity: Number(e.target.value) }))} />
            </Field>
          </div>
          {single.type === 'rect' && (
            <RangeField label="Corner" value={single.rx || 0} min={0} max={Math.max(1, Math.round(Math.min(single.width, single.height) / 2))}
              onChange={(v) => updateObjects([single.id], () => ({ rx: v }))} />
          )}
        </>
      )}

      {single && ['rect', 'ellipse', 'line', 'path'].includes(single.type) && (
        <>
          <div className="panel-section-title">Stroke</div>
          <div className="grid-2">
            <Field label="Color">
              <input type="color" value={single.stroke === 'none' ? '#000000' : single.stroke}
                onChange={(e) => updateObjects([single.id], () => ({ stroke: e.target.value }))} />
            </Field>
            <Field label="Width">
              <input type="number" min="0" value={single.strokeWidth}
                onChange={(e) => updateObjects([single.id], () => ({ strokeWidth: Math.max(0, Number(e.target.value)) }))} />
            </Field>
          </div>
        </>
      )}

      {selectedObjects.length > 1 && (
        <>
          <div className="panel-section-title">Align</div>
          <div className="grid-2">
            <button type="button" className="btn-sm" onClick={() => alignSelected('left')}><AlignHorizontalJustifyStart /> Left</button>
            <button type="button" className="btn-sm" onClick={() => alignSelected('centerH')}><AlignHorizontalJustifyCenter /> Center H</button>
            <button type="button" className="btn-sm" onClick={() => alignSelected('right')}><AlignHorizontalJustifyEnd /> Right</button>
            <button type="button" className="btn-sm" onClick={() => alignSelected('top')}><AlignVerticalJustifyStart /> Top</button>
            <button type="button" className="btn-sm" onClick={() => alignSelected('centerV')}><AlignVerticalJustifyCenter /> Center V</button>
            <button type="button" className="btn-sm" onClick={() => alignSelected('bottom')}><AlignVerticalJustifyEnd /> Bottom</button>
          </div>
        </>
      )}

      <div className="panel-section-title">Arrange</div>
      <div className="grid-2">
        <button type="button" className="btn-sm" onClick={() => zOrderMove(selectedIds, 'front')}><ChevronsUp /> To front</button>
        <button type="button" className="btn-sm" onClick={() => zOrderMove(selectedIds, 'forward')}><ChevronUp /> Forward</button>
        <button type="button" className="btn-sm" onClick={() => zOrderMove(selectedIds, 'backward')}><ChevronDown /> Backward</button>
        <button type="button" className="btn-sm" onClick={() => zOrderMove(selectedIds, 'back')}><ChevronsDown /> To back</button>
      </div>
      {selectedObjects.length > 1 && (
        <div className="grid-2">
          <button type="button" className="btn-sm" onClick={groupSelected}><Group /> Group</button>
          <button type="button" className="btn-sm" onClick={ungroupSelected}><Ungroup /> Ungroup</button>
        </div>
      )}
      <div className="grid-2">
        <button type="button" className="btn-sm" onClick={duplicateSelected}><Copy /> Duplicate</button>
        <button type="button" className="btn-sm" onClick={() => removeObjects(selectedIds)}><Trash2 /> Delete</button>
      </div>
    </div>
  );
}
