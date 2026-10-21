// Pure normalization for bill version comparisons. No DB, no network, no
// package imports — takes the shape hawaii-bill-diff's compareBillContent
// returns and produces the typed structure the UI renders.
//
// The load-bearing rule here is section alignment. The package's section regex
// silently drops sections (HB1494_HD1 parses 1,2,3,4,5,6,9,13,14,15,16,17 —
// 7, 8, 10, 11 are missing), so section lists differ in length AND content
// between two versions of the same bill. Aligning by array position would
// compare unrelated sections. We key on sectionNumber and report gaps.

export type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

export type DiffError = 'no-html' | 'fetch-failed' | 'parse-failed' | 'rate-limited';

/** One run of text within a section, carrying Hawaii's amendment marks. */
export interface ChangeFragment {
  kind: ChangeKind;
  text: string;
  /** formatting.strikethrough — Hawaii's deletion mark. */
  struck: boolean;
  /** formatting.underline — Hawaii's insertion mark. */
  underlined: boolean;
}

export interface SectionDiff {
  /** The alignment key, e.g. '4', '12'. Never an array index. */
  sectionNumber: string;
  kind: ChangeKind;
  /** Non-unchanged fragments; drives the collapsed row's label. */
  changeCount: number;
  fragments: ChangeFragment[];
  presence: 'both' | 'olderOnly' | 'newerOnly';
}

export interface VersionComparison {
  olderLabel: string;
  newerLabel: string;
  sections: SectionDiff[];
  totals: { added: number; removed: number; modified: number; unchanged: number };
  /** True when either parse dropped sections — the diff is not complete. */
  parseIncomplete: boolean;
  error: DiffError | null;
}

/** The subset of compareBillContent's output we depend on. */
export interface RawSectionChange {
  type: string;
  sectionNumber: string;
  changes: Array<{
    type: string;
    text: string;
    formatting?: { strikethrough?: boolean; underline?: boolean; bold?: boolean };
  }>;
}

const KINDS: ChangeKind[] = ['added', 'removed', 'modified', 'unchanged'];

function toKind(raw: string): ChangeKind {
  return (KINDS as string[]).includes(raw) ? (raw as ChangeKind) : 'modified';
}

/**
 * Numeric section ordering, so '12' sorts after '9'. Non-numeric section
 * numbers sort last (and among themselves lexically) rather than being dropped.
 */
export function compareSectionNumbers(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

/**
 * True when a parsed section sequence skips numbers, meaning the package's
 * fallback regex failed to recognize sections that exist in the document.
 */
export function hasSectionGaps(numbers: string[]): boolean {
  const parsed = numbers
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (parsed.length < 2) return false;
  return parsed[parsed.length - 1] - parsed[0] + 1 !== parsed.length;
}

export function errorComparison(
  olderLabel: string,
  newerLabel: string,
  error: DiffError,
): VersionComparison {
  return {
    olderLabel,
    newerLabel,
    sections: [],
    totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
    parseIncomplete: false,
    error,
  };
}

export function normalizeComparison(
  raw: RawSectionChange[],
  olderLabel: string,
  newerLabel: string,
  olderSectionNumbers: string[],
  newerSectionNumbers: string[],
): VersionComparison {
  const inOlder = new Set(olderSectionNumbers);
  const inNewer = new Set(newerSectionNumbers);

  const sections: SectionDiff[] = (raw ?? []).map((section) => {
    const fragments: ChangeFragment[] = (section.changes ?? [])
      // Empty/whitespace runs are parser noise, not content.
      .filter((change) => typeof change.text === 'string' && change.text.trim() !== '')
      .map((change) => ({
        kind: toKind(change.type),
        text: change.text,
        struck: change.formatting?.strikethrough === true,
        underlined: change.formatting?.underline === true,
      }));

    const number = section.sectionNumber;
    const presence: SectionDiff['presence'] =
      inOlder.has(number) && inNewer.has(number)
        ? 'both'
        : inNewer.has(number)
          ? 'newerOnly'
          : 'olderOnly';

    return {
      sectionNumber: number,
      kind: toKind(section.type),
      changeCount: fragments.filter((f) => f.kind !== 'unchanged').length,
      fragments,
      presence,
    };
  });

  sections.sort((a, b) => compareSectionNumbers(a.sectionNumber, b.sectionNumber));

  const totals = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const section of sections) totals[section.kind] += 1;

  return {
    olderLabel,
    newerLabel,
    sections,
    totals,
    parseIncomplete: hasSectionGaps(olderSectionNumbers) || hasSectionGaps(newerSectionNumbers),
    error: null,
  };
}

// ==============================================
// FRAGMENT CLEANUP FOR LLM CONSUMPTION
// ==============================================
// hawaii-bill-diff tags changes at WORD level, so one edited sentence arrives
// shredded into micro-fragments:
//
//   [removed] of any / [unchanged] of / [removed] the / [modified] a /
//   [unchanged] class A / [added] under the following sections:
//
// Most of those are grammatical glue ("of", "the", "a"). The model has to
// reassemble the sentence before it can interpret the edit, and the noise
// crowds out the one substantive change. These helpers coalesce runs and strip
// Word-export artifacts before the fragments reach a prompt.
//
// PURE: no DB, no network. Used by lib/summary-prompts, never by the renderer —
// the accordion still shows the parser's exact fragments, because a reader
// verifying wording needs the unmerged marks.

/**
 * Word-export debris that survives parsing: strikethrough/bold/underline
 * markers the HTML-to-text step leaves behind. They carry no meaning for a
 * language model and consume attention.
 */
const ARTIFACT_PATTERN = /(\*\*|__|~~|\[\]|\{\})/g;

/**
 * Trailing boilerplate every Hawaiʻi bill page carries. It is not legislative
 * text, and it duplicates content the model is told not to summarize.
 */
