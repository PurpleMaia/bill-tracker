'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { BillDetails } from '@/types/legislation';
import { getBillDetails } from '@/db/queries/bills-read';
import { data } from '@/lib/data-client';
import type { CommitteeChair } from '@/db/queries/committee-chairs';
import { buildContactScript, type ContactPosition } from '@/lib/legislators/contact-script';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Gavel, Loader2, Mail, Phone, ShieldCheck } from 'lucide-react';

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

  const scriptFor = useCallback(
    (chair: CommitteeChair) =>
      position && bill
        ? buildContactScript({
            billNumber: bill.bill_number,
            billTitle: bill.bill_title ?? null,
            chair, position, userName,
          })
        : null,
    [position, bill, userName],
  );

  const genericScript = useMemo(() => {
    if (!position || !bill || chairs.length === 0) return null;
    return buildContactScript({
      billNumber: bill.bill_number, billTitle: bill.bill_title ?? null,
      chair: chairs[0], position, userName,
    });
  }, [position, bill, chairs, userName]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: 'Script copied to your clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the text manually.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Back header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Back</span>
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Contact Legislator{bill ? ` — ${bill.bill_number}` : ''}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
          {/* Position selector — REQUIRED, no default */}
          <div className="rounded-lg border bg-card p-4">
            <p className="mb-2 text-sm font-medium">Choose your position</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Position">
              {(['support', 'oppose'] as ContactPosition[]).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={position === p}
                  onClick={() => setPosition(p)}
                  className={[
                    'h-11 rounded-md border text-sm font-medium capitalize transition-colors',
                    position === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </div>
            {!position && (
              <p className="mt-2 text-xs text-muted-foreground">Pick support or oppose to generate a script.</p>
            )}
          </div>

          {/* Generic script */}
          {genericScript && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Your script</p>
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => copy(genericScript.body)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <pre className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{genericScript.body}</pre>
            </div>
          )}

          {/* Chairs */}
          {chairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No committees assigned yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {chairs.map((chair, i) => {
                const script = scriptFor(chair);
                const RoleIcon = chair.role === 'chair' ? Gavel : ShieldCheck;
                const mailto = chair.email && script
                  ? `mailto:${chair.email}?subject=${encodeURIComponent(script.subject)}&body=${encodeURIComponent(script.body)}`
                  : chair.email ? `mailto:${chair.email}` : null;
                return (
                  <div key={`${chair.committeeCode}-${chair.role}-${i}`} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <RoleIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{chair.legislatorName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {chair.role === 'chair' ? 'Chair' : 'Vice-Chair'} · {chair.committeeName}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      {chair.email && (
                        <p className="flex items-center gap-1.5 break-all">
                          <Mail className="h-3.5 w-3.5 shrink-0" /> {chair.email}
                        </p>
                      )}
                      {chair.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" /> {chair.phone}
                        </p>
                      )}
                    </div>
                    {mailto && (
                      <Button asChild size="sm" variant="outline" className="mt-2 w-full" disabled={!position}>
                        <a href={mailto}>
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email {chair.role === 'chair' ? 'Chair' : 'Vice-Chair'}
                        </a>
                      </Button>
                    )}
                    {!position && chair.email && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Pick a position to fill the email.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
