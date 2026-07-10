import { describe, it, expect } from 'vitest';
import {
  parseVersionLabelFromReport,
  groupReportsByVersion,
} from '../bill-versions';
import type { BillVersion, CommitteeReport } from '@/types/legislation';

const v = (label: string): BillVersion => ({
  id: label, label, htmlLink: null, pdfLink: null,
  originalText: null, aiSummary: null, createdAt: null,
});
const r = (label: string, reportCode: string): CommitteeReport => ({
  id: label, label, reportCode, htmlLink: null, pdfLink: null,
  originalText: null, aiSummary: null, createdAt: null,
});

describe('parseVersionLabelFromReport', () => {
  it('strips a report-code segment from a draft-versioned report', () => {
    expect(parseVersionLabelFromReport('HB139_HD1_HSCR65')).toBe('HB139_HD1');
  });

  it('handles a report on the base version', () => {
    expect(parseVersionLabelFromReport('HB139_HSCR10')).toBe('HB139');
  });

  it('handles senate report codes', () => {
    expect(parseVersionLabelFromReport('HB139_SD1_SSCR1197')).toBe('HB139_SD1');
  });

  it('returns null when there is no report-code segment', () => {
    expect(parseVersionLabelFromReport('HB139_HD1')).toBeNull();
  });
});

describe('groupReportsByVersion', () => {
  it('nests reports under the matching version, preserving version order', () => {
    const versions = [v('HB139'), v('HB139_HD1'), v('HB139_HD2')];
    const reports = [
      r('HB139_HD1_HSCR65', 'HSCR65'),
      r('HB139_HD2_HSCR526', 'HSCR526'),
      r('HB139_HD2_HSCR901', 'HSCR901'),
    ];
    const { groups, orphanReports } = groupReportsByVersion(versions, reports);
    expect(groups.map(g => g.version.label)).toEqual(['HB139', 'HB139_HD1', 'HB139_HD2']);
    expect(groups[0].reports).toEqual([]);
    expect(groups[1].reports.map(x => x.reportCode)).toEqual(['HSCR65']);
    expect(groups[2].reports.map(x => x.reportCode)).toEqual(['HSCR526', 'HSCR901']);
    expect(orphanReports).toEqual([]);
  });

  it('puts reports with no matching version into orphanReports', () => {
    const versions = [v('HB139')];
    const reports = [r('HB139_SD9_SSCR999', 'SSCR999')];
    const { groups, orphanReports } = groupReportsByVersion(versions, reports);
    expect(groups[0].reports).toEqual([]);
    expect(orphanReports.map(x => x.reportCode)).toEqual(['SSCR999']);
  });

  it('treats an unparseable report label as an orphan', () => {
    const versions = [v('HB139')];
    const reports = [r('HB139', 'WEIRD')];
    const { orphanReports } = groupReportsByVersion(versions, reports);
    expect(orphanReports).toHaveLength(1);
  });
});