// NOTE: written WITHOUT the surrounding ** markup. cleanFragmentText strips
// Word artifacts before this runs, so a marker containing '**' would never
// match. Matching on the bare label is also more robust to markup variation.
//
// 'Description:' alone is deliberately NOT a marker: a bill can legitimately
// use that word mid-text, and cutting there would silently drop real
// legislative content. Only 'Report Title:' — which introduces the trailing
// page-furniture block — and the disclaimer sentence are safe to cut on.
const BOILERPLATE_MARKERS = [
  'The summary description of legislation appearing on this page',
  'Report Title:',
];

/**
 * Strips Word artifacts and collapses whitespace. Never drops real words.
 *
 * Artifacts are removed rather than replaced with a space, so "(c)~~]~~"
 * becomes "(c)]" — inserting a space there would fabricate a token boundary
 * inside what is really one string.
 */
export function cleanFragmentText(text: string): string {
  return text.replace(ARTIFACT_PATTERN, '').replace(/\s+/g, ' ').trim();
}

/**
 * Cuts the trailing "Report Title / Description / disclaimer" block, which is
 * page furniture rather than bill text. Returns the text unchanged when no
 * marker is present.
 */
export function stripBoilerplate(text: string): string {
  let cut = text.length;
  for (const marker of BOILERPLATE_MARKERS) {
    const at = text.indexOf(marker);
    if (at !== -1 && at < cut) cut = at;
  }
  return cut === text.length ? text : text.slice(0, cut).trim();
}

/**
 * Merges adjacent fragments of the same kind into one, after cleaning each and
 * dropping any that become empty.
 *
 * 'modified' is folded into the neighbouring kind it sits inside rather than
 * kept separate: the parser emits it for single reworded words, and on its own
 * a bare `[modified] a` tells a reader nothing. It is preserved only when it
 * stands alone in a run.
 *
 * Fragments whose cleaned text is pure punctuation or a single grammatical
 * particle are dropped when they are NOT part of a substantive change — an
 * isolated `[removed] the` is noise, but `[removed] the stadium` is the edit.
 */
export function coalesceFragments(fragments: ChangeFragment[]): ChangeFragment[] {
  const PARTICLES = new Set([
    'a', 'an', 'the', 'of', 'or', 'and', 'to', 'in', 'on', 'at', 'by', 'for',
    ',', ';', ':', '.', '(', ')', '"', "'",
  ]);

  const cleaned: ChangeFragment[] = [];
  for (const fragment of fragments) {
    const text = cleanFragmentText(fragment.text);
    if (text) cleaned.push({ ...fragment, text });
  }

  // MERGE FIRST, then filter. Filtering before merging would drop the "or" from
  // an "[removed] or" + "[removed] constructing" pair and silently change what
  // the edit says — the particle only counts as noise when it is the ENTIRE run.
  const merged: ChangeFragment[] = [];
  for (const fragment of cleaned) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === fragment.kind) {
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text} ${fragment.text}`,
        struck: previous.struck || fragment.struck,
        underlined: previous.underlined || fragment.underlined,
      };
      continue;
    }
    merged.push(fragment);
  }

  // A CHANGED run that is nothing but one grammatical particle carries no
  // information a reader could act on (a bare "[modified] a"). Unchanged
  // particles stay — they are the connective tissue of the surrounding context.
  return merged.filter(
    (fragment) => fragment.kind === 'unchanged' || !PARTICLES.has(fragment.text.toLowerCase()),
  );
}

/**
 * How comprehensively a comparison rewrites the bill. Drives how much the
 * change summary should say — see summarizeDiffAction and DIFF_SYSTEM_PROMPT.
 */
export type DiffScale = 'minor' | 'substantial' | 'rewrite';

/**
 * A comparison is a REWRITE when nearly every section changed and most of them
 * are wholly new. Measured on the real HB1334 -> HB1334_CD2 pair (base version
 * to conference draft): 9 of 9 sections changed, 6 of them newerOnly, zero
 * unchanged. A changelog of that degenerates into a summary of the new bill —
 * which the page already shows for the current version — so the UI says so and
 * points there instead of duplicating it.
 */
const REWRITE_CHANGED_RATIO = 0.9;
const REWRITE_NEW_SECTION_RATIO = 0.5;

/** Above this many changed sections, one-sentence-per-edit needs more room. */
const SUBSTANTIAL_CHANGED_SECTIONS = 4;

/**
 * Classifies a comparison by how much of the bill it rewrites. PURE.
 *
 * An empty or errored comparison is 'minor': callers gate on error/emptiness
 * before ever asking for a summary, so there is nothing to scale.
 */
export function classifyDiffScale(comparison: VersionComparison): DiffScale {
  const sections = comparison.sections;
  if (sections.length === 0) return 'minor';

  const changed = sections.filter((s) => s.kind !== 'unchanged');
  if (changed.length === 0) return 'minor';

  const newSections = changed.filter((s) => s.presence === 'newerOnly');
  const isRewrite =
    changed.length / sections.length >= REWRITE_CHANGED_RATIO &&
    newSections.length / changed.length >= REWRITE_NEW_SECTION_RATIO;
  if (isRewrite) return 'rewrite';

  return changed.length > SUBSTANTIAL_CHANGED_SECTIONS ? 'substantial' : 'minor';
}

/**
 * Sentence budget for a change summary at a given scale. Small diffs stay
 * tight; genuinely multi-edit diffs get room to be complete rather than
 * silently dropping real legislative changes behind a count.
 */
export function sentenceBudgetFor(scale: DiffScale, changedSections: number): number {
  if (scale === 'rewrite') return 2;
  if (scale === 'minor') return 4;
  return Math.min(8, Math.max(4, changedSections));
}
