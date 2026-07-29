import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
  DIFF_SYSTEM_PROMPT,
  buildDocumentUserTurn,
  buildReportUserTurn,
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

  // The diff prompt is a CHANGELOG, not a bill summary. Earlier output drifted
  // into describing the bill and editorializing about the direction of the
  // edits ("reflects a shift in focus toward..."), so both bans are explicit.
  it('the diff prompt demands a changelog, not a bill summary', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/changelog, not a summary/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/still be true of the older version, delete it/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/reflects a shift in focus/);
  });

  // Section markers survive in original_text; page/line structure does not
  // (it is one line with zero newlines). Some documents quote page/line refs
  // that belong to a DIFFERENT document — citing those would mislead.
  it('both prompts allow section citations but ban page/line citations', () => {
    for (const prompt of [DOCUMENT_SYSTEM_PROMPT, DIFF_SYSTEM_PROMPT]) {
      expect(prompt).toMatch(/§/);
      expect(prompt).toMatch(/cite a page or line number|cite page or line numbers/);
      expect(prompt).toMatch(/no page or line/);
    }
  });

  it('the document prompt leads with real-world consequence and bans jargon', () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/real-world consequence/);
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/pursuant to/);
  });

  // The UI renders the disclaimer, so the model must not emit its own.
  it('both prompts tell the model not to add its own disclaimer', () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/Do not add\s+a disclaimer/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/Do not add\s+a disclaimer/);
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

describe('REPORT_SYSTEM_PROMPT', () => {
  // A committee report restates the bill's purpose at length. The whole point of
  // this separate prompt is that the ACTIONS are the story, not the measure.
  it('demands the hearing be reported, not the bill', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/Report the hearing, not the bill/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/record of ACTIONS TAKEN/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/That is BACKGROUND, not the story/);
  });

  it('leads with the committee decision and covers amendments and testimony', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/THE DECISION, first sentence/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/AMENDMENTS/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/TESTIMONY/);
  });

  // Reporting only supporters would misrepresent a contested hearing; 33% of
  // the corpus records opposition.
  it('requires both sides of testimony when both are present', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/never report only one side/);
  });

  it('bans invented committees, testifiers, votes, and amendments', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/Never invent a committee name, a testifier, a vote count/);
  });

  it('carries the same plain-language bans as the other prompts', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/pursuant to/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/beg leave to report/);
  });

  it('tells the model not to add its own disclaimer', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/Do not add\s+a disclaimer/);
  });

  it('is a distinct prompt, not the bill-version one', () => {
    expect(REPORT_SYSTEM_PROMPT).not.toBe(DOCUMENT_SYSTEM_PROMPT);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/Committee Report Summarizer/);
    // The bill prompt should no longer carry report-specific instructions.
    expect(DOCUMENT_SYSTEM_PROMPT).not.toMatch(/For a committee report only/);
  });
});

describe('buildReportUserTurn', () => {
  it('identifies the report by its code and names the version it concerns', () => {
    const turn = buildReportUserTurn({
      label: 'HB139_HD1_HSCR65',
      reportCode: 'HSCR65',
      versionLabel: 'HB139_HD1',
      text: 'Your Committee on Agriculture...',
    });
    expect(turn).toContain('Committee report: HSCR65');
    expect(turn).toContain('Concerns bill version: HB139_HD1');
    expect(turn).toContain('Your Committee on Agriculture...');
  });

  it('falls back to the label when report_code is null', () => {
    // report_code is a nullable column.
    const turn = buildReportUserTurn({
      label: 'HB139_HD1_HSCR65', reportCode: null, versionLabel: null, text: 't',
    });
    expect(turn).toContain('Committee report: HB139_HD1_HSCR65');
    expect(turn).not.toContain('Concerns bill version:');
  });

  // The report names its own committees; passing the bill's committee_assignment
  // would invite attributing an action to a committee that never heard it.
  it('does not carry a bill-level committee list', () => {
    const turn = buildReportUserTurn({
      label: 'HB139_HD1_HSCR65', reportCode: 'HSCR65', versionLabel: 'HB139_HD1', text: 't',
    });
    expect(turn).not.toContain('Committees (in order)');
    expect(turn).toMatch(/report names the committees that acted/);
  });
});
