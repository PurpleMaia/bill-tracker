import { describe, it, expect } from 'vitest';
import { filterBills, hasActiveFilters, type BillFilters } from '@/lib/bills/bill-filters';
import type { Bill, Tag } from '@/types/legislation';

const tag = (id: string, name: string): Tag =>
  ({ id, name, color: '#000000' }) as Tag;

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: 'b1',
    bill_number: 'SB100',
    bill_title: 'A bill',
    bill_url: '',
    year: 2026,
    current_bill_status: 'introduced',
    current_status_string: '',
    description: '',
    archived: false,
    dead: false,
    committee_assignment: null,
    latest_update: null,
    ...overrides,
  } as Bill;
}

const noFilters: BillFilters = {
  searchQuery: '',
  selectedTagIds: [],
  selectedYears: [],
  deadFilter: 'all',
};

describe('hasActiveFilters', () => {
  it('is false when nothing is set', () => {
    expect(hasActiveFilters(noFilters)).toBe(false);
  });

  it('treats whitespace-only search as inactive', () => {
    expect(hasActiveFilters({ ...noFilters, searchQuery: '   ' })).toBe(false);
  });

  it.each([
    { ...noFilters, searchQuery: 'sb' },
    { ...noFilters, selectedTagIds: ['t1'] },
    { ...noFilters, selectedYears: [2026] },
    { ...noFilters, deadFilter: 'dead' as const },
  ])('is true when any dimension is set', (filters) => {
    expect(hasActiveFilters(filters)).toBe(true);
  });
});

describe('filterBills', () => {
  const bills = [
    bill({ id: 'a', bill_number: 'SB100', year: 2026, dead: false, tags: [tag('t1', 'Ag')] }),
    bill({ id: 'b', bill_number: 'HB200', year: 2025, dead: true, tags: [tag('t2', 'Food')] }),
    bill({ id: 'c', bill_number: 'SB300', year: null, dead: false, tags: undefined }),
  ];

  it('returns everything untouched with no filters', () => {
    expect(filterBills(bills, noFilters)).toEqual(bills);
  });

  it('narrows by search', () => {
    const result = filterBills(bills, { ...noFilters, searchQuery: 'HB200' });
    expect(result.map((b) => b.id)).toEqual(['b']);
  });

  it('narrows by tag; bills without tags are excluded', () => {
    const result = filterBills(bills, { ...noFilters, selectedTagIds: ['t1'] });
    expect(result.map((b) => b.id)).toEqual(['a']);
  });

  it('narrows by year; bills without a year are excluded', () => {
    const result = filterBills(bills, { ...noFilters, selectedYears: [2025] });
    expect(result.map((b) => b.id)).toEqual(['b']);
  });

  it('narrows by dead and alive', () => {
    expect(filterBills(bills, { ...noFilters, deadFilter: 'dead' }).map((b) => b.id)).toEqual(['b']);
    expect(filterBills(bills, { ...noFilters, deadFilter: 'alive' }).map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('applies all dimensions together', () => {
    const result = filterBills(bills, {
      searchQuery: 'sb',
      selectedTagIds: ['t1'],
      selectedYears: [2026],
      deadFilter: 'alive',
    });
    expect(result.map((b) => b.id)).toEqual(['a']);
  });
});
