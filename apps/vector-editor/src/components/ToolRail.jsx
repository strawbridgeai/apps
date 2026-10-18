import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Minus,
  PenTool,
  Type,
  Crop,
  Pipette,
  Brush,
  Eraser,
  Droplets,
  Flame,
  SunMedium,
  Stamp,
  Bandage,
  Pointer,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDoc } from '../state/DocumentContext.jsx';

// Single-key shortcuts (Photoshop's letters where it has one).
export const TOOL_SHORTCUTS = {};

const SHAPE_TOOLS = [
  { id: 'select', key: 'V', label: 'Select', Icon: MousePointer2 },
  { id: 'pan', key: 'H', label: 'Pan', hint: 'Hold Space to pan with any tool', Icon: Hand },
];

const DRAW_TOOLS = [
  { id: 'rect', key: 'U', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'pen', key: 'P', label: 'Pen', hint: 'Click points; Enter or click the first point to finish', Icon: PenTool },
  { id: 'text', key: 'T', label: 'Text', Icon: Type },
];

const IMAGE_TOOLS = [
  { id: 'crop', key: 'C', label: 'Crop image', Icon: Crop, needsImage: true },
  { id: 'bg-eyedropper', label: 'Background remover', hint: 'Click a color to remove it', Icon: Pipette, needsImage: true },
];

const PAINT_TOOLS = [
  { id: 'brush', key: 'B', label: 'Brush', Icon: Brush },
  { id: 'eraser', key: 'E', label: 'Eraser', Icon: Eraser, needsImage: true },
  { id: 'blur', label: 'Blur', Icon: Droplets, needsImage: true },
  { id: 'burn', label: 'Burn (darken)', Icon: Flame, needsImage: true },
  { id: 'dodge', label: 'Dodge (lighten)', Icon: SunMedium, needsImage: true },
];

const RETOUCH_TOOLS = [
  { id: 'spot', key: 'J', label: 'Spot heal', hint: 'Paint over a blemish to remove it', Icon: Sparkles, needsImage: true },
  { id: 'clone', key: 'S', label: 'Clone stamp', hint: 'Alt-click to set the source', Icon: Stamp, needsImage: true },
  { id: 'heal', label: 'Healing brush', hint: 'Alt-click to set the source', Icon: Bandage, needsImage: true },
  { id: 'smudge', label: 'Smudge', Icon: Pointer, needsImage: true },
];

for (const t of [...SHAPE_TOOLS, ...DRAW_TOOLS, ...IMAGE_TOOLS, ...PAINT_TOOLS, ...RETOUCH_TOOLS]) {
  if (t.key) TOOL_SHORTCUTS[t.key.toLowerCase()] = t.id;
}

export default function ToolRail() {
  const { activeTool, setActiveTool, selectedObjects } = useDoc();
  const hasImage = selectedObjects.length === 1 && selectedObjects[0].type === 'image';
  const [tip, setTip] = useState(null);

  const showTip = (e, tool) => {
    const r = e.currentTarget.getBoundingClientRect();
    const hint = tool.needsImage && !hasImage ? 'Select an image layer first' : tool.hint;
    setTip({ label: tool.label, shortcut: tool.key, hint, left: r.right + 10, top: r.top + r.height / 2 });
  };

  const renderGroup = (tools) =>
    tools.map((tool) => {
      const { id, label, Icon } = tool;
      return (
        <button
          key={id}
          type="button"
          className={`tool-btn ${activeTool === id ? 'active' : ''}`}
          aria-label={label}
          data-tool={id}
          onPointerEnter={(e) => showTip(e, tool)}
          onPointerLeave={() => setTip(null)}
          onFocus={(e) => showTip(e, tool)}
          onBlur={() => setTip(null)}
          onClick={() => setActiveTool(id)}
        >
          <Icon />
        </button>
      );
    });

  return (
    <div className="tool-rail">
      {renderGroup(SHAPE_TOOLS)}
      <div className="tool-rail-sep" />
      {renderGroup(DRAW_TOOLS)}
      <div className="tool-rail-sep" />
      {renderGroup(IMAGE_TOOLS)}
      <div className="tool-rail-sep" />
      {renderGroup(PAINT_TOOLS)}
      <div className="tool-rail-sep" />
      {renderGroup(RETOUCH_TOOLS)}
      {tip &&
        createPortal(
          <div className="tool-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>
            {tip.label}
            {tip.shortcut && <kbd className="tool-tip-key">{tip.shortcut}</kbd>}
            {tip.hint && <span className="tool-tip-hint">{tip.hint}</span>}
          </div>,
          document.body
        )}
    </div>
  );
}
