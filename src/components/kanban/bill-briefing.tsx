'use client';

import { useMemo } from 'react';
import type { BillDetails } from '@/types/legislation';
import { deriveBriefingFacts } from '@/lib/bills/bill-briefing-facts';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PenLine, GitCompare, ScrollText, Phone, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { Term } from '@/components/ui/term';
import { resolveVersionTerm, resolveCommitteeTerm } from '@/lib/glossary/resolvers';

const STEP_ICON = { testimony: PenLine, diff: GitCompare, reports: ScrollText, contact: Phone } as const;

export function BillBriefing({
  bill,
  today,
  dead,
  deadReason,
  progressValue,
  progressStages,
  currentStageName,
  onNextStep,
}: {
  bill: BillDetails;
  today: string;
  dead: boolean;
  deadReason: string | null;
  progressValue: number;
  progressStages: string[];
  currentStageName: string;
  onNextStep: (a: 'testimony' | 'diff' | 'reports' | 'contact') => void;
}) {
  const facts = useMemo(() => deriveBriefingFacts(bill, today), [bill, today]);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bill briefing</h3>
      </div>

      {/* Progress through the legislative pipeline */}
      <div>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Progress value={progressValue} className="w-full h-1.5" />
            </TooltipTrigger>
            <TooltipContent><p>{currentStageName} ({Math.round(progressValue)}%)</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="hidden sm:flex justify-between text-[10px] text-muted-foreground mt-1">
          {progressStages.map((s) => <span key={s}>{s}</span>)}
        </div>
        <div className="sm:hidden text-[10px] text-muted-foreground mt-1">{currentStageName}</div>
      </div>

      {/* Derived — always shown, no AI */}
      <div
        className={cn(
          'flex items-start gap-2 rounded-md border p-2.5 text-[12.5px]',
          facts.testimony.urgent
            ? 'border-red-300 bg-red-50 text-red-700'
            : facts.testimony.open
              ? 'border-primary/30 bg-primary/5'
              : 'text-muted-foreground',
        )}
      >
        {facts.testimony.urgent ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> : <Clock className="mt-0.5 h-4 w-4 flex-none" />}
        <span>{facts.testimony.message}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className={cn('rounded-md border p-2.5', dead && 'border-red-300 bg-red-50')}>
          <h4 className={cn('mb-1 text-[10px] font-semibold uppercase tracking-wide', dead ? 'text-red-700' : 'text-primary')}>
            {dead ? 'Bill failed' : 'Where it stands'}
          </h4>
          <p className={cn('text-[12px]', dead ? 'text-red-600' : 'text-foreground/80')}>
            {dead ? (deadReason ?? 'This bill is no longer moving.') : facts.standing}
          </p>
        </div>
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Latest version</h4>
          <p className="inline-flex items-center gap-1 text-[12px] text-foreground/80">
            {facts.latestVersionLabel ? (
              <>
                {facts.latestVersionHtml ? (
                  /* The label is a link here, so the link keeps the tap and a
                     sibling ⓘ carries the definition — never a button in an <a>. */
                  <a href={facts.latestVersionHtml} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{facts.latestVersionLabel}</a>
                ) : (
                  facts.latestVersionLabel
                )}
                <Term
                  variant="icon"
                  billId={bill.id}
                  term={resolveVersionTerm(facts.latestVersionLabel)}
                />
              </>
            ) : 'No versions on file.'}
          </p>
        </div>
        <div className="rounded-md border p-2.5">
          {facts.atConference ? (
            <>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Conference committee</h4>
              <p className="text-[12px] text-foreground/80">
                {/* At conference the negotiators are the conferees, not the committee
                    chairs — parsed from status updates. */}
                {facts.conferees.length > 0
                  ? facts.conferees.map((c, i) => (
                      <span key={`${c.chamber}-${c.surname}`}>
                        {i > 0 && ', '}
                        {c.surname}
                        {c.isChair && <span className="text-muted-foreground"> (Chair)</span>}
                      </span>
                    ))
                  : 'Conferees not yet appointed'}
              </p>
            </>
          ) : (
            <>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Committee activity</h4>
              <p className="text-[12px] text-foreground/80">
                {/* Codes stay tappable — an acronym is opaque. The heading does not. */}
                {facts.committeeCodes.length > 0
                  ? facts.committeeCodes.map((code, i) => (
                      <span key={code}>
                        {i > 0 && ', '}
                        <Term variant="chip" billId={bill.id} term={resolveCommitteeTerm(code)}>
                          {code}
                        </Term>
                      </span>
                    ))
                  : 'No committees'}
                {` · ${facts.reportCount} report(s)`}
              </p>
            </>
          )}
        </div>
      </div>

      {facts.nextSteps.length > 0 && (
        <div className="border-t border-dashed pt-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested next steps</h4>
          <div className="space-y-1.5">
            {facts.nextSteps.map((step, i) => {
              const Icon = STEP_ICON[step.action];
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-none text-primary" />
                  <span className="flex-1 text-[12.5px]">{step.text}</span>
                  <Button variant="ghost" size="sm" className="h-6 flex-none px-2 text-[11px] text-primary" onClick={() => onNextStep(step.action)}>
                    Go
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
