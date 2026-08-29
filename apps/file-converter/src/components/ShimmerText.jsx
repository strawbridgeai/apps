/**
 * Adapted from Kokonut UI's Shimmer Text (https://kokonutui.com), MIT
 * licensed. Original: @dorianbaffier, github.com/kokonut-labs/kokonutui.
 * Converted from TypeScript to plain JSX for this vanilla-JS/Vite app —
 * behavior and classes are otherwise unchanged. Same leaf-green ->
 * turquoise -> leaf-green sweep as pdf-viewer, vector-editor, and
 * camping-locator's title, matching the landing page's `.wordmark`
 * gradient (site-ui/landing).
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
        'bg-[length:200%_100%] bg-gradient-to-r from-[#2f6f36] via-[#24968a] to-[#2f6f36] bg-clip-text font-bold text-transparent',
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
