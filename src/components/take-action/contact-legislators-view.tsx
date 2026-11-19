'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  Lock,
  LogIn,
  Loader2,
  Megaphone,
  Trash2,
  Users,
} from 'lucide-react';
import { cn, formatBillStatusName } from '@/lib/core/utils';
import { RISE_IN, riseDelay } from '@/lib/core/motion';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useContactOpportunities, useContacts } from '@/hooks/use-contacts';
import { toast } from '@/hooks/use-toast';
import {
  CONTACT_METHOD_LABELS,
  CONTACT_STAGE_ACTIONS,
  type ContactOpportunity,
} from '@/lib/legislators/contact-stage';
import { FROM_CONTACT } from '@/lib/take-action/routes';
import type { Bill } from '@/types/legislation';
import type { LegislatorContact } from '@/types/contacts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginLink } from '@/components/auth/login-link';
import { LogContactDialog } from './log-contact-dialog';
import { FilterPillCount, filterPillClassName } from './filter-pill';
import { MobileHelpSheet } from './mobile-help-sheet';
import { GOVERNOR_OFFICE_RECIPIENT } from '@/lib/legislators/governor-contact';
import { ScrollToTopButton } from '@/components/main/scroll-to-top-button';

type Opportunity = ContactOpportunity<Bill, LegislatorContact>;
type ContactFilter = 'toContact' | 'contacted';

/** At the Governor stages the card's dialog offers the Governor's office, like the contact page. */
const GOVERNOR_SUGGESTION = [GOVERNOR_OFFICE_RECIPIENT];

/** How many history rows a card shows before "Show all". */
const HISTORY_PREVIEW = 3;

/**
 * The Contact Legislators tab of Take Action: the bills on Your Bills (same
 * list and scope as the board) where reaching out can move them now, plus the
 * user's — and their org's — logged contacts. Signed-in only.
 */
