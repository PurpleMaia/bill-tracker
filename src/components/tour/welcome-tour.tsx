'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useTrack } from '@/hooks/use-track';
import { cn } from '@/lib/core/utils';
import { StepVideo } from './step-video';
import {
  TOUR_END_EVENT,
  TOUR_OPEN_EVENT,
  TOUR_START_EVENT,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  MENU_TOUR_TARGET,
  SUBNAV_TOUR_TARGET,
  hasSeenTour,
  mobileNavHint,
  shouldAutoStartTour,
  tourStepPath,
} from '@/lib/tour/welcome-tour';

const GUTTER = 12;
const SPOT_PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Card width per viewport, sized so the 16:9 screen recordings stay legible:
 * full-bleed on phones, then stepping up for tablets, laptops, and big screens.
 */
function cardWidth(vw: number): number {
  const width = vw >= 1536 ? 720 : vw >= 1024 ? 560 : vw >= 640 ? 480 : vw;
  return Math.min(width, vw - GUTTER * 2);
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, 'done');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

function visibleRect(selector: string): Rect | null {
  for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }
  }
  return null;
}

/**
 * The header sub-nav tabs, when the page has any on screen. The slot itself is
 * always in the header (padded, even when empty), so measure what's inside it.
 */
function findSubnav(): Rect | null {
  const slot = document.querySelector<HTMLElement>(`[data-tour="${SUBNAV_TOUR_TARGET}"]`);
  if (!slot) return null;
  for (const child of Array.from(slot.children)) {
    const r = child.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }
  }
  return null;
}

/** Returns `prev` when `next` has the same geometry, so React skips the re-render. */
function sameRect(prev: Rect | null, next: Rect | null): Rect | null {
  if (prev && next &&
      prev.top === next.top && prev.left === next.left &&
      prev.width === next.width && prev.height === next.height) {
    return prev;
  }
  return next;
}

