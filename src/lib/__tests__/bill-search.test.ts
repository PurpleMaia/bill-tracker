import { describe, it, expect } from 'vitest';
import { searchBillsLocal, type SearchableBill } from '../bills/bill-search';

function bill(over: Partial<SearchableBill> & { id: string }): SearchableBill {
  return { bill_number: 'XX0', bill_title: '', description: '', ...over };
}

describe('searchBillsLocal', () => {
  it('returns the input array unchanged for empty and whitespace queries', () => {
    const bills = [bill({ id: 'a' }), bill({ id: 'b' })];
    expect(searchBillsLocal(bills, '')).toEqual(bills);
    expect(searchBillsLocal(bills, '   ')).toEqual(bills);
  });

  it('matches bill numbers case-insensitively', () => {
    const bills = [bill({ id: 'a', bill_number: 'SB123' })];
    expect(searchBillsLocal(bills, 'sb123')).toHaveLength(1);
    expect(searchBillsLocal(bills, 'SB123')).toHaveLength(1);
  });

  it('normalizes spaces and hyphens in bill-number queries', () => {
    const bills = [bill({ id: 'a', bill_number: 'SB123' }), bill({ id: 'b', bill_number: 'HB99' })];
    expect(searchBillsLocal(bills, 'sb 123').map(b => b.id)).toEqual(['a']);
    expect(searchBillsLocal(bills, 'sb-123').map(b => b.id)).toEqual(['a']);
  });

  it('ranks number matches above title matches above description matches', () => {
    const bills = [
      bill({ id: 'desc', description: 'relates to 123 farms' }),
      bill({ id: 'title', bill_title: 'Act 123 revision' }),
      bill({ id: 'num', bill_number: 'SB123' }),
    ];
    expect(searchBillsLocal(bills, '123').map(b => b.id)).toEqual(['num', 'title', 'desc']);
  });

  it('requires every token to match (AND semantics)', () => {
    const bills = [
      bill({ id: 'both', bill_title: 'water rights protection' }),
      bill({ id: 'water-only', bill_title: 'water quality' }),
    ];
    expect(searchBillsLocal(bills, 'water rights').map(b => b.id)).toEqual(['both']);
  });

  it('tolerates one typo for tokens of 5-8 letters', () => {
    const bills = [bill({ id: 'a', bill_title: 'clean water act' })];
    expect(searchBillsLocal(bills, 'watter')).toHaveLength(1); // 1 edit from "water"
  });

  it('tolerates two typos for tokens of 9+ letters', () => {
    const bills = [bill({ id: 'a', bill_title: 'agriculture funding' })];
    expect(searchBillsLocal(bills, 'agricultre')).toHaveLength(1); // 1 edit
    expect(searchBillsLocal(bills, 'agrecultre')).toHaveLength(1); // 2 edits
  });

  it('gives no fuzz to tokens of 4 letters or fewer', () => {
    const bills = [bill({ id: 'a', bill_title: 'water bill' })];
    expect(searchBillsLocal(bills, 'watr')).toHaveLength(0);
  });

  it('ignores punctuation attached to words when fuzzy matching', () => {
    const bills = [bill({ id: 'a', description: 'funding for agriculture, farms and food' })];
    expect(searchBillsLocal(bills, 'agricultre')).toHaveLength(1);
  });

  it('excludes bills where any token fails to match', () => {
    const bills = [bill({ id: 'a', bill_title: 'water quality' })];
    expect(searchBillsLocal(bills, 'water zoning')).toHaveLength(0);
  });

  it('keeps input order for equally-scored bills (stable)', () => {
    const bills = [
      bill({ id: 'first', bill_title: 'water one' }),
      bill({ id: 'second', bill_title: 'water two' }),
    ];
    expect(searchBillsLocal(bills, 'water').map(b => b.id)).toEqual(['first', 'second']);
  });
});
