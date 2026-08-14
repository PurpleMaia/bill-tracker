'use client';

import * as React from 'react';
import Link from 'next/link';
import { Info, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { GLOSSARY, type GlossaryTerm, type TermSlug } from '@/lib/glossary/terms';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * True only on devices with a real hovering pointer.
 *
 * MUST start false: there is no matchMedia during SSR, and starting true would
 * give every touch user a hover-only affordance on first paint plus a hydration
 * flip. Starting false costs a desktop user one tick of click-to-open.
 *
 * Queries the pointer, not the user agent, so iPads with keyboards, touchscreen
 * laptops, and desktop-mode phones all resolve correctly.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return fine;
}

type TermVariant = 'prose' | 'chip' | 'icon' | 'help';

interface TermProps {
  /** Static term. Mutually exclusive with `term`. */
  slug?: TermSlug;
  /** Resolved dynamic term (from @/lib/glossary/resolvers). null = no definition. */
  term?: GlossaryTerm | null;
  /** prose: dotted underline. chip: no marker, inherits the chip's own border.
   *  icon: a standalone ⓘ, for use beside a link.
   *  help: a standalone "?", for explaining a labelled value in place. */
  variant?: TermVariant;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Carried into /learn as ?bill= so the walkthrough can mark "you are here". */
  billId?: string;
  className?: string;
  children?: React.ReactNode;
}

const TRIGGER_BASE =
  'inline text-left align-baseline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm';

const VARIANT_CLASS: Record<TermVariant, string> = {
  // Muted dotted underline, inheriting color: reads as a footnote, not a link.
  prose: 'underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 cursor-help',
  // No marker of its own — the chip's existing border/background is the affordance.
  chip: 'cursor-help',
  icon: 'cursor-help text-muted-foreground hover:text-foreground align-middle',
  help: 'cursor-help opacity-70 hover:opacity-100 align-middle transition-opacity',
};

/**
 * An explainable piece of legislative jargon.
 *
 * Renders a hover tooltip on fine-pointer devices and a tap-popover otherwise,
 * because a hover-only affordance is invisible to touch users — a large share
 * of this app's audience.
 *
 * When the term has no definition (an unrecognized version label, an unknown
 * committee code) this renders its children as plain text with no affordance.
 * Never show a marker that opens an empty card.
 */
export function Term({
  slug,
  term,
  variant = 'prose',
  side = 'bottom',
  billId,
  className,
  children,
}: TermProps) {
  const finePointer = useFinePointer();
  const resolved: GlossaryTerm | null = slug ? GLOSSARY[slug] : (term ?? null);

  if (!resolved) return <>{children}</>;

  const learnMoreHref = resolved.learnMoreAnchor
    ? `/learn${billId ? `?bill=${encodeURIComponent(billId)}` : ''}#${resolved.learnMoreAnchor}`
    : null;

  // stopPropagation: almost every term sits inside a tappable parent (kanban
  // card -> opens the bill dialog, spreadsheet row, version link). Without this
  // a tap on the term also fires the parent.
  //
  // onKeyDown matters as much as the pointer handlers: Enter/Space on a focused
  // trigger bubbles as keydown to the parent's keyboard handler BEFORE the
  // synthesized click is stopped, so the parent would open the bill dialog.
  const trigger = (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.stopPropagation();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.stopPropagation();
        }
      }}
      aria-label={`What does "${resolved.term}" mean?`}
      className={cn(TRIGGER_BASE, VARIANT_CLASS[variant], className)}
    >
      {variant === 'icon' ? (
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      ) : variant === 'help' ? (
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        children
      )}
    </button>
  );

  const body = (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">{resolved.term}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{resolved.short}</p>
      {learnMoreHref && (
        <Link
          href={learnMoreHref}
          onClick={(e) => e.stopPropagation()}
          className="inline-block text-xs font-medium underline underline-offset-2 hover:no-underline"
        >
          Learn more
        </Link>
      )}
    </div>
  );

  // max-w fits a 375px viewport; collisionPadding keeps the card on screen
  // rather than letting it hang off the edge. w-auto overrides PopoverContent's
  // default w-72, which is wider than we want for a definition.
  const contentClass = 'w-auto max-w-[280px] p-3';

  // A hover tooltip cannot hold interactive content: moving focus toward the
  // link closes and unmounts it, so keyboard users could never reach "Learn
  // more". Any term WITH a link therefore uses popover semantics on every
  // device; link-less terms keep the cheap hover peek on desktop.
  const useTooltip = finePointer && !learnMoreHref;

  if (useTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side={side} collisionPadding={12} className={contentClass}>
          {body}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    // modal: a non-modal popover's outside press dismisses WITHOUT consuming the
    // event, so the tap that closes a definition inside a kanban card would also
    // reach the card and open the bill dialog. Modal renders a dismiss layer that
    // swallows that first outside interaction.
    <Popover modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        collisionPadding={12}
        className={contentClass}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
