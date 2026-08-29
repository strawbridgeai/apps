// Hand-authored Haikei-style blob glows for the dark admin surface —
// same "Blob" generator language as the landing page's
// OrganicBackground.jsx, recolored for the bioluminescent dark palette.
const BLOB =
  'M45.7,-58.4C59.4,-49.5,70.6,-35.5,73.6,-20.1C76.6,-4.7,71.4,12.1,63.2,26.6C55,41.1,43.8,53.3,29.9,60.6C16,67.9,-0.6,70.3,-16.9,66.8C-33.2,63.3,-49.2,53.9,-59.6,40.2C-70,26.5,-74.8,8.5,-72.3,-8.2C-69.8,-24.9,-60,-40.3,-46.7,-49.6C-33.4,-58.9,-16.7,-62.1,-0.2,-61.8C16.3,-61.5,32.1,-67.3,45.7,-58.4Z';

export function OrganicGlow({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="-100 -100 200 200" width={520} height={520} className="drift absolute -left-40 -top-32 opacity-[0.10]">
        <path d={BLOB} fill="var(--accent)" style={{ filter: 'blur(8px)' }} />
      </svg>
      <svg viewBox="-100 -100 200 200" width={440} height={440} className="drift absolute -right-32 top-1/4 opacity-[0.09]" style={{ animationDirection: 'reverse' }}>
        <path d={BLOB} fill="var(--sky)" style={{ filter: 'blur(8px)' }} />
      </svg>
    </div>
  );
}
