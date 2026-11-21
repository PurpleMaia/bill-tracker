'use client';

import { useState } from 'react';
import { cn } from '@/lib/core/utils';

/** Rough length past which a 4-line clamp would actually cut text on a phone. */
const CLAMP_THRESHOLD = 220;

/**
 * "What this bill does" — the plain-language hook that sits ABOVE the
 * procedural briefing, so someone deciding whether to track a bill first
 * learns what it is about. Clamped to four lines on phones (with Read more)
 * so the rest of the overview stays in view; full text from sm: up.
 */
export function BillDescription({ text }: { text: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const long = text.length > CLAMP_THRESHOLD;

  return (
    <section aria-labelledby="bill-description-heading">
      <h3
        id="bill-description-heading"
        className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-primary"
      >
        What this bill does
      </h3>
      <p className={cn('text-[15px] leading-relaxed sm:text-sm', long && !expanded && 'line-clamp-4 sm:line-clamp-none')}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-sm font-medium text-primary hover:underline sm:hidden"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </section>
  );
}
