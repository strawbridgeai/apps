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
} from 'lucide-react';
import { useDoc } from '../state/DocumentContext.jsx';

const SHAPE_TOOLS = [
  { id: 'select', label: 'Select (V)', Icon: MousePointer2 },
  { id: 'pan', label: 'Pan (Space)', Icon: Hand },
];

const DRAW_TOOLS = [
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'pen', label: 'Pen (click points, Enter/close to finish)', Icon: PenTool },
  { id: 'text', label: 'Text', Icon: Type },
];

const IMAGE_TOOLS = [
  { id: 'crop', label: 'Crop image', Icon: Crop, needsImage: true },
  { id: 'bg-eyedropper', label: 'Remove background by color pick', Icon: Pipette, needsImage: true },
];

const PAINT_TOOLS = [
  { id: 'brush', label: 'Brush', Icon: Brush },
  { id: 'eraser', label: 'Eraser (on image layers)', Icon: Eraser, needsImage: true },
  { id: 'blur', label: 'Blur', Icon: Droplets, needsImage: true },
  { id: 'burn', label: 'Burn (darken)', Icon: Flame, needsImage: true },
  { id: 'dodge', label: 'Dodge (lighten)', Icon: SunMedium, needsImage: true },
];

const RETOUCH_TOOLS = [
  { id: 'clone', label: 'Clone stamp (Alt-click to set source)', Icon: Stamp, needsImage: true },
  { id: 'heal', label: 'Healing brush (Alt-click to set source)', Icon: Bandage, needsImage: true },
  { id: 'smudge', label: 'Smudge', Icon: Pointer, needsImage: true },
];

export default function ToolRail() {
  const { activeTool, setActiveTool, selectedObjects } = useDoc();
  const hasImage = selectedObjects.length === 1 && selectedObjects[0].type === 'image';

  const renderGroup = (tools) =>
    tools.map(({ id, label, Icon, needsImage }) => (
      <button
        key={id}
        type="button"
        className={`tool-btn ${activeTool === id ? 'active' : ''}`}
        title={needsImage && !hasImage ? `${label} — select an image layer first` : label}
        onClick={() => setActiveTool(id)}
      >
        <Icon />
      </button>
    ));

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
    </div>
  );
}
