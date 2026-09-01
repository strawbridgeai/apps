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
//
// Two families:
//  - Simple reveals (fade-up, fade-in, zoom-in, slide-left/right): a short
//    one-time tween as the element enters, using the default trigger below.
//  - Pin presets (pin-*): the element locks in place (ScrollTrigger's
//    `pin: true`) for an extended scroll distance while a longer, more
//    deliberate transition plays — the Apple.com-style "scroll drives the
//    animation" mechanic, as opposed to "scrolling into view triggers it."
// Every factory returns `{ from, to }` plus optional `targets` ('self' -
// the default, or 'children' for pin-stagger), `stagger`, and `trigger`
// (overrides merged onto DEFAULT_TRIGGER) — omitted fields fall back to
// the simple-reveal defaults, so the original 5 presets are unchanged.
const DEFAULT_TRIGGER = { start: 'top bottom', end: 'top 55%', pin: false };

// Pin presets reuse the existing "Reveal Distance" slider as the pin's
// scroll-through length (scaled up) rather than adding a new schema field -
// a short slider value still reads as a deliberate, unhurried pin.
const pinTrigger = (distance) => ({ start: 'top top', end: `+=${Math.max(distance, 20) * 4}`, pin: true });

// Every CSS property any preset ever animates, across all of them - cleared
// unconditionally before each preset's own tween is set up (see the
// gsap.set call below for why this needs to be the full union, not just
// the incoming preset's own properties).
const ALL_ANIMATABLE_PROPS = 'autoAlpha,opacity,visibility,x,y,scale,clipPath';

const PRESETS = {
  none: null,
  'fade-up': (distance) => ({ from: { autoAlpha: 0, y: distance }, to: { autoAlpha: 1, y: 0 } }),
  'fade-in': () => ({ from: { autoAlpha: 0 }, to: { autoAlpha: 1 } }),
  'zoom-in': () => ({ from: { autoAlpha: 0, scale: 0.92 }, to: { autoAlpha: 1, scale: 1 } }),
  'slide-left': (distance) => ({ from: { autoAlpha: 0, x: distance }, to: { autoAlpha: 1, x: 0 } }),
  'slide-right': (distance) => ({ from: { autoAlpha: 0, x: -distance }, to: { autoAlpha: 1, x: 0 } }),
  // Pins, then grows into focus with a slight overshoot past 1 before
  // settling — the "content locks and zooms into attention" beat.
  'pin-zoom': (distance) => ({
    from: { autoAlpha: 0, scale: 0.8 },
    to: { autoAlpha: 1, scale: 1 },
    trigger: pinTrigger(distance),
  }),
  // Pins while a clip-path wipes open left-to-right, revealing the
  // already-in-place content from behind a "curtain" rather than moving
  // the content itself.
  'pin-reveal': (distance) => ({
    from: { clipPath: 'inset(0% 100% 0% 0%)' },
    to: { clipPath: 'inset(0% 0% 0% 0%)' },
    trigger: pinTrigger(distance),
  }),
  // Pins while revealing direct children one at a time (the app cards, or
  // whatever the target section's own children are) instead of the whole
  // block appearing at once.
  'pin-stagger': (distance) => ({
    from: { autoAlpha: 0, y: 40 },
    to: { autoAlpha: 1, y: 0 },
    targets: 'children',
    stagger: 0.15,
    trigger: pinTrigger(distance),
  }),
};

// A single continuous tween scrubbed to scroll position (not a
// fixed-duration animation that just happens to fire once in view) — same
// trigger points AppGrid's original effect used (`top bottom` to
// `top 55%`) by default; pin presets override start/end/pin via
// `trigger`, generalized to any ref + preset.
export function useScrollReveal(ref, { preset = 'fade-up', distance = 90 } = {}) {
  useEffect(() => {
    const factory = PRESETS[preset];
    if (!factory) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { from, to, targets = 'self', stagger, trigger } = factory(distance);
    const scrollTrigger = { ...DEFAULT_TRIGGER, ...trigger, trigger: ref.current, scrub: 0.5 };
    const tweenTargets = targets === 'children' ? Array.from(ref.current.children) : ref.current;
    // Switching presets live (Site Designer's preset picker, no page reload
    // between clicks) can leave inline styles behind from whichever
    // properties the PREVIOUS preset touched but this one doesn't (e.g.
    // pin-zoom's opacity/scale lingering after switching to pin-reveal,
    // which only ever sets clipPath) - ctx.revert() alone wasn't reliably
    // clearing these when a pinned ScrollTrigger was involved, confirmed by
    // reproducing the exact click-through-presets sequence. Clearing must
    // cover every property ANY preset could have left behind (not just
    // this preset's own from/to keys) and both possible target sets
    // (container and children), since the previous preset may have used a
    // different target shape than this one.
    gsap.set([ref.current, ...Array.from(ref.current.children)], { clearProps: ALL_ANIMATABLE_PROPS });
    const ctx = gsap.context(() => {
      gsap.fromTo(tweenTargets, from, {
        ...to,
        ease: 'none',
        stagger,
        scrollTrigger,
      });
    });
    return () => ctx.revert();
  }, [preset, distance]);
}
