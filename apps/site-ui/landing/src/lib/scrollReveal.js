import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Named presets for the Site Designer's per-object "Scroll Animation"
// field. Deliberately GSAP/ScrollTrigger-based, not framer-motion — this
// project already hit "two scroll-driven animation systems fighting over
// one property" once (see AppCard.jsx's comment) when a framer-motion
// whileInView was stacked on the same node as a GSAP scrub tween. Keeping
// every scroll-reveal on this one system avoids repeating that.
const PRESETS = {
  none: null,
  'fade-up': (distance) => ({ from: { autoAlpha: 0, y: distance }, to: { autoAlpha: 1, y: 0 } }),
  'fade-in': () => ({ from: { autoAlpha: 0 }, to: { autoAlpha: 1 } }),
  'zoom-in': () => ({ from: { autoAlpha: 0, scale: 0.92 }, to: { autoAlpha: 1, scale: 1 } }),
  'slide-left': (distance) => ({ from: { autoAlpha: 0, x: distance }, to: { autoAlpha: 1, x: 0 } }),
  'slide-right': (distance) => ({ from: { autoAlpha: 0, x: -distance }, to: { autoAlpha: 1, x: 0 } }),
};

// A single continuous tween scrubbed to scroll position (not a
// fixed-duration animation that just happens to fire once in view) — same
// trigger points AppGrid's original effect used (`top bottom` to
// `top 55%`), generalized to any ref + preset.
export function useScrollReveal(ref, { preset = 'fade-up', distance = 90 } = {}) {
  useEffect(() => {
    const factory = PRESETS[preset];
    if (!factory) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { from, to } = factory(distance);
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current, from, {
        ...to,
        ease: 'none',
        scrollTrigger: {
          trigger: ref.current,
          start: 'top bottom',
          end: 'top 55%',
          scrub: 0.5,
        },
      });
    });
    return () => ctx.revert();
  }, [preset, distance]);
}
