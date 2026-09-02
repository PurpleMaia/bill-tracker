'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MoreVertical,
  PenLine,
  Trash2,
  XCircle,
} from 'lucide-react';
import { cn, formatBillStatusName } from '@/lib/core/utils';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTestimonies } from '@/hooks/use-testimonies';
import { toast } from '@/hooks/use-toast';
import { tiptapPlainText } from '@/lib/testimony/tiptap-text';
import { getTestimonyEligibility } from '@/lib/testimony/testimony-eligibility';
import { getTestimonyDeadline } from '@/lib/testimony/hearing-schedule';
import { getNextDeadline } from '@/lib/bills/dead-bill';
import type { DeadlineEntry } from '@/lib/bills/dead-bill';
import type { BillStatus } from '@/db/types';
import type { TestimonyListItem, TestimonyPosition, TestimonyProspect } from '@/types/testimony';
// Switchable session calendar (respects NEXT_PUBLIC_DEMO_DEADLINES), matching the
// card / dialog / spreadsheet. Previously this view hardcoded the real 2026
// calendar, so it ignored demo mode and closed testimony once the real session ended.
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TestimoniesSidebar } from './testimonies-sidebar';

export type TestimoniesFilter = 'all' | 'drafts' | 'submitted';

interface DecoratedTestimony {
  item: TestimonyListItem;
  isDraft: boolean;
  /** Hearing datetime parsed from the latest status update, if one is scheduled. */
  hearingAt: Date | null;
  /** 'due now' / 'due in 36h' / 'due in 3d' — null when no hearing countdown applies. */
  countdown: string | null;
  /** Deadline (hearing minus 24h) is now or within 48 hours. */
  urgent: boolean;
  /** Fallback context when no hearing is scheduled: the bill's next session deadline. */
  nextDeadline: DeadlineEntry | null;
  /** The draft can no longer be submitted (hearing passed, bill enacted/dead, decking passed). */
  closed: boolean;
  /** Why it's closed, for the card ('' when open; null when the Dead badge already explains). */
  closedNote: string | null;
}

function decorate(item: TestimonyListItem, now: Date): DecoratedTestimony {
  const isDraft = item.submittedAt === null;

  let hearingAt: Date | null = null;
  let countdown: string | null = null;
  let urgent = false;
  let nextDeadline: DeadlineEntry | null = null;
  let closed = false;
  let closedNote: string | null = null;

  if (isDraft) {
    const eligibility = getTestimonyEligibility({
      dead: item.dead,
      billStatus: item.billStatus as BillStatus,
      committeeAssignment: item.committeeAssignment,
      deadlines: SESSION_DEADLINES,
      today: now.toISOString().split('T')[0],
      latestStatusText: item.latestStatusText,
    });

    if (!eligibility.allowed) {
      closed = true;
      // The Dead badge already explains dead bills — no need to say it twice.
      closedNote = item.dead ? null : eligibility.reason;
    } else {
      const deadline = getTestimonyDeadline({
        billStatus: item.billStatus as BillStatus,
        latestStatusText: item.latestStatusText,
        now,
      });
      hearingAt = deadline.hearingAt;
      countdown = deadline.countdown;
      urgent = deadline.urgent;
      if (deadline.hearingPassed && deadline.hearingAt) {
        closed = true;
        closedNote = `Hearing held ${formatHearing(deadline.hearingAt)} — submission window closed`;
      }
    }

    if (!closed && !countdown && item.committeeAssignment) {
      nextDeadline = getNextDeadline(
        item.billNumber,
        item.billStatus as BillStatus,
        item.committeeAssignment,
        SESSION_DEADLINES,
        now.toISOString().split('T')[0],
      );
    }
  }

  return { item, isDraft, hearingAt, countdown, urgent, nextDeadline, closed, closedNote };
}

interface DecoratedProspect {
  item: TestimonyProspect;
  hearingAt: Date | null;
  countdown: string | null;
  urgent: boolean;
}

