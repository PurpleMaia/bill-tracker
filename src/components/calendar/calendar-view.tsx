'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/core/utils';
import { data } from '@/lib/data-client';
import { useBills } from '@/hooks/contexts/bills-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useBillDialogParam } from '@/hooks/use-bill-dialog-param';
import { filterBills } from '@/lib/bills/bill-filters';
import {
  MILESTONE_META,
  MILESTONE_TYPES,
  extractMilestones,
  groupByDay,
  milestonesInMonth,
  type BillMilestone,
  type MilestoneType,
} from '@/lib/calendar/bill-milestones';
import { UrlBillDetailsDialog } from '@/components/kanban/url-bill-details-dialog';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

function MilestoneRow({
  m,
  onOpen,
  compact = false,
}: {
  m: BillMilestone;
  onOpen: (billId: string) => void;
  compact?: boolean;
}) {
  const meta = MILESTONE_META[m.type];
  return (
    <button
      type="button"
      onClick={() => onOpen(m.billId)}
      className={cn(
        'grid w-full grid-cols-[auto_1fr] items-center gap-x-3 rounded-full px-4 py-2 text-left text-sm',
        'hover:brightness-95 focus-visible:outline focus-visible:outline-2',
        !compact && 'sm:grid-cols-[5rem_5.5rem_4rem_1fr]',
        meta.rowClass,
      )}
    >
      <span className="font-semibold">{m.billNumber}</span>
      <span className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', meta.dotClass)} aria-hidden />
        {meta.label}
      </span>
      <span className={cn('hidden tabular-nums text-muted-foreground', !compact && 'sm:block')}>
        {format(new Date(`${m.date}T00:00:00`), 'M/d')}
      </span>
      <span className={cn('col-span-2 truncate', !compact && 'sm:col-span-1')}>{m.billTitle}</span>
    </button>
  );
}

/**
 * Calendar view of "Your Bills": marks the dated milestones (introduced,
 * crossover, conference, governor, failed) of the bills in context, respecting
 * the board's search/tag/year filters.
 */
export function CalendarView() {
  const { bills, loadingBills } = useBills();
  const { searchQuery, selectedTagIds, selectedYears } = useKanbanBoard();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<MilestoneType>>(new Set());
  const { open: openBill } = useBillDialogParam();

  const visibleBills = useMemo(
    () => filterBills(bills, { searchQuery, selectedTagIds, selectedYears, deadFilter: 'all' }),
    [bills, searchQuery, selectedTagIds, selectedYears],
  );

  const billIds = useMemo(() => visibleBills.map((b) => b.id).sort(), [visibleBills]);

  const { data: updates, isLoading, isError, refetch } = useQuery({
    queryKey: ['calendar-updates', billIds],
    queryFn: () => data.calendar.getUpdates(billIds),
    enabled: billIds.length > 0,
  });

  const milestones = useMemo(() => {
    if (!updates) return [];
    return visibleBills
      .flatMap((b) => extractMilestones(b, updates[b.id] ?? []))
      .filter((m) => !hidden.has(m.type));
  }, [visibleBills, updates, hidden]);

  const byDay = useMemo(() => groupByDay(milestones), [milestones]);
  const monthKey = format(month, 'yyyy-MM');
  const monthMilestones = useMemo(() => milestonesInMonth(milestones, monthKey), [milestones, monthKey]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  const selectedMilestones = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  const toggleType = (t: MilestoneType) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  if (loadingBills || (isLoading && billIds.length > 0)) {
    return (
      <div className="p-4 md:p-6">
        <Skeleton className="mx-auto h-96 w-full max-w-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,36rem)_18rem]">
        {/* Legend (doubles as a per-type visibility filter) */}
        <ul className="flex flex-wrap gap-x-4 gap-y-2 md:flex-col md:gap-3" aria-label="Milestone legend">
          {MILESTONE_TYPES.map((t) => {
            const meta = MILESTONE_META[t];
            const off = hidden.has(t);
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => toggleType(t)}
                  aria-pressed={!off}
                  className={cn('flex items-center gap-2 text-sm', off && 'opacity-40 line-through')}
                >
                  <span className={cn('h-3.5 w-3.5 rounded-full', meta.dotClass)} aria-hidden />
                  {meta.label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="min-w-0 space-y-6">
          {isError && (
            <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              Couldn&apos;t load milestone dates.
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {/* Month grid */}
          <div className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between bg-primary px-3 py-2 text-primary-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-white/20 hover:text-primary-foreground"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="font-semibold uppercase tracking-wide">{format(month, 'MMMM yyyy')}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-white/20 hover:text-primary-foreground"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = dayKey(d);
                const dayMilestones = byDay.get(key) ?? [];
                const inMonth = isSameMonth(d, month);
                const types = MILESTONE_TYPES.filter((t) => dayMilestones.some((m) => m.type === t));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key === selectedDay ? null : key)}
                    aria-label={`${format(d, 'MMMM d')}${dayMilestones.length ? `, ${dayMilestones.length} milestone${dayMilestones.length === 1 ? '' : 's'}` : ''}`}
                    aria-pressed={key === selectedDay}
                    className={cn(
                      'flex h-14 flex-col items-center justify-start gap-1 border-b border-r pt-1.5 text-sm hover:bg-muted/60',
                      !inMonth && 'text-muted-foreground/40',
                      key === selectedDay && 'bg-accent/15 ring-2 ring-inset ring-primary',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full',
                        isToday(d) && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {format(d, 'd')}
                    </span>
                    <span className="flex gap-0.5" aria-hidden>
                      {types.map((t) => (
                        <span key={t} className={cn('h-1.5 w-1.5 rounded-full', MILESTONE_META[t].dotClass)} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day detail — below the grid on small screens, right rail on lg */}
          <div className="lg:hidden">
            <DayPanel day={selectedDay} milestones={selectedMilestones} onOpen={openBill} />
          </div>

          {/* Month list */}
          <section aria-label={`Milestones in ${format(month, 'MMMM yyyy')}`} className="space-y-2">
            {monthMilestones.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {bills.length === 0 ? 'No tracked bills yet.' : 'No milestones this month.'}
              </p>
            ) : (
              monthMilestones.map((m) => <MilestoneRow key={m.id} m={m} onOpen={openBill} />)
            )}
          </section>
        </div>

        <div className="hidden lg:block">
          <DayPanel day={selectedDay} milestones={selectedMilestones} onOpen={openBill} />
        </div>
      </div>

      <UrlBillDetailsDialog
      />
    </div>
  );
}

function DayPanel({
  day,
  milestones,
  onOpen,
}: {
  day: string | null;
  milestones: BillMilestone[];
  onOpen: (billId: string) => void;
}) {
  return (
    <aside className="overflow-hidden rounded-md border-2 border-primary">
      <h3 className="bg-primary px-3 py-2 text-center font-semibold text-primary-foreground">
        {day ? format(new Date(`${day}T00:00:00`), 'MM / dd / yyyy') : 'Select a day'}
      </h3>
      <div className="min-h-24 space-y-2 p-2">
        {!day ? (
          <p className="p-2 text-sm text-muted-foreground">Pick a day to see its milestones.</p>
        ) : milestones.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No milestones on this day.</p>
        ) : (
          milestones.map((m) => <MilestoneRow key={m.id} m={m} onOpen={onOpen} compact />)
        )}
      </div>
    </aside>
  );
}
