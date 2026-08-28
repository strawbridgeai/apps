/**
 * Adapted from Watermelon UI's Badge (https://ui.watermelon.sh), source
 * github.com/WatermelonCorp/watermelon-platform. Trimmed of the
 * radix-ui Slot/asChild polymorphism (unused here) and semantic theme
 * tokens (mapped to this app's actual palette instead), same reasoning
 * as button.jsx.
 */
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-white',
        success: 'bg-green-100 text-green-700',
        warning: 'bg-amber-100 text-amber-800',
        muted: 'bg-gray-100 text-gray-600',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
