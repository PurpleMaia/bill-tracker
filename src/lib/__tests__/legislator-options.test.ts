import { describe, it, expect } from 'vitest';
import { buildLegislatorOptions } from '@/lib/legislators/legislator-options';

const leg = (id: string, first: string | null, last: string | null, chamber: string | null = 'House') => ({
  id, first_name: first, last_name: last, chamber, district: 1, in_office: true,
});

describe('buildLegislatorOptions', () => {
  it('sorts by last then first name with null names last', () => {
    const out = buildLegislatorOptions(
      [leg('1', null, null), leg('2', 'Zed', 'Ahn'), leg('3', 'Amy', 'Ahn'), leg('4', 'Bo', 'Lee')],
      [],
    );
    expect(out.map((o) => o.id)).toEqual(['3', '2', '4', '1']);
    expect(out[3]).toMatchObject({ firstName: '', lastName: '' });
  });

  it('groups roles: chair before vice-chair, then code, upper-cased', () => {
    const out = buildLegislatorOptions(
      [leg('1', 'A', 'B')],
      [
        { legislator_id: '1', code: 'zzz', role: 'vice_chair' },
        { legislator_id: '1', code: 'agr', role: 'vice_chair' },
        { legislator_id: '1', code: 'hlt', role: 'chair' },
        { legislator_id: '1', code: 'cpc', role: 'chair' },
      ],
    );
    expect(out[0].committees).toEqual([
      { code: 'CPC', role: 'chair' },
      { code: 'HLT', role: 'chair' },
      { code: 'AGR', role: 'vice-chair' },
      { code: 'ZZZ', role: 'vice-chair' },
    ]);
  });

  it('gives non-chairs an empty list and normalises chamber', () => {
    const out = buildLegislatorOptions([leg('1', 'A', 'B', 'Senate'), leg('2', 'C', 'D', null)], []);
    expect(out[0]).toMatchObject({ chamber: 'Senate', committees: [] });
    expect(out[1].chamber).toBe('House');
  });
});
