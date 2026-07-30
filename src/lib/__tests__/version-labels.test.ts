import { describe, it, expect } from 'vitest';
import { describeVersionLabel } from '../versions/version-labels';

describe('describeVersionLabel', () => {
  it('describes House drafts by ordinal', () => {
    expect(describeVersionLabel('HB1494_HD1')).toBe('House, first committee draft');
    expect(describeVersionLabel('HB1494_HD2')).toBe('House, second committee draft');
  });

  it('describes Senate drafts', () => {
    expect(describeVersionLabel('SB2374_SD1')).toBe('Senate, first committee draft');
  });

  it('describes conference drafts without a chamber', () => {
    expect(describeVersionLabel('HB235_CD1')).toBe('Conference draft');
  });

  it('treats a bare bill number as the introduced version', () => {
    expect(describeVersionLabel('HB1494')).toBe('As introduced');
    expect(describeVersionLabel('SB2374')).toBe('As introduced');
  });

  it('is case-insensitive and tolerates trailing underscores', () => {
    expect(describeVersionLabel('hb1494_hd1')).toBe('House, first committee draft');
    expect(describeVersionLabel('HB1494_HD1_')).toBe('House, first committee draft');
  });

  // Load-bearing: an unknown label must NOT be guessed at. The prompt omits
  // the pipeline-position line entirely rather than assert something false.
  it('returns null for unrecognized labels', () => {
    expect(describeVersionLabel('HB1494_ZZ9')).toBeNull();
    expect(describeVersionLabel('')).toBeNull();
    expect(describeVersionLabel('garbage')).toBeNull();
  });

  it('returns null past the supported ordinal range rather than inventing a word', () => {
    expect(describeVersionLabel('HB1494_HD9')).toBeNull();
  });
});
