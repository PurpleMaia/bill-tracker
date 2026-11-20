import { describe, it, expect } from 'vitest';
import { fillWeeks, rangeStart, previousRangeStart, percentChange } from '../analytics/buckets';

describe('fillWeeks', () => {
  it('zero-fills an empty series across the range', () => {
    const out = fillWeeks([], new Date('2026-11-02T12:00:00Z'), new Date('2026-11-20T12:00:00Z'));
    expect(out.map(p => p.week)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(out.every(p => p.value === 0)).toBe(true);
  });
  it('keeps existing values', () => {
    const out = fillWeeks([{ week: '2026-11-09', value: 4 }], new Date('2026-11-02T12:00:00Z'), new Date('2026-11-16T12:00:00Z'));
    expect(out).toEqual([{ week: '2026-11-02', value: 0 }, { week: '2026-11-09', value: 4 }, { week: '2026-11-16', value: 0 }]);
  });
  it('buckets by Hawaii time, not UTC', () => {
    // Monday 2026-11-09 05:00 UTC is still Sunday 2026-11-08 in Honolulu → week of 2026-11-02
    const out = fillWeeks([], new Date('2026-11-09T05:00:00Z'), new Date('2026-11-09T05:00:00Z'));
    expect(out[0].week).toBe('2026-11-02');
  });
});
describe('rangeStart / percentChange', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  it('computes range starts', () => {
    expect(rangeStart('30d', now)?.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(rangeStart('all', now)).toBeNull();
    expect(previousRangeStart('30d', now)?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });
  it('percentChange handles zero baseline', () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
  });
});
