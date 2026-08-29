import { useRef } from 'react';
import landingConfig from '../landing.config.json';
import { useScrollReveal } from '../lib/scrollReveal.js';
import { useLiveConfig } from '../lib/designerLive.js';

export function Footer() {
  const ref = useRef(null);
  const animation = useLiveConfig('footer.animation', landingConfig.footer.animation);
  useScrollReveal(ref, { preset: animation });

  return (
    <footer
      ref={ref}
      data-designer-id="footer.text"
      className="px-6 pb-10 text-center text-[var(--text-faint)]"
      style={{ fontFamily: 'var(--footer-font)', fontSize: 'var(--footer-size)' }}
    >
      <p>StrawbridgeAI</p>
    </footer>
  );
}
