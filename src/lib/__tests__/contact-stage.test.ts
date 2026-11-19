import { describe, it, expect } from 'vitest';
import {
  buildContactOpportunities,
  coversCurrentStage,
  getContactStage,
  hawaiiDay,
  isContactMethod,
  isContactStage,
  parseStatusDate,
  type ContactableBill,
  type ContactRecord,
} from '@/lib/legislators/contact-stage';

function bill(overrides: Partial<ContactableBill> & { id: string }): ContactableBill {
  return {
    bill_number: overrides.id.toUpperCase(),
    current_bill_status: 'introduced',
    dead: false,
    archived: false,
    latest_update: null,
    ...overrides,
  };
}

function contact(billId: string, stage: ContactRecord['stage'], contactedAt: string): ContactRecord {
  return { billId, stage, contactedAt };
}

describe('getContactStage', () => {
  it('asks for a hearing while a bill waits on a committee', () => {
    for (const status of ['introduced', 'waiting2', 'waiting3', 'crossoverWaiting1', 'crossoverWaiting2', 'crossoverWaiting3']) {
      expect(getContactStage({ status, dead: false })).toBe('hearing');
    }
  });

  it('has no ask once a hearing is scheduled, or before referral', () => {
    expect(getContactStage({ status: 'scheduled1', dead: false })).toBeNull();
    expect(getContactStage({ status: 'crossoverScheduled2', dead: false })).toBeNull();
    expect(getContactStage({ status: 'unassigned', dead: false })).toBeNull();
    expect(getContactStage({ status: 'deferred1', dead: false })).toBeNull();
  });

  it('targets conferees in conference', () => {
    expect(getContactStage({ status: 'conferenceAssigned', dead: false })).toBe('conference');
    expect(getContactStage({ status: 'conferenceScheduled', dead: false })).toBe('conference');
  });

  it('targets the Governor, then an override after a final veto', () => {
    expect(getContactStage({ status: 'transmittedGovernor', dead: false })).toBe('governor');
    expect(
      getContactStage({ status: 'vetoList', dead: false, latestStatusText: 'Notice of intent to veto.' }),
    ).toBe('intentToVeto');
    expect(
      getContactStage({ status: 'vetoList', dead: false, latestStatusText: 'Vetoed (Gov. Msg. No. 1369).' }),
    ).toBe('override');
  });

  it('has no one to contact for enacted or failed bills', () => {
    expect(getContactStage({ status: 'governorSigns', dead: false })).toBeNull();
    expect(getContactStage({ status: 'lawWithoutSignature', dead: false })).toBeNull();
    expect(getContactStage({ status: 'introduced', dead: true })).toBeNull();
    expect(getContactStage({ status: 'transmittedGovernor', dead: true })).toBeNull();
    expect(getContactStage({ status: null, dead: false })).toBeNull();
  });
});

describe('parseStatusDate', () => {
  it('reads Capitol M/D/YYYY and ISO dates', () => {
    expect(parseStatusDate('4/5/2026')).toBe('2026-04-05');
    expect(parseStatusDate('12/15/2026')).toBe('2026-12-15');
    expect(parseStatusDate('2026-07-15')).toBe('2026-07-15');
    expect(parseStatusDate('2026-07-15T10:00:00Z')).toBe('2026-07-15');
  });

  it('returns null for missing or unreadable dates', () => {
    expect(parseStatusDate(null)).toBeNull();
    expect(parseStatusDate('')).toBeNull();
    expect(parseStatusDate('soon')).toBeNull();
  });
});

describe('hawaiiDay', () => {
  it('uses the Hawaiʻi calendar day, not UTC', () => {
    // 05:00 UTC on Mar 2 is 19:00 on Mar 1 in Honolulu (UTC-10).
    expect(hawaiiDay('2026-03-02T05:00:00Z')).toBe('2026-03-01');
    expect(hawaiiDay('2026-03-02T12:00:00Z')).toBe('2026-03-02');
  });
});

