'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { BillDetails } from '@/types/legislation';
import { getBillDetails } from '@/db/queries/bills-read';
import { data } from '@/lib/data-client';
import type { CommitteeChair } from '@/db/queries/committee-chairs';
import { buildContactScript, type ContactPosition } from '@/lib/legislators/contact-script';
import { parseCommitteeCodes, committeeFullName } from '@/lib/testimony/committees';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Gavel,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';

/** Chairs for one committee, chair(s) before vice-chair(s), preserving query order. */
interface CommitteeGroup {
  code: string;
  name: string;
  chairs: CommitteeChair[];
}

function groupByCommittee(chairs: CommitteeChair[]): CommitteeGroup[] {
  const order: string[] = [];
  const map = new Map<string, CommitteeGroup>();
  for (const c of chairs) {
    let group = map.get(c.committeeCode);
    if (!group) {
      group = { code: c.committeeCode, name: c.committeeName, chairs: [] };
      map.set(c.committeeCode, group);
      order.push(c.committeeCode);
    }
    group.chairs.push(c);
  }
  return order.map((code) => map.get(code)!);
}

export default function ContactLegislatorPage() {
  const { id: billId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const backHref = searchParams.get('from') === 'testimonies' ? '/testimonies' : '/';

  const [bill, setBill] = useState<BillDetails | null>(null);
  const [chairs, setChairs] = useState<CommitteeChair[]>([]);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<ContactPosition | null>(null);

  useEffect(() => {
    if (!billId) return;
    let cancelled = false;
    (async () => {
      try {
        const details = await getBillDetails(billId);
        if (cancelled) return;
        setBill(details);
        const list = await data.legislators.getChairs(billId, details?.committee_assignment ?? null);
        if (!cancelled) setChairs(list);
      } catch {
        if (!cancelled) toast({ title: 'Error', description: 'Could not load contacts.', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [billId]);

  const userName = user?.username ?? undefined;

  // One correctly-addressed script per chair, memoized on the inputs that change it.
  const scripts = useMemo(() => {
    const out = new Map<string, { subject: string; body: string }>();
    if (!position || !bill) return out;
    for (const chair of chairs) {
      out.set(
        `${chair.committeeCode}-${chair.role}`,
        buildContactScript({
          billNumber: bill.bill_number,
          billTitle: bill.bill_title ?? null,
          chair,
          position,
          userName,
        }),
      );
    }
    return out;
  }, [position, bill, chairs, userName]);

  const groups = useMemo(() => groupByCommittee(chairs), [chairs]);
  const hasChairs = chairs.length > 0;

  if (loading) {
    return <ContactSkeleton onBack={() => router.push(backHref)} />;
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Back</span>
        </Button>
        <p className="truncate text-sm font-semibold">Contact Legislator</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
          {/* Bill context — the whole point of the page */}
          {bill && <BillContext bill={bill} />}

          {!hasChairs ? (
            <EmptyState />
          ) : (
            <>
              {/* Step 1 — Position */}
              <StepSection index={1} title="Choose your position">
                <p className="mb-3 text-xs text-muted-foreground">
                  Tell the committee whether you want this measure to move forward. This sets the tone of every script below.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Position">
                  <PositionButton
                    active={position === 'support'}
                    onClick={() => setPosition('support')}
                    icon={ThumbsUp}
                    label="Support"
                    help="Advance this bill"
                    tone="support"
                  />
                  <PositionButton
                    active={position === 'oppose'}
                    onClick={() => setPosition('oppose')}
                    icon={ThumbsDown}
                    label="Oppose"
                    help="Hold this bill"
                    tone="oppose"
                  />
                </div>
              </StepSection>

              {/* Step 2 — Contacts + scripts, gated on position */}
              <StepSection
                index={2}
                title="Contact the committee"
                muted={!position}
              >
                {!position ? (
                  <p className="text-sm text-muted-foreground">
                    Pick a position above to unlock a ready-to-send message for each chair.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {groups.map((group) => (
                      <div key={group.code}>
                        <div className="mb-2 flex items-baseline gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide">{group.code}</span>
                          <span className="truncate text-xs text-muted-foreground">{group.name}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {group.chairs.map((chair) => (
                            <ChairCard
                              key={`${chair.committeeCode}-${chair.role}`}
                              chair={chair}
                              script={scripts.get(`${chair.committeeCode}-${chair.role}`) ?? null}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </StepSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BillContext({ bill }: { bill: BillDetails }) {
  const committees = parseCommitteeCodes(bill.committee_assignment).map((code) => ({
    code,
    name: committeeFullName(code),
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{bill.bill_number}</p>
          {bill.bill_title && (
            <p className="mt-0.5 text-sm text-muted-foreground">{bill.bill_title}</p>
          )}
          {bill.introducer && (
            <p className="mt-2 text-xs text-muted-foreground">Introduced by {bill.introducer}</p>
          )}
        </div>
        {bill.bill_url && (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={bill.bill_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Capitol page</span>
              <span className="sm:hidden">Bill</span>
            </a>
          </Button>
        )}
      </div>

      {/* Which committees this bill is currently before */}
      <div className="mt-3 border-t pt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {committees.length > 0
            ? `Before ${committees.length} committee${committees.length === 1 ? '' : 's'}`
            : 'Not yet referred to a committee'}
        </p>
        {committees.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {committees.map((c) => (
              <span
                key={c.code}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
                title={c.name}
              >
                <span className="font-semibold">{c.code}</span>
                <span className="text-muted-foreground">{c.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepSection({
  index,
  title,
  muted,
  children,
}: {
  index: number;
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        'rounded-lg border bg-card p-4 transition-opacity',
        muted ? 'opacity-70' : 'opacity-100',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {index}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function PositionButton({
  active,
  onClick,
  icon: Icon,
  label,
  help,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ThumbsUp;
  label: string;
  help: string;
  tone: 'support' | 'oppose';
}) {
  const activeClasses =
    tone === 'support'
      ? 'border-green-200 bg-green-100 text-green-800'
      : 'border-red-200 bg-red-100 text-red-800';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        'flex items-center gap-3 rounded-md border p-3 text-left transition-colors',
        active ? activeClasses : 'bg-background hover:bg-muted',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          active ? 'bg-white' : 'bg-muted',
        ].join(' ')}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          {active && <Check className="h-3.5 w-3.5" />}
        </span>
        <span className="block text-xs opacity-80">{help}</span>
      </span>
    </button>
  );
}

function ChairCard({
  chair,
  script,
}: {
  chair: CommitteeChair;
  script: { subject: string; body: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const RoleIcon = chair.role === 'chair' ? Gavel : ShieldCheck;
  const roleLabel = chair.role === 'chair' ? 'Chair' : 'Vice-Chair';

  const mailto =
    chair.email && script
      ? `mailto:${chair.email}?subject=${encodeURIComponent(script.subject)}&body=${encodeURIComponent(script.body)}`
      : null;

  const copyScript = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.body);
      setCopied(true);
      toast({ title: 'Copied', description: `Script for ${chair.legislatorName} copied.` });
      // reset the inline confirmation after a moment
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Open the preview and copy manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <RoleIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{chair.legislatorName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel} · {chair.committeeName}
          </p>
        </div>
      </div>

      <div className="mt-2 space-y-1 text-xs">
        {chair.email && (
          <a
            href={`mailto:${chair.email}`}
            className="flex items-center gap-1.5 break-all text-muted-foreground hover:text-foreground hover:underline"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" /> {chair.email}
          </a>
        )}
        {chair.phone && (
          <a
            href={`tel:${chair.phone.replace(/[^\d+]/g, '')}`}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" /> {chair.phone}
          </a>
        )}
      </div>

      {/* Script preview toggle */}
      {script && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={['h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
          {open ? 'Hide script' : 'Preview script'}
        </button>
      )}
      {script && open && (
        <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {script.body}
        </pre>
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2 pt-3">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={copyScript}
          disabled={!script}
        >
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </>
          )}
        </Button>
        {chair.email &&
          (mailto ? (
            <Button asChild size="sm" className="flex-1">
              <a href={mailto}>
                <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
              </a>
            </Button>
          ) : (
            <Button size="sm" className="flex-1" disabled aria-disabled="true">
              <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
            </Button>
          ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed bg-card p-8 text-center">
      <Gavel className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">No committees assigned yet</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        Committee chairs appear once this bill is referred to a committee. Check back after the referral, then return
        here to send your message.
      </p>
    </div>
  );
}

function ContactSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Back</span>
        </Button>
        <p className="truncate text-sm font-semibold">Contact Legislator</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
