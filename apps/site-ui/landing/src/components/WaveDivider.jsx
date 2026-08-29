// Hand-authored Haikei-style "Layered Waves" divider — a soft organic
// waterline between sections, matching the terraced eco-city references.
export function WaveDivider({ flip = false, className = '' }) {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={`block h-16 w-full sm:h-24 ${flip ? 'rotate-180' : ''} ${className}`}
      aria-hidden="true"
    >
      <path
        d="M0,64 C240,110 480,10 720,40 C960,70 1200,110 1440,56 L1440,120 L0,120 Z"
        fill="var(--accent-2)"
        opacity="0.10"
      />
      <path
        d="M0,80 C240,40 480,120 720,84 C960,48 1200,20 1440,72 L1440,120 L0,120 Z"
        fill="var(--accent)"
        opacity="0.12"
      />
    </svg>
  );
}
