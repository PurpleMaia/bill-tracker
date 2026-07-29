import { describe, it, expect } from 'vitest';
import {
  parseVersionLabelFromReport,
  groupReportsByVersion,
  sortVersions,
  resolveComparisonOrder,
} from '../bill-versions';
import type { BillVersion, CommitteeReport } from '@/types/legislation';

const v = (label: string): BillVersion => ({
  id: label, label, htmlLink: null, pdfLink: null,
  originalText: null, aiSummary: null, createdAt: null,
  summaryGeneratedAt: null,
});
const r = (label: string, reportCode: string): CommitteeReport => ({
  id: label, label, reportCode, htmlLink: null, pdfLink: null,
  originalText: null, aiSummary: null, createdAt: null,
  summaryGeneratedAt: null,
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

  it('handles a conference committee report with a year suffix', () => {
    expect(parseVersionLabelFromReport('HB1334_CD1_CCR50-26')).toBe('HB1334_CD1');
  });

  it('handles a standing report with a year suffix', () => {
    expect(parseVersionLabelFromReport('SB2623_SD1_SSCR28-26')).toBe('SB2623_SD1');
  });

  it('returns null when there is no report-code segment', () => {
    expect(parseVersionLabelFromReport('HB139_HD1')).toBeNull();
  });
});

