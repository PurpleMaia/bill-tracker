'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BillSearchCard } from '@/components/search/bill-search-card';
import { TrackButton } from '@/components/search/track-button';
import { InterestPickerDialog } from './interest-picker-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { cn, formatBillHeadline } from '@/lib/core/utils';
import { HAWAII_TIME_ZONE } from '@/lib/testimony/hearing-schedule';
import type { RecommendedBill } from '@/types/legislation';
import { useState } from 'react';

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: HAWAII_TIME_ZONE,
});

/** Short date (e.g. "Tue, Mar 10") of a hearing in Hawaii time, regardless of the viewer's zone. */
function hearingWeekday(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : WEEKDAY_FORMAT.format(d);
}

/** Inline (phone) cards shown before "Show N more", so the full results stay near the top. */
const INITIAL_VISIBLE = 3;

function reasonLine(bill: RecommendedBill): string {
  const weekday = bill.next_hearing_at ? hearingWeekday(bill.next_hearing_at) : null;
  return `matched: ${bill.matched.join(' · ')}${weekday ? ` · hearing ${weekday}` : ''}`;
}

/**
 * Recommended bills share one tinted surface and a sparkle "For you" chip, so they
 * never read as part of the regular results list next to (or below) them.
 */
const SURFACE = 'rounded-lg border border-primary/20 bg-primary/5';

function ForYouChip() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 text-xs font-medium text-primary">
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      For you
    </span>
  );
}

/** Narrow card for the desktop side panel: number, headline, why it matched, Track. */
function CompactRecommendation({
  bill,
  onCardClick,
}: {
  bill: RecommendedBill;
  onCardClick: (billId: string) => void;
}) {
  const open = () => onCardClick(bill.id);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`View details for ${bill.bill_number}: ${bill.bill_title}`}
      className="cursor-pointer rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{bill.bill_number}</span>
        {bill.dead && (
          <span className="inline-flex h-5 items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 text-xs font-medium text-destructive">
            Failed
          </span>
        )}
        <div
          className="ml-auto shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <TrackButton billId={bill.id} billNumber={bill.bill_number} initialTracked={bill.is_tracked} />
        </div>
      </div>
      <p className={cn('mt-1 line-clamp-2 text-sm font-semibold leading-snug', bill.dead && 'opacity-60')}>
        {formatBillHeadline(bill) || bill.bill_title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{reasonLine(bill)}</p>
    </div>
  );
}

interface RecommendedBillsProps {
  /** 'panel' = desktop side column (compact, all items); 'inline' = phone section above results. */
  variant: 'panel' | 'inline';
  onCardClick: (billId: string) => void;
}

export function RecommendedBills({ variant, onCardClick }: RecommendedBillsProps) {
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isPanel = variant === 'panel';

  const { data: recs, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => data.recommendations.get(),
    enabled: !!user,
  });

  const header = (
    <div className="mb-2 flex items-center gap-1">
      <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        Recommended for you
      </h2>
      {user && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Refresh recommendations"
            title="Refresh recommendations"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setPickerOpen(true)}>
            {isPanel ? 'Edit' : 'Edit interests'}
          </Button>
        </>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (!user) {
    body = (
      <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
        Sign in to get recommendations
      </Link>
    );
  } else if (isError) {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        Couldn&apos;t load recommendations.
      </p>
    );
  } else if (isLoading || !recs) {
    body = (
      <div className="space-y-2">
        <Skeleton className={isPanel ? 'h-20 w-full' : 'h-28 w-full'} />
        <Skeleton className={isPanel ? 'h-20 w-full' : 'h-28 w-full'} />
      </div>
    );
  } else if (!recs.hasInterests || recs.items.length === 0) {
    body = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {recs.hasInterests
            ? 'No current bills match your interests yet'
            : 'Pick a few interests to see bills for you'}
        </p>
        {!recs.hasInterests && (
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            Pick interests
          </Button>
        )}
      </div>
    );
  } else if (isPanel) {
    body = (
      <ul className="space-y-2">
        {recs.items.map((bill) => (
          <li key={bill.id}>
            <CompactRecommendation bill={bill} onCardClick={onCardClick} />
          </li>
        ))}
      </ul>
    );
  } else {
    const hiddenCount = recs.items.length - INITIAL_VISIBLE;
    body = (
      <>
        <ul id="recommended-bills-list" className="space-y-3">
          {(expanded ? recs.items : recs.items.slice(0, INITIAL_VISIBLE)).map((bill) => (
            <li key={bill.id}>
              <BillSearchCard
                bill={bill}
                query=""
                onCardClick={onCardClick}
                badge={<ForYouChip />}
                footer={<p className="mt-2 text-xs text-muted-foreground">{reasonLine(bill)}</p>}
              />
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-muted-foreground"
            aria-expanded={expanded}
            aria-controls="recommended-bills-list"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          </Button>
        )}
      </>
    );
  }

  return (
    <section aria-label="Recommended for you" className={cn(SURFACE, 'p-3')}>
      {header}
      {body}
      {user && <InterestPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />}
    </section>
  );
}
