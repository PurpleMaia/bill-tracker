'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ScrollToTopButtonProps {
  /**
   * The element that scrolls. Omit to use the nearest scrolling ancestor of
   * where this button is rendered.
   */
  scrollRef?: React.RefObject<HTMLElement | null>;
  /** Accessible name, e.g. "Scroll back to search". */
  label: string;
  /** Scroll distance (px) past which the button appears. */
  threshold?: number;
}

/** Nearest ancestor whose overflow-y lets it scroll. */
function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Floating "back to top" button for long scrolling pages. Appears once the
 * page has scrolled past `threshold`. `fixed`, so it pins to the viewport's
 * bottom-right corner; on phones it lifts above the bottom tab bar (fixed at
 * bottom-0, z-chrome) and stays under it in stacking order (z-floating).
 */
export function ScrollToTopButton({ scrollRef, label, threshold = 400 }: ScrollToTopButtonProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setTarget(scrollRef?.current ?? findScrollParent(anchorRef.current));
  }, [scrollRef]);

  useEffect(() => {
    if (!target) return;
    const onScroll = () => setShow(target.scrollTop > threshold);
    target.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener('scroll', onScroll);
  }, [target, threshold]);

  return (
    <>
      {/* Locates the scroll container when no scrollRef is given. */}
      <span ref={anchorRef} aria-hidden="true" className="hidden" />
      {show && (
        <Button
          size="icon"
          variant="secondary"
          onClick={() => target?.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={label}
          // Light teal to match the Bill info helper; see BillInfoFab.
          className="fixed bottom-20 right-4 z-floating h-11 w-11 rounded-full border border-primary/20 shadow-lg hover:bg-secondary hover:brightness-95 md:bottom-6 md:right-6"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}
    </>
  );
}
