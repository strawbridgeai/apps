// Lightweight stand-in for shadcn's usual clsx+tailwind-merge `cn` helper.
// Plain concatenation is enough for how these components actually use it.
// Matches apps/camping-locator and site-ui/landing.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
