/**
 * Adapted from Watermelon UI's Badge (https://ui.watermelon.sh), source
 * github.com/WatermelonCorp/watermelon-platform. Same simplification as
 * camping-locator's copy of this component (no radix-ui, semantic tokens
 * mapped to this app's actual palette), minus class-variance-authority too
 * — this app doesn't otherwise depend on it, so a plain variant lookup
 * object stands in for cva's variant()  helper.
 */
import { cn } from '../../lib/utils.js';

const VARIANTS = {
  default: 'bg-orange-700 text-white',
  muted: 'bg-white/8 text-[#b6a793] ring-1 ring-inset ring-white/10',
};

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        VARIANTS[variant] || VARIANTS.default,
        className
      )}
      {...props}
    />
  );
}
