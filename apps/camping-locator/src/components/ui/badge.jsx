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
        default: 'bg-[#3f8f45] text-white',
        success: 'bg-[#3f8f45]/15 text-[#2f6f36] ring-1 ring-inset ring-[#3f8f45]/35',
        warning: 'bg-[#b3ad1f]/20 text-[#7a750f] ring-1 ring-inset ring-[#b3ad1f]/40',
        muted: 'bg-black/5 text-[#52624a] ring-1 ring-inset ring-black/10',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
