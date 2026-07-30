import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
  DIFF_SYSTEM_PROMPT,
  buildDocumentUserTurn,
  buildReportUserTurn,
  buildDiffUserTurn,
} from '../ai/summary-prompts';
import type { VersionComparison, SectionDiff } from '../versions/version-diff';

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
    expect(DIFF_SYSTEM_PROMPT).toMatch(/still be true of the\s+older version, delete it/);
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
    expect(REPORT_SYSTEM_PROMPT).toMatch(/read as identical/);
  });

  it('covers the four hearing facts: committee, decision, sides, next step', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/WHICH COMMITTEE met/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/WHAT THEY DECIDED/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/WHO SUPPORTED OR OPPOSED/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/NEXT STEP/);
  });

  // A bill averages 3 reports (up to 7), all shown in one timeline. Paragraph
  // summaries there are unreadable AND near-identical, because 99.9% of reports
  // restate the bill's purpose. Length is the fix, so it is asserted.
  it('is capped at a few sentences, not a paragraph', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/TWO TO FOUR SENTENCES/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/25–70 words/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/Going long is a failure/);
    // The bill-version prompt stays long-form; only reports are capped.
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/100–180 words/);
  });

  it('bans restating the bill and the committee findings', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/SKIP IT ENTIRELY/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/DO NOT describe what the bill or measure would do/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/DO NOT include the committee's findings/);
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

describe('DIFF_SYSTEM_PROMPT — mark interpretation', () => {
  // Hawaiʻi drafts are cumulative (12,027 of 12,123 versions are full drafts
  // averaging ~9,400 chars), so the reader is never short of bill descriptions.
  // What they cannot do is find the few edits buried in that text.
  it('states that the change explanation is the main thing, not the bill', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/THIS IS THE MAIN THING THE READER WANTS/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/cumulative/);
  });

  // The accordion shows struck/underlined fragments faithfully but leaves the
  // reader to derive the net effect. That derivation is this prompt's job.
  it('frames the task as interpreting the raw marks, not restating them', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/YOUR JOB IS THAT INTERPRETATION/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/do not restate the marks,\s+say what they mean/);
  });

  it('gives an explicit procedure for reading removed/added pairs', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/HOW TO READ THE MARKS/);
    // A removed+added pair is ONE replacement, not two separate edits.
    expect(DIFF_SYSTEM_PROMPT).toMatch(/usually ONE edit — a REPLACEMENT/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/\[removed\] alone is a DELETION/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/\[added\] alone is an INSERTION/);
    // Whole-section adds/removes are the largest edits and must lead.
    expect(DIFF_SYSTEM_PROMPT).toMatch(/dropped or created a provision/);
  });

  it('requires reading changed fragments against surrounding unchanged text', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/Read changed fragments against the \[unchanged\] words/);
  });

  // The prompt grew to 8,658 chars while adding the mark-reading rules and,
  // combined with a large user turn, started timing the endpoint out (HTTP 524,
  // no body). Keep it lean — this is a real operational ceiling, not style.
  it('stays lean enough not to crowd out the diff payload', () => {
    expect(DIFF_SYSTEM_PROMPT.length).toBeLessThan(8000);
  });
});

// Prompt examples leak into output. Observed twice with this model:
//  1. "Farmers selling at roadside stands would no longer need a county permit"
//     copied verbatim from a document-prompt example into a hemp-permit summary.
//  2. "The economic development fund was removed" copied from a diff-prompt
//     example into an SB2575 criminal-sentencing summary, where no such fund
//     exists anywhere in the diff.
// Concrete nouns in examples are the vector, so no prompt may contain a
// plausible-looking legislative noun phrase that a model could lift wholesale.
describe('prompt examples cannot be mistaken for content', () => {
  const LEAKED_PHRASES = [
    'economic development fund',
    'climate resiliency',
    'roadside stand',
    'county permit',
    'university of Hawaii at Manoa',
    'stadium',
  ];

  for (const [name, prompt] of Object.entries({
    DOCUMENT_SYSTEM_PROMPT,
    REPORT_SYSTEM_PROMPT,
    DIFF_SYSTEM_PROMPT,
  })) {
    it(`${name} contains no liftable concrete legislative nouns`, () => {
      for (const phrase of LEAKED_PHRASES) {
        expect(prompt.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });
  }

  it('each prompt states that every value must come from the input', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/must appear in the tagged\s+fragments/);
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/must appear in the text/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/Never invent a committee name/);
  });
});

// Length and accuracy rules added after live testing surfaced two failures.
describe('DIFF_SYSTEM_PROMPT — length discipline and stamp handling', () => {
  // A FIXED cap made the model choose between obeying the limit and reporting
  // real edits — on HB1334 -> CD2 it reported ten changes against a cap of four.
  // The budget is now computed from the diff and supplied in the user turn.
  it('defers to the supplied sentence budget rather than a fixed cap', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/ONE SENTENCE PER SUBSTANTIVE EDIT/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/"Sentence budget" given in the/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/THAT NUMBER IS A HARD LIMIT/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/Never\s+exceed it/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/DO NOT pad to reach the budget/);
    // Padding is where invented content came from, so the reason is stated.
    expect(DIFF_SYSTEM_PROMPT).toMatch(/Padding is where\s+invented content comes from/);
  });

  // Observed: two sentences described the amended text rather than the change
  // ("the program will operate on islands under 200,000 people").
  it('gives a concrete test for cutting bill-describing sentences', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/THE TEST, applied to every sentence/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/read ONLY the newer version/);
  });

  // Observed: "Additional edits were made to sections not included in this
  // comparison" — a vague catch-all that also conflated omitted edits with
  // sections the parser failed on. Those are separate facts.
  it('requires a counted overflow clause, not a vague catch-all', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/naming HOW MANY you left out/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/either count them or say nothing/);
  });

  // Observed: the model emitted BOTH "plus three smaller edits" and "the parse
  // was incomplete". With an incomplete parse it cannot know what it missed, so
  // only the parse caveat is honest.
  it('forbids emitting the omitted-count and parse caveat together', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/DIFFERENT facts/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/never emit both in the same summary/);
  });

  // Observed: the model reported the effective date as "duplicated" because
  // bill pages repeat it in a trailing "Effective <date> (SD2)" stamp.
  it('explains the trailing effective-date stamp is one change, not duplication', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/"Effective <date> \(SD2\)" stamp/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/That is ONE change/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/never call it\s+"duplicated"/);
  });
});
