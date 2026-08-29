import { useRef } from 'react';
import { apps } from '../data/apps.js';
import { AppCard } from './AppCard.jsx';
import landingConfig from '../landing.config.json';
import { useScrollReveal } from '../lib/scrollReveal.js';
import { useLiveConfig } from '../lib/designerLive.js';

export function AppGrid() {
  const gridRef = useRef(null);

  // The actual "transition from the top half into the tiles" the wave/gap
  // alone couldn't provide — see useScrollReveal for the mechanism. Preset
  // and distance are both editable from the Site Designer tab's App Grid
  // object; useLiveConfig's dependency change re-runs useScrollReveal's
  // effect automatically (it already depends on [preset, distance]), so a
  // live edit here re-attaches the ScrollTrigger with no extra wiring.
  const animation = useLiveConfig('appGrid.animation', landingConfig.appGrid.animation);
  const scrollRevealDistance = useLiveConfig('appGrid.scrollRevealDistance', landingConfig.appGrid.scrollRevealDistance);
  useScrollReveal(gridRef, { preset: animation, distance: scrollRevealDistance });

  return (
    <div
      ref={gridRef}
      data-designer-id="appGrid.container"
      className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-6 pb-24 pt-24 sm:grid-cols-2 lg:grid-cols-3"
    >
      {apps.map((app) => (
        <AppCard key={app.href} app={app} />
      ))}
    </div>
  );
}
