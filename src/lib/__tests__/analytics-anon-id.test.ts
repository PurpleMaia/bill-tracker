import { describe, it, expect } from 'vitest';
import { getAnonId } from '@/lib/analytics/anon-id';

describe('getAnonId', () => {
  it('persists and reuses an id', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const a = getAnonId(storage);
    expect(a).toMatch(/[0-9a-f-]{36}/);
    expect(getAnonId(storage)).toBe(a);
  });

  it('falls back to a stable per-load id when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const a = getAnonId(broken);
    expect(typeof a).toBe('string');
    expect(getAnonId(broken)).toBe(a);
  });
});
