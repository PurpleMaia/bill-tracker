import { describe, it, expect } from 'vitest';
import { placeCard } from '../tour/place-card';

const viewport = { width: 1000, height: 700 };
const card = { width: 300, height: 200 };

describe('placeCard', () => {
  it('prefers below the target, centered on it', () => {
    const pos = placeCard({ top: 50, left: 400, width: 100, height: 30 }, card, viewport);
    expect(pos.top).toBe(50 + 30 + 12);
    expect(pos.left).toBe(450 - 150);
  });

  it('goes above when there is no room below', () => {
    const pos = placeCard({ top: 600, left: 400, width: 100, height: 40 }, card, viewport);
    expect(pos.top).toBe(600 - 12 - 200);
  });

  it('goes beside a tall target when neither above nor below fits', () => {
    const tall = { top: 20, left: 600, width: 300, height: 660 };
    const pos = placeCard(tall, card, viewport);
    expect(pos.left).toBe(600 - 12 - 300);
  });

  it('keeps the card inside the viewport horizontally', () => {
    const pos = placeCard({ top: 50, left: 960, width: 30, height: 30 }, card, viewport);
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width - 12);
    const left = placeCard({ top: 50, left: 0, width: 30, height: 30 }, card, viewport);
    expect(left.left).toBeGreaterThanOrEqual(12);
  });

  it('falls back to the bottom of the viewport for a target that fills the screen', () => {
    const pos = placeCard({ top: 0, left: 0, width: 1000, height: 700 }, card, viewport);
    expect(pos.top).toBe(700 - 200 - 12);
  });
});