export function ContactLegislatorsView() {
  const { user, loading: authLoading } = useAuth();
  const { toContact, contacted, earlier, contacts, ready } = useContactOpportunities();
  // null = not chosen yet: open on "Need to contact", or "Contacted" when there's nothing to do.
  const [chosenFilter, setChosenFilter] = useState<ContactFilter | null>(null);
  const filter: ContactFilter = chosenFilter ?? (toContact.length === 0 ? 'contacted' : 'toContact');

  if (!authLoading && !user) return <ContactLoginWall />;

  const hasAnything = toContact.length > 0 || contacted.length > 0 || earlier.length > 0;
  const pills: Array<{ key: ContactFilter; label: string; icon: typeof Check; count: number }> = [
    { key: 'toContact', label: 'Need to contact', icon: Megaphone, count: toContact.length },
    { key: 'contacted', label: 'Contacted', icon: Check, count: contacted.length },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
      <div className={cn('mb-6', RISE_IN)}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Contact Legislators</h2>
          <MobileHelpSheet
            title="Requests matter"
            description="How contacting legislators works here."
          >
            <ContactSidebar />
          </MobileHelpSheet>
        </div>
        {ready && (
          <p className="mt-1 text-sm text-muted-foreground">
            {toContact.length > 0 && (
              <span className="font-medium text-amber-600">
                {toContact.length} bill{toContact.length === 1 ? '' : 's'} to contact ·{' '}
              </span>
            )}
            {contacted.length} contacted
          </p>
        )}
        {ready && hasAnything && (
          <nav aria-label="Filter contacts" className="mt-3 flex flex-wrap gap-1.5">
            {pills.map(({ key, label, icon: Icon, count }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChosenFilter(key)}
                  aria-pressed={active}
                  className={filterPillClassName(active)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <FilterPillCount active={active} count={count} />
                </button>
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {authLoading || (!ready && !contacts.error) ? (
            <ListSkeleton />
          ) : contacts.error ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load your contacts"
              description={contacts.error}
              action={{ label: 'Try again', onClick: contacts.refetch }}
            />
          ) : !hasAnything ? (
            <EmptyState
              icon={Users}
              title="No one to contact right now"
              description="Bills on your Tracker show up here when a call or email can help: waiting for a hearing, in conference, with the Governor, or vetoed."
              cta={{ href: '/discover', label: 'Find bills to track' }}
            />
          ) : (
            <div className="space-y-8">
              {filter === 'toContact' ? (
                toContact.length > 0 ? (
                  <OpportunityList items={toContact} />
                ) : (
                  <EmptyState
                    icon={Check}
                    title="You're all caught up"
                    description="None of your bills need a call or email right now. Check back as they move."
                  />
                )
              ) : (
                <>
                  {contacted.length > 0 ? (
                    <OpportunityList items={contacted} />
                  ) : (
                    <EmptyState
                      icon={Users}
                      title="No one contacted yet"
                      description="Bills you mark as contacted show up here, along with who you reached out to."
                    />
                  )}
                  {earlier.length > 0 && <EarlierSection items={earlier} />}
                </>
              )}
            </div>
          )}
        </div>

        <aside
          className={cn('hidden shrink-0 lg:sticky lg:top-24 lg:block lg:w-80', RISE_IN)}
          style={riseDelay(2)}
          aria-label="Contacting legislators help"
        >
          <ContactSidebar />
        </aside>
      </div>

      <ScrollToTopButton label="Scroll back to top" />
    </div>
  );
}

function OpportunityList({ items, staggerFrom = 0 }: { items: Opportunity[]; staggerFrom?: number }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={item.bill.id} className={RISE_IN} style={riseDelay(staggerFrom + i)}>
          <OpportunityCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function EarlierSection({ items }: { items: Opportunity[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Earlier contacts">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <History className="h-3.5 w-3.5" />
        Earlier contacts
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {items.length}
        </span>
      </button>
      {open && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Bills you reached out about that have nothing to ask right now — for example, the
            hearing you asked for has been scheduled.
          </p>
          <OpportunityList items={items} />
        </>
      )}
    </section>
  );
}

/** True for cmd/ctrl/shift/middle clicks — the browser opens a new tab, we stay put. */
function isModifiedClick(event: React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function OpportunityCard({ item }: { item: Opportunity }) {
  const { bill, stage, contacts, covered } = item;
  const [logOpen, setLogOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const billLabel = bill.nickname || bill.bill_title || '';
  const pending = stage !== null && !covered;

  return (
    <div
      className={cn(
        'group relative flex rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200',
        pending && 'border-dashed border-amber-300 shadow-none',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        navigating && 'opacity-70',
      )}
    >
      <div className="flex items-start p-4 pr-0">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            pending
              ? 'bg-amber-100 text-amber-700'
              : stage
                ? 'bg-green-100 text-green-700'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {pending ? <Megaphone className="h-4 w-4" /> : stage ? <Check className="h-4 w-4" /> : <History className="h-4 w-4" />}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold tracking-tight">{bill.bill_number}</span>
            {bill.year && (
              <Badge variant="secondary" className="h-4 rounded-md px-1 text-[10px] text-muted-foreground">
                {bill.year}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatBillStatusName(bill.current_bill_status)}
            </span>
          </div>
          {billLabel && <p className="mt-0.5 truncate text-sm text-muted-foreground">{billLabel}</p>}
        </div>

        {stage && (
          <p className="text-sm font-medium">
            {CONTACT_STAGE_ACTIONS[stage]}
            {covered && <span className="ml-1.5 text-xs font-normal text-green-700">· done</span>}
          </p>
        )}

        {contacts.length > 0 && <ContactHistory contacts={contacts} />}

        {stage && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild size="sm" variant={pending ? 'default' : 'outline'} className="h-8">
              <Link
                href={`/bills/${bill.id}/contact?from=${FROM_CONTACT}`}
                onClick={(e) => {
                  if (!isModifiedClick(e)) setNavigating(true);
                }}
              >
                {navigating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                )}
                {pending ? 'Contact' : 'Contact again'}
                {!navigating && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setLogOpen(true)}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Mark as contacted
            </Button>
            <LogContactDialog
              open={logOpen}
              onOpenChange={setLogOpen}
              billId={bill.id}
              billNumber={bill.bill_number}
              stage={stage}
              suggestedRecipients={stage === 'governor' || stage === 'intentToVeto' ? GOVERNOR_SUGGESTION : undefined}
              defaultMethod={stage === 'governor' || stage === 'intentToVeto' ? 'form' : 'email'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ContactHistory({ contacts }: { contacts: LegislatorContact[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? contacts : contacts.slice(0, HISTORY_PREVIEW);
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <ul className="space-y-1">
        {shown.map((contact) => (
          <ContactRow key={contact.id} contact={contact} />
        ))}
      </ul>
      {contacts.length > HISTORY_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 text-[11px] font-medium text-primary hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${contacts.length}`}
        </button>
      )}
    </div>
  );
}

function ContactRow({ contact }: { contact: LegislatorContact }) {
  const { remove } = useContacts();
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await remove(contact.id);
      toast({ title: 'Contact removed', description: `Removed your contact with ${contact.recipient}.` });
    } catch {
      toast({ title: 'Could not remove', description: 'Please try again.', variant: 'destructive' });
      setRemoving(false);
    }
  };

  return (
    <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
      <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-700" />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{contact.recipient}</span>
        {' · '}
        {CONTACT_METHOD_LABELS[contact.method]}
        {' · '}
        {formatDate(contact.contactedAt)}
        {!contact.mine && contact.contactedBy && <> · by {contact.contactedBy}</>}
        {contact.note && <p className="mt-0.5 line-clamp-2 italic">{contact.note}</p>}
      </div>
      {contact.mine && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="shrink-0 rounded p-0.5 hover:bg-background hover:text-red-600 disabled:opacity-50"
          aria-label={`Remove contact with ${contact.recipient}`}
          title="Remove"
        >
          {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      )}
    </li>
  );
}

function ContactSidebar() {
  const steps = [
    {
      title: 'Pick a bill',
      body: 'Bills you follow show up here when a call or email can help: waiting for a hearing, in conference, with the Governor, or vetoed.',
    },
    {
      title: 'Reach out',
      body: 'Contact opens a ready-to-edit email and call script with the right people for where the bill is. You send it from your own email or phone.',
    },
    {
      title: 'Mark it contacted',
      body: 'Record who you reached out to. Your org sees it too, so teammates can follow up instead of doubling up.',
    },
  ];
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Megaphone className="h-4 w-4 text-primary" />
        Requests matter
      </h3>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ContactLoginWall() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className={cn('w-full max-w-md text-center', RISE_IN)}>
        <CardHeader>
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>Login to contact legislators</CardTitle>
          <CardDescription>
            See which of your bills a call or email can help right now, and keep track of who you
            and your team have contacted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button asChild>
            <LoginLink>
              <LogIn className="mr-1" />
              Login
            </LoginLink>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/guide">Read the quick guide</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  action,
}: {
  icon: typeof Check;
  title: string;
  description: string;
  cta?: { href: string; label: string };
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center', RISE_IN)}>
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
            <div className="h-7 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
