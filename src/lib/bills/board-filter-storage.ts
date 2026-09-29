/**
 * Persists the kanban board's filter selection to localStorage so it
 * survives a full page reload / new session (the KanbanBoardProvider keeps
 * it in memory across soft navigation; this is what outlives a reload).
 *
 * Browser-only: every function guards `typeof window` and swallows storage
 * errors (private mode, quota, disabled storage) so the board never crashes
 * on a bad read/write. Reads validate the parsed shape defensively — a stale
 * or hand-edited blob falls back to defaults rather than poisoning state.
 *
 * No DB access — safe for src/lib. Mirrors the localStorage pattern used for
 * `activeTenantId` in auth-context.
 */

import type { DeadFilter } from '@/lib/bills/bill-filters';

const STORAGE_KEY = 'kanbanBoardFilters';

export interface StoredBoardFilters {
  searchQuery: string;
  selectedTagIds: string[];
  selectedYears: number[];
  deadFilter: DeadFilter;
}

const DEAD_FILTERS: readonly DeadFilter[] = ['all', 'dead', 'alive'];

/** Returns the persisted filters, or `null` if none/invalid/unavailable. */
export function loadBoardFilters(): StoredBoardFilters | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;

    const searchQuery = typeof value.searchQuery === 'string' ? value.searchQuery : '';
    const selectedTagIds = Array.isArray(value.selectedTagIds)
      ? value.selectedTagIds.filter((id): id is string => typeof id === 'string')
      : [];
    const selectedYears = Array.isArray(value.selectedYears)
      ? value.selectedYears.filter((y): y is number => typeof y === 'number' && Number.isFinite(y))
      : [];
    const deadFilter = DEAD_FILTERS.includes(value.deadFilter as DeadFilter)
      ? (value.deadFilter as DeadFilter)
      : 'all';

    return { searchQuery, selectedTagIds, selectedYears, deadFilter };
  } catch {
    return null;
  }
}

/** Writes the current filters to localStorage; no-ops if unavailable. */
export function saveBoardFilters(filters: StoredBoardFilters): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore write failures (quota, private mode, disabled storage).
  }
}