describe('sortVersions', () => {
  it('orders a Senate bill: base → SD drafts → HD drafts → CD drafts', () => {
    // Deliberately shuffled input (mirrors the meaningless created_at seed order).
    const input = ['SB894_HD1', 'SB894_SD1', 'SB894_SD3', 'SB894_SD2', 'SB894', 'SB894_CD1'].map(v);
    expect(sortVersions(input).map((x) => x.label)).toEqual([
      'SB894', 'SB894_SD1', 'SB894_SD2', 'SB894_SD3', 'SB894_HD1', 'SB894_CD1',
    ]);
  });

  it('orders a House bill: base → HD drafts → SD drafts → CD drafts', () => {
    const input = ['HB1334_SD2', 'HB1334_HD1', 'HB1334', 'HB1334_CD2', 'HB1334_HD3'].map(v);
    expect(sortVersions(input).map((x) => x.label)).toEqual([
      'HB1334', 'HB1334_HD1', 'HB1334_HD3', 'HB1334_SD2', 'HB1334_CD2',
    ]);
  });

  it('places a _PROPOSED draft immediately after its parent draft', () => {
    const input = ['SB894_SD1_PROPOSED', 'SB894_SD1', 'SB894'].map(v);
    expect(sortVersions(input).map((x) => x.label)).toEqual([
      'SB894', 'SB894_SD1', 'SB894_SD1_PROPOSED',
    ]);
  });

  it('places floor amendments after the conference draft, by number', () => {
    const input = ['HB1334_CD1_HFA6', 'HB1334_CD1', 'HB1334_CD1_HFA4'].map(v);
    expect(sortVersions(input).map((x) => x.label)).toEqual([
      'HB1334_CD1', 'HB1334_CD1_HFA4', 'HB1334_CD1_HFA6',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = ['SB894_SD1', 'SB894'].map(v);
    const before = input.map((x) => x.label);
    sortVersions(input);
    expect(input.map((x) => x.label)).toEqual(before);
  });

  it('tolerates a non-array (undefined/null) without throwing', () => {
    // A bill loaded from the list (plain Bill) has no `versions` field, so
    // callers may pass undefined during the pre-load render.
    expect(sortVersions(undefined as unknown as never)).toEqual([]);
    expect(sortVersions(null as unknown as never)).toEqual([]);
  });
});

describe('groupReportsByVersion', () => {
  it('returns versions in legislative order, not input order', () => {
    const versions = ['SB894_HD1', 'SB894', 'SB894_SD1'].map(v);
    const { groups } = groupReportsByVersion(versions, []);
    expect(groups.map((g) => g.version.label)).toEqual(['SB894', 'SB894_SD1', 'SB894_HD1']);
  });

  it('orders reports within a version by report-code number', () => {
    const versions = [v('SB894_HD1')];
    const reports = [
      r('SB894_HD1_HSCR1964', 'HSCR1964'),
      r('SB894_HD1_HSCR1242', 'HSCR1242'),
      r('SB894_HD1_HSCR1439', 'HSCR1439'),
    ];
    const { groups } = groupReportsByVersion(versions, reports);
    expect(groups[0].reports.map((x) => x.reportCode)).toEqual(['HSCR1242', 'HSCR1439', 'HSCR1964']);
  });

  it('orders reports by the label code when report_code is null (not the bill number)', () => {
    // report_code is a nullable column; the fallback must read the trailing
    // report-code segment (HSCR65/901), not the leading bill number (139).
    const nullCode = (label: string): CommitteeReport => ({
      id: label, label, reportCode: null, htmlLink: null, pdfLink: null,
      originalText: null, aiSummary: null, createdAt: null,
      summaryGeneratedAt: null,
    });
    const versions = [v('HB139_HD2')];
    const reports = [nullCode('HB139_HD2_HSCR901'), nullCode('HB139_HD2_HSCR65')];
    const { groups } = groupReportsByVersion(versions, reports);
    expect(groups[0].reports.map((x) => x.label)).toEqual(['HB139_HD2_HSCR65', 'HB139_HD2_HSCR901']);
  });


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

describe('resolveComparisonOrder', () => {
  // The user's own example: HB1334 must be on the left, HB1334_CD2 on the right.
  const hb1334 = [v('HB1334'), v('HB1334_HD3'), v('HB1334_SD2'), v('HB1334_CD2')];

  it('leaves an already-correct pair untouched', () => {
    expect(resolveComparisonOrder(hb1334, 'HB1334', 'HB1334_CD2')).toEqual({
      olderId: 'HB1334', newerId: 'HB1334_CD2', swapped: false,
    });
  });

  it('swaps an inverted pair so the older version lands on the left', () => {
    expect(resolveComparisonOrder(hb1334, 'HB1334_CD2', 'HB1334')).toEqual({
      olderId: 'HB1334', newerId: 'HB1334_CD2', swapped: true,
    });
  });

  it('respects the full draft ordering, not just base-vs-rest', () => {
    // sortVersions ranks origin-chamber drafts before the other chamber's,
    // with conference drafts last: HD3 -> SD2 is in order, SD2 -> HD3 is not.
    expect(resolveComparisonOrder(hb1334, 'HB1334_HD3', 'HB1334_SD2').swapped).toBe(false);
    expect(resolveComparisonOrder(hb1334, 'HB1334_SD2', 'HB1334_HD3')).toEqual({
      olderId: 'HB1334_HD3', newerId: 'HB1334_SD2', swapped: true,
    });
    expect(resolveComparisonOrder(hb1334, 'HB1334_CD2', 'HB1334_SD2').swapped).toBe(true);
  });

  it('treats the same version on both sides as not an ordering error', () => {
    // The UI already tells the user to pick two different versions; swapping
    // identical ids would be a pointless state change.
    expect(resolveComparisonOrder(hb1334, 'HB1334_HD3', 'HB1334_HD3')).toEqual({
      olderId: 'HB1334_HD3', newerId: 'HB1334_HD3', swapped: false,
    });
  });

  it('leaves unknown or empty ids alone rather than guessing', () => {
    expect(resolveComparisonOrder(hb1334, '', 'HB1334_CD2').swapped).toBe(false);
    expect(resolveComparisonOrder(hb1334, 'HB1334', 'nope').swapped).toBe(false);
    expect(resolveComparisonOrder([], 'HB1334', 'HB1334_CD2').swapped).toBe(false);
  });

  it('does not depend on the input array already being sorted', () => {
    const shuffled = [v('HB1334_CD2'), v('HB1334'), v('HB1334_SD2'), v('HB1334_HD3')];
    expect(resolveComparisonOrder(shuffled, 'HB1334_CD2', 'HB1334')).toEqual({
      olderId: 'HB1334', newerId: 'HB1334_CD2', swapped: true,
    });
  });
});
