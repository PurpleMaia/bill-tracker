import { describe, it, expect } from 'vitest';
import { deriveBriefingFacts } from '../bills/bill-briefing-facts';
import type { BillDetails, BillVersion } from '@/types/legislation';

const ver = (label: string): BillVersion => ({
  id: label, label, htmlLink: `https://x/${label}.htm`, pdfLink: null,
  originalText: 'text', aiSummary: null, createdAt: null,
  summaryGeneratedAt: null,
});

const baseBill = (over: Partial<BillDetails> = {}): BillDetails => ({
  id: 'b1', bill_number: 'HB1334', bill_title: 'T', nickname: null,
  bill_url: '', year: 2026, current_bill_status: 'scheduled1',
  current_status_string: '', description: 'A food bill.', archived: false,
  dead: false, committee_assignment: 'AGR, FIN', introducer: 'X',
  latest_update: null, food_related: true, created_at: null, updated_at: null,
  updates: [], versions: [ver('HB1334'), ver('HB1334_HD1')], reports: [],
  ...over,
});

describe('deriveBriefingFacts', () => {
  it('marks testimony open early in session and picks the latest version', () => {
    const f = deriveBriefingFacts(baseBill(), '2026-02-01');
    expect(f.testimony.open).toBe(true);
    expect(f.latestVersionLabel).toBe('HB1334_HD1');
    expect(f.committeeCodes).toEqual(['AGR', 'FIN']);
    // testimony open → a testimony next-step is offered
    expect(f.nextSteps.some((s) => s.action === 'testimony')).toBe(true);
    // two versions → a diff next-step is offered
    expect(f.nextSteps.some((s) => s.action === 'diff')).toBe(true);
  });

  it('marks testimony closed and gives a reason for a dead bill', () => {
    const f = deriveBriefingFacts(baseBill({ dead: true }), '2026-02-01');
    expect(f.testimony.open).toBe(false);
    expect(f.testimony.message.length).toBeGreaterThan(0);
    expect(f.nextSteps.some((s) => s.action === 'testimony')).toBe(false);
  });

  it('offers no diff step when there is only one version', () => {
    const f = deriveBriefingFacts(baseBill({ versions: [ver('HB1334')] }), '2026-02-01');
    expect(f.nextSteps.some((s) => s.action === 'diff')).toBe(false);
  });

  it('closes testimony once the scheduled hearing has passed', () => {
    // Scheduled bill, well before the session deadline, but the hearing in its
    // latest update was held in the past — testimony can no longer be submitted.
    const bill = baseBill({
      current_bill_status: 'scheduled1',
      latest_update: {
        id: 'u1', chamber: 'H', date: '1/15/2026',
        statustext: 'The committee(s) on AGR has scheduled a public hearing on 01-15-26 9:00AM in room 325.',
      },
    });
    const f = deriveBriefingFacts(bill, '2026-02-01');
    expect(f.testimony.open).toBe(false);
    expect(f.testimony.message.toLowerCase()).toContain('hearing');
    expect(f.nextSteps.some((s) => s.action === 'testimony')).toBe(false);
  });

  it('keeps testimony open when the scheduled hearing is still ahead', () => {
    const bill = baseBill({
      current_bill_status: 'scheduled1',
      latest_update: {
        id: 'u2', chamber: 'H', date: '2/20/2026',
        statustext: 'The committee(s) on AGR has scheduled a public hearing on 02-20-26 9:00AM in room 325.',
      },
    });
    const f = deriveBriefingFacts(bill, '2026-02-01');
    expect(f.testimony.open).toBe(true);
    expect(f.nextSteps.some((s) => s.action === 'testimony')).toBe(true);
  });
});
