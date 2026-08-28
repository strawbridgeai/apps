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
    base: 'from-emerald-50 via-emerald-50/80 to-emerald-50/90',
    overlay: 'from-emerald-300/30 via-emerald-200/20 to-emerald-400/20',
    accent: 'from-emerald-400/20 via-emerald-300/10 to-emerald-200/30',
    text: 'from-emerald-700 to-emerald-600',
    hover: 'from-emerald-300/30 via-emerald-200/20 to-emerald-300/30',
  },
};

export default function GradientButton({ label = 'Welcome', className, variant = 'emerald', ...props }) {
  const colors = gradientColors[variant];

  return (
    <Button className={cn('group relative h-11 overflow-hidden rounded-lg px-4 transition-all duration-500', className)} variant="ghost" {...props}>
      <div className={cn('absolute inset-0 rounded-lg bg-linear-to-b p-[2px]', colors.border)}>
        <div className="absolute inset-0 rounded-lg bg-white/80 opacity-90" />
      </div>
      <div className="absolute inset-[2px] rounded-lg bg-white/80 opacity-95" />
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
