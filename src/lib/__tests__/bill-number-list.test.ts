import { describe, it, expect } from 'vitest';
import {
  canonicalBillNumber,
  parseBillNumberList,
  matchBillNumberList,
} from '../bills/bill-number-list';

describe('canonicalBillNumber', () => {
  it('uppercases and strips spacing, hyphens and draft suffixes', () => {
    expect(canonicalBillNumber('hb 1334')).toBe('HB1334');
    expect(canonicalBillNumber('SB-45')).toBe('SB45');
    expect(canonicalBillNumber('HB1494_HD1')).toBe('HB1494');
  });
});

describe('parseBillNumberList', () => {
  it('reads numbers separated by commas, newlines and spaces', () => {
    expect(parseBillNumberList('HB1334, SB45\nhb 12  GM-500')).toEqual(['HB1334', 'SB45', 'HB12', 'GM500']);
  });

  it('dedupes while keeping first-seen order', () => {
    expect(parseBillNumberList('SB45 HB1 sb 45 HB-1')).toEqual(['SB45', 'HB1']);
  });

  it('swallows draft suffixes instead of reading them as bills', () => {
    expect(parseBillNumberList('HB1334 HD1, SB894_SD1, HB2 CD2')).toEqual(['HB1334', 'SB894', 'HB2']);
  });

  it('drops leading zeros', () => {
    expect(parseBillNumberList('HB0012')).toEqual(['HB12']);
  });

  it('returns nothing for text with no bill numbers', () => {
    expect(parseBillNumberList('')).toEqual([]);
    expect(parseBillNumberList('please tag these, thanks')).toEqual([]);
  });
});

describe('matchBillNumberList', () => {
  const bills = [
    { id: 'a', bill_number: 'HB1334' },
    { id: 'b', bill_number: 'SB45' },
    { id: 'c', bill_number: 'SB45' }, // same number, earlier session
    { id: 'd', bill_number: 'HB12' },
  ];

  it('matches every bill with a listed number and reports the rest', () => {
    expect(matchBillNumberList('hb 1334\nSB45\nHB999', bills)).toEqual({
      matchedIds: ['a', 'b', 'c'],
      unmatched: ['HB999'],
    });
  });

  it('returns empty results for an empty list', () => {
    expect(matchBillNumberList('', bills)).toEqual({ matchedIds: [], unmatched: [] });
  });
});
