// Renders one document object as real SVG markup. Every type is wrapped in
// the same translate+rotate <g> so move/resize/rotate logic in CanvasStage
// stays identical regardless of shape type — only the inner element (and
// its local-coordinate geometry) differs per type.
export default function ObjectRenderer({ obj, editingTextId }) {
  if (!obj.visible) return null;
  const { x, y, width, height, rotation } = obj;
  const transform = `translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2})`;
  const commonStyle = { opacity: obj.opacity };

  let inner = null;
  switch (obj.type) {
    case 'rect':
      inner = (
        <rect
          width={width}
          height={height}
          rx={obj.rx || 0}
          fill={obj.fill}
          fillOpacity={obj.fillOpacity}
          stroke={obj.strokeWidth ? obj.stroke : 'none'}
          strokeWidth={obj.strokeWidth}
          strokeOpacity={obj.strokeOpacity}
        />
      );
      break;
    case 'ellipse':
      inner = (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={obj.fill}
          fillOpacity={obj.fillOpacity}
          stroke={obj.strokeWidth ? obj.stroke : 'none'}
          strokeWidth={obj.strokeWidth}
          strokeOpacity={obj.strokeOpacity}
        />
      );
      break;
    case 'line':
      inner = (
        <line
          x1={obj.x1}
          y1={obj.y1}
          x2={obj.x2}
          y2={obj.y2}
          stroke={obj.stroke}
          strokeWidth={obj.strokeWidth}
          strokeOpacity={obj.strokeOpacity}
          strokeLinecap="round"
        />
      );
      break;
    case 'path': {
      const pts = obj.points.map((p) => p.join(',')).join(' ');
      const Tag = obj.closed ? 'polygon' : 'polyline';
      inner = (
        <Tag
          points={pts}
          fill={obj.closed ? obj.fill : 'none'}
          fillOpacity={obj.fillOpacity}
          stroke={obj.stroke}
          strokeWidth={obj.strokeWidth}
          strokeOpacity={obj.strokeOpacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
      break;
    }
    case 'text':
      inner = (
        <text
          x={obj.align === 'center' ? width / 2 : obj.align === 'right' ? width : 0}
          y={obj.fontSize}
          fill={obj.fill}
          fillOpacity={obj.fillOpacity}
          fontSize={obj.fontSize}
          fontFamily={obj.fontFamily}
          fontWeight={obj.fontWeight}
          textAnchor={obj.align === 'center' ? 'middle' : obj.align === 'right' ? 'end' : 'start'}
          style={{ whiteSpace: 'pre', visibility: editingTextId === obj.id ? 'hidden' : 'visible' }}
        >
          {obj.content.split('\n').map((line, i) => (
            <tspan
              key={i}
              x={obj.align === 'center' ? width / 2 : obj.align === 'right' ? width : 0}
              dy={i === 0 ? 0 : obj.fontSize * 1.2}
            >
              {line || ' '}
            </tspan>
          ))}
        </text>
      );
      break;
    case 'image':
      inner = (
        <image
          href={obj.src}
          width={width}
          height={height}
          preserveAspectRatio="none"
        />
      );
      break;
    default:
      inner = null;
  }

  return (
    <g
      transform={transform}
      style={commonStyle}
      data-obj-id={obj.id}
      pointerEvents={obj.locked ? 'none' : 'auto'}
    >
      {inner}
      {/* Invisible full-bbox hit area so thin/unfilled shapes (lines,
          open paths, text) are still easy to click/drag anywhere inside
          their bounds, matching most editors' selection behavior. */}
      <rect width={width} height={height} fill="rgba(0,0,0,0)" stroke="none" />
    </g>
  );
}
