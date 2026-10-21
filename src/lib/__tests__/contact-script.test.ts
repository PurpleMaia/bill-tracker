import { describe, it, expect } from 'vitest';
import {
  buildContactScript,
  buildBaseScript,
  buildCallScript,
  personalizeScript,
  NEUTRAL_GREETING,
} from '@/lib/legislators/contact-script';
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
  it('addresses the chair by name and requests a hearing', () => {
    const { subject, body } = buildContactScript({
      billNumber: 'HB9950',
      billTitle: 'Relating to Local Agriculture',
      chair: CHAIR,
      userName: 'Jaden Kapali',
    });
    expect(subject).toContain('HB9950');
    expect(subject).toMatch(/hearing/i);
    expect(body).toContain('Rep. Kirstin Kahaloa');
    expect(body).toContain('HB9950');
    expect(body).toContain('Relating to Local Agriculture');
    expect(body).toMatch(/request a hearing/i);
    expect(body).toContain('Jaden Kapali');
  });

  it('names the chair\'s committee in the request', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: 'Relating to Local Agriculture', chair: CHAIR,
    });
    expect(body).toContain('Agriculture & Food Systems');
  });

  it('handles a missing bill title without printing null', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: null, chair: CHAIR,
    });
    expect(body).not.toContain('null');
    expect(body).toContain('HB9950');
  });

  it('uses a mahalo sign-off', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: 'X', chair: CHAIR,
    });
    expect(body).toMatch(/Mahalo nui loa,/);
  });
});

describe('buildBaseScript', () => {
  it('uses the neutral greeting and no specific chair name', () => {
    const { subject, body } = buildBaseScript({
      billNumber: 'HB9950',
      billTitle: 'Relating to Local Agriculture',
      userName: 'Jaden Kapali',
      committeeName: 'Senate Committee on Ways and Means',
    });
    expect(subject).toBe('Hearing request for HB9950');
    expect(body.startsWith(NEUTRAL_GREETING)).toBe(true);
    expect(body).not.toContain('Rep.');
    expect(body).toContain('HB9950');
    expect(body).toContain('Relating to Local Agriculture');
    expect(body).toContain('Senate Committee on Ways and Means');
    expect(body).toContain('Jaden Kapali');
  });

  it('falls back to a generic committee reference when none is given', () => {
    const { body } = buildBaseScript({ billNumber: 'HB9950', billTitle: 'X' });
    expect(body).toMatch(/before the committee/i);
  });

  it('handles a missing title without printing null', () => {
    const { body } = buildBaseScript({ billNumber: 'HB9950', billTitle: null });
    expect(body).not.toContain('null');
    expect(body).toMatch(/request a hearing/i);
  });
});

describe('buildCallScript', () => {
  it('is a short spoken hearing ask with no greeting or signature', () => {
    const script = buildCallScript({
      billNumber: 'HB9950',
      billTitle: 'Relating to Local Agriculture',
      userName: 'Jaden Kapali',
      committeeName: 'Senate Committee on Ways and Means',
    });
    expect(script).toContain('Jaden Kapali');
    expect(script).toContain('HB9950');
    expect(script).toMatch(/schedule a hearing/i);
    expect(script).toContain('Senate Committee on Ways and Means');
    expect(script).not.toContain('Dear');
    expect(script).not.toContain('Sincerely');
  });

  it('handles a missing title and no committee name', () => {
    const script = buildCallScript({ billNumber: 'HB9950', billTitle: null });
    expect(script).toMatch(/schedule a hearing/i);
    expect(script).not.toContain('null');
    expect(script).toContain('<your-name>');
  });
});

describe('personalizeScript', () => {
  it('replaces the neutral greeting with the chair name, preserving edits', () => {
    const base = buildBaseScript({ billNumber: 'HB9950', billTitle: 'X', userName: 'Jaden' }).body;
    const edited = base.replace('weigh in', 'share their voice');
    const personalized = personalizeScript(edited, CHAIR);
    expect(personalized.startsWith('Dear Rep. Kirstin Kahaloa,')).toBe(true);
    expect(personalized).not.toContain(NEUTRAL_GREETING);
    // the user's edit to the body survives
    expect(personalized).toContain('share their voice');
  });

  it('prepends a greeting when the body has none', () => {
    const personalized = personalizeScript('I am writing about HB9950.', CHAIR);
    expect(personalized.startsWith('Dear Rep. Kirstin Kahaloa,')).toBe(true);
    expect(personalized).toContain('I am writing about HB9950.');
  });
});
