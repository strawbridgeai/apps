/**
 * Segmented-control tabs with a framer-motion (via the `motion` package)
 * layoutId indicator that slides between triggers, matching the pattern
 * already established for the admin dashboard's tabs
 * (/root/site-ui/admin/src/components/ui/tabs.jsx) — themed here to this
 * app's sunlit-solarpunk accent/accent-2 gradient instead of gold/leaf.
 */
import { motion } from 'motion/react';
import { cn } from '../../lib/utils.js';

export function TabList({ className, ...props }) {
  return <div role="tablist" className={cn('panel-tab-list', className)} {...props} />;
}

export function TabTrigger({ active, className, children, ...props }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn('panel-tab-trigger', active && 'active', className)}
      {...props}
    >
      {active && (
        <motion.span
          layoutId="panel-tab-indicator"
          className="panel-tab-indicator"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <span className="panel-tab-label">{children}</span>
    </button>
  );
}
