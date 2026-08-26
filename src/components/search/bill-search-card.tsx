'use client';

import React from 'react';
import { History, Info } from 'lucide-react';
import { DeadBillInfoPopover } from '@/components/kanban/dead-bill-info-popover';
import { Badge } from '@/components/ui/badge';
import { TrackButton } from './track-button';
import {
  cn,
  formatBillHeadline,
  formatBillStatusName,
  formatRelativeDate,
} from '@/lib/core/utils';
import { parseCommittees } from '@/lib/bills/dead-bill';
import { getStatusChipClasses } from './status-chip-classes';
import type { BillSearchResult } from '@/types/legislation';

/**
 * Wraps query matches in <mark> so users can see WHY a bill matched. Splits on
 * whitespace and escapes each token, since the query is user input.
 */
function highlight(text: string, query: string): React.ReactNode {
  const tokens = query.trim().split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return text;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);

  // `i % 2 === 1` alone identifies the captured groups from String.split.
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-900/60">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

interface BillSearchCardProps {
  bill: BillSearchResult;
  query: string;
  onCardClick: (billId: string) => void;
}

/**
 * One search result, styled to match the kanban board's card so a bill looks the
 * same wherever a user meets it: headline first, bill number as a quiet
 * reference label, description, then the latest status update.
 *
 * The dead-bill treatment is copied deliberately from KanbanCard — a red wash
 * applied as a gradient layer over the opaque card background (a translucent
 * bg-destructive/5 would replace bg-card and blend with whatever sits behind),
 * plus a desaturated content layer.
 *
 * The year chip is load-bearing, not decorative: Hawaii reuses bill numbers
 * across sessions (SB1251 exists in both 2025 and 2026 as different measures),
 * so without the year two results are indistinguishable.
 */
function BillSearchCardComponent({ bill, query, onCardClick }: BillSearchCardProps) {
  const headline = formatBillHeadline(bill);
  const committeeReferrals = bill.committee_assignment
    ? parseCommittees(bill.committee_assignment)
    : [];
  const committeeCodes = committeeReferrals.length > 0 ? committeeReferrals.join(' · ') : null;

  const handleClick = () => onCardClick(bill.id);

  return (
    <div
      className={cn(
        'group relative w-full rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md',
        bill.dead &&
          '[background-image:linear-gradient(hsl(var(--destructive)/0.05),hsl(var(--destructive)/0.05))] border-destructive/20',
        'outline-none ring-ring ring-offset-2 focus-visible:ring-2 has-[:focus-visible]:ring-2',
      )}
    >
      <div className="flex flex-col">
        <div
          className="flex w-full cursor-pointer flex-col p-3"
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${bill.bill_number}: ${bill.bill_title}`}
        >
          {/* Reference row: bill number + year + status, with Track pinned right. */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              {highlight(bill.bill_number, query)}
            </span>
            {bill.year !== null && (
              <Badge
                variant="secondary"
                className="h-4 rounded-md px-1 text-[10px] text-muted-foreground"
              >
                {bill.year}
              </Badge>
            )}
            {bill.dead ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 text-[10px] font-medium text-destructive">
                Failed
              </span>
            ) : (
              bill.bill_status && (
                /* Phase colors mirror getColumnPhaseBg on the board, so a bill's
                   status reads the same color here as the column it would sit in. */
                <span
                  className={cn(
                    'inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-medium',
                    getStatusChipClasses(bill.bill_status),
                  )}
                >
                  {formatBillStatusName(bill.bill_status)}
                </span>
              )
            )}
            {/* Right-hand action column. stopPropagation so neither control
                opens the card dialog. Kept OUTSIDE the dimming wrapper below —
                opacity/filter on a parent makes a composited group a child
                cannot escape, which would wash out the red button. */}
            <div
              className="ml-auto shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <TrackButton
                billId={bill.id}
                billNumber={bill.bill_number}
                initialTracked={bill.is_tracked}
              />
            </div>
          </div>

          {/*
            The dead-bill dimming wraps only the text content, NOT the badge row
            above. opacity/filter on a parent creates a composited group that a
            child cannot opt out of, so a red info button inside this div would
            render washed out no matter what classes it carried.
          */}
          <div className={cn(bill.dead && 'opacity-60 grayscale-[35%]')}>
          {/* Headline — the card's primary text, matching the board. */}
          <h3 className="mt-1.5 text-sm font-semibold leading-snug">
            {headline ? highlight(headline, query) : highlight(bill.bill_title, query)}
          </h3>

          {/* The full RELATING TO line, kept because it's a searchable field and
              users scanning results expect to see the term they matched on. */}
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
            {highlight(bill.bill_title, query)}
          </p>

          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {highlight(bill.description, query)}
          </p>

          {bill.latest_update && (
            <div className="mt-2 flex items-center gap-1 rounded-md bg-border/30 px-2 py-1.5">
              <History className="h-3 w-3 shrink-0 text-foreground/70" aria-hidden="true" />
              <span className="shrink-0 text-xs font-medium text-foreground/70">
                {formatRelativeDate(bill.latest_update.date)}
              </span>
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                &mdash; {bill.latest_update.statustext}
              </p>
            </div>
          )}

          </div>

          {/* Footer row: committee chips on the left, the failure-reason button
              on the right. Sits OUTSIDE the dimming wrapper above, because
              opacity/filter on a parent creates a composited group a child
              cannot escape — nested, the red button would render washed out. */}
          {(committeeCodes || bill.dead) && (
            <div className="mt-2 flex items-center gap-1.5">
              {committeeCodes && (
                <span
                  className={cn(
                    'inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-secondary/60 px-2 text-[10px] font-medium text-secondary-foreground',
                    bill.dead && 'opacity-60 grayscale-[35%]',
                  )}
                >
                  {committeeCodes}
                </span>
              )}

              {bill.dead && (
                /* Same 28px trigger the kanban card uses (w-7 h-7 / icon h-5 w-5),
                   so the affordance is identical on both surfaces. */
                <DeadBillInfoPopover
                  billNumber={bill.bill_number}
                  billStatus={bill.bill_status ?? ''}
                  committeeAssignment={bill.committee_assignment}
                  latestUpdate={bill.latest_update}
                  billUrl={bill.bill_url}
                >
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Why did ${bill.bill_number} fail?`}
                    title="Why did this bill fail?"
                    className="ml-auto inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
                  >
                    <Info className="h-5 w-5" aria-hidden="true" />
                  </button>
                </DeadBillInfoPopover>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// Memoized: with 40 cards per page and several pages accumulated, re-rendering
// every card on each keystroke is the main render cost to avoid.
export const BillSearchCard = React.memo(BillSearchCardComponent);