describe('coversCurrentStage', () => {
  it('counts a same-stage contact made on or after the bill last moved', () => {
    const contacts = [contact('b1', 'hearing', '2026-02-10T20:00:00Z')];
    expect(coversCurrentStage(contacts, 'hearing', '2/10/2026')).toBe(true);
    expect(coversCurrentStage(contacts, 'hearing', '2/1/2026')).toBe(true);
  });

  it('asks again once the bill moves on, even within the same stage', () => {
    const contacts = [contact('b1', 'hearing', '2026-02-10T20:00:00Z')];
    expect(coversCurrentStage(contacts, 'hearing', '2/20/2026')).toBe(false);
  });

  it('ignores contacts for a different stage', () => {
    const contacts = [contact('b1', 'hearing', '2026-04-20T20:00:00Z')];
    expect(coversCurrentStage(contacts, 'conference', '4/15/2026')).toBe(false);
  });

  it('counts any same-stage contact when the status date is unreadable', () => {
    const contacts = [contact('b1', 'governor', '2026-01-01T20:00:00Z')];
    expect(coversCurrentStage(contacts, 'governor', null)).toBe(true);
  });
});

describe('buildContactOpportunities', () => {
  it('splits bills into to-contact, contacted and earlier', () => {
    const bills = [
      bill({ id: 'a', current_bill_status: 'introduced', latest_update: { statustext: 'Referred to AGR.', date: '1/20/2026' } }),
      bill({ id: 'b', current_bill_status: 'waiting2', latest_update: { statustext: 'Passed first reading.', date: '2/1/2026' } }),
      bill({ id: 'c', current_bill_status: 'scheduled1' }),
      bill({ id: 'd', current_bill_status: 'scheduled1' }),
    ];
    const contacts = [
      contact('b', 'hearing', '2026-02-03T20:00:00Z'),
      contact('c', 'hearing', '2026-01-25T20:00:00Z'),
    ];
    const { toContact, contacted, earlier } = buildContactOpportunities(bills, contacts);
    expect(toContact.map((o) => o.bill.id)).toEqual(['a']);
    expect(contacted.map((o) => o.bill.id)).toEqual(['b']);
    expect(contacted[0].stage).toBe('hearing');
    expect(earlier.map((o) => o.bill.id)).toEqual(['c']);
    expect(earlier[0].stage).toBeNull();
  });

  it('keeps a bill to contact when its only contact was for an earlier step', () => {
    const bills = [
      bill({ id: 'a', current_bill_status: 'waiting2', latest_update: { statustext: 'Passed AGR.', date: '2/20/2026' } }),
    ];
    const contacts = [contact('a', 'hearing', '2026-01-25T20:00:00Z')];
    const { toContact, contacted } = buildContactOpportunities(bills, contacts);
    expect(toContact).toHaveLength(1);
    expect(toContact[0].contacts).toHaveLength(1);
    expect(contacted).toHaveLength(0);
  });

  it('drops archived and duplicate bills', () => {
    const bills = [
      bill({ id: 'a', archived: true }),
      bill({ id: 'b' }),
      bill({ id: 'b' }),
    ];
    const { toContact } = buildContactOpportunities(bills, []);
    expect(toContact.map((o) => o.bill.id)).toEqual(['b']);
  });

  it('sorts each bill’s contacts and the contacted list newest first', () => {
    const bills = [
      bill({ id: 'a', current_bill_status: 'transmittedGovernor' }),
      bill({ id: 'b', current_bill_status: 'transmittedGovernor' }),
    ];
    const contacts = [
      contact('a', 'governor', '2026-05-01T20:00:00Z'),
      contact('a', 'governor', '2026-05-03T20:00:00Z'),
      contact('b', 'governor', '2026-05-02T20:00:00Z'),
    ];
    const { contacted } = buildContactOpportunities(bills, contacts);
    expect(contacted.map((o) => o.bill.id)).toEqual(['a', 'b']);
    expect(contacted[0].contacts.map((c) => c.contactedAt)).toEqual([
      '2026-05-03T20:00:00Z',
      '2026-05-01T20:00:00Z',
    ]);
  });
});

describe('isContactStage / isContactMethod', () => {
  it('accepts only known values', () => {
    expect(isContactStage('hearing')).toBe(true);
    expect(isContactStage('lunch')).toBe(false);
    expect(isContactStage(undefined)).toBe(false);
    expect(isContactMethod('call')).toBe(true);
    expect(isContactMethod('fax')).toBe(false);
  });
});
