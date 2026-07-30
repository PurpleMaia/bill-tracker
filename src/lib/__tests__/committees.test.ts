import { describe, it, expect } from 'vitest';
import { COMMITTEE_NAMES, committeeFullName, parseCommitteeCodes } from '../testimony/committees';

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
