import { describe, it, expect } from 'vitest';
import {
  committeeFullName,
  parseCommitteeCodes,
  inferCurrentCommittee,
  hasJointReferral,
  jointReferralPartners,
  type CommitteeNameMap,
} from '../testimony/committees';

// Committee names are DB-backed now, so tests inject their own fixture map
// rather than asserting against a hardcoded production table.
const NAMES: CommitteeNameMap = {
  FIN: 'Finance',
  WAM: 'Ways and Means',
  AGR: 'Agriculture & Food Systems',
  JDC: 'Judiciary',
  WLA: 'Water and Land',
  EIG: 'Energy and Intergovernmental Affairs',
};

describe('jointReferralPartners', () => {
  it('returns both committees of the joint token containing the code', () => {
    expect(jointReferralPartners('HHS/WAE, SDL', 'HHS')).toEqual(['HHS', 'WAE']);
    expect(jointReferralPartners('HHS/WAE, SDL', 'WAE')).toEqual(['HHS', 'WAE']);
  });

  it('returns just the code for a lone referral', () => {
    expect(jointReferralPartners('HHS/WAE, SDL', 'SDL')).toEqual(['SDL']);
    expect(jointReferralPartners('AGR, FIN', 'AGR')).toEqual(['AGR']);
  });

  it('is case-insensitive and null/empty safe', () => {
    expect(jointReferralPartners('hhs/wae', 'HHS')).toEqual(['HHS', 'WAE']);
    expect(jointReferralPartners(null, 'HHS')).toEqual(['HHS']);
    expect(jointReferralPartners('AGR, FIN', 'XYZ')).toEqual(['XYZ']);
  });
});

describe('hasJointReferral', () => {
  it('detects a slash within a single referral token', () => {
    expect(hasJointReferral('HHS/WAE')).toBe(true);
    expect(hasJointReferral('HHS/WAE, SDL')).toBe(true);
    expect(hasJointReferral('AGR, EDN/FIN')).toBe(true);
  });

  it('is false for separate (comma-only) referrals', () => {
    expect(hasJointReferral('AGR, FIN')).toBe(false);
    expect(hasJointReferral('AGR')).toBe(false);
  });

  it('is null/empty safe', () => {
    expect(hasJointReferral(null)).toBe(false);
    expect(hasJointReferral(undefined)).toBe(false);
    expect(hasJointReferral('')).toBe(false);
  });
});

describe('committeeFullName', () => {
  it('translates known codes from the injected names map', () => {
    expect(committeeFullName('FIN', NAMES)).toBe('Finance');
    expect(committeeFullName('WAM', NAMES)).toBe('Ways and Means');
    expect(committeeFullName('AGR', NAMES)).toBe('Agriculture & Food Systems');
    expect(committeeFullName('JDC', NAMES)).toBe('Judiciary');
  });

  it('handles joint referrals with slashes', () => {
    expect(committeeFullName('WLA/EIG', NAMES)).toBe('Water and Land / Energy and Intergovernmental Affairs');
    expect(committeeFullName('JDC/WAM', NAMES)).toBe('Judiciary / Ways and Means');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(committeeFullName(' fin ', NAMES)).toBe('Finance');
    expect(committeeFullName('wla/ eig', NAMES)).toBe('Water and Land / Energy and Intergovernmental Affairs');
  });

  it('passes unknown codes through unchanged', () => {
    expect(committeeFullName('XYZ', NAMES)).toBe('XYZ');
    expect(committeeFullName('XYZ/FIN', NAMES)).toBe('XYZ / Finance');
  });

  it('passes every code through unchanged when the map is empty (pre-fetch state)', () => {
    expect(committeeFullName('FIN', {})).toBe('FIN');
    expect(committeeFullName('WLA/EIG', {})).toBe('WLA / EIG');
  });
});

describe('parseCommitteeCodes', () => {
  it('splits comma- and slash-separated codes, trimmed and de-duped', () => {
    expect(parseCommitteeCodes('AGR, EDN/FIN, AGR')).toEqual(['AGR', 'EDN', 'FIN']);
  });
  it('upper-cases and trims', () => {
    expect(parseCommitteeCodes(' fin , agr ')).toEqual(['FIN', 'AGR']);
  });
  it('returns [] for null or empty', () => {
    expect(parseCommitteeCodes(null)).toEqual([]);
    expect(parseCommitteeCodes('   ')).toEqual([]);
  });
});

describe('inferCurrentCommittee', () => {
  it('returns the committee named in the most recent status update', () => {
    const updates = [
      { statustext: 'The committee(s) on WAM will hold a public decision making on 02-13-2026 at 1:30 PM.' },
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
      { statustext: 'The committee(s) on AEN has scheduled a public hearing on 01-15-26 9:00AM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('picks the newest referral committee even when an older update names an earlier one', () => {
    const updates = [
      { statustext: 'Referred to WAM.' },
      { statustext: 'The committee on AEN passed the measure.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('still infers when the bill is only in its first committee', () => {
    const updates = [
      { statustext: 'The committee(s) on AEN has scheduled a public hearing on 01-15-26 9:00AM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('AEN');
  });

  it('handles joint-referral tokens in status text', () => {
    const updates = [
      { statustext: 'Referred to the committee(s) on WLA/EIG.' },
    ];
    // A joint referral is heard together; we return the furthest-along part
    // deterministically (EIG follows WLA in the parsed referral order).
    expect(inferCurrentCommittee('WLA/EIG', updates)).toBe('EIG');
  });

  it('resolves to the furthest-along committee across referral phrases', () => {
    const updates = [
      { statustext: 'The committee(s) on WAM has scheduled a public hearing on 02-13-26 1:30PM.' },
      { statustext: 'Passed and referred to the committee(s) on AEN.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('does not let an incidental earlier-committee mention override an explicit later one', () => {
    // The freshest update explicitly schedules WAM but also references the prior
    // AEN referral as a bare word. Phrase precision + furthest-along must win WAM.
    const updates = [
      { statustext: 'The committee(s) on WAM has scheduled a public hearing (prior referral: AEN).' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('is independent of same-day update ordering', () => {
    // Same date, order not guaranteed by the DB. Furthest-along wins regardless.
    const referredFirst = [
      { statustext: 'The committee(s) on WAM has scheduled a hearing on 02-13-26 1:30PM.' },
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
      { statustext: 'The committee(s) on AEN passed the measure.' },
    ];
    const reversed = [...referredFirst].reverse();
    expect(inferCurrentCommittee('AEN, WAM', referredFirst)).toBe('WAM');
    expect(inferCurrentCommittee('AEN, WAM', reversed)).toBe('WAM');
  });

  it('falls back to the last referral code when no update names a committee', () => {
    const updates = [{ statustext: 'Introduced and passed First Reading.' }];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('falls back to the last referral code with no updates at all', () => {
    expect(inferCurrentCommittee('AEN, WAM', [])).toBe('WAM');
    expect(inferCurrentCommittee('AEN, WAM', null)).toBe('WAM');
  });

  it('returns null when there is no committee assignment', () => {
    expect(inferCurrentCommittee(null, [{ statustext: 'anything' }])).toBeNull();
    expect(inferCurrentCommittee('', [])).toBeNull();
  });

  it('ignores codes in status text that are not part of the referral', () => {
    const updates = [{ statustext: 'The committee(s) on FIN scheduled a hearing.' }];
    // FIN is not in this bill's referral list, so it's ignored; fall back to last.
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });
});
