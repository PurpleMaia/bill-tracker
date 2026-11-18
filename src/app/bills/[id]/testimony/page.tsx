'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { BillDetails } from '@/types/legislation';
import type { TestimonyDraft, TestimonyPosition } from '@/types/testimony';
import { data } from '@/lib/data-client';
import { safeReturnPath } from '@/lib/core/safe-return-path';
import { fullNameOrUsername } from '@/lib/auth/profile';
import { tiptapHasText } from '@/lib/testimony/tiptap-text';
import { RETURN_TO_PARAM, stripBillParam } from '@/lib/bills/bill-dialog-url';
import { currentTestimonyRound, roundLabel, sameRound } from '@/lib/testimony/testimony-round';
import { useAuth } from '@/hooks/contexts/auth-context';
import { invalidateTestimonies } from '@/hooks/use-testimonies';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { TestimonyStepper, type TestimonyStep } from '@/components/testimony/testimony-stepper';
import { BillReferencePanel } from '@/components/bills/bill-reference-panel';
import { BillInfoFab } from '@/components/bills/bill-info-fab';
import { TestimonyHeaderForm, type TestimonyHeaderValue } from '@/components/testimony/testimony-header-form';
import { TestimonyEditor } from '@/components/testimony/testimony-editor';
import { TestimonyExportStep } from '@/components/testimony/testimony-export-step';
import { TestimonySubmitGuide } from '@/components/testimony/testimony-submit-guide';
import { TestimonyRoundSwitcher } from '@/components/testimony/testimony-round-switcher';
import { FlowWalkthrough } from '@/components/tour/flow-walkthrough';
import { TESTIMONY_WALKTHROUGH_KEY, testimonyWalkthrough } from '@/lib/tour/flow-walkthroughs';
import { ArrowLeft, ArrowRight, Loader2, Lock } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/** The draft's body, or an empty doc when it has none yet. */
function draftContent(draft: TestimonyDraft): unknown {
  const hasContent =
    draft.contentJson && typeof draft.contentJson === 'object' &&
    Array.isArray((draft.contentJson as { content?: unknown[] }).content);
  return hasContent ? draft.contentJson : EMPTY_DOC;
}

/** Whether focus landed somewhere that opens the on-screen keyboard. */
function isTextEntry(target: EventTarget): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input:not([type="radio"]), textarea'));
}

