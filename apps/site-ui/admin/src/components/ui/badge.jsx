/**
 * Simplified shadcn/ui Badge — used here for app status pills. Semantic
 * colors (good/warn/muted) kept separate from the brand accent green,
 * per the dashboard's own status meaning rather than decoration.
 */
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        live: 'text-[var(--good)]',
        'in-progress': 'text-[var(--warn)]',
        'not-published': 'text-[var(--text-faint)]',
      },
    },
    defaultVariants: { variant: 'not-published' },
  }
);

const DOT = {
  live: 'bg-[var(--good)] shadow-[0_0_6px_var(--good)]',
  'in-progress': 'bg-[var(--warn)] shadow-[0_0_6px_var(--warn)] pulse-dot',
  'not-published': 'bg-[var(--text-faint)]',
};

export function StatusBadge({ status, label, className }) {
  return (
    <span className={cn(badgeVariants({ variant: status }), className)}>
      <span className={cn('size-[7px] rounded-full', DOT[status])} />
      {label}
    </span>
  );
}
