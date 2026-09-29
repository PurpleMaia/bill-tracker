import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSearchFilters, saveSearchFilters } from '@/lib/bills/search-filter-storage';
import type { SearchFilters } from '@/lib/bills/search-params';

/**
 * The vitest environment is `node`, so there is no `window`/`localStorage` by
 * default. We install a minimal in-memory localStorage on `globalThis.window`
 * to exercise read/write/validation, and remove it to cover the SSR guard.
 */
function installMockStorage() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  };
  return store;
}

function removeWindow() {
  delete (globalThis as any).window;
}

const FULL: SearchFilters = {
  q: 'water',
  years: [2026, 2027],
  chambers: ['house', 'senate'],
  stages: ['introduced', 'passed'],
  deadFilter: 'alive',
  trackedFilter: 'tracked',
};

const DEFAULTS_SHAPE: SearchFilters = {
  q: '',
  years: [],
  chambers: [],
  stages: [],
  deadFilter: 'all',
  trackedFilter: 'all',
};

describe('search-filter-storage', () => {
  afterEach(() => {
    removeWindow();
    vi.restoreAllMocks();
  });

  describe('when window is unavailable (SSR)', () => {
    it('loadSearchFilters returns null', () => {
      removeWindow();
      expect(loadSearchFilters()).toBeNull();
    });

    it('saveSearchFilters is a no-op and does not throw', () => {
      removeWindow();
      expect(() => saveSearchFilters(FULL)).not.toThrow();
    });
  });

  describe('round-trip', () => {
    beforeEach(() => installMockStorage());

    it('returns null when nothing is stored', () => {
      expect(loadSearchFilters()).toBeNull();
    });

    it('persists and restores a full filter set', () => {
      saveSearchFilters(FULL);
      expect(loadSearchFilters()).toEqual(FULL);
    });
  });

  describe('defensive validation of a stale/bad blob', () => {
    it('falls back to null for non-JSON', () => {
      const store = installMockStorage();
      store.set('billSearchFilters', 'not json{');
      expect(loadSearchFilters()).toBeNull();
    });

    it('falls back to null for a non-object payload', () => {
      const store = installMockStorage();
      store.set('billSearchFilters', JSON.stringify('nope'));
      expect(loadSearchFilters()).toBeNull();
    });

    it('coerces missing/wrong-typed fields to defaults', () => {
      const store = installMockStorage();
      store.set(
        'billSearchFilters',
        JSON.stringify({ q: 42, years: 'nope', deadFilter: 'bogus', trackedFilter: 'bogus' })
      );
      expect(loadSearchFilters()).toEqual(DEFAULTS_SHAPE);
    });

    it('drops invalid chambers, non-finite years, and non-string stages', () => {
      const store = installMockStorage();
      store.set(
        'billSearchFilters',
        JSON.stringify({
          q: 'x',
          years: [2026, 'no', NaN, 2027],
          chambers: ['house', 'moon', 'senate'],
          stages: ['ok', 5, 'ok2'],
          deadFilter: 'dead',
          trackedFilter: 'untracked',
        })
      );
      expect(loadSearchFilters()).toEqual({
        q: 'x',
        years: [2026, 2027],
        chambers: ['house', 'senate'],
        stages: ['ok', 'ok2'],
        deadFilter: 'dead',
        trackedFilter: 'untracked',
      });
    });
  });

  it('swallows a getItem that throws', () => {
    (globalThis as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error('storage disabled');
        },
      },
    };
    expect(loadSearchFilters()).toBeNull();
  });
});