export default function TestimonyPage() {
  const { id: billId } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Which of the user's testimonies for this bill (one per hearing round) to open.
  const requestedId = searchParams.get('t');
  const { user, activeTenant, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();

  // Where the user came from — back navigation returns there, not always the board.
  // Back returns to where the user came from: the bill dialog's host page
  // (`returnTo`, validated), else the testimonies list, else home.
  const backHref = safeReturnPath(searchParams.get(RETURN_TO_PARAM))
    ?? (searchParams.get('from') === 'testimonies' ? '/testimonies' : '/');

  const [bill, setBill] = useState<BillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<TestimonyStep>(1);
  const [form, setForm] = useState<TestimonyHeaderValue>({
    authorName: '',
    organization: '',
    position: 'comments' as TestimonyPosition,
  });
  const [contentJson, setContentJson] = useState<unknown>(EMPTY_DOC);
  const [submitted, setSubmitted] = useState(false);
  // The user's testimonies for this bill, and which one is open (null until the first save creates it).
  const [testimonies, setTestimonies] = useState<TestimonyDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  // Bumped when a different testimony is loaded, to remount the editor (not when a first save assigns an id).
  const [editorKey, setEditorKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // A text field or the editor has focus — on a phone, the keyboard is up.
  const [typing, setTyping] = useState(false);

  const hydrated = useRef(false); // true once bill + draft are loaded (enables autosave)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  const contentRef = useRef(contentJson);
  const dirtyRef = useRef(false); // edits not yet persisted
  const inFlightRef = useRef(false); // a save request is running
  const savePromiseRef = useRef<Promise<void> | null>(null); // the running save, for flushSave
  const activeIdRef = useRef<string | null>(null); // the testimony saves go to
  const testimoniesRef = useRef<TestimonyDraft[]>([]);
  testimoniesRef.current = testimonies;
  const requestedIdRef = useRef(requestedId); // read once on load; switching updates the URL itself
  const authorDefaultRef = useRef('');
  authorDefaultRef.current = user ? fullNameOrUsername(user) : '';

  /** URL of this page with `t` pointing at the given testimony (other params kept). */
  const hrefFor = useCallback(
    (testimonyId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('t', testimonyId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );
  const hrefForRef = useRef(hrefFor);
  hrefForRef.current = hrefFor;

  /** Loads one testimony (or a fresh blank one when null) into the editor state. */
  const hydrate = useCallback((draft: TestimonyDraft | null) => {
    const nextForm: TestimonyHeaderValue = draft
      ? { authorName: draft.authorName, organization: draft.organization, position: draft.position }
      : { authorName: authorDefaultRef.current, organization: '', position: 'comments' };
    const nextContent = draft ? draftContent(draft) : EMPTY_DOC;
    setForm(nextForm);
    setContentJson(nextContent);
    setSubmitted(draft?.submittedAt != null);
    setActiveId(draft?.id ?? null);
    setStep(1);
    setEditorKey((k) => k + 1);
    formRef.current = nextForm;
    contentRef.current = nextContent;
    activeIdRef.current = draft?.id ?? null;
    dirtyRef.current = false;
  }, []);

  /** Replaces (or adds) a testimony in the local list after a save/create/submit. */
  const upsertLocal = useCallback((draft: TestimonyDraft) => {
    setTestimonies((prev) => {
      const rest = prev.filter((t) => t.id !== draft.id);
      return [draft, ...rest].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    });
  }, []);

  // Load the bill and the user's testimonies for it together, then open the
  // requested one (?t=), else the one for the bill's current hearing round,
  // else the newest. No testimony yet → a blank one, created on first save.
  useEffect(() => {
    if (!billId || authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const [details, list] = await Promise.all([
          data.bills.getBillDetails({ billId }),
          data.testimony.listForBill(billId),
        ]);
        if (cancelled) return;
        details.updates = [...(details.updates ?? [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setBill(details);
        setTestimonies(list);
        const round = currentTestimonyRound({
          billNumber: details.bill_number,
          billStatus: details.current_bill_status,
          currentCommittee: details.current_committee ?? null,
          committeeAssignment: details.committee_assignment,
          updates: details.updates,
          dead: details.dead,
        });
        const picked =
          list.find((t) => t.id === requestedIdRef.current) ??
          list.find((t) => sameRound(t, round)) ??
          list[0] ??
          null;
        hydrate(picked);
        if (picked && picked.id !== requestedIdRef.current) router.replace(hrefForRef.current(picked.id));
        hydrated.current = true;
      } catch {
        if (!cancelled) {
          toast({ title: 'Error', description: 'Failed to load this bill.', variant: 'destructive' });
          // Drop `?bill=` so the host doesn't reopen a dialog for the bill that just failed to load.
          router.replace(stripBillParam(backHref));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billId, authLoading, user, router, backHref, hydrate]);

  // Serialized save: only one saveDraft request runs at a time, so slow responses
  // can never complete out of order and overwrite newer content. Edits that arrive
  // while a request is in flight set dirtyRef and trigger a follow-up save.
  // Reads formRef/contentRef inside the callback so it always sees the latest values,
  // avoiding stale-closure data loss when both halves change within the debounce window.
  // The target testimony id is read once at the start, so a save can never land
  // in a different round than the one the edits were made in.
  const performSave = useCallback(async () => {
    if (!billId || inFlightRef.current || !dirtyRef.current) return;
    inFlightRef.current = true;
    dirtyRef.current = false;
    const f = formRef.current;
    const c = contentRef.current;
    const tenantId = activeTenant?.tenantId ?? null;
    const run = (async () => {
      try {
        let targetId = activeIdRef.current;
        if (!targetId) {
          // First save for this bill: start the testimony for its current hearing round.
          const created = await data.testimony.create({ billId, tenantId, authorName: f.authorName });
          targetId = created.id;
          activeIdRef.current = created.id;
          setActiveId(created.id);
          router.replace(hrefForRef.current(created.id));
        }
        const saved = await data.testimony.update(targetId, {
          tenantId,
          authorName: f.authorName,
          organization: f.organization,
          position: f.position,
          contentJson: c,
        });
        upsertLocal(saved);
        inFlightRef.current = false;
        invalidateTestimonies();
        if (dirtyRef.current) {
          void performSaveRef.current();
        } else {
          setSaveState('saved');
        }
      } catch {
        inFlightRef.current = false;
        dirtyRef.current = true;
        setSaveState('error');
        toast({ title: 'Save failed', description: 'Your draft could not be saved. Retrying on next edit.', variant: 'destructive' });
      }
    })();
    savePromiseRef.current = run;
    await run;
  }, [billId, activeTenant?.tenantId, upsertLocal, router]);

  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  // Debounced autosave (1.5s after the last change).
  const scheduleSave = useCallback(() => {
    if (!hydrated.current || !billId) return;
    dirtyRef.current = true;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void performSaveRef.current();
    }, 1500);
  }, [billId]);

  /**
   * Persists pending edits now and waits for every running save (including the
   * follow-up a save chains for edits made meanwhile). A failed save leaves
   * dirtyRef set, which callers check before moving on.
   */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    while (inFlightRef.current) await savePromiseRef.current;
    if (!dirtyRef.current) return;
    await performSaveRef.current();
    while (inFlightRef.current) await savePromiseRef.current;
  }, []);

  /** Leaving Write saves right away, so Review/Submit always act on a stored testimony. */
  const goToStep = useCallback(
    (next: TestimonyStep) => {
      setStep(next);
      void flushSave();
    },
    [flushSave],
  );

  const handleSelectTestimony = useCallback(
    async (testimonyId: string) => {
      setSwitching(true);
      try {
        await flushSave();
        if (dirtyRef.current) return; // save failed — stay put rather than drop edits
        const next = testimoniesRef.current.find((t) => t.id === testimonyId);
        if (!next) return;
        hydrate(next);
        router.replace(hrefFor(testimonyId));
      } finally {
        setSwitching(false);
      }
    },
    [flushSave, hydrate, hrefFor, router],
  );

  // Starts a testimony for the bill's current hearing round, copied from the newest one.
  const handleCreateTestimony = useCallback(async () => {
    if (!billId) return;
    setSwitching(true);
    try {
      await flushSave();
      if (dirtyRef.current) return;
      const created = await data.testimony.create({
        billId,
        tenantId: activeTenant?.tenantId ?? null,
        copyFromId: testimoniesRef.current[0]?.id ?? null,
      });
      upsertLocal(created);
      hydrate(created);
      router.replace(hrefFor(created.id));
      invalidateTestimonies();
    } catch {
      toast({ title: 'Error', description: 'Could not start a new testimony.', variant: 'destructive' });
    } finally {
      setSwitching(false);
    }
  }, [billId, activeTenant?.tenantId, flushSave, upsertLocal, hydrate, hrefFor, router]);

  // On unmount (e.g. the Back button), flush any pending edits immediately instead
  // of dropping the debounce — the request keeps running after navigation.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void performSaveRef.current();
    },
    [],
  );

  // Warn on hard unload (tab close / refresh) while edits are unsaved or a save is
  // still in flight — the browser can't be forced to wait, but it can ask.
  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlightRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);

  const handleFormChange = (next: TestimonyHeaderValue) => {
    setForm(next);
    formRef.current = next;
    scheduleSave();
  };

  const handleContentChange = (json: unknown) => {
    setContentJson(json);
    contentRef.current = json;
    scheduleSave();
  };

  // An empty testimony can't move on to Review (or be skipped past via the stepper).
  const hasText = useMemo(() => tiptapHasText(contentJson), [contentJson]);

  // The tour walks the Write step, so replaying it from Review/Submit returns there first.
  const startTour = useCallback(() => setStep(1), []);
  const walkthrough = useMemo(
    () => testimonyWalkthrough({ billNumber: bill?.bill_number ?? '' }),
    [bill?.bill_number],
  );

  if (authLoading || (user && loading)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading testimony writer...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center">
          <Lock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h1 className="mb-1 text-lg font-semibold">Login to write testimony</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Testimony drafts are saved to your account so you can come back to them.
          </p>
          <Button asChild>
            <Link href="/">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!bill) return null;

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : '';

  const currentRound = currentTestimonyRound({
    billNumber: bill.bill_number,
    billStatus: bill.current_bill_status,
    currentCommittee: bill.current_committee ?? null,
    committeeAssignment: bill.committee_assignment,
    updates: bill.updates,
    dead: bill.dead,
  });
  // Offer a new testimony only once one exists and none covers the bill's current round.
  const newRoundLabel =
    activeId && !bill.dead && !testimonies.some((t) => sameRound(t, currentRound)) ? roundLabel(currentRound) : null;
  const roundSwitcher = activeId ? (
    <TestimonyRoundSwitcher
      testimonies={testimonies}
      activeId={activeId}
      newRoundLabel={newRoundLabel}
      onSelect={(id) => void handleSelectTestimony(id)}
      onCreate={() => void handleCreateTestimony()}
      disabled={switching}
    />
  ) : null;

  const referencePanel = <BillReferencePanel bill={bill} />;
  const stepper = <TestimonyStepper step={step} onStepChange={goToStep} maxStep={hasText ? 3 : 1} />;
  const nextRow = (
    <div className="flex items-center justify-end gap-3">
      {!hasText && <p className="text-xs text-muted-foreground">Write your testimony to continue.</p>}
      <Button onClick={() => goToStep(2)} disabled={!hasText} data-flow-tour="next">
        Next: Review
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  );

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
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold">Testimony — {bill.bill_number}</h1>
              {!isMobile && roundSwitcher}
            </div>
            <p className="truncate text-xs text-muted-foreground">{bill.bill_title}</p>
            {isMobile && roundSwitcher && <div className="mt-1">{roundSwitcher}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
            {saveLabel}
          </span>
          <FlowWalkthrough walkthrough={walkthrough} storageKey={TESTIMONY_WALKTHROUGH_KEY} onStart={startTour} />
          {!isMobile && <div data-flow-tour="stepper">{stepper}</div>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Reference panel — sidebar on desktop, sheet on mobile */}
        {!isMobile && (
          <aside className="w-[340px] shrink-0 border-r bg-muted/20" data-flow-tour="reference">{referencePanel}</aside>
        )}

        <main
          className="min-w-0 flex-1 overflow-y-auto"
          onFocus={(e) => setTyping(isTextEntry(e.target))}
          onBlur={() => setTyping(false)}
        >
          {/* On phones, room at the bottom for the fixed stepper bar. */}
          {/* Bottom padding follows isMobile alone (not sm:), which runs past the sm breakpoint. */}
          <div className={['mx-auto max-w-3xl space-y-4 px-4 pt-4 sm:px-6 sm:pt-6', isMobile ? 'pb-20' : 'pb-4 sm:pb-6'].join(' ')}>

            {step === 1 && (
              <>
                <div data-flow-tour="details">
                  <TestimonyHeaderForm value={form} onChange={handleFormChange} />
                </div>
                {/* Phones: Next sits above the editor so it isn't buried under the keyboard. */}
                {isMobile && nextRow}
                <div data-flow-tour="editor">
                  {/* Remounts when switching rounds so the editor shows that round's body. */}
                  <TestimonyEditor key={editorKey} initialContent={contentJson} onChange={handleContentChange} />
                </div>
                {!isMobile && nextRow}
              </>
            )}

            {step === 2 && (
              <TestimonyExportStep
                bill={bill}
                form={form}
                contentJson={contentJson}
                onBack={() => setStep(1)}
                onNext={() => goToStep(3)}
              />
            )}

            {step === 3 && (
              <TestimonySubmitGuide
                bill={bill}
                testimonyId={activeId}
                submitted={submitted}
                onMarkSubmitted={() => {
                  setSubmitted(true);
                  setTestimonies((prev) =>
                    prev.map((t) => (t.id === activeId ? { ...t, submittedAt: new Date().toISOString() } : t)),
                  );
                }}
                onBack={() => setStep(2)}
                doneHref={backHref}
              />
            )}
          </div>
        </main>
      </div>

      {/* Phones: the step progress lives in a bar at the bottom, with Bill info floating above it.
          Both step aside while typing, so they don't sit on top of the keyboard. */}
      {isMobile && !typing && (
        <>
          <nav
            className="fixed inset-x-0 bottom-0 z-30 flex justify-center border-t bg-background px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            data-flow-tour="stepper"
          >
            {stepper}
          </nav>
          <BillInfoFab panel={referencePanel} className="bottom-[4.25rem]" />
        </>
      )}
    </div>
  );
}
