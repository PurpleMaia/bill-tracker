'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { LogIn, RefreshCw, Sparkles } from 'lucide-react';
import { LoginLink } from '@/components/auth/login-link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BillSearchCard } from '@/components/search/bill-search-card';
import { TrackButton } from '@/components/search/track-button';
import { InterestPickerDialog } from './interest-picker-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { cn, formatBillHeadline, formatBillStatusName } from '@/lib/core/utils';
import { getStatusChipClasses } from '@/components/search/status-chip-classes';
import { HAWAII_TIME_ZONE } from '@/lib/testimony/hearing-schedule';
import { nextOffset, pageWindow } from '@/lib/bills/recommendation-paging';
import type { RecommendedBill } from '@/types/legislation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

/** Inline (phone) cards shown before "Show more", so the full results stay near the top. */
const INITIAL_VISIBLE = 3;
/** Inline cards once expanded; Refresh moves on to the next set. */
const EXPANDED_VISIBLE = 10;

/** Cards the panel lays out before measuring how many fully fit its height. */
const PANEL_WINDOW = 12;

/** What it matched, plus the hearing date when one is coming up. */
function matchSummary(bill: RecommendedBill): string {
  const weekday = bill.next_hearing_at ? hearingWeekday(bill.next_hearing_at) : null;
  return `${bill.matched.join(' · ')}${weekday ? ` · hearing ${weekday}` : ''}`;
}

function reasonLine(bill: RecommendedBill): string {
  return `matched: ${matchSummary(bill)}`;
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

/**
 * Narrow card for the desktop side panel, sized to its content. Two columns: the
 * bill info (number and status, headline, short description, why it was
 * recommended) takes 5/6, and a full-height Track button takes the last 1/6.
 */
function CompactRecommendation({
  bill,
  onCardClick,
}: {
  bill: RecommendedBill;
  onCardClick: (billId: string) => void;
}) {
  const open = () => onCardClick(bill.id);
  const summary = matchSummary(bill);
  return (
    <div className="flex overflow-hidden rounded-md border bg-card shadow-sm transition-shadow hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
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
        className="w-5/6 min-w-0 cursor-pointer p-3 focus-visible:outline-none"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground">
            {bill.bill_number}
          </span>
          {bill.dead ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 text-xs font-medium text-destructive">
              Failed
            </span>
          ) : (
            bill.bill_status && (
              <span
                title={formatBillStatusName(bill.bill_status)}
                className={cn(
                  'inline-flex h-5 min-w-0 items-center rounded-full border px-2 text-xs font-medium',
                  getStatusChipClasses(bill.bill_status),
                )}
              >
                <span className="truncate">{formatBillStatusName(bill.bill_status)}</span>
              </span>
            )
          )}
        </div>

        <div className={cn(bill.dead && 'opacity-60')}>
          <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug">
            {formatBillHeadline(bill) || bill.bill_title}
          </p>
          {bill.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{bill.description}</p>
          )}
        </div>

        <p
          className="mt-2 flex min-w-0 items-center gap-1 text-xs text-primary"
          title={`Recommended because it matched: ${summary}`}
        >
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{summary}</span>
        </p>
      </div>

      {/* Track fills the remaining 1/6 at full card height, icon over label. */}
      <div className="w-1/6 shrink-0 border-l">
        <TrackButton
          billId={bill.id}
          billNumber={bill.bill_number}
          initialTracked={bill.is_tracked}
          compact
          className="h-full w-full flex-col gap-1 rounded-none px-0 text-xs sm:h-full sm:w-full sm:px-0"
        />
      </div>
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
  // Start of the visible set within the ranked pool; Refresh advances it.
  const [offset, setOffset] = useState(0);
  // Panel only: how many cards (of PANEL_WINDOW laid out) fully fit its height.
  const [fitCount, setFitCount] = useState(PANEL_WINDOW);
  const fitRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const isPanel = variant === 'panel';

  const { data: recs, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => data.recommendations.get(),
    enabled: !!user,
  });

  const total = recs?.items.length ?? 0;
  // The panel lays out a full window and hides whatever doesn't fully fit, since
  // cards vary in height; phones show a fixed count.
  const windowSize = isPanel ? PANEL_WINDOW : expanded ? EXPANDED_VISIBLE : INITIAL_VISIBLE;
  const visible = recs ? pageWindow(recs.items, offset, windowSize) : [];
  const visibleCount = isPanel ? Math.min(fitCount, visible.length) : windowSize;
  const visibleKey = visible.map((b) => b.id).join(',');

  // Count cards whose bottom edge is inside the panel. Hiding the rest uses
  // `invisible` (layout unchanged), so measuring never feeds back into itself.
  const measureFit = useCallback(() => {
    const container = fitRef.current;
    const list = listRef.current;
    if (!container || !list) return;
    let count = 0;
    for (const child of Array.from(list.children) as HTMLElement[]) {
      if (child.offsetTop + child.offsetHeight > container.clientHeight) break;
      count++;
    }
    setFitCount(Math.max(1, count));
  }, []);

  useLayoutEffect(() => {
    if (isPanel) measureFit();
  }, [isPanel, measureFit, visibleKey]);

  useEffect(() => {
    const el = fitRef.current;
    if (!isPanel || !el) return;
    const observer = new ResizeObserver(measureFit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isPanel, measureFit]);

  // No scrolling: Refresh is how a user sees more. It moves to the next set and
  // refetches, so newly tracked bills drop out and new matches come in.
  const handleRefresh = () => {
    setOffset((o) => nextOffset(o, visibleCount, total));
    void refetch();
  };

  const header = (
    <div className="mb-2 flex items-center gap-1">
      <h2 className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-sm font-semibold">
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
            onClick={handleRefresh}
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
    // Signed-out invitation: medallion, what you get, one clear action. In the
    // panel it centers in the full column; inline it sits compactly.
    body = (
      <div
        className={cn(
          'flex flex-col items-center text-center',
          isPanel ? 'h-full justify-center px-2' : 'py-3',
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-semibold">Get bills picked for you</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Login, choose a few topics you care about, and we&apos;ll surface matching bills.
        </p>
        <Button asChild size="sm" className="mt-4">
          <LoginLink>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Login
          </LoginLink>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          New here?{' '}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
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
      <ul ref={listRef} className="relative space-y-2">
        {visible.map((bill, i) => {
          const hidden = i >= visibleCount;
          return (
            <li key={bill.id} className={cn(hidden && 'invisible')} aria-hidden={hidden || undefined}>
              <CompactRecommendation bill={bill} onCardClick={onCardClick} />
            </li>
          );
        })}
      </ul>
    );
  } else {
    const hiddenCount = Math.min(EXPANDED_VISIBLE, total) - INITIAL_VISIBLE;
    body = (
      <>
        <ul id="recommended-bills-list" className="space-y-3">
          {visible.map((bill) => (
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
    <section
      aria-label="Recommended for you"
      className={cn(SURFACE, 'p-3', isPanel && 'flex h-full flex-col')}
    >
      {header}
      {isPanel ? (
        // Fills the panel's remaining height; cards that don't fit wait for Refresh.
        <div ref={fitRef} className="min-h-0 flex-1 overflow-hidden">
          {body}
        </div>
      ) : (
        body
      )}
      {user && <InterestPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />}
    </section>
  );
}
