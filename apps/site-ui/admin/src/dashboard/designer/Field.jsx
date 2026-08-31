import { Input, Label } from '../../components/ui/input.jsx';
import { cn } from '../../lib/utils.js';

const GRADIENT_PRESET_LABEL = { none: 'None', 'forest-mist': 'Forest Mist', sunrise: 'Sunrise', lagoon: 'Lagoon' };
const ANIMATION_PRESET_LABEL = {
  none: 'None',
  'fade-up': 'Fade Up',
  'fade-in': 'Fade In',
  'zoom-in': 'Zoom In',
  'slide-left': 'Slide Left',
  'slide-right': 'Slide Right',
  'pin-zoom': 'Pin & Zoom',
  'pin-reveal': 'Pin & Wipe',
  'pin-stagger': 'Cascade In',
};

function FieldRow({ label, children, align = 'center' }) {
  return (
    <div
      className={cn(
        'flex justify-between gap-4 border-b border-[var(--border)] py-2.5 last:border-0',
        align === 'start' ? 'items-start' : 'items-center'
      )}
    >
      <Label className="shrink-0">{label}</Label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function ColorField({ field, value, onChange }) {
  const hex = value || '#000000';
  return (
    <FieldRow label={field.label}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(field.id, e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border border-[var(--border)] bg-transparent p-0.5"
      />
      <span className="w-16 font-mono text-xs text-[var(--text-faint)]">{hex}</span>
    </FieldRow>
  );
}

function AlphaColorField({ field, value, onChange }) {
  const hex = value?.hex ?? '#000000';
  const alpha = value?.alpha ?? 1;
  return (
    <FieldRow label={field.label}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(field.id, { hex: e.target.value, alpha })}
        className="h-8 w-10 cursor-pointer rounded-md border border-[var(--border)] bg-transparent p-0.5"
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={alpha}
        onChange={(e) => onChange(field.id, { hex, alpha: Number(e.target.value) })}
        className="w-20 accent-[var(--accent)]"
      />
      <span className="w-9 text-right font-mono text-xs text-[var(--text-faint)]">{Math.round(alpha * 100)}%</span>
    </FieldRow>
  );
}

function SliderField({ field, value, onChange }) {
  const v = value ?? field.default ?? field.min;
  return (
    <FieldRow label={field.label}>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={v}
        onChange={(e) => onChange(field.id, Number(e.target.value))}
        className="w-28 accent-[var(--accent)]"
      />
      <span className="w-10 text-right font-mono text-xs text-[var(--text-faint)]">{v}</span>
    </FieldRow>
  );
}

function ToggleField({ field, value, onChange }) {
  const v = value ?? field.default ?? false;
  return (
    <FieldRow label={field.label}>
      <button
        type="button"
        role="switch"
        aria-checked={v}
        onClick={() => onChange(field.id, !v)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          v ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)] bg-[var(--panel-solid-2)]'
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-4.5 rounded-full bg-white transition-transform',
            v ? 'translate-x-[22px]' : 'translate-x-0'
          )}
        />
      </button>
    </FieldRow>
  );
}

function SelectField({ field, value, onChange }) {
  const v = value ?? field.default;
  return (
    <FieldRow label={field.label}>
      <select
        value={v}
        onChange={(e) => onChange(field.id, e.target.value)}
        className="rounded-[10px] border border-[var(--border)] bg-[var(--panel-solid-2)] px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

function GradientPresetField({ field, value, onChange }) {
  return (
    <FieldRow label={field.label} align="start">
      <div className="flex flex-wrap justify-end gap-1.5">
        {field.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(field.id, opt)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              value === opt
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]'
                : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'
            )}
          >
            {GRADIENT_PRESET_LABEL[opt] || opt}
          </button>
        ))}
      </div>
    </FieldRow>
  );
}

function AnimationPresetField({ field, value, onChange }) {
  return (
    <FieldRow label={field.label} align="start">
      <div className="flex flex-wrap justify-end gap-1.5">
        {field.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(field.id, opt)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              value === opt
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]'
                : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'
            )}
          >
            {ANIMATION_PRESET_LABEL[opt] || opt}
          </button>
        ))}
      </div>
    </FieldRow>
  );
}

function TextField({ field, value, onChange }) {
  return (
    <FieldRow label={field.label}>
      <Input
        value={value ?? ''}
        maxLength={field.maxLen}
        onChange={(e) => onChange(field.id, e.target.value)}
        className="w-56"
      />
    </FieldRow>
  );
}

function TextListField({ field, value, onChange }) {
  const items = value ?? [];

  function update(i, v) {
    const next = items.slice();
    next[i] = v;
    onChange(field.id, next);
  }
  function remove(i) {
    onChange(
      field.id,
      items.filter((_, idx) => idx !== i)
    );
  }
  function add() {
    if (items.length >= field.maxItems) return;
    onChange(field.id, [...items, '']);
  }

  return (
    <div className="border-b border-[var(--border)] py-2.5 last:border-0">
      <Label className="mb-2 block">{field.label}</Label>
      <div className="flex flex-col gap-1.5">
        {items.map((w, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input value={w} maxLength={field.maxLenEach} onChange={(e) => update(i, e.target.value)} className="w-44" />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove word"
              className="text-[var(--text-faint)] transition-colors hover:text-[var(--bad)]"
            >
              &#10005;
            </button>
          </div>
        ))}
        {items.length < field.maxItems && (
          <button type="button" onClick={add} className="self-start text-xs text-[var(--accent)] hover:underline">
            + Add word
          </button>
        )}
      </div>
    </div>
  );
}

export function Field({ field, value, onChange }) {
  switch (field.type) {
    case 'color':
      return field.alpha ? (
        <AlphaColorField field={field} value={value} onChange={onChange} />
      ) : (
        <ColorField field={field} value={value} onChange={onChange} />
      );
    case 'slider':
      return <SliderField field={field} value={value} onChange={onChange} />;
    case 'toggle':
      return <ToggleField field={field} value={value} onChange={onChange} />;
    case 'select':
      return <SelectField field={field} value={value} onChange={onChange} />;
    case 'gradient-preset':
      return <GradientPresetField field={field} value={value} onChange={onChange} />;
    case 'animation-preset':
      return <AnimationPresetField field={field} value={value} onChange={onChange} />;
    case 'text':
      return <TextField field={field} value={value} onChange={onChange} />;
    case 'text-list':
      return <TextListField field={field} value={value} onChange={onChange} />;
    default:
      return null;
  }
}
