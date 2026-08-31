'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { BillDetails } from '@/types/legislation';
import { getBillDetails } from '@/db/queries/bills-read';
import { data } from '@/lib/data-client';
import type { CommitteeChair } from '@/db/queries/committee-chairs';
import {
  buildBaseScript,
  buildCallScript,
  personalizeScript,
} from '@/lib/legislators/contact-script';
import {
  committeeFullName,
  inferCurrentCommittee,
  hasJointReferral,
  jointReferralPartners,
  JOINT_REFERRAL_NOTE,
} from '@/lib/testimony/committees';
import { useCommitteeNames } from '@/hooks/contexts/committee-names-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { BillReferencePanel } from '@/components/bills/bill-reference-panel';
import { isEnacted } from '@/lib/bills/dead-bill';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Gavel,
  Info,
  Loader2,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  ShieldCheck,
} from 'lucide-react';

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
  const isMobile = useIsMobile();
  const committeeNames = useCommitteeNames();

  const backHref = searchParams.get('from') === 'testimonies' ? '/testimonies' : '/';

  const [bill, setBill] = useState<BillDetails | null>(null);
  const [chairs, setChairs] = useState<CommitteeChair[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // The shared, user-editable scripts, seeded once the bill loads.
  const [scriptBody, setScriptBody] = useState<string>('');
  const [scriptSubject, setScriptSubject] = useState<string>('');
  const [callScript, setCallScript] = useState<string>('');

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

  const groups = useMemo(() => groupByCommittee(chairs), [chairs]);
  const hasChairs = chairs.length > 0;

  // The committee the bill is currently awaiting a hearing before — inferred
  // once, then reused to both foreground its chairs and word the script.
  const currentCode = useMemo(
    () => inferCurrentCommittee(bill?.committee_assignment ?? null, bill?.updates),
    [bill],
  );

  // The committee(s) currently holding the bill. For a JOINT referral (HHS/WAE)
  // both committees hear it together, so BOTH are foregrounded — neither drops
  // into the collapsed "other committees" list. For a normal referral this is
  // just the one inferred group.
  const currentCodes = useMemo(
    () =>
      new Set(
        currentCode
          ? jointReferralPartners(bill?.committee_assignment ?? null, currentCode)
          : [],
      ),
    [bill?.committee_assignment, currentCode],
  );
  const currentGroups = useMemo(() => {
    const matched = groups.filter((g) => currentCodes.has(g.code));
    // Fall back to the first group so a bill whose inference misses still shows
    // someone to contact rather than an empty foreground.
    return matched.length > 0 ? matched : groups.slice(0, 1);
  }, [groups, currentCodes]);
  const otherGroups = useMemo(
    () => groups.filter((g) => !currentGroups.includes(g)),
    [groups, currentGroups],
  );

  // Word the script for the primary current committee (the one furthest along).
  const currentGroup = useMemo(
    () => currentGroups.find((g) => g.code === currentCode) ?? currentGroups[0] ?? null,
    [currentGroups, currentCode],
  );

  // The committee's display name: prefer the current group's DB name (the same
  // string the contact cards show) so the script and the cards never disagree;
  // fall back to the code's mapped full name if no chair group matched.
  const currentCommitteeName = currentGroup?.name ?? (currentCode ? committeeFullName(currentCode, committeeNames) : undefined);

  // Seed the shared scripts once the bill and its current committee are known.
  useEffect(() => {
    if (!bill) return;
    const base = buildBaseScript({
      billNumber: bill.bill_number,
      billTitle: bill.bill_title ?? null,
      committeeName: currentCommitteeName,
    });
    setScriptBody(base.body);
    setScriptSubject(base.subject);
    setCallScript(
      buildCallScript({
        billNumber: bill.bill_number,
        billTitle: bill.bill_title ?? null,
        committeeName: currentCommitteeName,
      }),
    );
  }, [bill, currentCommitteeName]);

  const referencePanel = bill ? <BillReferencePanel bill={bill} /> : null;

  if (loading) {
    return <ContactSkeleton onBack={() => router.push(backHref)} />;
  }

  // A bill signed into law is done — legislators can no longer act on it. Guard
  // the route so a directly-pasted URL can't bypass the disabled Contact button.
  if (bill && isEnacted(bill.current_bill_status)) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <ShieldCheck className="h-10 w-10 text-green-700" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">This bill has become law</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {bill.bill_number} has been signed into law. Legislators can no longer act on it, so
            there is no one to contact about it.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(backHref)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              Request a Hearing{bill ? ` — ${bill.bill_number}` : ''}
            </h1>
            {bill?.bill_title && <p className="truncate text-xs text-muted-foreground">{bill.bill_title}</p>}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Reference panel — collapsible sidebar on desktop, sheet on mobile */}
        {!isMobile && referencePanel && (
          panelCollapsed ? (
            <aside className="flex w-10 shrink-0 flex-col items-center border-r bg-muted/20 py-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPanelCollapsed(false)}
                aria-label="Show bill information"
                title="Show bill information"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </aside>
          ) : (
            <aside className="flex w-[340px] shrink-0 flex-col border-r bg-muted/20">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bill info</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPanelCollapsed(true)}
                  aria-label="Hide bill information"
                  title="Hide bill information"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1">{referencePanel}</div>
            </aside>
          )
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div
            className={[
              'mx-auto space-y-4 p-4 sm:p-6',
              panelCollapsed ? 'max-w-6xl' : 'max-w-5xl',
            ].join(' ')}
          >
            {isMobile && referencePanel && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Info className="mr-1.5 h-3.5 w-3.5" />
                    Bill info
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[85vw] p-0 sm:w-[380px]">
                  <SheetHeader className="border-b px-4 py-3">
                    <SheetTitle className="text-sm">Bill reference</SheetTitle>
                  </SheetHeader>
                  <div className="h-[calc(100dvh-57px)]">{referencePanel}</div>
                </SheetContent>
              </Sheet>
            )}

            {!hasChairs ? (
              <EmptyState />
            ) : (
              <Compose
                currentGroups={currentGroups}
                otherGroups={otherGroups}
                isJointReferral={hasJointReferral(bill?.committee_assignment)}
                subject={scriptSubject}
                body={scriptBody}
                onChange={setScriptBody}
                callScript={callScript}
                onCallChange={setCallScript}
                panelCollapsed={panelCollapsed}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------- Compose ------------------------------- */

/** Stable key identifying a chair within the flat list. */
function chairKey(chair: CommitteeChair): string {
  return `${chair.committeeCode}-${chair.role}`;
}

function Compose({
  currentGroups,
  otherGroups,
  isJointReferral,
  subject,
  body,
  onChange,
  callScript,
  onCallChange,
  panelCollapsed,
}: {
  currentGroups: CommitteeGroup[];
  otherGroups: CommitteeGroup[];
  isJointReferral: boolean;
  subject: string;
  body: string;
  onChange: (v: string) => void;
  callScript: string;
  onCallChange: (v: string) => void;
  panelCollapsed: boolean;
}) {
  const [showOthers, setShowOthers] = useState(false);

  // Scripts get the larger share. When the bill panel is collapsed there's more
  // width overall, so push the scripts even wider (5/8 → 2/3 of the row).
  const scriptSpan = panelCollapsed ? 'lg:col-span-5' : 'lg:col-span-4';
  const contactSpan = panelCollapsed ? 'lg:col-span-3' : 'lg:col-span-4';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Ask for a hearing</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          This bill is waiting on a committee to schedule a hearing. Send the message below to that committee&apos;s
          chair and vice-chair. The more requests they get, the more likely they are to put it on the agenda.
        </p>
        {isJointReferral && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {JOINT_REFERRAL_NOTE} Contact the chair and vice-chair of both committees.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-8">
        {/* Left — the editable email + call scripts, equal height */}
        <div
          className={[
            'grid grid-cols-1 gap-4 lg:sticky lg:top-0 lg:self-start lg:grid-rows-2',
            scriptSpan,
          ].join(' ')}
        >
          {/* Email script */}
          <div className="flex flex-col rounded-lg border bg-card p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Email script</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              One message goes to every chair. You may edit it freely. The greeting ("Dear Chair") is filled in for each legislator when you
              send.
            </p>
            <div className="mb-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-medium">{subject}</span>
            </div>
            <Textarea
              value={body}
              onChange={(e) => onChange(e.target.value)}
              rows={12}
              className="min-h-[8rem] flex-1 resize-y font-mono text-sm leading-relaxed"
              aria-label="Email message to legislators"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tip: replace <span className="font-medium">&lt;your-name&gt;</span> and add a sentence about why this bill
              matters to you.
            </p>
          </div>

          {/* Call script */}
          <div className="flex flex-col rounded-lg border bg-card p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Call script</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              What to say when you call an office.
            </p>
            <Textarea
              value={callScript}
              onChange={(e) => onCallChange(e.target.value)}
              rows={7}
              className="min-h-[8rem] flex-1 resize-y font-mono text-sm leading-relaxed"
              aria-label="Phone call script"
            />
          </div>
        </div>

        {/* Right — the contact list, current committee(s) foregrounded. A joint
            referral foregrounds both committees (the "Ask for a hearing" card
            above explains why); contact all of them. */}
        <div className={['space-y-4', contactSpan].join(' ')}>
          {currentGroups.map((group) => (
            <div key={group.code}>
              <div className="mb-2 flex items-center gap-2 border-b pb-1.5">
                <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                  {group.code}
                </span>
                <h3 className="truncate text-sm font-semibold">{group.name}</h3>
                <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  Awaiting hearing
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.chairs.map((chair) => (
                  <ChairCard key={chairKey(chair)} chair={chair} subject={subject} body={body} />
                ))}
              </div>
            </div>
          ))}

          {otherGroups.length > 0 && (
            <div className="rounded-lg border bg-muted/20">
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={showOthers}
              >
                {showOthers ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {showOthers ? 'Hide' : 'Show'} other committees ({otherGroups.length})
              </button>
              {showOthers && (
                <div className="space-y-4 px-3 pb-3 opacity-80">
                  <p className="text-[11px] text-muted-foreground">
                    These committees are also on this bill&apos;s referral path but aren&apos;t the one currently
                    holding it. Contact them only if the bill has already moved on.
                  </p>
                  {otherGroups.map((group) => (
                    <div key={group.code}>
                      <div className="mb-2 flex items-center gap-2 border-b pb-1.5">
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                          {group.code}
                        </span>
                        <h3 className="truncate text-sm font-semibold">{group.name}</h3>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {group.chairs.map((chair) => (
                          <ChairCard key={chairKey(chair)} chair={chair} subject={subject} body={body} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Gmail web-compose URL — opens a prefilled draft in the user's Gmail (their own account as sender). */
function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function ChairCard({
  chair,
  subject,
  body,
}: {
  chair: CommitteeChair;
  subject: string;
  body: string;
}) {
  const [copied, setCopied] = useState(false);
  const RoleIcon = chair.role === 'chair' ? Gavel : ShieldCheck;
  const roleLabel = chair.role === 'chair' ? 'Chair' : 'Vice-Chair';

  // Personalize the shared script for this specific recipient at send time.
  const personalized = useMemo(() => personalizeScript(body, chair), [body, chair]);
  const mailto = chair.email
    ? `mailto:${chair.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(personalized)}`
    : null;
  const gmail = chair.email ? gmailComposeUrl(chair.email, subject, personalized) : null;

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(personalized);
      setCopied(true);
      toast({ title: 'Copied', description: `Message for ${chair.legislatorName} copied.` });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Open the preview and copy manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col rounded-md border bg-card p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <RoleIcon className="h-3 w-3" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{chair.legislatorName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
        </div>
      </div>

      <div className="mt-1.5 space-y-0.5 text-[11px]">
        {chair.email && (
          <a
            href={`mailto:${chair.email}`}
            className="flex items-center gap-1 break-all text-muted-foreground hover:text-foreground hover:underline"
          >
            <Mail className="h-3 w-3 shrink-0" /> {chair.email}
          </a>
        )}
        {chair.phone && (
          <a
            href={`tel:${chair.phone.replace(/[^\d+]/g, '')}`}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            <Phone className="h-3 w-3 shrink-0" /> {chair.phone}
          </a>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1 pt-2">
        {mailto && (
          <Button asChild size="sm" className="h-7 flex-1 px-2 text-[11px]">
            <a href={mailto}>
              <Mail className="mr-1 h-3 w-3" /> Email
            </a>
          </Button>
        )}
        {gmail && (
          <Button asChild size="sm" variant="outline" className="h-7 flex-1 px-2 text-[11px]">
            <a href={gmail} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" /> Gmail
            </a>
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={copyScript}
          aria-label="Copy message"
          title="Copy message"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- Shared -------------------------------- */

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed bg-card p-8 text-center">
      <Gavel className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">No committees assigned yet</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        Committee chairs appear once this bill is referred to a committee. Check back after the referral, then return
        here to request a hearing.
      </p>
    </div>
  );
}

function ContactSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Back</span>
        </Button>
        <h1 className="truncate text-sm font-semibold">Request a Hearing</h1>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
