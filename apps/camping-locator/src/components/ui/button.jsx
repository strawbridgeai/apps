/**
 * Simplified shadcn/ui Button primitive (the shape GradientButton expects
 * at @/components/ui/button) — trimmed to what's actually used here: no
 * radix-ui Slot/asChild polymorphism, and concrete Tailwind colors instead
 * of a full semantic theme-token system, to keep this a minimal addition
 * rather than a full shadcn theme install.
 */
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center cursor-pointer rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-orange-700 text-white hover:bg-orange-800',
        ghost: 'hover:bg-white/5',
      },
      size: {
        default: 'h-9 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