/** Null when the hearing has already happened — nothing actionable to show. */
function decorateProspect(item: TestimonyProspect, now: Date): DecoratedProspect | null {
  const deadline = getTestimonyDeadline({
    billStatus: item.billStatus as BillStatus,
    latestStatusText: item.latestStatusText,
    now,
  });
  if (deadline.hearingPassed) return null;
  return {
    item,
    hearingAt: deadline.hearingAt,
    countdown: deadline.countdown,
    urgent: deadline.urgent,
  };
}

function compareProspects(a: DecoratedProspect, b: DecoratedProspect): number {
  return (a.hearingAt?.getTime() ?? Infinity) - (b.hearingAt?.getTime() ?? Infinity);
}

/**
 * Actionable drafts first, closest testimony deadline leading; no-hearing
 * drafts by last edit; closed drafts sink to the bottom.
 */
function compareDrafts(a: DecoratedTestimony, b: DecoratedTestimony): number {
  if (a.closed !== b.closed) return a.closed ? 1 : -1;
  const aDeadline = a.countdown && a.hearingAt ? a.hearingAt.getTime() : Infinity;
  const bDeadline = b.countdown && b.hearingAt ? b.hearingAt.getTime() : Infinity;
  if (aDeadline !== bDeadline) return aDeadline - bDeadline;
  return (b.item.updatedAt ?? '').localeCompare(a.item.updatedAt ?? '');
}

export function TestimoniesView({ filter }: { filter: TestimoniesFilter }) {
  const { user, loading: authLoading } = useAuth();
  const { items, prospects, error, refetch, removeItem } = useTestimonies();

  // Coarse clock so countdowns/urgency/closed states stay live while the
  // page sits open — deadline info frozen at mount time would silently lie.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { needed, drafts, submitted } = useMemo(() => {
    const decorated = (items ?? []).map((item) => decorate(item, now));
    return {
      needed: (prospects ?? [])
        .map((prospect) => decorateProspect(prospect, now))
        .filter((p): p is DecoratedProspect => p !== null)
        .sort(compareProspects),
      drafts: decorated.filter((d) => d.isDraft).sort(compareDrafts),
      submitted: decorated.filter((d) => !d.isDraft),
    };
  }, [items, prospects, now]);

  const dueSoonCount = drafts.filter((d) => d.urgent).length;
  const hasAnything = (items?.length ?? 0) > 0 || needed.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
      {/* Page heading + summary */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Your Testimonies</h2>
        {items !== null && hasAnything && (
          <p className="mt-1 text-sm text-muted-foreground">
            {needed.length > 0 && (
              <span className="font-medium text-amber-600">
                {needed.length} bill{needed.length === 1 ? ' needs' : 's need'} testimony ·{' '}
              </span>
            )}
            {drafts.length} draft{drafts.length === 1 ? '' : 's'}
            {dueSoonCount > 0 && (
              <span className="font-medium text-red-600"> · {dueSoonCount} due soon</span>
            )}
            <span> · {submitted.length} submitted</span>
          </p>
        )}
      </div>

      {/* Testimony list grounded left; guide rail fills the right */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {authLoading || (user && items === null && !error) ? (
            <ListSkeleton />
          ) : !user ? (
            <EmptyState
              icon={FileText}
              title="Login to see your testimonies"
              description="Your testimony drafts and submissions are tied to your account."
            />
          ) : error ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load your testimonies"
              description={error}
              action={{ label: 'Try again', onClick: refetch }}
            />
          ) : (
            <TooltipProvider delayDuration={300}>
              <FilteredList
                filter={filter}
                needed={needed}
                drafts={drafts}
                submitted={submitted}
                onDeleted={removeItem}
              />
            </TooltipProvider>
          )}
        </div>

        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-80" aria-label="Testimony help">
          <TestimoniesSidebar />
        </aside>
      </div>
    </div>
  );
}

