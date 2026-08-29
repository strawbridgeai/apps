import { cn } from '../../lib/utils.js';

export function Card({ className, ...props }) {
  return <div className={cn('glass rounded-2xl', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}
