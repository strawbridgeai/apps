/**
 * Adapted from Kokonut UI's Shimmer Text (https://kokonutui.com), MIT
 * licensed. Original: @dorianbaffier, github.com/kokonut-labs/kokonutui.
 * Converted from TypeScript to plain JSX for this vanilla-JS/Vite app —
 * behavior and classes are otherwise unchanged.
 */
import { motion } from 'motion/react';
import { cn } from '../lib/utils.js';

export default function ShimmerText({ text = 'Text Shimmer', className }) {
  return (
    <motion.h1
      animate={{
        backgroundPosition: ['200% center', '-200% center'],
      }}
      className={cn(
        // Original Kokonut UI recipe shimmers dark-on-light (near-black via
        // gray); inverted here to a warm gold-on-cream sweep so it's
        // actually visible against this app's dark/glass theme.
        'bg-[length:200%_100%] bg-gradient-to-r from-[#f2e9dd] via-[#c9a24b] to-[#f2e9dd] bg-clip-text font-bold text-transparent',
        className
      )}
      transition={{
        duration: 2.5,
        ease: 'linear',
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {text}
    </motion.h1>
  );
}
