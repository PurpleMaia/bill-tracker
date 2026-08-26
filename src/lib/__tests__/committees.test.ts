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
  // Committees are met in list order: the FIRST code is the committee the bill
  // must clear first. The current committee is the earliest one not yet cleared.

  it('is the first committee while the bill still sits there', () => {
    // AEN only has a hearing scheduled — it hasn't cleared the bill yet.
    const updates = [
      { statustext: 'The committee(s) on AEN has scheduled a public hearing on 01-15-26 9:00AM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('AEN');
  });

  it('advances to the next committee once the first clears the bill', () => {
    const updates = [
      { statustext: 'The committee(s) on WAM has scheduled a public hearing on 02-13-26 1:30PM.' },
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
      { statustext: 'The committee(s) on AEN recommend(s) that the measure be PASSED.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('treats an explicit referral to a later committee as proof the earlier ones cleared', () => {
    // Only the referral line is present; AEN never gets its own "passed" line,
    // but being referred to WAM implies AEN let it move on.
    const updates = [
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('stays on a committee that deferred the bill (a deferral is not clearing)', () => {
    const updates = [
      { statustext: 'The committee on AEN deferred the measure.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('AEN');
  });

  it('keeps the leading committee of a joint referral (heard together)', () => {
    const updates = [
      { statustext: 'Referred to the committee(s) on WLA/EIG.' },
    ];
    expect(inferCurrentCommittee('WLA/EIG', updates)).toBe('WLA');
  });

  it('is independent of update ordering', () => {
    const forward = [
      { statustext: 'The committee(s) on AEN recommend(s) that the measure be PASSED.' },
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
    ];
    const reversed = [...forward].reverse();
    expect(inferCurrentCommittee('AEN, WAM', forward)).toBe('WAM');
    expect(inferCurrentCommittee('AEN, WAM', reversed)).toBe('WAM');
  });

  it('falls back to the FIRST referral code when no update signals progress', () => {
    const updates = [{ statustext: 'Introduced and passed First Reading.' }];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('AEN');
  });

  it('falls back to the first referral code with no updates at all', () => {
    expect(inferCurrentCommittee('AEN, WAM', [])).toBe('AEN');
    expect(inferCurrentCommittee('AEN, WAM', null)).toBe('AEN');
  });

  it('surfaces the final committee once every committee has cleared', () => {
    const updates = [
      { statustext: 'The committee(s) on AEN recommend(s) that the measure be PASSED.' },
      { statustext: 'The committee(s) on WAM recommend(s) that the measure be PASSED.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('WAM');
  });

  it('returns null when there is no committee assignment', () => {
    expect(inferCurrentCommittee(null, [{ statustext: 'anything' }])).toBeNull();
    expect(inferCurrentCommittee('', [])).toBeNull();
  });

  it('ignores committee codes that are not part of the referral', () => {
    const updates = [{ statustext: 'The committee(s) on FIN recommend(s) that the measure be PASSED.' }];
    // FIN is not in this bill's referral list, so it does not clear AEN.
    expect(inferCurrentCommittee('AEN, WAM', updates)).toBe('AEN');
  });
});
