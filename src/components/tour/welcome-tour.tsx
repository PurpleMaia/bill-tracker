'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/core/utils';
import { StepVideo } from './step-video';
import {
  TOUR_START_EVENT,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  shouldAutoStartTour,
} from '@/lib/tour/welcome-tour';

const CARD_WIDTH = 320;
const GUTTER = 12;
const SPOT_PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== null;
  } catch {
    // Storage blocked: treat as seen so we never nag on every page load.
    return true;
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, 'done');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

/**
 * The same nav destination renders twice (header on desktop, bottom bar on
 * mobile) and one copy is display:none, so pick whichever is actually visible.
 */
function findVisibleTarget(href: string): Rect | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="nav-${href}"]`);
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }
  }
  return null;
}

/**
 * First-visit tour: dims the page and spotlights each main navigation tab in
 * turn. Auto-starts once on the landing pages; replayable via TOUR_START_EVENT.
 */
export function WelcomeTour() {
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const open = step !== null;
  const current = step !== null ? TOUR_STEPS[step] : null;

  const close = useCallback(() => {
    markTourSeen();
    setStep(null);
    setTarget(null);
  }, []);

  // Auto-start for first-time visitors on the landing pages. Delayed a beat so
  // the header has laid out before we measure it.
  useEffect(() => {
    if (!shouldAutoStartTour(pathname, hasSeenTour())) return;
    const t = window.setTimeout(() => setStep(0), 600);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // Replay from anywhere (e.g. the Guide page's button).
  useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, []);

  // Measure the spotlight target, and keep it fresh on resize/scroll.
  useLayoutEffect(() => {
    if (!current?.target) {
      setTarget(null);
      return;
    }
    const measure = () => setTarget(findVisibleTarget(current.target!));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [current]);

  // Move focus to the primary action on each step; Escape skips; Tab stays inside.
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>('button');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, step, close]);

  if (step === null || !current) return null;

  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  // Card placement: next to the spotlight (below it for the header, above it
  // for the mobile bottom bar), clamped to the viewport. No target = centered.
  let cardStyle: React.CSSProperties;
  if (target) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - GUTTER * 2);
    const centerX = target.left + target.width / 2;
    const left = Math.max(GUTTER, Math.min(centerX - width / 2, vw - width - GUTTER));
    const below = target.top + target.height / 2 < vh / 2;
    cardStyle = below
      ? { top: target.top + target.height + SPOT_PAD + GUTTER, left, width }
      : { bottom: vh - target.top + SPOT_PAD + GUTTER, left, width };
  } else {
    cardStyle = {
      top: '50%',
      left: '50%',
      width: Math.min(CARD_WIDTH + 40, window.innerWidth - GUTTER * 2),
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* Click shield: blocks the page behind the tour without dismissing it. */}
      <div className={cn('absolute inset-0', !target && 'bg-black/55')} />

      {target && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-white"
          style={{
            top: target.top - SPOT_PAD,
            left: target.left - SPOT_PAD,
            width: target.width + SPOT_PAD * 2,
            height: target.height + SPOT_PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        aria-describedby="welcome-tour-body"
        className="absolute rounded-lg border bg-background p-4 text-foreground shadow-xl"
        style={cardStyle}
      >
        {current.target && (
          <StepVideo key={current.id} name={current.id} label={`${current.title} demo`} className="mb-3" />
        )}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isFirst ? 'Quick tour' : `${step} of ${TOUR_STEPS.length - 1}`}
        </p>
        <h2 id="welcome-tour-title" className="mt-1 text-lg font-semibold">
          {current.title}
        </h2>
        <p id="welcome-tour-body" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground">
            {isLast ? 'Close' : 'Skip tour'}
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button
              ref={nextRef}
              size="sm"
              onClick={() => (isLast ? close() : setStep(step + 1))}
            >
              {isFirst ? 'Start tour' : isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
