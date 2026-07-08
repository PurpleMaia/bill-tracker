'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BillDetails } from '@/types/legislation';
import type { TestimonyPosition } from '@/types/testimony';
import { getBillDetails } from '@/db/queries/bills-read';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { invalidateTestimonies } from '@/hooks/use-testimonies';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { TestimonyStepper, type TestimonyStep } from '@/components/testimony/testimony-stepper';
import { TestimonyReferencePanel } from '@/components/testimony/testimony-reference-panel';
import { TestimonyHeaderForm, type TestimonyHeaderValue } from '@/components/testimony/testimony-header-form';
import { TestimonyEditor } from '@/components/testimony/testimony-editor';
import { TestimonyExportStep } from '@/components/testimony/testimony-export-step';
import { TestimonySubmitGuide } from '@/components/testimony/testimony-submit-guide';
import { ArrowLeft, ArrowRight, Info, Loader2, Lock } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export default function TestimonyPage() {
  const { id: billId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, activeTenant, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();

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
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const hydrated = useRef(false); // true once bill + draft are loaded (enables autosave)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  const contentRef = useRef(contentJson);
  const dirtyRef = useRef(false); // edits not yet persisted
  const inFlightRef = useRef(false); // a saveDraft request is running

  // Load bill + draft together.
  useEffect(() => {
    if (!billId || authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const [details, draft] = await Promise.all([
          getBillDetails(billId),
          data.testimony.getDraft(billId),
        ]);
        if (cancelled) return;
        details.updates = [...(details.updates ?? [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setBill(details);
        if (draft) {
          const nextForm: TestimonyHeaderValue = {
            authorName: draft.authorName,
            organization: draft.organization,
            position: draft.position,
          };
          const hasContent =
            draft.contentJson && typeof draft.contentJson === 'object' &&
            Array.isArray((draft.contentJson as { content?: unknown[] }).content);
          const nextContent = hasContent ? draft.contentJson : EMPTY_DOC;
          setForm(nextForm);
          setContentJson(nextContent);
          setSubmitted(draft.submittedAt !== null);
          formRef.current = nextForm;
          contentRef.current = nextContent;
        } else {
          const nextForm: TestimonyHeaderValue = { ...formRef.current, authorName: user.username || '' };
          setForm(nextForm);
          formRef.current = nextForm;
        }
        hydrated.current = true;
      } catch {
        if (!cancelled) {
          toast({ title: 'Error', description: 'Failed to load this bill.', variant: 'destructive' });
          router.replace('/');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billId, authLoading, user, router]);

  // Serialized save: only one saveDraft request runs at a time, so slow responses
  // can never complete out of order and overwrite newer content. Edits that arrive
  // while a request is in flight set dirtyRef and trigger a follow-up save.
  // Reads formRef/contentRef inside the callback so it always sees the latest values,
  // avoiding stale-closure data loss when both halves change within the debounce window.
  const performSave = useCallback(async () => {
    if (!billId || inFlightRef.current || !dirtyRef.current) return;
    inFlightRef.current = true;
    dirtyRef.current = false;
    const f = formRef.current;
    const c = contentRef.current;
    try {
      await data.testimony.saveDraft({
        billId,
        tenantId: activeTenant?.tenantId ?? null,
        authorName: f.authorName,
        organization: f.organization,
        position: f.position,
        contentJson: c,
      });
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
  }, [billId, activeTenant?.tenantId]);

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
          <h1 className="mb-1 text-lg font-semibold">Sign in to write testimony</h1>
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

  const referencePanel = <TestimonyReferencePanel bill={bill} />;

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Testimony — {bill.bill_number}</h1>
            <p className="truncate text-xs text-muted-foreground">{bill.bill_title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
            {saveLabel}
          </span>
          <TestimonyStepper step={step} onStepChange={setStep} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Reference panel — sidebar on desktop, sheet on mobile */}
        {!isMobile && (
          <aside className="w-[340px] shrink-0 border-r bg-muted/20">{referencePanel}</aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
            {isMobile && (
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

            {step === 1 && (
              <>
                <TestimonyHeaderForm value={form} onChange={handleFormChange} />
                <TestimonyEditor initialContent={contentJson} onChange={handleContentChange} />
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)}>
                    Next: Review
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <TestimonyExportStep
                bill={bill}
                form={form}
                contentJson={contentJson}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}

            {step === 3 && (
              <TestimonySubmitGuide
                bill={bill}
                submitted={submitted}
                onMarkSubmitted={() => setSubmitted(true)}
                onBack={() => setStep(2)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
