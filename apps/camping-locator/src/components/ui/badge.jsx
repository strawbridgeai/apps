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
        default: 'bg-orange-700 text-white',
        success: 'bg-[#7fa05e]/20 text-[#a9c78c] ring-1 ring-inset ring-[#7fa05e]/30',
        warning: 'bg-[#c9a24b]/20 text-[#e0c179] ring-1 ring-inset ring-[#c9a24b]/30',
        muted: 'bg-white/8 text-[#b6a793] ring-1 ring-inset ring-white/10',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
