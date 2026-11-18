import React from 'react';
import { Info, ExternalLink } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { explainDeadBill } from '@/lib/bills/dead-bill-explanation';
import type { StatusUpdate } from '@/lib/bills/dead-bill';
import { todayHawaii } from '@/lib/core/utils';
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';

interface DeadBillInfoPopoverProps {
  billNumber: string;
  billStatus: string;
  committeeAssignment: string | null;
  latestUpdate: { statustext: string; date: string; chamber: string } | null;
  /** Full status updates for detailed analysis — optional, falls back to latestUpdate only */
  statusUpdates?: StatusUpdate[];
  billUrl: string;
  /** Optional "Remove from board" action rendered in the body, under the revival note. */
  removeSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function DeadBillInfoPopover({
  billNumber,
  billStatus,
  committeeAssignment,
  latestUpdate,
  statusUpdates,
  billUrl,
  removeSlot,
  children,
}: DeadBillInfoPopoverProps) {
  // Full status updates for detailed analysis; fall back to the latest update only.
  const updates: StatusUpdate[] = statusUpdates ??
    (latestUpdate ? [{ statustext: latestUpdate.statustext, date: latestUpdate.date, chamber: latestUpdate.chamber }] : []);

  const { heading, summary, missedDeadline, committeeExplanation, showRevivalNote } =
    explainDeadBill(
      { billNumber, billStatus, committeeAssignment },
      updates,
      SESSION_DEADLINES,
      todayHawaii(),
    );

  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-0 rounded-lg shadow-lg"
        side="right"
        align="start"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-red-100 bg-red-50/50 rounded-t-lg">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100">
            <Info className="h-4 w-4 text-red-700" />
          </div>
          <h3 className="font-semibold text-[15px] text-red-800">
            {heading}
          </h3>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3.5">
          {/* Summary */}
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>

          {/* Missed deadline card — only when the death was actually a missed
              deadline, not a committee action. */}
          {missedDeadline && (
            <div className="rounded-md border bg-muted/40 px-3.5 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                Missed Deadline
              </p>
              <p className="text-sm font-semibold text-teal-700">{missedDeadline.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{missedDeadline.date}</p>
            </div>
          )}

          {/* Committee explanation */}
          <p className="text-sm text-foreground leading-relaxed">{committeeExplanation}</p>

          {/* Revival note — only meaningful for a bill that actually stalled. */}
          {showRevivalNote && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Bills that fail in committee can sometimes be revived in subsequent sessions or attached to other bills as amendments. This is procedural and not always a final stop.
            </p>
          )}

          {/* Remove from board action */}
          {removeSlot && <div className="pt-1">{removeSlot}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 rounded-b-lg">
          <span className="text-xs text-muted-foreground">Source: capitol.hawaii.gov</span>
          {billUrl ? (
            <a
              href={billUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Read full bill <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <a
              href={`https://www.capitol.hawaii.gov/sessions/session2026/bills/${billNumber}.htm`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Read full bill <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
