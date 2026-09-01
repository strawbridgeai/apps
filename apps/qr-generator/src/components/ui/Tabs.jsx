/**
 * Segmented-control tabs with a sliding gradient indicator — adapted from
 * the same pattern used in site-ui/admin's Kokonut-sourced TabList/TabTrigger,
 * re-themed light (leaf-green -> turquoise indicator on a white pill) and
 * switched to the `motion` package (not `framer-motion`) to match this
 * repo's other apps.
 */
import { motion } from 'motion/react';
import { cn } from '../../lib/utils.js';

export function TabList({ className, ...props }) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex gap-1 rounded-full border border-[var(--border)] bg-white/80 p-1.5 shadow-sm',
        className
      )}
      {...props}
    />
  );
}

export function TabTrigger({ active, layoutId, className, children, ...props }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'relative rounded-full px-5 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-2)]',
        active ? 'text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
        className
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-full"
          style={{ background: 'linear-gradient(120deg, var(--accent) 0%, var(--accent-2) 100%)' }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
}
