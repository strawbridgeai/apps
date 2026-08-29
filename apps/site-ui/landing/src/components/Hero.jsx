import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import landingConfig from '../landing.config.json';
import { useLiveConfig } from '../lib/designerLive.js';

const WORDS = ['Useful', 'Apps', 'for', 'Everyone'];

export function Hero() {
  // landingConfig is the real built-in value (used as-is on the published
  // site); useLiveConfig only overrides it inside the Site Designer's
  // preview iframe, the instant a field changes there - see
  // lib/designerLive.js.
  const arrowBounce = useLiveConfig('hero.arrowBounce', landingConfig.hero.arrowBounce);
  const arrowBounceSeconds = useLiveConfig('hero.arrowBounceSeconds', landingConfig.hero.arrowBounceSeconds);
  const minHeightMode = useLiveConfig('hero.minHeightMode', landingConfig.hero.minHeightMode);

  return (
    <div
      className={`relative mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-16 text-center ${
        minHeightMode === 'compact' ? '' : 'min-h-screen'
      }`}
    >
      {/* Filling the viewport here (rather than just wrapping the headline
          tightly) guarantees the app grid below always starts past the
          fold, on any device — without it, on shorter/typical viewports
          the grid was already sitting inside the very first screenful, so
          its scroll-triggered reveal had already mostly resolved by the
          time the page settled and no real transition was perceptible.
          Only the Site Designer tab's "Hero Height: Content height" option
          should ever set minHeightMode to 'compact' — doing so regresses
          that fix and should come with a matching change to the app
          grid's scroll-reveal trigger if used. */}
      <h1
        data-designer-id="hero.headline"
        className="flex flex-wrap items-center justify-center gap-x-[0.3em] leading-[1.12] tracking-tight text-balance"
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--font-heading-size)',
          fontWeight: 'var(--font-heading-weight)',
        }}
      >
        {WORDS.map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            {word}
          </motion.span>
        ))}
      </h1>
      <motion.div
        data-designer-id="hero.arrow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className={`mt-10 text-[var(--accent-2)] ${arrowBounce ? 'bob' : ''}`}
        style={arrowBounce ? { animationDuration: `${arrowBounceSeconds}s` } : undefined}
        aria-hidden="true"
      >
        <ChevronDown className="size-7" strokeWidth={2.5} />
      </motion.div>
    </div>
  );
}
