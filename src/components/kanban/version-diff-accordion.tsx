'use client';

import { useMemo, useState } from 'react';
import type { ChangeFragment, SectionDiff, VersionComparison } from '@/lib/versions/version-diff';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './report-summary';
import { AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';

// Hawaii prints bills with deletions struck through and insertions underlined.
// These fragments carry the source document's own marks, so we render the same
// convention. Colour is never the only channel (WCAG 1.4.1): the
// strikethrough/underline is a redundant visual cue and each changed fragment
// also carries a visually-hidden "added"/"removed" label for screen readers.
const FRAGMENT_CLASS: Record<ChangeFragment['kind'], string> = {
  added: 'text-[#2F7A3E] bg-[#E7F4E9] underline decoration-[#2F7A3E]/60',
  removed: 'text-[#B4442F] bg-[#FBEAE6] line-through decoration-[#B4442F]/60',
  modified: 'text-[#8A5A00] bg-[#FBF1DD]',
  unchanged: 'text-foreground/75',
};

const SECTION_BADGE: Record<SectionDiff['kind'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  added: { label: 'added', variant: 'default' },
  removed: { label: 'removed', variant: 'outline' },
  modified: { label: 'modified', variant: 'secondary' },
  unchanged: { label: 'unchanged', variant: 'outline' },
};

const SR_LABEL: Partial<Record<ChangeFragment['kind'], string>> = {
  added: 'added: ',
  removed: 'removed: ',
  modified: 'changed: ',
};

function Fragment({ fragment }: { fragment: ChangeFragment }) {
  const srLabel = SR_LABEL[fragment.kind];
  return (
    <span className={cn('rounded px-0.5', FRAGMENT_CLASS[fragment.kind])}>
      {srLabel && <span className="sr-only">{srLabel}</span>}
      {fragment.text}{' '}
    </span>
  );
}

interface VersionDiffAccordionProps {
  comparison: VersionComparison;
  /** All three required to offer an AI summary; omit to render counts only. */
  billId?: string;
  olderId?: string;
  newerId?: string;
}

type DiffSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: string; model: string }
  | { status: 'error'; message: string };

export function VersionDiffAccordion({ comparison, billId, olderId, newerId }: VersionDiffAccordionProps) {
  const { preferences } = useAuth();
  const aiOptedIn = preferences?.ai_opt_in === true;
  const [aiState, setAiState] = useState<DiffSummaryState>({ status: 'idle' });

  const { changed, unchanged } = useMemo(() => {
    const sections = comparison.sections;
    return {
      changed: sections.filter((s) => s.kind !== 'unchanged'),
      unchanged: sections.filter((s) => s.kind === 'unchanged'),
    };
  }, [comparison.sections]);

  if (comparison.sections.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No differences detected between these versions.
      </p>
    );
  }

  const { totals } = comparison;
  const summaryParts = [
    totals.modified > 0 && `${totals.modified} modified`,
    totals.removed > 0 && `${totals.removed} removed`,
    totals.added > 0 && `${totals.added} added`,
  ].filter(Boolean) as string[];

  // No diff, no summary (spec §Error handling). Also requires opt-in and ids.
  // Gated on CHANGED sections, not all sections: a parse can succeed with every
  // section tagged 'unchanged', and there is nothing to narrate in that case.
  // Mirrors the server-side guard in actions/summaries.ts.
  const canSummarize =
    aiOptedIn &&
    !!billId && !!olderId && !!newerId &&
    !comparison.error &&
    changed.length > 0;

  async function summarizeDiff() {
    if (!billId || !olderId || !newerId) return;
    setAiState({ status: 'loading' });
    try {
      const result = await data.summaries.summarizeDiff({ billId, olderId, newerId });
      setAiState({ status: 'done', summary: result.summary, model: result.model });
    } catch (error: any) {
      setAiState({ status: 'error', message: error?.message || "Couldn't summarize — try again." });
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-md border bg-muted/40 p-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Summary of changes
        </span>
        <p className="mt-1 text-[12.5px] text-foreground/80">
          {comparison.olderLabel} → {comparison.newerLabel}
          {summaryParts.length > 0 ? ` · ${summaryParts.join(' · ')}` : ' · no section changes'}
        </p>
        {canSummarize && aiState.status !== 'done' && (
          <div className="mt-2 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={summarizeDiff}
              disabled={aiState.status === 'loading'}
              className="h-7 gap-1 self-start px-1.5 text-xs text-olive-dark hover:bg-transparent hover:text-olive-dark/80 focus-visible:bg-transparent"
            >
              {aiState.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiState.status === 'loading' ? 'Summarizing…' : 'Summarize changes'}
            </Button>
            {aiState.status === 'error' && (
              <span className="px-1.5 text-[11px] text-destructive">{aiState.message}</span>
            )}
          </div>
        )}
        {/* Re-checks opt-in rather than trusting the state machine: a summary
            generated before the user turned AI off must stop rendering too. */}
        {aiOptedIn && aiState.status === 'done' && (
          <div className="mt-2">
            <SummaryCard summary={aiState.summary} model={aiState.model} />
          </div>
        )}
      </div>

      {comparison.parseIncomplete && (
        <p className="flex items-start gap-1.5 px-0.5 text-[11.5px] text-muted-foreground">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Some sections couldn&apos;t be parsed and aren&apos;t shown below.</span>
        </p>
      )}

      {changed.length > 0 && (
        <Accordion type="multiple" className="overflow-hidden rounded-md border">
          {changed.map((section) => {
            const badge = SECTION_BADGE[section.kind];
            return (
              <AccordionItem key={section.sectionNumber} value={section.sectionNumber} className="border-b last:border-b-0">
                {/* min-h-11 keeps the header a >=44px touch target. */}
                <AccordionTrigger className="min-h-11 px-3 py-2 text-left hover:no-underline">
                  <span className="flex flex-1 flex-wrap items-center gap-2 pr-2">
                    <span className="text-[13px] font-semibold">SECTION {section.sectionNumber}</span>
                    <Badge variant={badge.variant} className="h-4 px-1.5 text-[10px]">{badge.label}</Badge>
                    {section.changeCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {section.changeCount} {section.changeCount === 1 ? 'change' : 'changes'}
                      </span>
                    )}
                    {section.presence !== 'both' && (
                      <span className="text-[11px] text-muted-foreground">
                        {section.presence === 'newerOnly'
                          ? `only in ${comparison.newerLabel}`
                          : `only in ${comparison.olderLabel}`}
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  {/* Legislative text is prose — wrap it at a comfortable measure.
                      Fragments render as plain text, never markdown. */}
                  <p className="text-[13px] leading-relaxed">
                    {section.fragments.map((fragment, i) => (
                      <Fragment key={i} fragment={fragment} />
                    ))}
                  </p>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {unchanged.length > 0 && (
        <p className="px-0.5 text-[11.5px] text-muted-foreground">
          {unchanged.length} unchanged {unchanged.length === 1 ? 'section' : 'sections'} not shown
          {' ('}
          {unchanged.map((s) => s.sectionNumber).join(', ')}
          {')'}
        </p>
      )}
    </div>
  );
}
