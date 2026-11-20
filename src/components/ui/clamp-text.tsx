'use client';

import { useEffect, useLayoutEffect, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/core/utils';

const CLAMP = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' } as const;
const MOBILE_QUERY = '(max-width: 639px)';

interface ClampTextProps {
  /** Element to render — keep the original semantics (p, h2, h3, ...). */
  as?: ElementType;
  /** Lines shown on mobile before clamping. Desktop (sm+) always clamps to 1. */
  lines?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}

/**
 * Text that clamps instead of being cut off for good. Touch screens have no
 * hover, so a `title` tooltip can't reveal truncated text on mobile; instead,
 * on mobile, text that actually overflows becomes a button that expands in
 * place (tap again to collapse). Desktop keeps the one-line look plus the
 * tooltip, and stays non-interactive.
 * Text that fits renders as plain text — no dead button for screen readers.
 *
 * Don't use inside another button or link (nested interactive elements).
 */
export function ClampText({ as: Tag = 'p', lines = 2, className, children }: ClampTextProps) {
  // Callback-ref state: the text node remounts when it moves into/out of the
  // button, and the effect must re-observe the new node.
  const [el, setEl] = useState<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [fullText, setFullText] = useState<string>();
  // Below Tailwind's `sm` — the only width where tap-to-expand applies. On
  // desktop the text stays non-interactive (no extra tab stops) with a tooltip.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => {
      setIsMobile(query.matches);
      if (!query.matches) setExpanded(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    // Measured only while collapsed: expanded text never overflows, and the
    // button must stay so it can collapse again.
    if (!el || expanded) return;
    const measure = () => {
      setOverflowing(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
      setFullText(el.textContent ?? undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, expanded, children]);

  const text = (
    <span
      ref={setEl}
      className={cn('block break-words', expanded ? 'line-clamp-none' : cn(CLAMP[lines], 'sm:line-clamp-1'))}
    >
      {children}
    </span>
  );

  return (
    <Tag className={cn('min-w-0', className)} title={overflowing && !expanded ? fullText : undefined}>
      {isMobile && (overflowing || expanded) ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="block w-full min-w-0 cursor-pointer rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text}
        </button>
      ) : (
        text
      )}
    </Tag>
  );
}
