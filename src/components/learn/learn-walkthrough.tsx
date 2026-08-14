'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, XCircle } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';
// data.bills exposes only getBills — there is no getBillDetails on the
// data-client. getBillDetails is a 'use server' query function that client
// components call directly (same pattern as bill-details-dialog.tsx).
import { getBillDetails } from '@/db/queries/bills-read';

export function LearnWalkthrough() {
  const searchParams = useSearchParams();
  const billId = searchParams.get('bill');
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState<string | null>(null);
  const [billDead, setBillDead] = useState(false);

  // "You are here" enrichment. Failure is silent on purpose: the walkthrough is
  // the point, position is a bonus, and an error banner on an explainer page
  // would be noise for a reader who just wanted the definition.
  useEffect(() => {
    if (!billId) return;
    let cancelled = false;
    getBillDetails(billId)
      .then((bill) => {
        if (cancelled || !bill) return;
        setBillNumber(bill.bill_number || null);
        setBillDead(Boolean(bill.dead));
        const status = bill.current_bill_status || '';
        const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(status));
        setCurrentStageId(stage?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [billId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Explicit back affordance: on touch, arriving here means leaving the
          board and losing scroll position, so the browser back button should
          not be the only exit. */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bills
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
        How a bill becomes law in Hawaiʻi
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Most bills never become law. They usually die because a deadline passed or a committee
        chair never scheduled a hearing — not because anyone voted them down. Here is the path a
        bill has to survive, stage by stage.
      </p>

      {billNumber && (
        <div
          className={cn(
            'mt-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
            billDead ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/40'
          )}
        >
          {billDead && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}
          <div className={billDead ? 'text-destructive' : undefined}>
            {billDead ? (
              <>
                <span className="font-semibold">{billNumber}</span> failed
                {currentStageId ? ' at the stage marked below' : ''}. Most bills do — usually
                because a deadline passed or a chair never scheduled a hearing. It never reached the
                stages after that point.
              </>
            ) : (
              <>
                You came from <span className="font-semibold">{billNumber}</span>
                {currentStageId
                  ? '. Its current stage is highlighted below.'
                  : '. Its current stage could not be placed on this path.'}
              </>
            )}
          </div>
        </div>
      )}

      <ol className="mt-8 space-y-4">
        {PROGRESS_STAGES.map((stage, i) => {
          const isCurrent = stage.id === currentStageId;
          const markedIndex = currentStageId
            ? PROGRESS_STAGES.findIndex((s) => s.id === currentStageId)
            : -1;
          // For a failed bill, stages past the failure point never happened —
          // dimming them says that without needing a sentence.
          const isUnreached = billDead && markedIndex !== -1 && i > markedIndex;
          const isFailPoint = isCurrent && billDead;

          return (
            <li
              key={stage.id}
              id={stage.id}
              className={cn(
                'scroll-mt-20 rounded-lg border p-4 transition-colors',
                isFailPoint && 'border-destructive/40 bg-destructive/5',
                isCurrent && !billDead && 'border-primary bg-primary/5',
                !isCurrent && 'bg-card',
                isUnreached && 'opacity-50'
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    isFailPoint && 'bg-destructive text-destructive-foreground',
                    isCurrent && !billDead && 'bg-primary text-primary-foreground',
                    !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isFailPoint ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <h2 className="font-semibold">{stage.name}</h2>
                {isFailPoint && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    The bill failed here
                  </span>
                )}
                {isCurrent && !billDead && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Your bill is here
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {stage.description}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Official records live at{' '}
        <a
          href="https://www.capitol.hawaii.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          capitol.hawaii.gov
        </a>
        . Always read the bill text before relying on it or testifying.
      </p>
    </div>
  );
}
