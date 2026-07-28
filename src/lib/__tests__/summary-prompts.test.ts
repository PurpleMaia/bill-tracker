import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_SYSTEM_PROMPT,
  DIFF_SYSTEM_PROMPT,
  buildDocumentUserTurn,
  buildDiffUserTurn,
} from '../summary-prompts';
import type { VersionComparison, SectionDiff } from '../version-diff';

function frag(kind: SectionDiff['fragments'][number]['kind'], text: string) {
  return { kind, text, struck: kind === 'removed', underlined: kind === 'added' };
}

function comparison(sections: SectionDiff[], overrides: Partial<VersionComparison> = {}): VersionComparison {
  return {
    olderLabel: 'HB1494_HD1',
    newerLabel: 'HB1494_HD2',
    sections,
    totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
    parseIncomplete: false,
    error: null,
    ...overrides,
  };
}

describe('system prompts', () => {
  it('both forbid relying on recalled bill numbers', () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/REUSED/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/REUSED/);
  });

  it('the diff prompt forbids finding changes itself', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/MUST NOT look for changes yourself/);
  });
});

describe('buildDocumentUserTurn', () => {
  it('includes label, kind, derived position, committees, and text', () => {
    const turn = buildDocumentUserTurn({
      label: 'HB1494_HD1',
      kind: 'bill version',
      committees: 'AGR, ECD, FIN',
      text: 'SECTION 1. The legislature finds...',
    });
    expect(turn).toContain('Document: HB1494_HD1 (bill version)');
    expect(turn).toContain('Produced by: House, first committee draft');
    expect(turn).toContain('Committees (in order): AGR, ECD, FIN');
    expect(turn).toContain('SECTION 1. The legislature finds...');
  });

  it('omits the position line for an unrecognized label instead of guessing', () => {
    const turn = buildDocumentUserTurn({
      label: 'garbage', kind: 'bill version', committees: null, text: 'text',
    });
    expect(turn).not.toContain('Produced by:');
    expect(turn).not.toContain('Committees');
  });
});

describe('buildDiffUserTurn', () => {
  // The core cost/quality rule: unchanged SECTIONS are dropped entirely, but
  // unchanged FRAGMENTS inside a changed section are kept as context.
  it('drops unchanged sections and keeps changed ones', () => {
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '1', kind: 'unchanged', changeCount: 0, presence: 'both',
          fragments: [frag('unchanged', 'boilerplate that must not be sent')] },
        { sectionNumber: '4', kind: 'modified', changeCount: 2, presence: 'both',
          fragments: [
            frag('unchanged', 'The director of finance is authorized to issue'),
            frag('removed', 'or constructing'),
            frag('added', 'the university of Hawaii at Manoa campus'),
          ] },
      ]),
      committees: 'AGR, ECD, FIN',
    });

    expect(turn).not.toContain('boilerplate that must not be sent');
    expect(turn).toContain('SECTION 4 [modified]');
    expect(turn).toContain('[removed] or constructing');
    expect(turn).toContain('[added] the university of Hawaii at Manoa campus');
    // Context inside a changed section is retained — a bare [removed] fragment
    // is meaningless without the sentence around it.
    expect(turn).toContain('[unchanged] The director of finance is authorized to issue');
  });

  it('labels both sides with their derived pipeline position', () => {
    const turn = buildDiffUserTurn({ comparison: comparison([]), committees: null });
    expect(turn).toContain('Older: House, first committee draft');
    expect(turn).toContain('Newer: House, second committee draft');
  });

  it('notes a section present in only one version', () => {
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '9', kind: 'removed', changeCount: 1, presence: 'olderOnly',
          fragments: [frag('removed', 'dropped section body')] },
      ]),
      committees: null,
    });
    expect(turn).toContain('only in HB1494_HD1');
  });

  it('passes through parseIncomplete so the prompt can caveat', () => {
    expect(buildDiffUserTurn({ comparison: comparison([], { parseIncomplete: true }), committees: null }))
      .toContain('Parse incomplete: yes');
    expect(buildDiffUserTurn({ comparison: comparison([]), committees: null }))
      .toContain('Parse incomplete: no');
  });

  it('notes a section present only in the newer version', () => {
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '9', kind: 'added', changeCount: 1, presence: 'newerOnly',
          fragments: [frag('added', 'new section body')] },
      ]),
      committees: null,
    });
    expect(turn).toContain('only in HB1494_HD2');
  });

  it('truncates a long unchanged fragment inside a changed section and appends an ellipsis', () => {
    const longUnchanged = `${'x'.repeat(500)}TAIL_MARKER_UNCHANGED`;
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '4', kind: 'modified', changeCount: 1, presence: 'both',
          fragments: [
            frag('unchanged', longUnchanged),
            frag('removed', 'or constructing'),
          ] },
      ]),
      committees: null,
    });
    expect(turn).not.toContain('TAIL_MARKER_UNCHANGED');
    expect(turn).toContain('…');
  });

  it('emits long added and removed fragments verbatim, in full, without truncation', () => {
    const longAdded = `${'x'.repeat(500)}TAIL_MARKER_ADDED`;
    const longRemoved = `${'x'.repeat(500)}TAIL_MARKER_REMOVED`;
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '4', kind: 'modified', changeCount: 2, presence: 'both',
          fragments: [
            frag('added', longAdded),
            frag('removed', longRemoved),
          ] },
      ]),
      committees: null,
    });
    expect(turn).toContain(`[added] ${longAdded}`);
    expect(turn).toContain(`[removed] ${longRemoved}`);
    expect(turn).toContain('TAIL_MARKER_ADDED');
    expect(turn).toContain('TAIL_MARKER_REMOVED');

    const addedLine = turn.split('\n').find((line) => line.includes('TAIL_MARKER_ADDED'));
    const removedLine = turn.split('\n').find((line) => line.includes('TAIL_MARKER_REMOVED'));
    expect(addedLine).not.toContain('…');
    expect(removedLine).not.toContain('…');
  });
});
