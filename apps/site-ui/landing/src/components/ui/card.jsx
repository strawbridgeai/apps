/**
 * Simplified shadcn/ui Card primitive — plain div wrappers with the
 * liquid-glass surface treatment applied via the .glass utility in
 * style.css, rather than shadcn's default flat bg-card token.
 */
import { cn } from '../../lib/utils.js';

export function Card({ className, ...props }) {
  return <div className={cn('glass rounded-[var(--radius-card)]', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}
