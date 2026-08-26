import { describe, it, expect } from 'vitest';
import {
  COMMITTEE_NAMES,
  committeeFullName,
  parseCommitteeCodes,
  inferCurrentCommittee,
} from '../testimony/committees';

describe('committeeFullName', () => {
  it('translates known House and Senate codes', () => {
    expect(committeeFullName('FIN')).toBe('Finance');
    expect(committeeFullName('WAM')).toBe('Ways and Means');
    expect(committeeFullName('AGR')).toBe('Agriculture & Food Systems');
    expect(committeeFullName('JDC')).toBe('Judiciary');
  });

  it('handles joint referrals with slashes', () => {
    expect(committeeFullName('WLA/EIG')).toBe('Water and Land / Energy and Intergovernmental Affairs');
    expect(committeeFullName('JDC/WAM')).toBe('Judiciary / Ways and Means');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(committeeFullName(' fin ')).toBe('Finance');
    expect(committeeFullName('wla/ eig')).toBe('Water and Land / Energy and Intergovernmental Affairs');
  });

  it('passes unknown codes through unchanged', () => {
    expect(committeeFullName('XYZ')).toBe('XYZ');
    expect(committeeFullName('XYZ/FIN')).toBe('XYZ / Finance');
  });

  it('has a non-empty name for every mapped code', () => {
    for (const [code, name] of Object.entries(COMMITTEE_NAMES)) {
      expect(name.length, `empty name for ${code}`).toBeGreaterThan(0);
    }
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
    expect(inferCurrentCommittee('WLA/EIG', updates)).toBe('WLA');
  });

  it('resolves to the leading referral committee when one line names several', () => {
    const updates = [
      { statustext: 'Referred to AEN and WAM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('AEN');
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
