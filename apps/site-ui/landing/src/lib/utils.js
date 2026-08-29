// Lightweight stand-in for shadcn's usual clsx+tailwind-merge `cn` helper.
// Plain concatenation is enough for how these components actually use it
// (stacking non-conflicting utility classes) — skips two extra
// dependencies for a "minimal" UI addition. Matches apps/camping-locator.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
