import { describe, it, expect } from 'vitest';
import { deriveBillStanding } from '@/lib/bills/bill-standing';
import type { BillDetails } from '@/types/legislation';

// Minimal BillDetails factory — only the fields deriveBillStanding reads.
function makeBill(overrides: Partial<BillDetails> = {}): BillDetails {
  return {
    id: 'b1',
    bill_number: 'HB123',
    current_bill_status: 'introduced',
    dead: false,
    committee_assignment: 'FIN',
    latest_update: null,
    ...overrides,
  } as unknown as BillDetails;
}

// A date well before any 2026 session deadline, so testimony is open on merit.
const TODAY = '2026-01-15';

describe('deriveBillStanding', () => {
  it('reports a dead bill without any next action', () => {
    const s = deriveBillStanding(makeBill({ dead: true }), TODAY);
    expect(s.reason.toLowerCase()).toContain('no longer moving');
    expect(s.action).toBeNull();
  });

  it('names the committee and chamber when the bill is waiting on a hearing', () => {
    const s = deriveBillStanding(
      makeBill({ bill_number: 'HB123', current_bill_status: 'waiting2', committee_assignment: 'FIN' }),
      TODAY,
    );
    expect(s.reason.toLowerCase()).toContain('committee');
    expect(s.reason).toContain('FIN');
    expect(s.reason.toLowerCase()).toContain('schedule');
    expect(s.reason).toContain('House');
  });

  it('names the Senate for an SB and the other chamber after crossover', () => {
    const senate = deriveBillStanding(
      makeBill({ bill_number: 'SB50', current_bill_status: 'waiting2', committee_assignment: 'AGR' }),
      TODAY,
    );
    expect(senate.reason).toContain('Senate');
    // An SB in crossover sits in the House.
    const crossed = deriveBillStanding(
      makeBill({ bill_number: 'SB50', current_bill_status: 'crossoverWaiting2', committee_assignment: 'AGR' }),
      TODAY,
    );
    expect(crossed.reason).toContain('House');
  });

  it('does not use em dashes in any reason', () => {
    const statuses = ['introduced', 'waiting2', 'scheduled1', 'conferenceAssigned', 'transmittedGovernor', 'governorSigns'];
    for (const st of statuses) {
      const s = deriveBillStanding(makeBill({ current_bill_status: st }), TODAY);
      expect(s.reason).not.toContain('—');
    }
    expect(deriveBillStanding(makeBill({ dead: true }), TODAY).reason).not.toContain('—');
  });

  it('reports a scheduled hearing and points at testimony', () => {
    const s = deriveBillStanding(
      makeBill({ current_bill_status: 'scheduled1', committee_assignment: 'AGR' }),
      TODAY,
    );
    expect(s.reason.toLowerCase()).toContain('hearing');
    expect(s.action?.toLowerCase()).toContain('testimony');
  });

  it('surfaces an open testimony window when eligible in a committee stage', () => {
    const s = deriveBillStanding(
      makeBill({ current_bill_status: 'waiting2', committee_assignment: 'FIN' }),
      TODAY,
    );
    // Committee stage with testimony still open => action nudges testimony.
    expect(s.action?.toLowerCase()).toContain('testimony');
  });

  it('describes the conference stage as waiting on conferees', () => {
    const s = deriveBillStanding(
      makeBill({ current_bill_status: 'conferenceAssigned' }),
      TODAY,
    );
    expect(s.reason.toLowerCase()).toContain('conferee');
    expect(s.action).toBeNull();
  });

  it('describes the governor stage as awaiting the Governor', () => {
    const s = deriveBillStanding(
      makeBill({ current_bill_status: 'transmittedGovernor' }),
      TODAY,
    );
    expect(s.reason.toLowerCase()).toContain('governor');
    expect(s.action).toBeNull();
  });

  it('reports an enacted bill as law', () => {
    const s = deriveBillStanding(
      makeBill({ current_bill_status: 'governorSigns' }),
      TODAY,
    );
    expect(s.reason.toLowerCase()).toContain('law');
    expect(s.action).toBeNull();
  });

  it('does not push testimony once the final hearing deadline has passed', () => {
    const s = deriveBillStanding(
      makeBill({ current_bill_status: 'waiting2', committee_assignment: 'FIN' }),
      '2026-12-31',
    );
    expect(s.action).toBeNull();
  });
});
