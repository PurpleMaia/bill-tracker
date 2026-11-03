'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Compass, ArrowRight, ChevronLeft, ChevronRight, ListChecks, XCircle } from 'lucide-react';
import type { BillDetails } from '@/types/legislation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/core/utils';
import { sortVersions } from '@/lib/versions/bill-versions';
import { buildReadingSteps, type ReadingStep } from '@/lib/bills/bill-reading-steps';
import { buildSpotlightSteps } from '@/lib/bills/bill-spotlight-steps';
import { BillSpotlightTour } from './bill-spotlight-tour';
import { useCommitteeNames } from '@/hooks/contexts/committee-names-context';

/** The bill's parts as walkthrough steps, built from its real values. */
function useReadingSteps(bill: BillDetails, currentStatus: string, deadlineName?: string | null) {
  const committeeNames = useCommitteeNames();

  // sortVersions puts these in LEGISLATIVE order. The query returns them by
  // created_at, so a backfilled or out-of-order insert would otherwise present
  // an older draft as "latest". Matches the briefing and versions panel.
  const latestVersionLabel = useMemo(() => {
    if (!bill.versions || bill.versions.length === 0) return null;
    const ordered = sortVersions(bill.versions);
    return ordered[ordered.length - 1]?.label ?? null;
  }, [bill.versions]);

  return useMemo(
    () =>
      buildReadingSteps({
        billNumber: bill.bill_number,
        billTitle: bill.bill_title,
        introducer: bill.introducer ?? null,
        committeeAssignment: bill.committee_assignment ?? null,
        latestVersionLabel,
        currentStatus,
        deadlineName,
        dead: Boolean(bill.dead),
        committeeNames,
      }),
    [bill, latestVersionLabel, currentStatus, deadlineName, committeeNames]
  );
}

/** A failed bill's most useful fact is that nothing below it will happen. */
function FailedBanner() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-destructive">
        This bill has failed. Everything below translates what the bill is and where it got to
        before it stopped.
      </p>
    </div>
  );
}

/** One row of the all-at-once list: the bill's ACTUAL value, then what it means. */
function BreakdownRow({ step }: { step: ReadingStep }) {
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      <p className="font-mono text-sm font-semibold leading-snug text-foreground">{step.value}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.explanation}</p>
    </div>
  );
}

