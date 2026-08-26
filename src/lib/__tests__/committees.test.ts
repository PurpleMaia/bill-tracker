import { describe, it, expect } from 'vitest';
import {
  COMMITTEE_NAMES,
  committeeFullName,
  parseCommitteeCodes,
  parseCommitteeSteps,
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

describe('parseCommitteeSteps', () => {
  it('keeps commas as sequential steps and slashes as one joint step', () => {
    expect(parseCommitteeSteps('AGR, JDC/HWN, FIN')).toEqual([['AGR'], ['JDC', 'HWN'], ['FIN']]);
  });
  it('upper-cases, trims, and drops codes already seen in an earlier step', () => {
    expect(parseCommitteeSteps(' agr , jdc/hwn , agr ')).toEqual([['AGR'], ['JDC', 'HWN']]);
  });
  it('returns [] for null or empty', () => {
    expect(parseCommitteeSteps(null)).toEqual([]);
    expect(parseCommitteeSteps('   ')).toEqual([]);
  });
});

describe('inferCurrentCommittee', () => {
  // Steps are met in order: the FIRST step is the gate the bill must clear first.
  // The current step is the earliest one not yet cleared. Returns ALL codes in
  // that step (a joint hearing yields more than one).

  it('is the first committee while the bill still sits there', () => {
    // AEN only has a hearing scheduled — it hasn't cleared the bill yet.
    const updates = [
      { statustext: 'The committee(s) on AEN has scheduled a public hearing on 01-15-26 9:00AM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['AEN']);
  });

  it('advances to the next committee once the first clears the bill', () => {
    const updates = [
      { statustext: 'The committee(s) on WAM has scheduled a public hearing on 02-13-26 1:30PM.' },
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
      { statustext: 'The committee(s) on AEN recommend(s) that the measure be PASSED.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['WAM']);
  });

  it('treats an explicit referral to a later committee as proof the earlier ones cleared', () => {
    // Only the referral line is present; AEN never gets its own "passed" line,
    // but being referred to WAM implies AEN let it move on.
    const updates = [
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['WAM']);
  });

  it('stays on a committee that deferred the bill (a deferral is not clearing)', () => {
    const updates = [
      { statustext: 'The committee on AEN deferred the measure.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['AEN']);
  });

  it('returns BOTH committees of a joint hearing, together', () => {
    const updates = [
      { statustext: 'Referred to the committee(s) on JDC/HWN.' },
    ];
    expect(inferCurrentCommittee('JDC/HWN', updates)).toEqual(['JDC', 'HWN']);
  });

  it('keeps a joint step current until EVERY member of it clears', () => {
    // AGR cleared; the JDC/HWN joint step is next and only HWN has passed so far.
    const updates = [
      { statustext: 'Passed Second Reading and referred to the committee(s) on JDC/HWN.' },
      { statustext: 'The committee(s) on HWN recommend(s) that the measure be PASSED.' },
    ];
    expect(inferCurrentCommittee('AGR, JDC/HWN, FIN', updates)).toEqual(['JDC', 'HWN']);
  });

  it('advances past a joint step once all its members clear', () => {
    const updates = [
      { statustext: 'The committee(s) on JDC recommend(s) that the measure be PASSED.' },
      { statustext: 'The committee(s) on HWN recommend(s) that the measure be PASSED.' },
    ];
    expect(inferCurrentCommittee('JDC/HWN, FIN', updates)).toEqual(['FIN']);
  });

  it('is independent of update ordering', () => {
    const forward = [
      { statustext: 'The committee(s) on AEN recommend(s) that the measure be PASSED.' },
      { statustext: 'Passed Second Reading and referred to the committee(s) on WAM.' },
    ];
    const reversed = [...forward].reverse();
    expect(inferCurrentCommittee('AEN, WAM', forward)).toEqual(['WAM']);
    expect(inferCurrentCommittee('AEN, WAM', reversed)).toEqual(['WAM']);
  });

  it('falls back to the FIRST step when no update signals progress', () => {
    const updates = [{ statustext: 'Introduced and passed First Reading.' }];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['AEN']);
  });

  it('falls back to the first step with no updates at all', () => {
    expect(inferCurrentCommittee('AEN, WAM', [])).toEqual(['AEN']);
    expect(inferCurrentCommittee('AEN, WAM', null)).toEqual(['AEN']);
    expect(inferCurrentCommittee('JDC/HWN, FIN', null)).toEqual(['JDC', 'HWN']);
  });

  it('surfaces the final step once every committee has cleared', () => {
    const updates = [
      { statustext: 'The committee(s) on AEN recommend(s) that the measure be PASSED.' },
      { statustext: 'The committee(s) on WAM recommend(s) that the measure be PASSED.' },
    ];
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['WAM']);
  });

  it('returns [] when there is no committee assignment', () => {
    expect(inferCurrentCommittee(null, [{ statustext: 'anything' }])).toEqual([]);
    expect(inferCurrentCommittee('', [])).toEqual([]);
  });

  it('ignores committee codes that are not part of the referral', () => {
    const updates = [{ statustext: 'The committee(s) on FIN recommend(s) that the measure be PASSED.' }];
    // FIN is not in this bill's referral list, so it does not clear AEN.
    expect(inferCurrentCommittee('AEN, WAM', updates)).toEqual(['AEN']);
  });
});
