'use client';

import { useMemo } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { groupReportsByVersion } from '@/lib/bill-versions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VersionTextViewer } from './version-text-viewer';
import { FileText, ExternalLink, Sparkles, ScrollText } from 'lucide-react';

function LinkButtons({ htmlLink, pdfLink }: { htmlLink: string | null; pdfLink: string | null }) {
  if (!htmlLink && !pdfLink) return null;
  return (
    <div className="flex items-center gap-1.5">
      {htmlLink && (
        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
          <a href={htmlLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-3 w-3" /> HTML
          </a>
        </Button>
      )}
      {pdfLink && (
        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
          <a href={pdfLink} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-1 h-3 w-3" /> PDF
          </a>
        </Button>
      )}
    </div>
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
      {report.aiSummary && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{report.aiSummary}</p>
      )}
      {report.originalText && (
        <div className="mt-1">
          <VersionTextViewer text={report.originalText} label="Read report" />
        </div>
      )}
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

  // "Latest" = last by created_at (query returns ascending, so last element).
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 sm:p-5 space-y-5">
        {/* Zone A — Latest card */}
        {(latestVersion || latestReport) && (
          <div className="rounded-lg border border-primary/20 bg-card p-3.5 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Latest</h4>
            </div>

            {latestVersion && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{latestVersion.label}</span>
                  <LinkButtons htmlLink={latestVersion.htmlLink} pdfLink={latestVersion.pdfLink} />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {latestVersion.aiSummary ?? 'No summary yet — the full text is available below.'}
                </p>
              </div>
            )}

            {latestReport && (
              <div className="border-t pt-2.5">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Latest report
                </p>
                <ReportRow report={latestReport} />
              </div>
            )}
          </div>
        )}

        {/* Zone B — Timeline */}
        <div>
          <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h4>
          <ol className="relative space-y-4 border-l border-border/70 pl-4">
            {groups.map((group, i) => {
              const isLatest = latestVersion?.id === group.version.id;
              const isBase = i === 0;
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
                  {group.version.aiSummary && (
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{group.version.aiSummary}</p>
                  )}
                  {group.version.originalText && (
                    <div className="mt-1">
                      <VersionTextViewer text={group.version.originalText} defaultOpen={isLatest} />
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
  );
}
