import { describe, it, expect } from 'vitest';
import { formatLegislatorLabel, formatRoles } from '@/lib/legislators/legislator-labels';
import type { LegislatorOption } from '@/types/legislation';

const opt = (overrides: Partial<LegislatorOption> = {}): LegislatorOption => ({
  id: '1',
  firstName: 'Mike',
  lastName: 'Lee',
  chamber: 'House',
  district: 12,
  inOffice: true,
  committees: [],
  ...overrides,
});

describe('formatLegislatorLabel', () => {
  it('formats a House member as "Last, First (H-district)"', () => {
    expect(formatLegislatorLabel(opt())).toBe('Lee, Mike (H-12)');
  });

  it('uses S- for Senate members', () => {
    expect(formatLegislatorLabel(opt({ chamber: 'Senate', district: 3 }))).toBe('Lee, Mike (S-3)');
  });

  it('omits the district suffix when district is null', () => {
    expect(formatLegislatorLabel(opt({ district: null }))).toBe('Lee, Mike');
  });

  it('appends (former) for legislators no longer in office', () => {
    expect(formatLegislatorLabel(opt({ inOffice: false }))).toBe('Lee, Mike (H-12) (former)');
    expect(formatLegislatorLabel(opt({ inOffice: false, district: null }))).toBe('Lee, Mike (former)');
  });

  it('drops the comma when the first name is missing', () => {
    expect(formatLegislatorLabel(opt({ firstName: '' }))).toBe('Lee (H-12)');
  });
});

describe('formatRoles', () => {
  it('lists chair roles before vice-chair roles, joined by " · "', () => {
    expect(
      formatRoles(
        opt({
          committees: [
            { code: 'FIN', role: 'vice-chair' },
            { code: 'AGR', role: 'chair' },
          ],
        }),
      ),
    ).toBe('Chair AGR · Vice Chair FIN');
  });

  it('formats a single role', () => {
    expect(formatRoles(opt({ committees: [{ code: 'WAL', role: 'vice-chair' }] }))).toBe(
      'Vice Chair WAL',
    );
  });

  it('returns an empty string for a legislator with no roles', () => {
    expect(formatRoles(opt())).toBe('');
  });
});
