import { describe, it, expect } from 'vitest';
import { boardMetadata } from '@/lib/boards/board-metadata';

describe('boardMetadata', () => {
  it('titles a public board with the org and product name', () => {
    const m = boardMetadata({ name: 'Food+', description: 'We grow food.' });
    expect(m.title).toBe('Food+’s Tracker · Hawaiʻi Bill Tracker');
    expect(m.description).toBe('We grow food.');
    expect(m.openGraph?.title).toBe('Food+’s Tracker · Hawaiʻi Bill Tracker');
  });

  it('falls back to a generic description', () => {
    expect(boardMetadata({ name: 'Food+', description: '' }).description).toBe(
      'Bills Food+ is tracking in the Hawaiʻi legislature.',
    );
  });

  it('gives private or unknown boards a generic title', () => {
    expect(boardMetadata(null)).toEqual({ title: 'Board not found · Hawaiʻi Bill Tracker' });
  });
});
