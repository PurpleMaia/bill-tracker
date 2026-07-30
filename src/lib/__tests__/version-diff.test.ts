import { describe, it, expect } from 'vitest';
import {
  normalizeComparison,
  compareSectionNumbers,
  hasSectionGaps,
  errorComparison,
  cleanFragmentText,
  stripBoilerplate,
  coalesceFragments,
  classifyDiffScale,
  sentenceBudgetFor,
  type RawSectionChange,
  type ChangeFragment,
  type SectionDiff,
  type VersionComparison,
} from '@/lib/versions/version-diff';

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

// ==============================================
// FRAGMENT CLEANUP FOR LLM CONSUMPTION
// ==============================================
// hawaii-bill-diff tags at WORD level. A single edited sentence arrives as a
// dozen micro-fragments, most of them grammatical glue, which the model must
// reassemble before it can interpret anything. These helpers run only on the
// prompt path — the accordion keeps the parser's exact fragments.

function f(kind: ChangeFragment['kind'], text: string): ChangeFragment {
  return { kind, text, struck: kind === 'removed', underlined: kind === 'added' };
}

describe('cleanFragmentText', () => {
  it('strips Word-export artifacts and collapses whitespace', () => {
    expect(cleanFragmentText('**__§706-__** Sentence of   imprisonment')).toBe('§706- Sentence of imprisonment');
    expect(cleanFragmentText('(c)~~]~~')).toBe('(c)]');
  });

  it('never drops real words', () => {
    expect(cleanFragmentText('twenty years')).toBe('twenty years');
  });

  it('returns empty string for artifact-only text', () => {
    expect(cleanFragmentText('~~**__')).toBe('');
  });
});

describe('stripBoilerplate', () => {
  // Markers are matched on the BARE label: cleanFragmentText has already
  // stripped the ** / __ markup by the time this runs, so a marker written as
  // '** Report Title:**' would never match. This was a real bug — the block
  // survived into the prompt until the markers dropped their markup.
  it('cuts the trailing Report Title block after markup has been cleaned', () => {
    const text = 'SECTION 7. This Act shall take effect. Report Title: Firearms; Mandatory Minimum';
    expect(stripBoilerplate(text)).toBe('SECTION 7. This Act shall take effect.');
  });

  it('takes the Description half with it, since it follows Report Title', () => {
    const text = 'Body text. Report Title: Firearms Description: Establishes mandatory minimums.';
    expect(stripBoilerplate(text)).toBe('Body text.');
  });

  it('cuts the informational-purposes disclaimer', () => {
    const text = 'Real text here. The summary description of legislation appearing on this page is for informational purposes only';
    expect(stripBoilerplate(text)).toBe('Real text here.');
  });

  it('leaves text without boilerplate untouched', () => {
    expect(stripBoilerplate('SECTION 2. Chapter 706 is amended.')).toBe('SECTION 2. Chapter 706 is amended.');
  });

  // 'Description:' on its own is NOT a marker: a bill may legitimately use the
  // word mid-text, and cutting there would silently drop real legislative
  // content — far worse than leaving a little boilerplate in.
  it('does NOT cut on a bare "Description:" in body text', () => {
    const text = 'SECTION 3. Description: of the property shall be recorded.';
    expect(stripBoilerplate(text)).toBe(text);
  });

  it('cuts at the EARLIEST marker when several are present', () => {
    const text = 'Body. The summary description of legislation appearing on this page x. Report Title: y';
    expect(stripBoilerplate(text)).toBe('Body.');
  });
});

