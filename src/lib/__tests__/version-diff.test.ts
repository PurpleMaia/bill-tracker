import { describe, it, expect } from 'vitest';
import {
  normalizeComparison,
  compareSectionNumbers,
  hasSectionGaps,
  errorComparison,
  type RawSectionChange,
} from '@/lib/version-diff';

const frag = (type: string, text: string, fmt?: Record<string, boolean>) => ({
  type,
  text,
  formatting: { strikethrough: false, underline: false, bold: false, ...fmt },
});

describe('compareSectionNumbers', () => {
  it('orders numerically, not lexically', () => {
    expect(['12', '9', '2', '10'].sort(compareSectionNumbers)).toEqual(['2', '9', '10', '12']);
  });

  it('puts non-numeric section numbers last, stably', () => {
    expect(['4', 'A', '2'].sort(compareSectionNumbers)).toEqual(['2', '4', 'A']);
  });
});

describe('hasSectionGaps', () => {
  it('detects the real HB1494_HD1 gap (7, 8, 10, 11 dropped)', () => {
    expect(hasSectionGaps(['1', '2', '3', '4', '5', '6', '9', '13', '14', '15', '16', '17'])).toBe(true);
  });

  it('is false for a contiguous sequence', () => {
    expect(hasSectionGaps(['1', '2', '3', '4'])).toBe(false);
  });

  it('is false for an empty or single-section list', () => {
    expect(hasSectionGaps([])).toBe(false);
    expect(hasSectionGaps(['1'])).toBe(false);
  });
});

describe('normalizeComparison', () => {
  it('maps formatting flags to struck/underlined and preserves kinds', () => {
    const raw: RawSectionChange[] = [
      {
        type: 'modified',
        sectionNumber: '4',
        changes: [
          frag('unchanged', 'SECTION 4. The director of finance is authorized'),
          frag('removed', 'or constructing', { strikethrough: true }),
          frag('added', 'the university of Hawaii at Manoa campus', { underline: true }),
        ],
      },
    ];
    const c = normalizeComparison(raw, 'HB1494_HD1', 'HB1494_HD2', ['4'], ['4']);
    const section = c.sections[0];
    expect(section.kind).toBe('modified');
    expect(section.fragments[1]).toMatchObject({ kind: 'removed', struck: true, underlined: false });
    expect(section.fragments[2]).toMatchObject({ kind: 'added', underlined: true, struck: false });
    // changeCount excludes unchanged fragments.
    expect(section.changeCount).toBe(2);
    expect(section.presence).toBe('both');
  });

  it('aligns by section number: a section only in the newer parse is newerOnly', () => {
    const raw: RawSectionChange[] = [
      { type: 'modified', sectionNumber: '13', changes: [frag('added', 'x')] },
      { type: 'added', sectionNumber: '12', changes: [frag('added', 'y')] },
    ];
    const c = normalizeComparison(
      raw,
      'HD1',
      'HD2',
      ['9', '13'],       // older parse: no 12
      ['9', '12', '13'], // newer parse: has 12
    );
    const byNumber = Object.fromEntries(c.sections.map((s) => [s.sectionNumber, s]));
    expect(byNumber['12'].presence).toBe('newerOnly');
    expect(byNumber['13'].presence).toBe('both');
    // Numeric ordering: 12 before 13.
    expect(c.sections.map((s) => s.sectionNumber)).toEqual(['12', '13']);
  });

  it('marks a section present only in the older parse as olderOnly', () => {
    const raw: RawSectionChange[] = [
      { type: 'removed', sectionNumber: '16', changes: [frag('removed', 'gone', { strikethrough: true })] },
    ];
    const c = normalizeComparison(raw, 'HD1', 'HD2', ['16'], []);
    expect(c.sections[0].presence).toBe('olderOnly');
  });

  it('sets parseIncomplete when either parse has gaps', () => {
    const raw: RawSectionChange[] = [{ type: 'unchanged', sectionNumber: '1', changes: [frag('unchanged', 'a')] }];
    expect(normalizeComparison(raw, 'A', 'B', ['1', '2'], ['1', '2']).parseIncomplete).toBe(false);
    expect(normalizeComparison(raw, 'A', 'B', ['1', '4'], ['1', '2']).parseIncomplete).toBe(true);
    expect(normalizeComparison(raw, 'A', 'B', ['1', '2'], ['1', '4']).parseIncomplete).toBe(true);
  });

  it('computes totals from section verdicts', () => {
    const raw: RawSectionChange[] = [
      { type: 'modified', sectionNumber: '1', changes: [frag('added', 'a')] },
      { type: 'modified', sectionNumber: '2', changes: [frag('added', 'b')] },
      { type: 'removed', sectionNumber: '3', changes: [frag('removed', 'c')] },
      { type: 'added', sectionNumber: '4', changes: [frag('added', 'd')] },
      { type: 'unchanged', sectionNumber: '5', changes: [frag('unchanged', 'e')] },
    ];
    const c = normalizeComparison(raw, 'A', 'B', ['1', '2', '3', '4', '5'], ['1', '2', '3', '4', '5']);
    expect(c.totals).toEqual({ added: 1, removed: 1, modified: 2, unchanged: 1 });
  });

  it('preserves markdown-active artifacts as literal text', () => {
    const raw: RawSectionChange[] = [
      { type: 'modified', sectionNumber: '1', changes: [frag('modified', '1.~~')] },
    ];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].fragments[0].text).toBe('1.~~');
  });

  it('drops empty and whitespace-only fragments', () => {
    const raw: RawSectionChange[] = [
      {
        type: 'modified',
        sectionNumber: '1',
        changes: [frag('added', 'real'), frag('added', ''), frag('added', '   ')],
      },
    ];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].fragments).toHaveLength(1);
    expect(c.sections[0].changeCount).toBe(1);
  });

  it('tolerates a missing formatting object', () => {
    const raw = [
      { type: 'modified', sectionNumber: '1', changes: [{ type: 'added', text: 'x' }] },
    ] as RawSectionChange[];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].fragments[0]).toMatchObject({ struck: false, underlined: false });
  });

  it('coerces an unrecognized change type to modified', () => {
    const raw = [
      { type: 'weird', sectionNumber: '1', changes: [{ type: 'bogus', text: 'x' }] },
    ] as RawSectionChange[];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].kind).toBe('modified');
    expect(c.sections[0].fragments[0].kind).toBe('modified');
  });
});

describe('errorComparison', () => {
  it('returns an empty comparison carrying the error code', () => {
    const c = errorComparison('A', 'B', 'fetch-failed');
    expect(c.error).toBe('fetch-failed');
    expect(c.sections).toEqual([]);
    expect(c.totals).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 0 });
    expect(c.parseIncomplete).toBe(false);
  });
});
