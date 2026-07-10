import type { BillVersion, CommitteeReport } from '@/types/legislation';

/**
 * A committee-report label embeds the version it belongs to plus a trailing
 * report-code segment, e.g. "HB139_HD1_HSCR65" (version "HB139_HD1", report
 * "HSCR65") or "HB139_HSCR10" (base version "HB139"). Report codes look like
 * H/S + "SCR" + digits. We strip the final "_<REPORTCODE>" segment to recover
 * the version label.
 *
 * Returns null when the label has no recognizable report-code segment.
 */
export function parseVersionLabelFromReport(reportLabel: string): string | null {
  const match = reportLabel.match(/^(.*)_([HS]SCR\d+)$/);
  return match ? match[1] : null;
}

export interface VersionGroup {
  version: BillVersion;
  reports: CommitteeReport[];
}

/**
 * Matches each committee report to its version by label and returns the
 * versions (input order preserved) each with its reports nested, plus any
 * reports that matched no known version.
 */
export function groupReportsByVersion(
  versions: BillVersion[],
  reports: CommitteeReport[],
): { groups: VersionGroup[]; orphanReports: CommitteeReport[] } {
  const byLabel = new Map<string, CommitteeReport[]>();
  const orphanReports: CommitteeReport[] = [];

  for (const report of reports) {
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
  const groups: VersionGroup[] = versions.map((version) => {
    matchedLabels.add(version.label);
    return { version, reports: byLabel.get(version.label) ?? [] };
  });

  // Reports whose parsed version label matches no actual version → orphans.
  for (const [label, bucket] of byLabel) {
    if (!matchedLabels.has(label)) orphanReports.push(...bucket);
  }

  return { groups, orphanReports };
}