describe('coalesceFragments', () => {
  it('merges adjacent same-kind fragments into one', () => {
    const out = coalesceFragments([
      f('removed', 'or'), f('removed', 'constructing'),
      f('unchanged', 'the'), f('unchanged', 'stadium'),
    ]);
    expect(out.map((x) => `${x.kind}:${x.text}`)).toEqual([
      'removed:or constructing', 'unchanged:the stadium',
    ]);
  });

  // The real SB2575 case: an edited sentence shredded into eight fragments,
  // most of them particles that tell a reader nothing on their own.
  it('drops changed fragments that are bare grammatical particles', () => {
    const out = coalesceFragments([
      f('removed', 'of any'), f('unchanged', 'of'), f('removed', 'the'),
      f('modified', 'a'), f('unchanged', 'class A'),
      f('added', 'under the following sections:'),
    ]);
    // 'the' (removed) and 'a' (modified) are noise and go; 'of any' stays
    // because it is not a single particle; unchanged 'of' stays as context.
    expect(out.map((x) => x.text)).not.toContain('the');
    expect(out.map((x) => x.text)).not.toContain('a');
    expect(out.map((x) => `${x.kind}:${x.text}`)).toContain('added:under the following sections:');
  });

  it('keeps unchanged particles, which are the connective context', () => {
    const out = coalesceFragments([f('unchanged', 'the'), f('removed', 'stadium')]);
    expect(out.map((x) => `${x.kind}:${x.text}`)).toEqual(['unchanged:the', 'removed:stadium']);
  });

  // A particle inside a longer changed phrase must survive — "the stadium" is
  // the edit, even though "the" alone would be dropped.
  it('does not strip particles that are part of a substantive change', () => {
    const out = coalesceFragments([f('removed', 'the stadium')]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('the stadium');
  });

  it('drops fragments that clean to nothing', () => {
    expect(coalesceFragments([f('removed', '~~**'), f('added', 'real text')]))
      .toEqual([expect.objectContaining({ kind: 'added', text: 'real text' })]);
  });

  it('preserves struck/underlined flags when merging', () => {
    const out = coalesceFragments([f('added', 'first'), f('added', 'second')]);
    expect(out[0].underlined).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(coalesceFragments([])).toEqual([]);
  });
});

// Regression: an earlier implementation filtered particles BEFORE merging, so
// "[removed] or" + "[removed] constructing" lost the "or" and the edit read as
// deleting only the word "constructing". Silent meaning change in a
// legislative diff — the exact failure this whole feature must not have.
describe('coalesceFragments — particle filtering order', () => {
  it('keeps a leading particle that is part of a multi-fragment change', () => {
    const out = coalesceFragments([
      { kind: 'removed', text: 'or', struck: true, underlined: false },
      { kind: 'removed', text: 'constructing', struck: true, underlined: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('or constructing');
  });

  it('still drops a changed run that is ONLY a particle', () => {
    const out = coalesceFragments([
      { kind: 'unchanged', text: 'class A', struck: false, underlined: false },
      { kind: 'modified', text: 'a', struck: false, underlined: false },
      { kind: 'unchanged', text: 'felony', struck: false, underlined: false },
    ]);
    expect(out.map((x) => x.text)).not.toContain('a');
  });
});

// ==============================================
// DIFF SCALE (drives the change-summary length)
// ==============================================
// A FIXED four-sentence cap forced the model to choose between obeying the limit
// and reporting real edits. On the real HB1334 -> HB1334_CD2 pair it reported
// ten changes against a cap of four, and padded with bill-describing sentences.
// The budget is now computed from the diff itself.

function section(
  number: string,
  kind: SectionDiff['kind'],
  presence: SectionDiff['presence'] = 'both',
): SectionDiff {
  return { sectionNumber: number, kind, changeCount: kind === 'unchanged' ? 0 : 1, fragments: [], presence };
}

function cmp(sections: SectionDiff[]): VersionComparison {
  return {
    olderLabel: 'A', newerLabel: 'B', sections,
    totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
    parseIncomplete: false, error: null,
  };
}

describe('classifyDiffScale', () => {
  // Measured from the live corpus: HB1334 -> HB1334_CD2 is 9 of 9 sections
  // changed with 6 newerOnly. CD2 is effectively a different bill.
  it('calls a base -> conference-draft rewrite a rewrite', () => {
    const sections = [
      section('1', 'modified'), section('5', 'modified'), section('6', 'modified'),
      section('2', 'added', 'newerOnly'), section('3', 'added', 'newerOnly'),
      section('4', 'added', 'newerOnly'), section('7', 'added', 'newerOnly'),
      section('8', 'added', 'newerOnly'), section('9', 'added', 'newerOnly'),
    ];
    expect(classifyDiffScale(cmp(sections))).toBe('rewrite');
  });

  it('is not a rewrite when most changed sections existed before', () => {
    // Everything changed, but nothing is new — that is a heavy amendment, not a
    // replacement, and itemizing it is still useful.
    const sections = [
      section('1', 'modified'), section('2', 'modified'), section('3', 'modified'),
      section('4', 'modified'), section('5', 'modified'),
    ];
    expect(classifyDiffScale(cmp(sections))).toBe('substantial');
  });

  it('is not a rewrite when much of the bill is untouched', () => {
    const sections = [
      section('1', 'unchanged'), section('2', 'unchanged'), section('3', 'unchanged'),
      section('4', 'added', 'newerOnly'), section('5', 'added', 'newerOnly'),
    ];
    expect(classifyDiffScale(cmp(sections))).toBe('minor');
  });

  it('calls a few changed sections minor', () => {
    expect(classifyDiffScale(cmp([
      section('1', 'unchanged'), section('2', 'modified'), section('3', 'modified'),
    ]))).toBe('minor');
  });

  it('treats empty and all-unchanged comparisons as minor', () => {
    expect(classifyDiffScale(cmp([]))).toBe('minor');
    expect(classifyDiffScale(cmp([section('1', 'unchanged')]))).toBe('minor');
  });
});

describe('sentenceBudgetFor', () => {
  // A rewrite gets almost no room on purpose: itemizing it duplicates the
  // current-version summary the page already shows.
  it('gives a rewrite only two sentences', () => {
    expect(sentenceBudgetFor('rewrite', 9)).toBe(2);
  });

  it('gives a minor diff four', () => {
    expect(sentenceBudgetFor('minor', 2)).toBe(4);
  });

  // Scales with the diff so real edits are not hidden behind a count, but
  // never unbounded.
  it('scales a substantial diff with the changed-section count, capped at eight', () => {
    expect(sentenceBudgetFor('substantial', 5)).toBe(5);
    expect(sentenceBudgetFor('substantial', 8)).toBe(8);
    expect(sentenceBudgetFor('substantial', 40)).toBe(8);
  });

  it('never returns fewer than four for a substantial diff', () => {
    expect(sentenceBudgetFor('substantial', 1)).toBe(4);
  });
});