/** Every part at once — the quick-scan alternative to the step-by-step walkthrough. */
export function BillBreakdown({
  bill,
  currentStatus,
  deadlineName,
}: {
  bill: BillDetails;
  currentStatus: string;
  /** Name of the bill's next deadline, e.g. "First Decking". The pill on the
   *  card shows this jargon with only a date tooltip, so the definition lives
   *  here rather than bloating that tooltip. */
  deadlineName?: string | null;
}) {
  const steps = useReadingSteps(bill, currentStatus, deadlineName);

  return (
    <div className="space-y-4">
      {bill.dead && <FailedBanner />}
      <div className="space-y-3">
        {steps.map((step) => (
          <BreakdownRow key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

/**
 * Step-by-step walkthrough: a mini "bill card" whose parts light up one at a
 * time, with the active part's real value and plain-language meaning below.
 * The parts are clickable to jump around; Back/Next (or the arrow keys) walk
 * through in reading order.
 *
 * Renders the dialog's scrolling middle row AND its pinned footer row, so the
 * Back/Next controls stay on screen however tall the content gets.
 */
function BillReadingGuide({
  bill,
  currentStatus,
  deadlineName,
}: {
  bill: BillDetails;
  currentStatus: string;
  deadlineName?: string | null;
}) {
  const steps = useReadingSteps(bill, currentStatus, deadlineName);
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);

  // The step list can shrink if the bill's details finish loading mid-read.
  const current = steps[Math.min(index, steps.length - 1)];
  const position = steps.indexOf(current);
  const isFirst = position === 0;
  const isLast = position === steps.length - 1;

  const go = (next: number) => setIndex(Math.max(0, Math.min(steps.length - 1, next)));

  if (showAll) {
    return (
      <>
        <ScrollArea className="min-h-0">
          <div className="space-y-4 px-5 py-4">
            <BillBreakdown bill={bill} currentStatus={currentStatus} deadlineName={deadlineName} />
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setShowAll(false)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to step-by-step
            </Button>
          </div>
        </ScrollArea>
        <div className="border-t bg-muted/30 px-5 py-3">
          <BillBreakdownFooter billId={bill.id} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScrollArea
        className="min-h-0"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'ArrowRight') go(position + 1);
          else if (e.key === 'ArrowLeft') go(position - 1);
        }}
      >
        <div className="space-y-4 px-5 py-4">
          {bill.dead && <FailedBanner />}

          {/* The mini bill card: tap a part to jump to it. The active part is
              ringed and the rest dimmed — the spotlight, inside the dialog. */}
          <div
            role="group"
            aria-label="Parts of this bill"
            className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/30 p-1.5 sm:grid-cols-3"
          >
            {steps.map((step, i) => {
              const active = i === position;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'min-w-0 rounded-md border px-2 py-1 text-left transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    step.id === 'title' && 'col-span-2 sm:col-span-3',
                    active
                      ? 'border-primary bg-background shadow-sm ring-2 ring-primary/40'
                      : 'border-transparent bg-background/60 opacity-60 hover:opacity-100'
                  )}
                >
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {step.label}
                  </span>
                  <span className="block truncate font-mono text-xs font-semibold">{step.value}</span>
                </button>
              );
            })}
          </div>

          {/* Active step */}
          <div aria-live="polite" className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {current.label} · {position + 1} of {steps.length}
            </p>
            <p className="mt-1.5 break-words font-mono text-sm font-semibold leading-snug">
              {current.value}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {current.explanation}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              <ListChecks className="mr-1.5 h-4 w-4" />
              Show everything at once
            </Button>
            <BillBreakdownFooter billId={bill.id} />
          </div>
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {steps.map((step, i) => (
            <span
              key={step.id}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === position ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={isFirst} onClick={() => go(position - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <Button size="sm" disabled={isLast} onClick={() => go(position + 1)}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

/** Pinned footer action. Lives OUTSIDE the ScrollArea so it stays visible. */
export function BillBreakdownFooter({ billId }: { billId: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
      <Link href={`/learn?bill=${encodeURIComponent(billId)}`}>
        See the full path a bill takes
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}

/**
 * The "How to read this" affordance and its walkthrough dialog. Kept in one
 * place so the bill dialog only has to render a single element in its header.
 */
export function BillBreakdownButton({
  bill,
  currentStatus,
  deadlineName,
}: {
  bill: BillDetails;
  currentStatus: string;
  deadlineName?: string | null;
}) {
  // The pill starts the spotlight tour over the real bill dialog; the list
  // dialog (step-by-step cards, or everything at once) is its fallback.
  const [tourOpen, setTourOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const readingSteps = useReadingSteps(bill, currentStatus, deadlineName);
  const spotlightSteps = useMemo(() => buildSpotlightSteps(readingSteps), [readingSteps]);

  return (
    <>
      {/* The ripple sits in a wrapper BEHIND the button: a ping inside the
          button would be painted over by the button's own fill. */}
      <span className="relative inline-flex">
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-yellow-400 opacity-70 motion-safe:animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"
          aria-hidden="true"
        />
        <Button
          size="sm"
          onClick={() => setTourOpen(true)}
          /* The one control that teaches the rest, so it must not read as just
             another chip: a solid yellow pill with a radiating ripple and a guide
             icon, where the surrounding badges (Failed, Fiscal) are muted. */
          className="relative h-7 gap-1.5 rounded-full border border-yellow-500/70 bg-yellow-400 px-2.5 text-xs font-semibold text-yellow-950 shadow-sm hover:bg-yellow-300 hover:text-yellow-950"
          aria-label="How to read this bill"
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
          {/* Always labeled — even on mobile the pill reads "How to read",
              expanding to the full phrase once there's room. */}
          <span className="sm:hidden">How to read</span>
          <span className="hidden sm:inline">How to read this</span>
        </Button>
      </span>

      <BillSpotlightTour
        open={tourOpen}
        onOpenChange={setTourOpen}
        steps={spotlightSteps}
        onViewList={() => setListOpen(true)}
      />

      <Dialog open={listOpen} onOpenChange={setListOpen}>
      {/* Three-row grid: fixed header, scrolling middle, pinned footer.
          overflow-hidden clips the ScrollArea's scrollbar to the rounded
          corners — without it the bar draws over the container edge.
          grid-rows-[auto_minmax(0,1fr)_auto] lets the middle row shrink, which
          a plain 1fr will not do inside a max-h grid. */}
      <DialogContent className="grid max-h-[85vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">How to read this bill</DialogTitle>
          <DialogDescription className="text-xs">
            Step through every part of {bill.bill_number}, in plain language.
          </DialogDescription>
        </DialogHeader>
        <BillReadingGuide
          bill={bill}
          currentStatus={currentStatus}
          deadlineName={deadlineName}
        />
      </DialogContent>
      </Dialog>
    </>
  );
}
