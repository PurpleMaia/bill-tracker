'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BillSearchCard } from '@/components/search/bill-search-card';
import { InterestPickerDialog } from './interest-picker-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
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

/** Cards shown before "Show N more", so the full results stay near the top of the page. */
const INITIAL_VISIBLE = 3;

function reasonLine(bill: RecommendedBill): string {
  const weekday = bill.next_hearing_at ? hearingWeekday(bill.next_hearing_at) : null;
  return `matched: ${bill.matched.join(' · ')}${weekday ? ` · hearing ${weekday}` : ''}`;
}

export function RecommendedBillsRow({ onCardClick }: { onCardClick: (billId: string) => void }) {
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data: recs, isLoading, isError } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => data.recommendations.get(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <section aria-label="Recommended for you" className="mb-4 flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in to get recommendations
        </Link>
      </section>
    );
  }

  if (isError) {
    return (
      <p role="status" className="mb-4 text-sm text-muted-foreground">
        Couldn&apos;t load recommendations.
      </p>
    );
  }

  if (isLoading || !recs) {
    return (
      <section aria-label="Recommended for you" className="mb-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </section>
    );
  }

  const picker = <InterestPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />;

  if (!recs.hasInterests || recs.items.length === 0) {
    const message = recs.hasInterests
      ? 'No current bills match your interests yet'
      : 'Pick a few interests to see bills for you';
    return (
      <section aria-label="Recommended for you" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          {recs.hasInterests ? 'Edit interests' : 'Pick interests'}
        </Button>
        {picker}
      </section>
    );
  }

  const hiddenCount = recs.items.length - INITIAL_VISIBLE;

  return (
    <section aria-label="Recommended for you" className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Recommended for you
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
          Edit interests
        </Button>
      </div>
      <ul id="recommended-bills-list" className="space-y-3">
        {(expanded ? recs.items : recs.items.slice(0, INITIAL_VISIBLE)).map((bill) => (
          <li key={bill.id}>
            <BillSearchCard
              bill={bill}
              query=""
              onCardClick={onCardClick}
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
      {picker}
    </section>
  );
}
