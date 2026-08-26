import React from 'react';
import { Info, ExternalLink } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  isBillDead,
  parseCommittees,
} from '@/lib/bills/dead-bill';
import type { SessionDeadlines, StatusUpdate, DeadBillResult } from '@/lib/bills/dead-bill';
import { todayHawaii } from '@/lib/core/utils';
import type { BillStatus as DBBillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';

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
  const today = todayHawaii();
  const committees = committeeAssignment ? parseCommittees(committeeAssignment) : [];
  const committeeList = committees.join(', ');

  // Run the full dead-bill algorithm to get the reason
  const updates: StatusUpdate[] = statusUpdates ??
    (latestUpdate ? [{ statustext: latestUpdate.statustext, date: latestUpdate.date, chamber: latestUpdate.chamber }] : []);

  const result: DeadBillResult = committeeAssignment
    ? isBillDead(
        {
          bill_number: billNumber,
          bill_status: billStatus as DBBillStatus,
          committee_assignment: committeeAssignment,
        },
        updates,
        deadlinesJson as SessionDeadlines,
        today,
      )
    : { dead: true, reason: 'No committee assignment' };

  // Use the failedDeadline from the algorithm result — this is the FIRST
  // deadline the bill failed to meet, not the most recent one relative to today.
  const missedDeadline = result.failedDeadline ?? null;
  const deadlineName = missedDeadline?.name ?? null;
  const deadlineDate = missedDeadline?.date
    ? new Date(missedDeadline.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // isBillDead returns five reason shapes. Branch on which one we actually got
  // rather than string-matching a single word: an earlier version only looked
  // for "deferred", so "Recommendation not adopted by WAM" (a committee action,
  // with no failedDeadline) fell through to the deadline copy and rendered
  // "its Unknown deadline".
  const lowerReason = result.reason.toLowerCase();
  const isNotAdopted = lowerReason.includes('recommendation was not adopted')
    || lowerReason.includes('recommendation not adopted');
  const isDeferral = lowerReason.includes('deferred');
  const isCommitteeAction = isNotAdopted || isDeferral;

  // Some rows are flagged dead while carrying an end-of-process status (a bill
  // signed into law, transmitted to the Governor, or vetoed). Claiming those
  // "failed in committee" would be wrong, so describe where they actually
  // ended instead.
  const CLOSED_STATUS_SUMMARY: Record<string, string> = {
    governorSigns: 'This bill completed the legislative process and was signed into law.',
    lawWithoutSignature: 'This bill became law without the Governor’s signature.',
    vetoList: 'This bill passed the legislature but was vetoed by the Governor.',
    transmittedGovernor: 'This bill passed the legislature and was transmitted to the Governor.',
    conferencePassed: 'This bill passed conference committee.',
  };
  const closedSummary = CLOSED_STATUS_SUMMARY[billStatus];

  const summary = closedSummary
    ? closedSummary
    : isNotAdopted
      ? 'This bill failed because a committee did not adopt the recommendation to advance it.'
      : isDeferral
        ? 'This bill failed because it was permanently deferred by a committee.'
        : deadlineName
          ? `This bill failed because it was not scheduled for a committee hearing before its ${deadlineName} deadline.`
          : 'This bill is no longer advancing this session.';

  const committeeLabel = committeeList || 'committee';

  const committeeExplanation = closedSummary
    ? `It is no longer moving through committee because the process for it has concluded. Its referrals were ${committeeLabel}.`
    : isNotAdopted
      ? `${committeeLabel} heard this bill but did not adopt the recommendation needed to move it forward, ending its progress this session.`
      : isDeferral
        ? 'The committee permanently deferred this bill, ending its progress this session.'
        : deadlineName
          ? committees.length > 1
            ? `Bills referred to multiple committees must be scheduled by the ${deadlineName} deadline to remain active in this session. This bill was referred to ${committeeList} but neither chair scheduled it for a hearing in time.`
            : `This bill was referred to ${committeeLabel} but was not scheduled for a hearing before the ${deadlineName} deadline.`
          : committeeAssignment
            ? `This bill was referred to ${committeeLabel} but did not complete the steps needed to stay active this session.`
            : 'This bill has no committee referral on record, so it cannot advance this session.';

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
            {closedSummary ? 'Where did this bill end up?' : 'Why did this bill fail?'}
          </h3>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3.5">
          {/* Summary */}
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>

          {/* Missed deadline card — only when the death was actually a missed
              deadline, not a committee action. */}
          {!isCommitteeAction && missedDeadline && (
            <div className="rounded-md border bg-muted/40 px-3.5 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                Missed Deadline
              </p>
              <p className="text-sm font-semibold text-teal-700">{deadlineName}</p>
              {deadlineDate && (
                <p className="text-xs text-muted-foreground mt-0.5">{deadlineDate}</p>
              )}
            </div>
          )}

          {/* Committee explanation */}
          <p className="text-sm text-foreground leading-relaxed">{committeeExplanation}</p>

          {/* Revival note — only meaningful for a bill that actually stalled. */}
          {!closedSummary && (
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
