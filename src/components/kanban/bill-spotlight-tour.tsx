'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/core/utils';
import { placeCard, type Box } from '@/lib/tour/place-card';
import type { SpotlightStep } from '@/lib/bills/bill-spotlight-steps';

const SPOT_PAD = 6;
const CARD_WIDTH = 340;

/** First element for a target that is actually rendered (some exist twice, e.g. desktop and mobile actions). */
function findTarget(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-bill-tour="${target}"]`);
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

interface BillSpotlightTourProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: readonly SpotlightStep[];
  /** Switch to the plain list of explanations instead. */
  onViewList: () => void;
}

/**
 * A guided spotlight over the real bill dialog: the page dims, a cut-out
 * highlights the actual element being explained, and a coach card explains it
 * with this bill's own values.
 *
 * Built as a NESTED Radix dialog so it cooperates with the bill dialog's focus
 * trap and outside-click handling: clicks on this layer never count as "outside"
 * the bill dialog, and Escape closes only the tour.
 */
export function BillSpotlightTour({ open, onOpenChange, steps, onViewList }: BillSpotlightTourProps) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Only walk steps whose target is on screen right now. The updates panel, for
  // one, is a separate tab on phones, and the briefing is absent while loading.
  const [available, setAvailable] = useState<SpotlightStep[]>([]);
  useEffect(() => {
    if (!open) return;
    setAvailable(steps.filter((s) => findTarget(s.target) !== null));
    setIndex(0);
  }, [open, steps]);

  const current = available[Math.min(index, Math.max(0, available.length - 1))];
  const position = current ? available.indexOf(current) : 0;
  const isFirst = position === 0;
  const isLast = position === available.length - 1;

  // Bring the target into view inside its scroll area, then follow it. Position
  // is re-read every frame (only committed when it changes) rather than on
  // resize/scroll events: the bill dialog animates in, its panels scroll
  // independently, and its content loads in late, and any of those would leave
  // a one-shot measurement pointing at the wrong place.
  useLayoutEffect(() => {
    if (!open || !current) return;
    findTarget(current.target)?.scrollIntoView({ block: 'center', inline: 'nearest' });

    let raf = 0;
    let last = '';
    const tick = () => {
      const el = findTarget(current.target);
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
  }, [open, current]);

  // The card's height changes with the step's copy; placement needs the real one.
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [current, box]);

  const cardWidth = Math.min(CARD_WIDTH, Math.max(0, viewport.width - 24));
  const cardPos = useMemo(() => {
    if (!box || viewport.width === 0) return null;
    return placeCard(
      { top: box.top - SPOT_PAD, left: box.left - SPOT_PAD, width: box.width + SPOT_PAD * 2, height: box.height + SPOT_PAD * 2 },
      { width: cardWidth, height: cardHeight },
      viewport
    );
  }, [box, viewport, cardWidth, cardHeight]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(available.length - 1, next)));
  const close = () => onOpenChange(false);

  if (!open || !current) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Transparent: it only blocks clicks. The dimming is the cut-out below. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70]" />

        {box && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-[70] rounded-lg ring-2 ring-white transition-all duration-200 motion-reduce:transition-none"
            style={{
              top: box.top - SPOT_PAD,
              left: box.left - SPOT_PAD,
              width: box.width + SPOT_PAD * 2,
              height: box.height + SPOT_PAD * 2,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            }}
          />
        )}

        <DialogPrimitive.Content
          ref={cardRef}
          onOpenAutoFocus={(e) => {
            // Land on the primary action rather than the first button in the DOM.
            e.preventDefault();
            cardRef.current?.querySelector<HTMLElement>('[data-tour-next]')?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(position + 1);
            else if (e.key === 'ArrowLeft') go(position - 1);
          }}
          className={cn(
            'fixed z-[71] rounded-lg border bg-background p-4 text-foreground shadow-xl outline-none',
            !cardPos && 'invisible'
          )}
          style={{
            width: cardWidth || CARD_WIDTH,
            top: cardPos?.top ?? 0,
            left: cardPos?.left ?? 0,
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {current.label} · {position + 1} of {available.length}
          </p>
          <DialogPrimitive.Title className="sr-only">{current.label}</DialogPrimitive.Title>
          {current.value && (
            <p className="mt-1.5 break-words font-mono text-sm font-semibold leading-snug">
              {current.value}
            </p>
          )}
          <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {current.body}
          </DialogPrimitive.Description>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1" aria-hidden="true">
              {available.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === position ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                  )}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {!isFirst && (
                <Button variant="outline" size="sm" onClick={() => go(position - 1)}>
                  Back
                </Button>
              )}
              <Button data-tour-next size="sm" onClick={() => (isLast ? close() : go(position + 1))}>
                {isLast ? 'Done' : 'Next'}
              </Button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <Button variant="ghost" size="sm" className="-ml-2 h-7 text-xs text-muted-foreground" onClick={close}>
              Skip
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                close();
                onViewList();
              }}
            >
              <ListChecks className="mr-1 h-3.5 w-3.5" />
              View as list
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
