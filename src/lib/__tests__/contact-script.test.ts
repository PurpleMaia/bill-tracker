import { describe, it, expect } from 'vitest';
import { buildContactScript } from '@/lib/legislators/contact-script';
import type { CommitteeChair } from '@/db/queries/committee-chairs';

const CHAIR: CommitteeChair = {
  committeeCode: 'AGR',
  committeeName: 'Agriculture & Food Systems',
  role: 'chair',
  legislatorName: 'Rep. Kirstin Kahaloa',
  chamber: 'House',
  email: 'repkahaloa@capitol.hawaii.gov',
  phone: '808-586-8510',
};

describe('buildContactScript', () => {
  it('addresses the chair by name and states support', () => {
    const { subject, body } = buildContactScript({
      billNumber: 'HB9950',
      billTitle: 'Relating to Local Agriculture',
      chair: CHAIR,
      position: 'support',
      userName: 'Jaden Kapali',
    });
    expect(subject).toContain('HB9950');
    expect(subject).toContain('Support');
    expect(body).toContain('Rep. Kirstin Kahaloa');
    expect(body).toContain('HB9950');
    expect(body).toContain('Relating to Local Agriculture');
    expect(body).toMatch(/support/i);
    expect(body).toContain('Jaden Kapali');
  });

  it('states opposition when position is oppose', () => {
    const { subject, body } = buildContactScript({
      billNumber: 'HB9950', billTitle: 'Relating to Local Agriculture',
      chair: CHAIR, position: 'oppose',
    });
    expect(subject).toContain('Oppose');
    expect(body).toMatch(/oppose/i);
  });

  it('handles a missing bill title without printing null', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: null, chair: CHAIR, position: 'support',
    });
    expect(body).not.toContain('null');
    expect(body).toContain('HB9950');
  });

  it('uses a generic sign-off when no userName is given', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: 'X', chair: CHAIR, position: 'support',
    });
    expect(body).toMatch(/Sincerely,/);
  });
});
