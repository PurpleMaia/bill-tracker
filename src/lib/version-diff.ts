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

export type DiffError = 'no-html' | 'fetch-failed' | 'parse-failed';

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
