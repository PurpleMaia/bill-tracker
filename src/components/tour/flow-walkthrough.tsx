'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { Walkthrough, WalkthroughStep } from '@/lib/tour/flow-walkthroughs';
import { placeCard, type Box } from '@/lib/tour/place-card';
import { cn } from '@/lib/core/utils';
import { Button } from '@/components/ui/button';
import { ArrowRight, CircleHelp, Megaphone, TriangleAlert } from 'lucide-react';

const SPOT_PAD = 6;
const CARD_WIDTH = 360;

function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Storage blocked: treat as seen so we never nag on every page load.
    return true;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, 'done');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

/** First element for a target that is actually rendered (some exist twice, e.g. desktop sidebar and mobile button). */
function findTarget(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-flow-tour="${target}"]`);
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

/** The tour's cards: a centered intro, one per on-screen step, a centered outro. */
type Card = { kind: 'intro' } | { kind: 'step'; step: WalkthroughStep } | { kind: 'outro' };

interface FlowWalkthroughProps {
  walkthrough: Walkthrough;
  /** localStorage flag; the tour auto-starts until it's set. */
  storageKey: string;
  /**
   * Whether the page is in a state the tour describes. The tour only auto-starts
   * (and only gets marked seen) when true, so an empty state doesn't use it up.
   */
  autoStart?: boolean;
  /** Called before the tour starts, e.g. to return to the step the tour walks through. */
  onStart?: () => void;
}

/**
 * "How this works" for an action flow: a header button that runs a spotlight
 * tour over the real page — like the welcome tour. It leads with what the
 * Hawaiʻi Bill Tracker can't do for the user, then says what each part of the
 * page does. Starts on its own the first time someone reaches the flow.
 */
export function FlowWalkthrough({ walkthrough, storageKey, autoStart = true, onStart }: FlowWalkthroughProps) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const start = useCallback(() => {
    onStart?.();
    setIndex(0);
    setCards([{ kind: 'intro' }]);
    setOpen(true);
  }, [onStart]);

  const close = useCallback(() => {
    markSeen(storageKey);
    setOpen(false);
    setBox(null);
  }, [storageKey]);

  // Auto-start once, after a beat so the page has laid out before we measure it.
  useEffect(() => {
    if (!autoStart || hasSeen(storageKey)) return;
    const t = window.setTimeout(start, 500);
    return () => window.clearTimeout(t);
    // `start` is intentionally omitted: a new onStart identity must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, storageKey]);

  // Once open (and after onStart's re-render), keep only the steps whose target is on screen.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setCards([
        { kind: 'intro' },
        ...walkthrough.steps.filter((s) => findTarget(s.target) !== null).map((step) => ({ kind: 'step' as const, step })),
        { kind: 'outro' },
      ]);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, walkthrough]);

  const current = cards[Math.min(index, cards.length - 1)];
  const target = current?.kind === 'step' ? current.step.target : null;
  const stepCount = cards.filter((c) => c.kind === 'step').length;
  const isFirst = index === 0;
  const isLast = index === cards.length - 1;

  // Track the viewport while open — the centered intro/outro cards have no target
  // to measure from, and they must still fit narrow phones.
  useEffect(() => {
    if (!open) return;
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // Bring the target into view, then follow it every frame (only committing
  // changes): panels scroll independently and content loads in late.
  useLayoutEffect(() => {
    if (!open || !target) {
      setBox(null);
      return;
    }
    findTarget(target)?.scrollIntoView({ block: 'center', inline: 'nearest' });
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = findTarget(target);
      if (el) {
        const r = el.getBoundingClientRect();
        const key = [r.top, r.left, r.width, r.height, window.innerWidth, window.innerHeight].join('|');
        if (key !== last) {
          last = key;
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
          setViewport({ width: window.innerWidth, height: window.innerHeight });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, target]);

  // The card's height changes with its copy; placement needs the real one.
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [current, box]);

  const cardWidth = Math.min(current?.kind === 'step' ? CARD_WIDTH : 520, (viewport.width || CARD_WIDTH + 24) - 24);
  const cardPos = useMemo(() => {
    if (!box || viewport.width === 0) return null;
    return placeCard(
      { top: box.top - SPOT_PAD, left: box.left - SPOT_PAD, width: box.width + SPOT_PAD * 2, height: box.height + SPOT_PAD * 2 },
      { width: cardWidth, height: cardHeight },
      viewport,
    );
  }, [box, viewport, cardWidth, cardHeight]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(cards.length - 1, next)));
  const centered = current?.kind !== 'step';

  return (
    <>
      <Button size="sm" className="h-8 px-2.5" onClick={start} data-flow-tour="help">
        <CircleHelp className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">How this works</span>
      </Button>

      {open && current && (
        <DialogPrimitive.Root open onOpenChange={(next) => !next && close()}>
          <DialogPrimitive.Portal>
            {/* Blocks the page without dismissing the tour; dims it when nothing is spotlighted. */}
            <DialogPrimitive.Overlay className={cn('fixed inset-0 z-[70]', centered && 'bg-black/55')} />

            {box && !centered && (
              <div
                aria-hidden
                className="pointer-events-none fixed z-[70] rounded-lg ring-2 ring-white transition-all duration-200 motion-reduce:transition-none"
                style={{
                  top: box.top - SPOT_PAD,
                  left: box.left - SPOT_PAD,
                  width: box.width + SPOT_PAD * 2,
                  height: box.height + SPOT_PAD * 2,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                }}
              />
            )}

            <DialogPrimitive.Content
              ref={cardRef}
              onPointerDownOutside={(e) => e.preventDefault()}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                cardRef.current?.querySelector<HTMLElement>('[data-tour-next]')?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') go(index + 1);
                else if (e.key === 'ArrowLeft') go(index - 1);
              }}
              className={cn(
                'fixed z-[71] max-h-[90dvh] overflow-y-auto rounded-lg border bg-background p-4 text-foreground shadow-xl outline-none',
                !centered && !cardPos && 'invisible',
              )}
              style={
                centered
                  ? {
                      width: cardWidth,
                      maxWidth: 'calc(100vw - 24px)',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }
                  : { width: cardWidth, top: cardPos?.top ?? 0, left: cardPos?.left ?? 0 }
              }
            >
              {current.kind === 'intro' && (
                <>
                  {/* The limitation is on the first card, so even someone who skips the tour reads it. */}
                  {walkthrough.caveatFirst && <CaveatBox caveat={walkthrough.caveat} className="mb-4" />}
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How this works</p>
                  <DialogPrimitive.Title className="mt-1 text-lg font-semibold">{walkthrough.title}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {walkthrough.goal}
                  </DialogPrimitive.Description>
                  {walkthrough.emphasis && (
                    <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
                      <Megaphone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <p className="text-sm font-semibold">{walkthrough.emphasis}</p>
                    </div>
                  )}
                  {!walkthrough.caveatFirst && <CaveatBox caveat={walkthrough.caveat} className="mt-3" />}
                </>
              )}

              {current.kind === 'step' && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {index} of {stepCount}
                  </p>
                  <DialogPrimitive.Title className="mt-1 text-base font-semibold">{current.step.title}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {current.step.body}
                  </DialogPrimitive.Description>
                </>
              )}

              {current.kind === 'outro' && (
                <>
                  <div className="flex gap-3">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <DialogPrimitive.Title className="text-sm font-semibold">What happens next</DialogPrimitive.Title>
                      <DialogPrimitive.Description className="text-sm text-muted-foreground">
                        {walkthrough.next}
                      </DialogPrimitive.Description>
                    </div>
                  </div>
                </>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground">
                  {isLast ? 'Close' : 'Skip tour'}
                </Button>
                <div className="flex gap-2">
                  {!isFirst && (
                    <Button variant="outline" size="sm" onClick={() => go(index - 1)}>
                      Back
                    </Button>
                  )}
                  <Button data-tour-next size="sm" onClick={() => (isLast ? close() : go(index + 1))}>
                    {isFirst ? 'Start tour' : isLast ? 'Got it' : 'Next'}
                  </Button>
                </div>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  );
}

function CaveatBox({ caveat, className }: { caveat: Walkthrough['caveat']; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">{caveat.title}</p>
        <p className="text-sm text-muted-foreground">{caveat.body}</p>
      </div>
    </div>
  );
}
