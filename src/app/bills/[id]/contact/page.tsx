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
  type ContactPosition,
} from '@/lib/legislators/contact-script';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { BillReferencePanel } from '@/components/bills/bill-reference-panel';
import { ContactStepper, type ContactStep } from '@/components/kanban/contact-stepper';
import {
  ArrowLeft,
  ArrowRight,
  Check,
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
  ThumbsDown,
  ThumbsUp,
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

  const backHref = searchParams.get('from') === 'testimonies' ? '/testimonies' : '/';

  const [bill, setBill] = useState<BillDetails | null>(null);
  const [chairs, setChairs] = useState<CommitteeChair[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<ContactStep>(1);
  const [position, setPosition] = useState<ContactPosition | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // The shared, user-editable scripts. Seeded when a position is chosen; null
  // until then. Edits are preserved as the user moves between steps.
  const [scriptBody, setScriptBody] = useState<string | null>(null);
  const [scriptSubject, setScriptSubject] = useState<string>('');
  const [callScript, setCallScript] = useState<string | null>(null);

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
  const maxStep: ContactStep = position ? 2 : 1;

  // Choosing (or changing) a position seeds the shared script. We only OVERWRITE
  // an existing draft when the position actually flips, so edits aren't lost by
  // re-clicking the same choice.
  const choosePosition = (p: ContactPosition) => {
    if (p !== position && bill) {
      const base = buildBaseScript({
        billNumber: bill.bill_number,
        billTitle: bill.bill_title ?? null,
        position: p,
      });
      setScriptBody(base.body);
      setScriptSubject(base.subject);
      setCallScript(
        buildCallScript({
          billNumber: bill.bill_number,
          billTitle: bill.bill_title ?? null,
          position: p,
        }),
      );
    }
    setPosition(p);
  };

  const goToStep = (s: ContactStep) => {
    if (s > maxStep) return;
    setStep(s);
  };

  const referencePanel = bill ? <BillReferencePanel bill={bill} /> : null;

  if (loading) {
    return <ContactSkeleton onBack={() => router.push(backHref)} />;
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
              Contact Legislator{bill ? ` — ${bill.bill_number}` : ''}
            </h1>
            {bill?.bill_title && <p className="truncate text-xs text-muted-foreground">{bill.bill_title}</p>}
          </div>
        </div>
        {hasChairs && <ContactStepper step={step} onStepChange={goToStep} maxStep={maxStep} />}
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
              step !== 2 ? 'max-w-3xl' : panelCollapsed ? 'max-w-6xl' : 'max-w-5xl',
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
            ) : step === 1 ? (
              <StepPosition
                position={position}
                onChoose={choosePosition}
                onNext={() => goToStep(2)}
              />
            ) : (
              <StepCompose
                groups={groups}
                subject={scriptSubject}
                body={scriptBody ?? ''}
                onChange={setScriptBody}
                callScript={callScript ?? ''}
                onCallChange={setCallScript}
                onBack={() => goToStep(1)}
                panelCollapsed={panelCollapsed}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------- Step 1 -------------------------------- */

function StepPosition({
  position,
  onChoose,
  onNext,
}: {
  position: ContactPosition | null;
  onChoose: (p: ContactPosition) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Choose your position</h2>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Tell the committee whether you want this measure to move forward. This sets the tone of your script.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Position">
          <PositionButton
            active={position === 'support'}
            onClick={() => onChoose('support')}
            icon={ThumbsUp}
            label="Support"
            help="Advance this bill"
            tone="support"
          />
          <PositionButton
            active={position === 'oppose'}
            onClick={() => onChoose('oppose')}
            icon={ThumbsDown}
            label="Oppose"
            help="Hold this bill"
            tone="oppose"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!position}>
          Next: Compose
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
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

/* --------------------------- Step 2: Compose --------------------------- */

/** Stable key identifying a chair within the flat list. */
function chairKey(chair: CommitteeChair): string {
  return `${chair.committeeCode}-${chair.role}`;
}

function StepCompose({
  groups,
  subject,
  body,
  onChange,
  callScript,
  onCallChange,
  onBack,
  panelCollapsed,
}: {
  groups: CommitteeGroup[];
  subject: string;
  body: string;
  onChange: (v: string) => void;
  callScript: string;
  onCallChange: (v: string) => void;
  onBack: () => void;
  panelCollapsed: boolean;
}) {
  // Scripts get the larger share. When the bill panel is collapsed there's more
  // width overall, so push the scripts even wider (5/8 → 2/3 of the row).
  const scriptSpan = panelCollapsed ? 'lg:col-span-5' : 'lg:col-span-4';
  const contactSpan = panelCollapsed ? 'lg:col-span-3' : 'lg:col-span-4';

  return (
    <div className="space-y-4">
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
              One message goes to every chair. Edit it freely — the greeting is filled in for each legislator when you
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
              What to say when you call an office. Keep it short — staff just note your position.
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

        {/* Right — the contact list */}
        <div className={['space-y-4', contactSpan].join(' ')}>
          {groups.map((group) => (
            <div key={group.code}>
              <div className="mb-2 flex items-center gap-2 border-b pb-1.5">
                <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
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
      </div>

      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back: Position
        </Button>
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
        here to send your message.
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
        <h1 className="truncate text-sm font-semibold">Contact Legislator</h1>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
