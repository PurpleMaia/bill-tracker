'use client';

import { useMemo } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { groupReportsByVersion } from '@/lib/versions/bill-versions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SummarySection } from './report-summary';
import { FileText, ExternalLink, ScrollText, GitCompare } from 'lucide-react';
import { cn } from '@/lib/core/utils';

function LinkButtons({ link, type }: { link: string | null; type: 'version' | 'report' }) {
  if (!link) return null;
  return (
    <Button asChild variant="outline" size="sm" className="h-7 text-xs shrink-0">
      <a href={link} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-3 w-3" /> View {type[0].toUpperCase() + type.slice(1)}
      </a>
    </Button>
  );
}

function ReportRow({ billId, report }: { billId: string; report: CommitteeReport }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/60 p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{report.reportCode ?? report.label}</span>
        </div>
        <LinkButtons link={report.pdfLink} type="report" />
      </div>
      <div className="mt-1.5">
        <SummarySection
          target="report"
          billId={billId}
          documentId={report.id}
          existingSummary={report.aiSummary}
          noun="committee report"
        />
      </div>
    </div>
  );
}

export function BillVersionsPanel({
  billId,
  versions,
  reports,
  selectedOlderId,
  selectedNewerId,
  onCompare,
}: {
  billId: string;
  versions: BillVersion[];
  reports: CommitteeReport[];
  selectedOlderId: string;
  selectedNewerId: string;
  onCompare: (olderId: string, newerId: string) => void;
}) {
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
                    <LinkButtons link={latestVersion.pdfLink} type="version" />
                  </div>
                  <SummarySection
                    key={latestVersion.id}
                    target="version"
                    billId={billId}
                    documentId={latestVersion.id}
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
                    <LinkButtons link={latestReport.pdfLink} type="report" />
                  </div>
                  <SummarySection
                    key={latestReport.id}
                    target="report"
                    billId={billId}
                    documentId={latestReport.id}
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
                const isSelected =
                  selectedNewerId === group.version.id && previous?.id === selectedOlderId;
                return (
                  <li
                    key={group.version.id}
                    className={cn(
                      'relative rounded-md transition-colors',
                      isSelected && '-mx-2 bg-primary/5 px-2 py-1.5 ring-1 ring-primary/25',
                    )}
                    aria-current={isSelected ? 'true' : undefined}
                  >
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{group.version.label}</span>
                        {isBase && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">introduced</Badge>}
                        {isLatest && <Badge variant="default" className="h-4 px-1.5 text-[10px]">current</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* The base version has no predecessor, so nothing to compare against. */}
                        {previous && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCompare(previous.id, group.version.id)}
                            className="h-7 gap-1 px-1.5 text-xs text-primary hover:bg-transparent hover:text-primary/80"
                          >
                            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                            Compare
                            <span className="sr-only"> {group.version.label} with {previous.label}</span>
                          </Button>
                        )}
                        <LinkButtons link={group.version.pdfLink} type="version" />
                      </div>
                    </div>
                    {/* No per-version AI summary here. Hawaiʻi drafts are
                        cumulative — each restates the whole bill with a few
                        edits woven in — so a summary per row produced several
                        near-identical paragraphs and buried the one thing that
                        differs. Zone A carries the summary for the current
                        version; what changed at each step belongs to Compare. */}
                    {group.reports.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {group.reports.map((report) => (
                          <ReportRow key={report.id} billId={billId} report={report} />
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
                    <ReportRow key={report.id} billId={billId} report={report} />
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
