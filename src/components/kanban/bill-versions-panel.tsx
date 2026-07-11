'use client';

import { useMemo } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { groupReportsByVersion } from '@/lib/bill-versions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SummarySection } from './report-summary';
import { VersionDiffInline } from './version-diff-inline';
import { FileText, ExternalLink, ScrollText } from 'lucide-react';

function LinkButtons({ htmlLink, pdfLink }: { htmlLink: string | null; pdfLink: string | null }) {
  const href = pdfLink ?? htmlLink;
  if (!href) return null;
  return (
    <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs shrink-0">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="mr-1 h-3 w-3" /> View
      </a>
    </Button>
  );
}

function ReportRow({ report }: { report: CommitteeReport }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{report.reportCode ?? report.label}</span>
        </div>
        <LinkButtons htmlLink={report.htmlLink} pdfLink={report.pdfLink} />
      </div>
      <div className="mt-1.5">
        <SummarySection
          text={report.originalText ?? ''}
          existingSummary={report.aiSummary}
          noun="committee report"
        />
      </div>
    </div>
  );
}

export function BillVersionsPanel({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }) {
  const { groups, orphanReports } = useMemo(
    () => groupReportsByVersion(versions, reports),
    [versions, reports],
  );

  if (versions.length === 0 && reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No versions or reports available yet</p>
      </div>
    );
  }

  // "Latest" = furthest along the legislative pipeline. groups is sorted in
  // legislative order, so the last group is the most recent version, and the
  // latest report is the last report attached to the latest version that has
  // one (falling back to the last report seen scanning groups in order).
  const latestVersion = groups.length > 0 ? groups[groups.length - 1].version : null;
  let latestReport: CommitteeReport | null = null;
  for (const group of groups) {
    if (group.reports.length > 0) latestReport = group.reports[group.reports.length - 1];
  }
  if (!latestReport && orphanReports.length > 0) {
    latestReport = orphanReports[orphanReports.length - 1];
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="p-4 sm:p-5 space-y-5">
          {/* Zone A — Latest card */}
          {(latestVersion || latestReport) && (
            <div className="rounded-lg border border-primary/20 bg-card p-3.5 shadow-sm space-y-3">
              {latestVersion && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Latest version</h4>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{latestVersion.label}</span>
                    <LinkButtons htmlLink={latestVersion.htmlLink} pdfLink={latestVersion.pdfLink} />
                  </div>
                  <SummarySection
                    text={latestVersion.originalText ?? ''}
                    existingSummary={latestVersion.aiSummary}
                    noun="version"
                  />
                </div>
              )}

              {latestReport && (
                <div className={latestVersion ? 'space-y-1.5 border-t pt-2.5' : 'space-y-1.5'}>
                  <div className="flex items-center gap-1.5">
                    <ScrollText className="h-3.5 w-3.5 text-primary" />
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Latest committee report</h4>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{latestReport.reportCode ?? latestReport.label}</span>
                    <LinkButtons htmlLink={latestReport.htmlLink} pdfLink={latestReport.pdfLink} />
                  </div>
                  <SummarySection
                    text={latestReport.originalText ?? ''}
                    existingSummary={latestReport.aiSummary}
                    noun="committee report"
                  />
                </div>
              )}
            </div>
          )}

          {/* Zone B — Timeline */}
          <div>
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h4>
            <ol className="relative space-y-4 border-l border-border/70 pl-4">
              {groups.slice().reverse().map((group, revIdx) => {
                // groups is oldest→newest (legislative order); render newest→oldest
                // so the current version sits on top.
                const origIdx = groups.length - 1 - revIdx;
                const isBase = origIdx === 0;
                const isLatest = latestVersion?.id === group.version.id;
                const previous = origIdx > 0 ? groups[origIdx - 1].version : null;
                return (
                  <li key={group.version.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{group.version.label}</span>
                        {isBase && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">introduced</Badge>}
                        {isLatest && <Badge variant="default" className="h-4 px-1.5 text-[10px]">current</Badge>}
                      </div>
                      <LinkButtons htmlLink={group.version.htmlLink} pdfLink={group.version.pdfLink} />
                    </div>
                    <div className="mt-1.5">
                      <SummarySection
                        text={group.version.originalText ?? ''}
                        existingSummary={group.version.aiSummary}
                        noun="version"
                      />
                    </div>
                    {previous && group.version.originalText && previous.originalText && (
                      <div className="mt-1">
                        <VersionDiffInline older={previous} newer={group.version} />
                      </div>
                    )}
                    {group.reports.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {group.reports.map((report) => (
                          <ReportRow key={report.id} report={report} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {orphanReports.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Other reports</h4>
                <div className="space-y-1.5">
                  {orphanReports.map((report) => (
                    <ReportRow key={report.id} report={report} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
