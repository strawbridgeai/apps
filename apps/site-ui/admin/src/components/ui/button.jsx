/**
 * Simplified shadcn/ui Button primitive — no radix-ui Slot/asChild
 * polymorphism, concrete Tailwind colors instead of a semantic theme
 * install. Same trim as apps/camping-locator and site-ui/landing.
 */
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 cursor-pointer rounded-full text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent)] text-[#0d1712] hover:brightness-110',
        outline:
          'border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text-dim)] bg-transparent',
        ghost: 'hover:bg-white/5 text-[var(--text-dim)] hover:text-[var(--text)]',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export function Button({ className, variant, size, as: Comp = 'button', ...props }) {
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
