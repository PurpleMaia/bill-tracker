import type { BillVersion, CommitteeReport } from '@/types/legislation';

// A committee-report code: House/Senate Standing Committee Reports (HSCR/SSCR)
// and Conference Committee Reports (CCR), each with digits and an optional
// "-NN" session-year suffix, e.g. "HSCR65", "SSCR1197", "CCR50-26".
const REPORT_CODE = /(?:H|S)SCR\d+(?:-\d+)?|CCR\d+(?:-\d+)?/;

/**
 * A committee-report label embeds the version it belongs to plus a trailing
 * report-code segment, e.g. "HB139_HD1_HSCR65" (version "HB139_HD1", report
 * "HSCR65"), "HB139_HSCR10" (base version), or "HB1334_CD1_CCR50-26"
 * (conference report on the CD1 version). We strip the final "_<REPORTCODE>"
 * segment to recover the version label.
 *
 * Returns null when the label has no recognizable report-code segment.
 */
export function parseVersionLabelFromReport(reportLabel: string): string | null {
  const match = reportLabel.match(new RegExp(`^(.*)_(${REPORT_CODE.source})$`));
  return match ? match[1] : null;
}

/**
 * Parses a version label into the pieces that determine its place in the
 * legislative pipeline. A label looks like "SB894", "SB894_SD1",
 * "SB894_SD1_PROPOSED", or "HB1334_CD1_HFA4".
 *
 * Returns:
 *  - originChamber: 'S' | 'H' — the chamber that introduced the bill (from the
 *    "SB"/"HB" prefix). Used to decide whether Senate or House drafts come
 *    first after the base version.
 *  - draftKind: 'base' | 'SD' | 'HD' | 'CD' — the draft type.
 *  - draftNum: the draft number (0 for base).
 *  - proposed: whether this is a "_PROPOSED" working draft (sorts just after
 *    its parent draft).
 *  - amendment: floor-amendment code like "HFA4" / "SFA12" (sorts after the CD
 *    it amends, by number).
 */
export interface ParsedVersion {
  originChamber: 'S' | 'H' | null;
  draftKind: 'base' | 'SD' | 'HD' | 'CD';
  draftNum: number;
  proposed: boolean;
  amendment: { chamber: 'H' | 'S'; num: number } | null;
}

export function parseVersionLabel(label: string): ParsedVersion {
  const prefixMatch = label.match(/^([HS])B\d+/);
  const originChamber = prefixMatch ? (prefixMatch[1] as 'S' | 'H') : null;

  const proposed = /_PROPOSED\b/.test(label);

  const amendMatch = label.match(/_([HS])FA(\d+)/);
  const amendment = amendMatch
    ? { chamber: amendMatch[1] as 'H' | 'S', num: Number(amendMatch[2]) }
    : null;

  const draftMatch = label.match(/_(SD|HD|CD)(\d+)/);
  const draftKind = draftMatch ? (draftMatch[1] as 'SD' | 'HD' | 'CD') : 'base';
  const draftNum = draftMatch ? Number(draftMatch[2]) : 0;

  return { originChamber, draftKind, draftNum, proposed, amendment };
}

/**
 * Sorts bill versions into true legislative order:
 *   base → origin-chamber drafts → other-chamber drafts → conference drafts,
 * each numbered ascending; "_PROPOSED" sorts just after its parent draft, and
 * floor amendments sort after the conference draft they amend.
 *
 * For a Senate bill (SB): base → SD1 → SD2 → SD3 → HD1 → HD2 → CD1 → HFA/SFA.
 * For a House bill (HB): base → HD1 → HD2 → SD1 → SD2 → CD1 → HFA/SFA.
 *
 * Returns a new array; the input is not mutated. Falls back to label
 * comparison when two versions are otherwise indistinguishable, so ordering is
 * stable and deterministic.
 */
export function sortVersions(versions: BillVersion[]): BillVersion[] {
  // Defensive: callers may pass a bill that hasn't loaded its versions yet
  // (a plain Bill from the list has no `versions` field), so tolerate a
  // non-array rather than throwing "versions is not iterable".
  if (!Array.isArray(versions)) return [];

  // Rank of a draft kind, given the bill's chamber of origin. Origin-chamber
  // drafts come before the other chamber's; conference drafts come last.
  const draftRank = (p: ParsedVersion): number => {
    if (p.draftKind === 'base') return 0;
    if (p.draftKind === 'CD') return 3;
    const isOriginDraft =
      (p.originChamber === 'S' && p.draftKind === 'SD') ||
      (p.originChamber === 'H' && p.draftKind === 'HD');
    return isOriginDraft ? 1 : 2;
  };

  return [...versions].sort((a, b) => {
    const pa = parseVersionLabel(a.label);
    const pb = parseVersionLabel(b.label);

    const ra = draftRank(pa);
    const rb = draftRank(pb);
    if (ra !== rb) return ra - rb;

    if (pa.draftNum !== pb.draftNum) return pa.draftNum - pb.draftNum;

    // Same draft: a base/plain draft precedes its "_PROPOSED" variant.
    if (pa.proposed !== pb.proposed) return pa.proposed ? 1 : -1;

    // Floor amendments sort after the plain draft, by amendment number.
    const na = pa.amendment?.num ?? -1;
    const nb = pb.amendment?.num ?? -1;
    if (na !== nb) return na - nb;

    return a.label.localeCompare(b.label);
  });
}

/**
 * Extracts the numeric portion of a report code (e.g. "SSCR830" → 830) for
 * ordering reports chronologically within a version. Report numbers increase
 * over the course of a session.
 */
export function reportCodeNumber(report: CommitteeReport): number {
  // Primary number after the letter prefix, ignoring any "-NN" year suffix:
  // "SSCR830" → 830, "CCR50-26" → 50.
  const source = report.reportCode ?? report.label;
  const match = source.match(/[A-Z]+(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export interface VersionGroup {
  version: BillVersion;
  reports: CommitteeReport[];
}

/**
 * Matches each committee report to its version by label and returns the
 * versions in true legislative order, each with its reports nested (reports
 * ordered by report-code number), plus any reports that matched no version.
 */
export function groupReportsByVersion(
  versions: BillVersion[],
  reports: CommitteeReport[],
): { groups: VersionGroup[]; orphanReports: CommitteeReport[] } {
  // Defensive: tolerate not-yet-loaded (non-array) inputs.
  const safeReports = Array.isArray(reports) ? reports : [];
  const byLabel = new Map<string, CommitteeReport[]>();
  const orphanReports: CommitteeReport[] = [];

  for (const report of safeReports) {
    const versionLabel = parseVersionLabelFromReport(report.label);
    if (versionLabel === null) {
      orphanReports.push(report);
      continue;
    }
    const bucket = byLabel.get(versionLabel);
    if (bucket) bucket.push(report);
    else byLabel.set(versionLabel, [report]);
  }

  const matchedLabels = new Set<string>();
  const groups: VersionGroup[] = sortVersions(versions).map((version) => {
    matchedLabels.add(version.label);
    const groupReports = (byLabel.get(version.label) ?? []).slice().sort(
      (a, b) => reportCodeNumber(a) - reportCodeNumber(b),
    );
    return { version, reports: groupReports };
  });

  // Reports whose parsed version label matches no actual version → orphans.
  for (const [label, bucket] of byLabel) {
    if (!matchedLabels.has(label)) orphanReports.push(...bucket);
  }
  orphanReports.sort((a, b) => reportCodeNumber(a) - reportCodeNumber(b));

  return { groups, orphanReports };
}