function FilteredList({
  filter,
  needed,
  drafts,
  submitted,
  onDeleted,
}: {
  filter: TestimoniesFilter;
  needed: DecoratedProspect[];
  drafts: DecoratedTestimony[];
  submitted: DecoratedTestimony[];
  onDeleted: (billId: string) => void;
}) {
  const neededSection = needed.length > 0 && (
    <section aria-label="Needs testimony">
      <SectionHeading icon={CalendarClock} label="Needs testimony" count={needed.length} />
      <ul className="space-y-3">
        {needed.map((prospect) => (
          <li key={prospect.item.billId}>
            <ProspectCard prospect={prospect} />
          </li>
        ))}
      </ul>
    </section>
  );

  if (filter === 'drafts') {
    if (needed.length === 0 && drafts.length === 0) {
      return (
        <EmptyState
          icon={PenLine}
          title="No drafts in progress"
          description="Start a testimony from any bill on your board — drafts save automatically and show up here."
          cta={{ href: '/', label: 'Go to Your Bills' }}
        />
      );
    }
    return (
      <div className="space-y-8">
        {neededSection}
        {drafts.length > 0 && (
          <section aria-label="Drafts">
            <SectionHeading icon={PenLine} label="Drafts" count={drafts.length} />
            <TestimonyCardList entries={drafts} onDeleted={onDeleted} />
          </section>
        )}
      </div>
    );
  }

  if (filter === 'submitted') {
    return submitted.length === 0 ? (
      <EmptyState
        icon={Check}
        title="Nothing submitted yet"
        description="When you mark a testimony as submitted on the capitol site, it will appear here."
        cta={{ href: '/testimonies/drafts', label: 'View your drafts' }}
      />
    ) : (
      <TestimonyCardList entries={submitted} onDeleted={onDeleted} />
    );
  }

  if (needed.length === 0 && drafts.length === 0 && submitted.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No testimonies yet"
        description="Open a bill on your board and choose Write Testimony — your drafts and submissions will be tracked here."
        cta={{ href: '/', label: 'Go to Your Bills' }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {neededSection}
      {drafts.length > 0 && (
        <section aria-label="Drafts">
          <SectionHeading icon={PenLine} label="Drafts" count={drafts.length} />
          <TestimonyCardList entries={drafts} onDeleted={onDeleted} />
        </section>
      )}
      {submitted.length > 0 && (
        <section aria-label="Submitted">
          <SectionHeading icon={Check} label="Submitted" count={submitted.length} />
          <TestimonyCardList entries={submitted} onDeleted={onDeleted} />
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof PenLine;
  label: string;
  count: number;
}) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
        {count}
      </span>
    </h3>
  );
}

function TestimonyCardList({
  entries,
  onDeleted,
}: {
  entries: DecoratedTestimony[];
  onDeleted: (billId: string) => void;
}) {
  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.item.billId}>
          <TestimonyCard entry={entry} onDeleted={onDeleted} />
        </li>
      ))}
    </ul>
  );
}