/** Smallest rect covering both, for placing the card clear of every spotlight. */
function union(a: Rect, b: Rect | null): Rect {
  if (!b) return a;
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  return {
    top,
    left,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

/** Whether the nav links are tucked in the hamburger drawer (phones). */
function navIsInMenu(): boolean {
  return visibleRect(`[data-tour="${MENU_TOUR_TARGET}"]`) !== null;
}

/**
 * The nav link for `href` in the desktop header. On phones the links sit in
 * the closed hamburger drawer, so spotlight the hamburger button instead.
 */
function findVisibleTarget(href: string): Rect | null {
  return visibleRect(`[data-tour="nav-${href}"]`) ?? visibleRect(`[data-tour="${MENU_TOUR_TARGET}"]`);
}

/**
 * First-visit tour: dims the page and spotlights each main navigation tab in
 * turn, navigating to that tab's page so the feature shows behind the card.
 * Auto-starts once on the landing pages; replayable via TOUR_START_EVENT.
 */
export function WelcomeTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  // Phones: nav lives in the hamburger drawer, so each step says how to get there.
  const [inMenu, setInMenu] = useState(false);
  // The page's sub-nav tabs, spotlighted alongside the nav item when present.
  const [subnav, setSubnav] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Whether this run of the tour has navigated yet (see the navigation effect).
  const navigatedRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const track = useTrack();

  const open = step !== null;

  // Announce every opening, auto-started or replayed, so the interest picker
  // stays out of the way for the whole tour, even after it leaves the landing page.
  useEffect(() => {
    if (open) window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
  }, [open]);
  const current = step !== null ? TOUR_STEPS[step] : null;

  const close = useCallback((completed: boolean) => {
    track('tour_finished', { completed });
    markTourSeen();
    navigatedRef.current = false;
    setStep(null);
    setTarget(null);
    window.dispatchEvent(new Event(TOUR_END_EVENT));
  }, [track]);

  // Auto-start for first-time visitors on the landing pages. Delayed a beat so
  // the header has laid out before we measure it.
  useEffect(() => {
    if (!shouldAutoStartTour(pathname, hasSeenTour())) return;
    // Functional update: the tour itself navigates back to /find-bills on "Back",
    // which must not restart a tour that's already running.
    const t = window.setTimeout(() => setStep((s) => s ?? 0), 600);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // Replay from anywhere (e.g. the Guide page's button).
  useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, []);

  // Walk the user to the page each step describes. The tour is mounted in the
  // main layout, so it survives the navigation. Push once to leave the starting
  // page, then replace, so after the tour the browser's Back returns to where
  // the user started instead of replaying every tour page.
  useEffect(() => {
    if (!current) return;
    const path = tourStepPath(current, pathname);
    if (!path) return;
    if (navigatedRef.current) {
      router.replace(path);
    } else {
      navigatedRef.current = true;
      router.push(path);
    }
  }, [current, pathname, router]);

  // Measure the spotlight target, and keep it fresh on resize/scroll. Re-run on
  // navigation too, since the new page can shift layout.
  useLayoutEffect(() => {
    if (!current) return;
    const measure = () => {
      setInMenu(navIsInMenu());
      setTarget((prev) => sameRect(prev, current.target ? findVisibleTarget(current.target) : null));
      setSubnav((prev) => sameRect(prev, current.subnav ? findSubnav() : null));
    };
    measure();
    // The sub-nav renders only after the step's page has loaded (a cold dev
    // compile can take many seconds) and auth has resolved, and layout can
    // shift as data arrives — so keep re-measuring for as long as the step is
    // open. sameRect keeps state stable when nothing moved, so this is cheap.
    const poll = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [current, pathname]);

  // Move focus to the primary action on each step; Escape skips; Tab stays inside.
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(false);
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
  // for a target in the lower half), clamped to the viewport. No target = centered.
  // maxHeight is the space actually left on that side, so on short viewports
  // the card scrolls internally instead of running off-screen.
  let cardStyle: React.CSSProperties;
  const vh = window.innerHeight;
  // Every spotlit element: the nav item (or hamburger) plus the sub-nav tabs.
  const holes = target ? [target, ...(subnav ? [subnav] : [])] : [];
  const anchor = target ? union(target, subnav) : null;
  if (anchor) {
    const vw = window.innerWidth;
    const width = cardWidth(vw);
    const centerX = anchor.left + anchor.width / 2;
    const left = Math.max(GUTTER, Math.min(centerX - width / 2, vw - width - GUTTER));
    const below = anchor.top + anchor.height / 2 < vh / 2;
    if (below) {
      const top = anchor.top + anchor.height + SPOT_PAD + GUTTER;
      cardStyle = { top, left, width, maxHeight: vh - top - GUTTER };
    } else {
      const bottom = vh - anchor.top + SPOT_PAD + GUTTER;
      cardStyle = { bottom, left, width, maxHeight: vh - bottom - GUTTER };
    }
  } else {
    cardStyle = {
      top: '50%',
      left: '50%',
      width: cardWidth(window.innerWidth),
      maxHeight: vh - GUTTER * 2,
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div className="fixed inset-0 z-tour" role="presentation">
      {/* Click shield: blocks the page behind the tour without dismissing it. */}
      <div className={cn('absolute inset-0', holes.length === 0 && 'bg-black/55')} />

      {/* Dim everything except the spotlit elements: one SVG mask with a hole
          per element (a box-shadow per hole would dim the other holes). */}
      {holes.length > 0 && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <mask id="welcome-tour-holes">
              <rect width="100%" height="100%" fill="white" />
              {holes.map((h, i) => (
                <rect
                  key={i}
                  x={h.left - SPOT_PAD}
                  y={h.top - SPOT_PAD}
                  width={h.width + SPOT_PAD * 2}
                  height={h.height + SPOT_PAD * 2}
                  rx={8}
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" mask="url(#welcome-tour-holes)" />
        </svg>
      )}
      {holes.map((h, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-white"
          style={{
            top: h.top - SPOT_PAD,
            left: h.left - SPOT_PAD,
            width: h.width + SPOT_PAD * 2,
            height: h.height + SPOT_PAD * 2,
          }}
        />
      ))}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        aria-describedby="welcome-tour-body"
        className="absolute overflow-y-auto rounded-lg border bg-background p-4 text-foreground shadow-xl"
        style={cardStyle}
      >
        {current.target && (
          <StepVideo
            key={current.id}
            name={current.id}
            label={`${current.title} demo`}
            // Cap the height so the card's text and buttons stay on screen on
            // short or landscape viewports; object-contain keeps the whole frame.
            className="mb-3 max-h-[45dvh] object-contain"
          />
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
        {subnav && current.subnav && (
          <p className="mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-sm font-medium text-primary">
            {current.subnav}
          </p>
        )}
        {inMenu && (
          <p className="mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-sm font-medium text-primary">
            {mobileNavHint(current)}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => close(isLast)} className="text-muted-foreground">
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
              onClick={() => (isLast ? close(true) : setStep(step + 1))}
            >
              {isFirst ? 'Start tour' : isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
