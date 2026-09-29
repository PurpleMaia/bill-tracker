import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadBoardFilters, saveBoardFilters } from '@/lib/bills/board-filter-storage';

/**
 * The vitest environment is `node`, so there is no `window`/`localStorage` by
 * default. We install a minimal in-memory localStorage on `globalThis.window`
 * to exercise the read/write/validation logic, and remove it to cover the
 * `typeof window === 'undefined'` guard.
 */
function installMockStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as any).window = { localStorage };
  return store;
}

function removeWindow() {
  delete (globalThis as any).window;
}

const DEFAULTS = {
  searchQuery: '',
  selectedTagIds: [] as string[],
  selectedYears: [] as number[],
  deadFilter: 'all' as const,
};

describe('board-filter-storage', () => {
  afterEach(() => {
    removeWindow();
    vi.restoreAllMocks();
  });

  describe('when window is unavailable (SSR)', () => {
    it('loadBoardFilters returns null', () => {
      removeWindow();
      expect(loadBoardFilters()).toBeNull();
    });

    it('saveBoardFilters is a no-op and does not throw', () => {
      removeWindow();
      expect(() => saveBoardFilters(DEFAULTS)).not.toThrow();
    });
  });

  describe('round-trip', () => {
    beforeEach(() => installMockStorage());

    it('returns null when nothing is stored', () => {
      expect(loadBoardFilters()).toBeNull();
    });

    it('persists and restores a full filter set', () => {
      const filters = {
        searchQuery: 'water',
        selectedTagIds: ['tag-a', 'tag-b'],
        selectedYears: [2026, 2027],
        deadFilter: 'alive' as const,
      };
      saveBoardFilters(filters);
      expect(loadBoardFilters()).toEqual(filters);
    });
  });

  describe('defensive validation of a stale/bad blob', () => {
    it('falls back to defaults for non-JSON', () => {
      const store = installMockStorage();
      store.set('kanbanBoardFilters', 'not json{');
      expect(loadBoardFilters()).toBeNull();
    });

    it('falls back to defaults for a non-object payload', () => {
      const store = installMockStorage();
      store.set('kanbanBoardFilters', JSON.stringify(42));
      expect(loadBoardFilters()).toBeNull();
    });

    it('coerces missing/wrong-typed fields to defaults', () => {
      const store = installMockStorage();
      store.set(
        'kanbanBoardFilters',
        JSON.stringify({ searchQuery: 123, selectedTagIds: 'nope', deadFilter: 'bogus' })
      );
      expect(loadBoardFilters()).toEqual(DEFAULTS);
    });

    it('drops non-string tag ids and non-finite years', () => {
      const store = installMockStorage();
      store.set(
        'kanbanBoardFilters',
        JSON.stringify({
          searchQuery: 'x',
          selectedTagIds: ['ok', 5, null, 'ok2'],
          selectedYears: [2026, 'nope', NaN, 2027],
          deadFilter: 'dead',
        })
      );
      expect(loadBoardFilters()).toEqual({
        searchQuery: 'x',
        selectedTagIds: ['ok', 'ok2'],
        selectedYears: [2026, 2027],
        deadFilter: 'dead',
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
    expect(loadBoardFilters()).toBeNull();
  });
});
