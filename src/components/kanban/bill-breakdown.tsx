'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { HelpCircle, ArrowRight, XCircle } from 'lucide-react';
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
import { GLOSSARY } from '@/lib/glossary/terms';
import {
  resolveStatusTerm,
  resolveCommitteeTerm,
  resolveVersionTerm,
  resolveDeadlineTerm,
} from '@/lib/glossary/resolvers';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';
import { parseCommitteeCodes, committeeFullName } from '@/lib/testimony/committees';
import { COLUMN_TITLES } from '@/lib/bills/kanban-columns';

/**
 * One row of the breakdown: the bill's ACTUAL value, then what it means.
 *
 * Showing the real value is the whole point — a generic glossary makes the
 * reader map definitions onto the bill themselves, which is the mapping gap
 * this panel exists to close.
 */
function BreakdownRow({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      <p className="font-mono text-sm font-semibold leading-snug text-foreground">{value}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * "How to read this bill" — a bill-specific anatomy panel.
 *
 * Replaces what used to be a dotted underline on every heading in the dialog.
 * A newcomer's real question is "what am I looking at and what matters here?",
 * which wants one coherent explanation rather than sixteen fragments they have
 * to hunt for.
 */
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
  const committeeCodes = useMemo(
    () => parseCommitteeCodes(bill.committee_assignment ?? null),
    [bill.committee_assignment]
  );

  const statusTerm = resolveStatusTerm(currentStatus);
  const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(currentStatus));

  const latestVersion = bill.versions && bill.versions.length > 0
    ? bill.versions[bill.versions.length - 1]
    : null;
  const versionTerm = latestVersion ? resolveVersionTerm(latestVersion.label) : null;

  const chamberWord = bill.bill_number?.toUpperCase().startsWith('S') ? 'Senate' : 'House';
  const otherChamber = chamberWord === 'House' ? 'Senate' : 'House';

  // A failed bill's most useful fact is that nothing below it will happen.
  const isDead = Boolean(bill.dead);

  const deadlineTerm = deadlineName ? resolveDeadlineTerm(deadlineName) : null;

  return (
    <div className="space-y-4">
      {isDead && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-destructive">
            This bill has failed — it is no longer moving. Everything below describes where it got
            to before it stopped.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <BreakdownRow value={bill.bill_number || 'Unknown'}>
          A {chamberWord} bill — the {`"${chamberWord === 'House' ? 'HB' : 'SB'}"`} prefix means it
          was introduced there. The number is just filing order; a lower number does not mean the
          bill matters more.
        </BreakdownRow>

        {bill.bill_title && (
          <BreakdownRow value={bill.bill_title}>{GLOSSARY['relating-to'].short}</BreakdownRow>
        )}

        {bill.introducer && (
          <BreakdownRow value={bill.introducer}>{GLOSSARY.introducers.short}</BreakdownRow>
        )}

        {committeeCodes.length > 0 && (
          <BreakdownRow value={committeeCodes.join(', ')}>
            {committeeCodes
              .map((code) => {
                const resolved = resolveCommitteeTerm(code);
                return resolved ? `${code} is ${committeeFullName(code)}` : null;
              })
              .filter(Boolean)
              .join('; ')}
            {committeeCodes.length > 1
              ? `. This bill must clear all ${committeeCodes.length} to stay alive. `
              : '. '}
            {GLOSSARY['committee-chair'].short}
          </BreakdownRow>
        )}

        {latestVersion && (
          <BreakdownRow value={latestVersion.label}>
            {versionTerm
              ? versionTerm.short
              : `A snapshot of the bill's text. ${GLOSSARY['bill-version'].short}`}
          </BreakdownRow>
        )}

        {statusTerm && (
          <BreakdownRow value={COLUMN_TITLES[currentStatus] ?? currentStatus}>
            {statusTerm.short}
          </BreakdownRow>
        )}

        {stage && !isDead && (
          <BreakdownRow value={`Stage: ${stage.name}`}>
            {stage.description}
            {stage.id === 'orig-chamber' &&
              ` If it passes here, it crosses over to the ${otherChamber} and starts committee review again.`}
          </BreakdownRow>
        )}

        {deadlineTerm && (
          <BreakdownRow value={deadlineName as string}>{deadlineTerm.short}</BreakdownRow>
        )}
      </div>

      <div className="border-t pt-3">
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link href={`/learn?bill=${encodeURIComponent(bill.id)}`}>
            See the full path a bill takes
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The "?" affordance and its dialog. Kept in one place so the bill dialog only
 * has to render a single element in its header.
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
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          /* Outline that darkens on hover, no background fill — ghost's
             hover:bg-accent read as a dark teal block. */
          className="h-6 gap-1 border-border bg-transparent px-1.5 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:bg-transparent hover:text-foreground"
          aria-label="How to read this bill"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">How to read this</span>
        </Button>
      </DialogTrigger>
      {/* Nested above the bill dialog. max-h + ScrollArea because the breakdown
          is taller than a phone viewport. */}
      <DialogContent className="max-h-[85vh] max-w-lg gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">How to read this bill</DialogTitle>
          <DialogDescription className="text-xs">
            Every part of {bill.bill_number}, in plain language.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(85vh-5.5rem)]">
          <div className="px-5 py-4">
            <BillBreakdown bill={bill} currentStatus={currentStatus} deadlineName={deadlineName} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
