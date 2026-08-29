/**
 * Segmented-control tabs living inside their own glass pill container
 * (fixes the previous pass's flat/dark-looking bare buttons) with a
 * framer-motion layoutId indicator that slides and glows behind the
 * active label instead of a static gradient fill.
 */
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';

export function TabList({ className, ...props }) {
  return (
    <div
      role="tablist"
      className={cn(
        'glass inline-flex flex-wrap gap-1 rounded-full p-1.5',
        className
      )}
      {...props}
    />
  );
}

export function TabTrigger({ active, className, children, ...props }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={cn(
        'relative rounded-full px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--gold)]',
        active ? 'text-[#08130c]' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
        className
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId="tab-indicator"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(120deg, var(--gold) 0%, var(--accent) 100%)',
            boxShadow: '0 0 18px rgba(94, 214, 150, 0.55), 0 0 8px rgba(226, 181, 74, 0.4)',
          }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}
