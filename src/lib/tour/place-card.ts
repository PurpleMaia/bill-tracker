export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Where to put a coach card relative to a spotlighted element: below it, else
 * above, else to its right, else to its left — whichever side first has room —
 * clamped inside the viewport. When the target is so large nothing fits beside
 * it, the card sits at the bottom of the viewport instead.
 */
export function placeCard(
  target: Box,
  card: Size,
  viewport: Size,
  gap = 12,
  margin = 12
): { top: number; left: number } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - card.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - card.height - margin));
  const centerX = target.left + target.width / 2 - card.width / 2;
  const centerY = target.top + target.height / 2 - card.height / 2;

  const belowTop = target.top + target.height + gap;
  if (belowTop + card.height + margin <= viewport.height) return { top: belowTop, left: clampX(centerX) };

  const aboveTop = target.top - gap - card.height;
  if (aboveTop >= margin) return { top: aboveTop, left: clampX(centerX) };

  const rightLeft = target.left + target.width + gap;
  if (rightLeft + card.width + margin <= viewport.width) return { top: clampY(centerY), left: rightLeft };

  const leftLeft = target.left - gap - card.width;
  if (leftLeft >= margin) return { top: clampY(centerY), left: leftLeft };

  return { top: clampY(viewport.height), left: clampX(centerX) };
}
