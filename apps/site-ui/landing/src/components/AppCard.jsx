import { Mountain, FileText, ArrowLeftRight, PenTool, Radar } from 'lucide-react';
import { Card, CardContent } from './ui/card.jsx';

const ICONS = { Mountain, FileText, ArrowLeftRight, PenTool, Radar };

// The scroll-in transition lives one level up, on AppGrid's container as a
// whole (a single GSAP scrub tied to scroll position) — not here per-card.
// A per-card framer-motion whileInView used to live on this element too,
// but stacking a second scroll-driven animation on the exact same node as
// the parent's GSAP tween is the same "two systems fighting over one
// property" bug already hit once with the background blobs.
export function AppCard({ app }) {
  const Icon = ICONS[app.icon];
  return (
    <a
      href={app.href}
      className="group block rounded-[var(--radius-card)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-2)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      <Card className="shine h-full overflow-hidden transition-transform duration-200 ease-out group-hover:-translate-y-1.5">
        <CardContent className="flex h-full flex-col gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
            style={{ background: `color-mix(in srgb, ${app.tint} 16%, transparent)` }}
          >
            <Icon className="size-5" style={{ color: app.tint }} aria-hidden="true" />
          </div>
          <div className="text-base font-semibold">{app.name}</div>
          <p className="text-sm leading-relaxed text-[var(--text-dim)]">{app.desc}</p>
        </CardContent>
      </Card>
    </a>
  );
}
