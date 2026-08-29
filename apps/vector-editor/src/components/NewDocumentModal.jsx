import { useState } from 'react';
import { useDoc } from '../state/DocumentContext.jsx';

const PRESETS = [
  { name: 'Instagram Post', width: 1080, height: 1080 },
  { name: 'Instagram Story', width: 1080, height: 1920 },
  { name: 'YouTube Thumbnail', width: 1280, height: 720 },
  { name: 'Facebook Cover', width: 820, height: 312 },
  { name: 'A4 Print (300dpi)', width: 2480, height: 3508 },
  { name: 'Letter Print (300dpi)', width: 2550, height: 3300 },
  { name: 'US Business Card', width: 1050, height: 600 },
  { name: 'Desktop Wallpaper', width: 1920, height: 1080 },
];

export default function NewDocumentModal({ onClose }) {
  const { newDocument } = useDoc();
  const [name, setName] = useState('Untitled');
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [background, setBackground] = useState('#ffffff');
  const [activePreset, setActivePreset] = useState(0);

  const applyPreset = (i) => {
    setActivePreset(i);
    setWidth(PRESETS[i].width);
    setHeight(PRESETS[i].height);
  };

  const create = () => {
    newDocument({
      name: name || 'Untitled',
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      background,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <h2>New document</h2>

        <div className="field-row">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="panel-section-title">Presets</div>
        <div className="preset-grid">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className={`preset-btn ${activePreset === i ? 'active' : ''}`}
              onClick={() => applyPreset(i)}
            >
              {p.name}
              <span className="preset-dim">{p.width} × {p.height}</span>
            </button>
          ))}
        </div>

        <div className="panel-section-title">Custom size</div>
        <div className="grid-2">
          <div className="field-row">
            <label>Width</label>
            <input
              type="number"
              min="1"
              value={width}
              onChange={(e) => {
                setActivePreset(-1);
                setWidth(Number(e.target.value));
              }}
            />
          </div>
          <div className="field-row">
            <label>Height</label>
            <input
              type="number"
              min="1"
              value={height}
              onChange={(e) => {
                setActivePreset(-1);
                setHeight(Number(e.target.value));
              }}
            />
          </div>
        </div>

        <div className="field-row field-row-bg">
          <label>Background</label>
          <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={create}>Create</button>
        </div>
      </div>
    </div>
  );
}
