import type { CSSProperties } from 'react';

/**
 * Mount-in transition shared by the main pages: fade while rising a few px
 * into place. The keyframes/timing live in tailwind.config (`rise-in`);
 * reduced-motion users get no animation.
 */
export const RISE_IN = 'animate-rise-in motion-reduce:animate-none';

/**
 * RISE_IN without the movement — same timing and `riseDelay` stagger. For
 * content that swaps in place, where a rise would read as jitter (the bill
 * dialog's tabs, the version diff).
 */
export const FADE_IN = 'animate-fade-in motion-reduce:animate-none';

/** Past this many slots every item starts together, so long lists never lag. */
const MAX_STAGGER = 6;

/**
 * Inline style placing an element at slot `i` of a staggered cascade. Pair it
 * with RISE_IN or FADE_IN; `--stagger` scales the animation delay.
 */
export function riseDelay(i: number): CSSProperties {
  return { '--stagger': Math.min(i, MAX_STAGGER) } as CSSProperties;
}