/** True for cmd/ctrl/shift/middle clicks — the browser opens a new tab, we stay put. */
function isModifiedClick(event: React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** The card's right-aligned action label, swapping to a spinner once navigation starts. */
function CardActionLabel({ label, navigating }: { label: string; navigating: boolean }) {
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
      {navigating ? (
        <>
          Opening…
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </span>
  );
}

/** Countdown pill + hearing datetime, shared by testimony and prospect cards. */
function HearingCountdown({
  hearingAt,
  countdown,
  urgent,
}: {
  hearingAt: Date;
  countdown: string;
  urgent: boolean;
}) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex cursor-default items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              urgent
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-amber-200 bg-amber-50 text-amber-700',
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {capitalize(countdown)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">
          Testimony must be submitted at least 24 hours before the hearing.
        </TooltipContent>
      </Tooltip>
      <span className="text-[11px] text-muted-foreground">Hearing {formatHearing(hearingAt)}</span>
    </>
  );
}

/**
 * A tracked bill with a hearing coming up and no testimony started —
 * dashed border signals "not yet created"; the card starts a new draft.
 */
function ProspectCard({ prospect }: { prospect: DecoratedProspect }) {
  const { item, hearingAt, countdown, urgent } = prospect;
  const billLabel = item.nickname || item.billTitle || '';
  const [navigating, setNavigating] = useState(false);

  return (
    <div
      className={cn(
        'group relative flex rounded-lg border border-dashed bg-card text-card-foreground transition-all duration-200',
        urgent ? 'border-red-300' : 'border-amber-300',
        'hover:shadow-md hover:-translate-y-px focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        navigating && 'opacity-70',
      )}
    >
      <div className="flex items-start p-4 pr-0">
        <span
          className={cn(
            'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            urgent ? 'bg-red-100 text-red-700 ring-2 ring-red-200' : 'bg-amber-100 text-amber-700',
          )}
        >
          {urgent && (
            <span
              className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40 motion-safe:animate-ping"
              aria-hidden="true"
            />
          )}
          <CalendarClock className="relative h-4 w-4" />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/bills/${item.billId}/testimony?from=testimonies`}
              onClick={(e) => {
                if (!isModifiedClick(e)) setNavigating(true);
              }}
              className="text-sm font-semibold tracking-tight after:absolute after:inset-0 focus-visible:outline-none"
            >
              {item.billNumber}
              <span className="sr-only"> — start testimony</span>
            </Link>
            {item.year && (
              <Badge variant="secondary" className="h-4 rounded-md px-1 text-[10px] text-muted-foreground">
                {item.year}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatBillStatusName(item.billStatus)}
            </span>
          </div>
          {billLabel && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{billLabel}</p>
          )}
        </div>

        {item.description && (
          <p className="line-clamp-1 text-sm leading-relaxed text-foreground/80">
            {item.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {countdown && hearingAt ? (
            <HearingCountdown hearingAt={hearingAt} countdown={countdown} urgent={urgent} />
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Hearing scheduled — time not posted yet
            </span>
          )}

          <CardActionLabel label="Start testimony" navigating={navigating} />
        </div>
      </div>
    </div>
  );
}

function TestimonyCard({
  entry,
  onDeleted,
}: {
  entry: DecoratedTestimony;
  onDeleted: (billId: string) => void;
}) {
  const { item, isDraft, hearingAt, countdown, urgent, nextDeadline, closed, closedNote } = entry;
  const billLabel = item.nickname || item.billTitle || '';
  const [navigating, setNavigating] = useState(false);

  return (
    <div
      className={cn(
        'group relative flex rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200',
        'hover:shadow-md hover:-translate-y-px focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        navigating && 'opacity-70',
      )}
    >
      {/* State medallion */}
      <div className="flex items-start p-4 pr-0">
        <StateMedallion isDraft={isDraft} urgent={urgent} dead={item.dead} closed={closed} />
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-2 p-4', item.dead && 'opacity-60')}>
        {/* Bill identity + position */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Stretched link — the whole card navigates to the testimony writer */}
              <Link
                href={`/bills/${item.billId}/testimony?from=testimonies`}
                onClick={(e) => {
                  if (!isModifiedClick(e)) setNavigating(true);
                }}
                className="text-sm font-semibold tracking-tight after:absolute after:inset-0 focus-visible:outline-none"
              >
                {item.billNumber}
                <span className="sr-only">
                  {!isDraft
                    ? ' — view submitted testimony'
                    : closed
                      ? ' — view draft (testimony closed)'
                      : ' — continue testimony draft'}
                </span>
              </Link>
              {item.year && (
                <Badge variant="secondary" className="h-4 rounded-md px-1 text-[10px] text-muted-foreground">
                  {item.year}
                </Badge>
              )}
              {item.dead && (
                <Badge variant="destructive" className="h-4 rounded-full px-1.5 text-[10px] text-white">
                  Failed
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatBillStatusName(item.billStatus)}
              </span>
            </div>
            {billLabel && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{billLabel}</p>
            )}
          </div>
          <PositionBadge position={item.position} />
        </div>

        {/* Testimony excerpt */}
        {item.excerpt ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">{item.excerpt}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No testimony text yet.</p>
        )}

        {/* State + deadline + action */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {!isDraft && <SubmittedChip submittedAt={item.submittedAt} />}

          {closed && closedNote && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <XCircle className="h-3 w-3" />
              {closedNote}
            </span>
          )}

          {countdown && hearingAt && (
            <HearingCountdown hearingAt={hearingAt} countdown={countdown} urgent={urgent} />
          )}

          {!countdown && nextDeadline && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1 text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2">
                  <CalendarClock className="h-3 w-3" />
                  Next deadline: {nextDeadline.name} · {formatDate(nextDeadline.date + 'T00:00:00')}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                &ldquo;{nextDeadline.name}&rdquo; is the next procedural deadline this bill must
                clear to stay alive this session. No hearing is scheduled yet — testimony opens
                once one is.
              </TooltipContent>
            </Tooltip>
          )}

          {isDraft && item.updatedAt && (
            <span className="text-[11px] text-muted-foreground">
              Edited {formatDate(item.updatedAt)}
            </span>
          )}

          <CardActionLabel
            label={
              !isDraft
                ? 'View testimony'
                : closed
                  ? 'View draft'
                  : urgent
                    ? 'Finish & submit'
                    : 'Continue draft'
            }
            navigating={navigating}
          />
        </div>
      </div>

      {/* Card actions menu — layered above the stretched link */}
      <div className="relative z-10 flex items-start p-2">
        <TestimonyCardMenu item={item} isDraft={isDraft} onDeleted={onDeleted} />
      </div>
    </div>
  );
}

function TestimonyCardMenu({
  item,
  isDraft,
  onDeleted,
}: {
  item: TestimonyListItem;
  isDraft: boolean;
  onDeleted: (billId: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCopy = async () => {
    try {
      const draft = await data.testimony.getDraft(item.billId);
      const text = tiptapPlainText(draft?.contentJson);
      if (!text) {
        toast({ title: 'Nothing to copy', description: 'This testimony has no text yet.' });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `Testimony for ${item.billNumber} copied to clipboard.` });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy the testimony text.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await data.testimony.remove(item.billId);
      onDeleted(item.billId);
      toast({
        title: isDraft ? 'Draft deleted' : 'Testimony removed',
        description: isDraft
          ? `Your ${item.billNumber} testimony draft was deleted.`
          : `Your ${item.billNumber} testimony record was removed.`,
      });
      setConfirmOpen(false);
    } catch {
      toast({ title: 'Delete failed', description: 'Could not delete the testimony. Please try again.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`More actions for ${item.billNumber}`}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={item.billUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on Capitol site
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy testimony text
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDraft ? 'Delete draft' : 'Remove testimony record'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDraft ? 'Delete this draft?' : 'Remove this testimony record?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDraft
                ? `Your testimony draft for ${item.billNumber} will be permanently deleted. This cannot be undone.`
                : `Your ${item.billNumber} testimony record will be removed from Food+. This does not withdraw testimony already submitted on the Capitol website, and it cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : isDraft ? 'Delete draft' : 'Remove record'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Circular state indicator at the left of each card: green check for
 * submitted, blue pen for drafts — ringed in red with a pulse when the
 * testimony deadline is imminent — and muted for dead bills or drafts
 * whose submission window has closed.
 */
function StateMedallion({
  isDraft,
  urgent,
  dead,
  closed,
}: {
  isDraft: boolean;
  urgent: boolean;
  dead: boolean;
  closed: boolean;
}) {
  if (dead || (isDraft && closed)) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {dead ? <XCircle className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
      </span>
    );
  }
  if (!isDraft) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
        <Check className="h-4 w-4" />
      </span>
    );
  }
  if (urgent) {
    return (
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 ring-2 ring-red-200">
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40 motion-safe:animate-ping"
          aria-hidden="true"
        />
        <PenLine className="relative h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
      <PenLine className="h-4 w-4" />
    </span>
  );
}

const POSITION_STYLES: Record<TestimonyPosition, { label: string; className: string }> = {
  support: { label: 'Support', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  oppose: { label: 'Oppose', className: 'border-red-200 bg-red-50 text-red-700' },
  comments: { label: 'Comments', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

function PositionBadge({ position }: { position: TestimonyPosition }) {
  const { label, className } = POSITION_STYLES[position];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        className,
      )}
    >
      {label}
    </span>
  );
}

function SubmittedChip({ submittedAt }: { submittedAt: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      <Check className="h-3 w-3" />
      Submitted{submittedAt ? ` ${formatDate(submittedAt)}` : ''}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  action,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  cta?: { href: string; label: string };
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/60" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {cta && (
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
      {action && (
        <Button variant="outline" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex rounded-lg border bg-card shadow-sm">
          <div className="p-4 pr-0">
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="flex-1 space-y-2.5 p-4">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatHearing(hearingAt: Date): string {
  return hearingAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
