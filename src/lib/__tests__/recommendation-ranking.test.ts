import { describe, it, expect } from 'vitest';
import { rankRecommendations } from '@/lib/bills/recommendation-ranking';
import type { BillSearchResult } from '@/types/legislation';

const NOW = new Date('2026-03-01T00:00:00Z');

function bill(
  n: string,
  o: Partial<BillSearchResult> & { matched?: string[]; text?: string; date?: string } = {},
): BillSearchResult & { matched: string[] } {
  const { matched = ['a'], text, date, ...rest } = o;
  return {
    id: n,
    bill_number: n,
    bill_title: n,
    description: '',
    year: 2026,
    bill_status: null,
    dead: false,
    bill_url: '',
    updated_at: null,
    nickname: null,
    committee_assignment: null,
    is_tracked: false,
    latest_update:
      text !== undefined || date !== undefined
        ? { date: date ?? '2026-01-01', statustext: text ?? 'Referred.' } as BillSearchResult['latest_update']
        : null,
    matched,
    ...rest,
  };
}

const FUTURE = (d: string) => `The committee(s) on AGR will hold a public hearing on ${d} at 1:30 PM.`;
const order = (r: { bill_number: string }[]) => r.map((b) => b.bill_number);

describe('rankRecommendations', () => {
  it('ranks alive bills above dead bills even with an upcoming hearing', () => {
    const r = rankRecommendations(
      [bill('HB1', { dead: true, text: FUTURE('03-10-2026') }), bill('HB2')],
      NOW,
    );
    expect(order(r)).toEqual(['HB2', 'HB1']);
  });

  it('ranks future hearings first, soonest first; past hearing is null', () => {
    const r = rankRecommendations(
      [
        bill('HB1', { date: '2026-02-28' }),
        bill('HB2', { text: FUTURE('03-20-2026') }),
        bill('HB3', { text: FUTURE('03-10-2026') }),
        bill('HB4', { text: FUTURE('02-10-2026') }),
      ],
      NOW,
    );
    expect(order(r).slice(0, 2)).toEqual(['HB3', 'HB2']);
    expect(r[0].next_hearing_at).toBe(new Date('2026-03-10T13:30:00-10:00').toISOString());
    expect(r.find((b) => b.bill_number === 'HB4')!.next_hearing_at).toBeNull();
    expect(r.find((b) => b.bill_number === 'HB1')!.next_hearing_at).toBeNull();
  });

  it('orders by recent activity, falling back to updated_at, missing last', () => {
    const r = rankRecommendations(
      [
        bill('HB1', { date: '2026-01-01' }),
        bill('HB2'),
        bill('HB3', { updated_at: '2026-02-20T00:00:00Z' }),
        bill('HB4', { date: '2026-02-01' }),
      ],
      NOW,
    );
    expect(order(r)).toEqual(['HB3', 'HB4', 'HB1', 'HB2']);
  });

  it('breaks timing ties by matched count, then bill number', () => {
    const r = rankRecommendations(
      [bill('HB3', { matched: ['a'] }), bill('HB2', { matched: ['a'] }), bill('HB9', { matched: ['a', 'b'] })],
      NOW,
    );
    expect(order(r)).toEqual(['HB9', 'HB2', 'HB3']);
  });

  it('gives no advantage for repeated keyword text in the description', () => {
    const r = rankRecommendations(
      [bill('HB2', { description: 'agriculture '.repeat(10) }), bill('HB1')],
      NOW,
    );
    expect(order(r)).toEqual(['HB1', 'HB2']);
  });

  it('caps output at limit and does not mutate input', () => {
    const input = Array.from({ length: 15 }, (_, i) => bill(`HB${String(i).padStart(2, '0')}`));
    const copy = [...input];
    expect(rankRecommendations(input, NOW)).toHaveLength(10);
    expect(rankRecommendations(input, NOW, 3)).toHaveLength(3);
    expect(input).toEqual(copy);
  });
});
