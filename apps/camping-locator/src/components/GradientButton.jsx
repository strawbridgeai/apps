/**
 * Adapted from Kokonut UI's Gradient Button (https://kokonutui.com), MIT
 * licensed. Original: @dorianbaffier, github.com/kokonut-labs/kokonutui.
 * Converted from TypeScript to plain JSX for this vanilla-JS/Vite app —
 * behavior and classes are otherwise unchanged, minus the "purple"/
 * "orange" variants this app doesn't use.
 */
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';

const gradientColors = {
  emerald: {
    border: 'from-emerald-400 via-emerald-300 to-emerald-200',
    back: 'bg-white/80',
    base: 'from-emerald-50 via-emerald-50/80 to-emerald-50/90',
    overlay: 'from-emerald-300/30 via-emerald-200/20 to-emerald-400/20',
    accent: 'from-emerald-400/20 via-emerald-300/10 to-emerald-200/30',
    text: 'from-emerald-700 to-emerald-600',
    hover: 'from-emerald-300/30 via-emerald-200/20 to-emerald-300/30',
  },
  // Earth-tone variant for this app's dark/glass theme — same structure as
  // the original emerald variant, just a terracotta-over-charcoal palette
  // (and a dark backing layer instead of the original's opaque white one,
  // which would otherwise show through as a light square on this theme).
  clay: {
    border: 'from-orange-400 via-amber-400 to-orange-300',
    back: 'bg-stone-950/85',
    base: 'from-stone-900/80 via-stone-900/70 to-stone-900/80',
    overlay: 'from-orange-400/25 via-amber-300/15 to-orange-500/20',
    accent: 'from-orange-400/20 via-amber-300/10 to-orange-500/25',
    text: 'from-orange-300 to-amber-200',
    hover: 'from-orange-400/30 via-amber-300/20 to-orange-400/30',
  },
};

export default function GradientButton({ label = 'Welcome', className, variant = 'emerald', ...props }) {
  const colors = gradientColors[variant];

  return (
    <Button className={cn('group relative h-11 overflow-hidden rounded-lg px-4 transition-all duration-500', className)} variant="ghost" {...props}>
      <div className={cn('absolute inset-0 rounded-lg bg-linear-to-b p-[2px]', colors.border)}>
        <div className={cn('absolute inset-0 rounded-lg opacity-90', colors.back)} />
      </div>
      <div className={cn('absolute inset-[2px] rounded-lg opacity-95', colors.back)} />
      <div className={cn('absolute inset-[2px] rounded-lg bg-linear-to-r opacity-90', colors.base)} />
      <div className={cn('absolute inset-[2px] rounded-lg bg-linear-to-b opacity-80', colors.overlay)} />
      <div className={cn('absolute inset-[2px] rounded-lg bg-linear-to-br', colors.accent)} />

      <div className="relative flex items-center justify-center gap-2">
        <span className={cn('bg-linear-to-b bg-clip-text font-semibold text-sm text-transparent tracking-tight', colors.text)}>{label}</span>
      </div>

      <div className={cn('absolute inset-[2px] rounded-lg bg-linear-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100', colors.hover)} />
    </Button>
  );
}
