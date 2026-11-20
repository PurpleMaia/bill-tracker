/**
 * Paging for the recommendations panel: it shows only as many cards as fit on
 * screen (no scrolling), and Refresh rotates to the next set.
 */

/** `size` items starting at `offset`, wrapping past the end; never repeats an item. */
export function pageWindow<T>(items: T[], offset: number, size: number): T[] {
  if (items.length === 0 || size <= 0) return [];
  const count = Math.min(size, items.length);
  return Array.from({ length: count }, (_, i) => items[(offset + i) % items.length]);
}

/** Offset of the next set after a refresh; 0 when the whole list already fits. */
export function nextOffset(offset: number, size: number, total: number): number {
  if (total === 0 || size >= total) return 0;
  return (offset + size) % total;
}
