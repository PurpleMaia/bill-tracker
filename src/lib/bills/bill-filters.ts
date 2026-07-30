/**
 * Pure client-side bill filtering shared by the kanban board, the
 * spreadsheet view, and the export dialog, so "what you see" and "what
 * you export" always agree. No DB access — safe for src/lib.
 */

import { searchBillsLocal } from '@/lib/bills/bill-search';
import type { Bill } from '@/types/legislation';

export type DeadFilter = 'all' | 'dead' | 'alive';

export interface BillFilters {
  searchQuery: string;
  selectedTagIds: string[];
  selectedYears: number[];
  deadFilter: DeadFilter;
}

export function hasActiveFilters(filters: BillFilters): boolean {
  return (
    filters.searchQuery.trim().length > 0 ||
    filters.selectedTagIds.length > 0 ||
    filters.selectedYears.length > 0 ||
    filters.deadFilter !== 'all'
  );
}

/**
 * Applies search (ranked, preserves relevance order), then tag, year, and
 * dead/alive narrowing. Bills with no year are excluded by a year filter;
 * bills with no tags are excluded by a tag filter.
 */
export function filterBills(bills: Bill[], filters: BillFilters): Bill[] {
  const { searchQuery, selectedTagIds, selectedYears, deadFilter } = filters;
  let items = bills;

  if (searchQuery.trim()) {
    items = searchBillsLocal(items, searchQuery);
  }

  if (selectedTagIds.length > 0) {
    items = items.filter((bill) => {
      const billTagIds = bill.tags?.map((tag) => tag.id) || [];
      return billTagIds.some((tagId) => selectedTagIds.includes(tagId));
    });
  }

  if (selectedYears.length > 0) {
    items = items.filter((bill) => {
      if (bill.year === null || bill.year === undefined) return false;
      const year = typeof bill.year === 'string' ? parseInt(bill.year, 10) : bill.year;
      return selectedYears.includes(year);
    });
  }

  if (deadFilter === 'dead') {
    items = items.filter((bill) => bill.dead);
  } else if (deadFilter === 'alive') {
    items = items.filter((bill) => !bill.dead);
  }

  return items;
}
