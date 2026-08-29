// Hand-authored Haikei-style organic backdrop — Haikei (haikei.app) is a
// browser tool, not an npm package, so this recreates its "Blob" +
// "Circuit Board" generator look directly as inline SVG: soft blurred
// blob shapes (the eco-city renders) layered over a faint PCB-trace mesh
// (the moss-on-circuit-board reference) at very low opacity, so the two
// reference moods read as one texture instead of competing.
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import landingConfig from '../landing.config.json';
import { useLiveConfig } from '../lib/designerLive.js';

gsap.registerPlugin(ScrollTrigger);

const BLOB_A =
  'M45.7,-58.4C59.4,-49.5,70.6,-35.5,73.6,-20.1C76.6,-4.7,71.4,12.1,63.2,26.6C55,41.1,43.8,53.3,29.9,60.6C16,67.9,-0.6,70.3,-16.9,66.8C-33.2,63.3,-49.2,53.9,-59.6,40.2C-70,26.5,-74.8,8.5,-72.3,-8.2C-69.8,-24.9,-60,-40.3,-46.7,-49.6C-33.4,-58.9,-16.7,-62.1,-0.2,-61.8C16.3,-61.5,32.1,-67.3,45.7,-58.4Z';
const BLOB_B =
  'M39.6,-51.1C50.9,-42.6,59.2,-29.9,63.4,-15.5C67.6,-1.1,67.7,15,61.4,28.5C55.1,42,42.4,52.9,28.1,59.4C13.8,65.9,-2.1,68,-18.1,65C-34.1,62,-50.2,53.9,-59.8,40.8C-69.4,27.7,-72.5,9.6,-69.5,-6.8C-66.5,-23.2,-57.4,-37.9,-45,-46.7C-32.6,-55.5,-16.3,-58.4,-0.5,-57.8C15.3,-57.2,28.3,-59.6,39.6,-51.1Z';

function Blob({ path, className, style, size = 480 }) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function OrganicBackground() {
  const blobARef = useRef(null);
  const blobBRef = useRef(null);
  const blobCRef = useRef(null);

  // Scroll-scrubbed parallax on top of the existing CSS "drift" loop — each
  // blob moves vertically at its own rate across the full page scroll, so
  // they read as floating at different depths instead of one flat plane.
  // `scrub: 1` ties the motion directly to scroll position (with a 1s lag
  // for smoothing) rather than firing once like the whileInView reveals
  // elsewhere on this page.
  //
  // GSAP targets a wrapper div around each blob, not the blob's own <svg> —
  // that svg already has an infinite CSS `.drift`/`.drift-slow` animation
  // running on `transform`, and having GSAP tween `transform` on the exact
  // same element fights the CSS animation for that property every frame
  // (whichever one last wins the frame "wins," so the two mostly canceled
  // each other out and the parallax was invisible in a real browser, even
  // though a single getComputedStyle() snapshot in a quick check could
  // still show a non-identity matrix and look "correct"). Putting GSAP's
  // translate on a separate ancestor node lets both transforms compose
  // instead of colliding.
  const parallax = useLiveConfig('organicBackground.parallax', landingConfig.organicBackground.parallax);
  const parallaxIntensity = useLiveConfig('organicBackground.parallaxIntensity', landingConfig.organicBackground.parallaxIntensity);

  useEffect(() => {
    // Matches the reduced-motion guard already wrapping .drift/.bob in
    // style.css — GSAP has no CSS media query to lean on, so it's checked
    // explicitly here instead.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!parallax) return;
    const refs = [blobARef, blobBRef, blobCRef];
    const ctx = gsap.context(() => {
      const trigger = { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.5 };
      const rates = [70, -45, 100];
      refs.forEach((ref, i) => {
        gsap.to(ref.current, { yPercent: rates[i] * parallaxIntensity, ease: 'none', scrollTrigger: trigger });
      });
    });
    return () => ctx.revert();
  }, [parallax, parallaxIntensity]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div ref={blobARef} className="absolute -left-32 -top-28">
        <Blob path={BLOB_A} className="drift opacity-[0.16]" style={{ fill: 'var(--accent)', filter: 'blur(6px)' }} />
      </div>
      <div ref={blobBRef} className="absolute -right-36 top-16">
        <Blob path={BLOB_B} className="drift-slow opacity-[0.14]" size={420} style={{ fill: 'var(--accent-2)', filter: 'blur(6px)' }} />
      </div>
      <div ref={blobCRef} className="absolute -bottom-40 left-1/3">
        <Blob path={BLOB_A} className="drift opacity-[0.10]" size={380} style={{ fill: 'var(--gold)', filter: 'blur(6px)' }} />
      </div>
    </div>
  );
}

// Faint PCB-trace mesh — right-angle "circuit" lines with via dots, tiled
// as an SVG pattern at near-invisible opacity. Nods to the moss-on-circuit
// reference without pulling focus from the actual UI.
export function CircuitMesh({ className = '' }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern id="circuit-mesh" width="120" height="120" patternUnits="userSpaceOnUse">
          <path
            d="M0 60 H40 V20 H90 V60 H120 M60 0 V40 H100 V120"
            fill="none"
            stroke="var(--accent-dim)"
            strokeWidth="1.4"
          />
          <circle cx="40" cy="20" r="3" fill="var(--accent-dim)" />
          <circle cx="90" cy="60" r="3" fill="var(--accent-2-dim)" />
          <circle cx="60" cy="40" r="3" fill="var(--gold-dim)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit-mesh)" />
    </svg>
  );
}
