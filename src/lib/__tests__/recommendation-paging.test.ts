import { describe, it, expect } from 'vitest';
import { pageWindow, nextOffset } from '@/lib/bills/recommendation-paging';

const items = ['a', 'b', 'c', 'd', 'e'];

describe('pageWindow', () => {
  it('returns `size` items starting at offset', () => {
    expect(pageWindow(items, 1, 2)).toEqual(['b', 'c']);
  });

  it('wraps around the end of the list', () => {
    expect(pageWindow(items, 4, 3)).toEqual(['e', 'a', 'b']);
  });

  it('never repeats an item when size exceeds the list', () => {
    expect(pageWindow(items, 2, 9)).toEqual(['c', 'd', 'e', 'a', 'b']);
  });

  it('handles an empty list and a non-positive size', () => {
    expect(pageWindow([], 3, 2)).toEqual([]);
    expect(pageWindow(items, 0, 0)).toEqual([]);
  });
});

describe('nextOffset', () => {
  it('advances by the page size, wrapping', () => {
    expect(nextOffset(0, 2, 5)).toBe(2);
    expect(nextOffset(4, 2, 5)).toBe(1);
  });

  it('stays at 0 when everything already fits', () => {
    expect(nextOffset(0, 5, 5)).toBe(0);
    expect(nextOffset(0, 8, 5)).toBe(0);
    expect(nextOffset(0, 2, 0)).toBe(0);
  });
});
