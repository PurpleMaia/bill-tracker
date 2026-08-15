'use client';

import React from 'react';
import Link from 'next/link';
import { CircleDot, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TrackButton } from './track-button';
import { formatBillStatusName } from '@/lib/core/utils';
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

  return parts.map((part, i) =>
    pattern.test(part) && i % 2 === 1 ? (
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
}

/**
 * One search result. Purpose-built rather than reusing KanbanCard, which is
 * coupled to drag state, assignment dialogs, and tag editing.
 *
 * The year chip is load-bearing, not decorative: Hawaii reuses bill numbers
 * across sessions (SB1251 exists in both 2025 and 2026 as different measures),
 * so without the year two results are indistinguishable.
 */
function BillSearchCardComponent({ bill, query }: BillSearchCardProps) {
  return (
    <Card className="p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/bills/${bill.id}`}
              className="font-mono text-sm font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {highlight(bill.bill_number, query)}
            </Link>
            {bill.year !== null && (
              <Badge variant="outline" className="text-xs">
                {bill.year}
              </Badge>
            )}
            {/* Card state reads through an icon chip, never a left-edge strip. */}
            {bill.dead ? (
              <Badge variant="secondary" className="gap-1 text-xs text-muted-foreground">
                <XCircle className="h-3 w-3" aria-hidden="true" />
                Dead
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-xs">
                <CircleDot className="h-3 w-3" aria-hidden="true" />
                {bill.bill_status ? formatBillStatusName(bill.bill_status) : 'Active'}
              </Badge>
            )}
          </div>

          <h3 className="mt-2 text-sm font-medium leading-snug">
            {highlight(bill.bill_title, query)}
          </h3>

          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {highlight(bill.description, query)}
          </p>
        </div>

        <div className="shrink-0">
          <TrackButton billId={bill.id} billNumber={bill.bill_number} />
        </div>
      </div>
    </Card>
  );
}

// Memoized: with 40 cards per page and several pages accumulated, re-rendering
// every card on each keystroke is the main render cost to avoid.
export const BillSearchCard = React.memo(BillSearchCardComponent);
