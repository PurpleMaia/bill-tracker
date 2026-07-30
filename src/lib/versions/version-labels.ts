// PURE label parsing for Hawaiʻi bill version labels. No DB, no network.
//
// Labels look like: HB1494 (as introduced), HB1494_HD1 (House draft 1),
// SB2374_SD2 (Senate draft 2), HB235_CD1 (conference draft). Some labels in
// the corpus point at documents that 404 (HB1494_CD1) — parsing the label is
// independent of whether the document exists.
//
// An unrecognized label returns null on purpose: the prompt then omits the
// pipeline-position line instead of asserting something we cannot verify.

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

const CHAMBER_BY_CODE: Record<string, string> = {
  HD: 'House',
  SD: 'Senate',
};

/**
 * Describes where a version sits in the legislative process, e.g.
 * 'House, first committee draft'. Returns null when the label is not a shape
 * we recognize — callers MUST omit the position line in that case.
 */
export function describeVersionLabel(label: string): string | null {
  const trimmed = label.trim().replace(/_+$/, '');
  if (!trimmed) return null;

  const parts = trimmed.split('_');

  // Bare bill number, e.g. HB1494 / SB2374.
  if (parts.length === 1) {
    return /^[A-Z]+\d+$/i.test(parts[0]) ? 'As introduced' : null;
  }

  const suffix = parts[parts.length - 1].toUpperCase();
  const match = /^([A-Z]{2})(\d+)$/.exec(suffix);
  if (!match) return null;

  const [, code, digits] = match;
  const ordinal = ORDINALS[Number(digits) - 1];
  if (!ordinal) return null;

  if (code === 'CD') return 'Conference draft';

  const chamber = CHAMBER_BY_CODE[code];
  if (!chamber) return null;

  return `${chamber}, ${ordinal} committee draft`;
}
