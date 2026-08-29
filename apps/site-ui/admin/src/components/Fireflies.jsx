// Small glowing drifting dots — nods to the glowing-mushroom/moss
// reference without literal illustration. Purely decorative, so
// Math.random() at module load is fine (client-only app, no SSR).
const SEEDS = Array.from({ length: 10 }, () => ({
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: 2 + Math.random() * 3,
  delay: Math.random() * 6,
  duration: 5 + Math.random() * 4,
  hue: Math.random() > 0.5 ? 'var(--accent)' : 'var(--gold)',
}));

export function Fireflies({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {SEEDS.map((s, i) => (
        <span
          key={i}
          className="firefly float-y"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: s.hue,
            boxShadow: `0 0 ${s.size * 3}px ${s.hue}`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
