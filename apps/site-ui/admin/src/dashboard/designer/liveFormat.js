// Client-side mirror of /root/bots/site-designer/lib/cssVars.js's value
// formatting — needed so a field edit can be sent to the preview iframe as
// the exact CSS string to apply live, with no server round-trip. Small,
// deliberate duplication (this admin panel and the landing app are two
// separately deployed apps, sharing no build) — keep in sync with
// cssVars.js's writeField if a new format is ever added there. Gradient
// presets are NOT resolved here - the preset name is sent as-is with
// `preset: true`, and DesignerBridge.jsx (landing side) holds its own copy
// of the preset table, same reasoning.
function formatRgba({ hex, alpha }) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function formatCssValue(field, value) {
  const { target } = field;
  if (target.preset) return { value, preset: true };
  switch (target.format) {
    case 'blurPx':
      return { value: `blur(${Number(value)}px)` };
    case 'px':
      return { value: `${Number(value)}px` };
    case 'rgbaAlpha':
      return { value: formatRgba(value) };
    case 'raw':
      return { value: String(value) };
    default:
      return { value };
  }
}
