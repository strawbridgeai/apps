/**
 * Toggle switch — simplified from Watermelon UI's switch pattern
 * (ui.watermelon.sh): a plain checkbox driving a sliding-knob track, no
 * radix-ui primitive, concrete hex colors instead of a semantic token set.
 */
import { cn } from '../../lib/utils.js';

export function Switch({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer select-none items-center gap-2.5">
      <span
        className="relative inline-flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
      >
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={cn(
            'pointer-events-none block size-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </span>
      {label && <span className="text-sm text-[var(--text-dim)]">{label}</span>}
    </label>
  );
}
