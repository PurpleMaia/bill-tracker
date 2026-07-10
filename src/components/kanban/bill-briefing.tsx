'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import { deriveBriefingFacts } from '@/lib/bill-briefing-facts';
import { stubBriefingNarrative } from './ai-stub';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, PenLine, GitCompare, ScrollText, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEP_ICON = { testimony: PenLine, diff: GitCompare, reports: ScrollText } as const;

export function BillBriefing({
  bill,
  today,
  onNextStep,
}: {
  bill: BillDetails;
  today: string;
  onNextStep: (a: 'testimony' | 'diff' | 'reports') => void;
}) {
  const facts = deriveBriefingFacts(bill, today);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    try {
      setNarrative(await stubBriefingNarrative(bill));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bill briefing</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={summarize}
          disabled={loading}
          className="h-7 gap-1 border-olive-dark/40 px-2 text-xs text-olive-dark"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {narrative ? 'Regenerate' : 'Summarize with AI'}
        </Button>
      </div>

      {/* Optional AI narrative */}
      {narrative && (
        <div className="rounded-md border border-olive-dark/40 bg-olive-soft/40 p-2.5">
          <p className="text-[12.5px] leading-relaxed text-foreground/80">{narrative}</p>
        </div>
      )}

      {/* Derived — always shown, no AI */}
      <div
        className={cn(
          'flex items-start gap-2 rounded-md border p-2.5 text-[12.5px]',
          facts.testimony.urgent
            ? 'border-red-300 bg-red-50 text-red-700'
            : facts.testimony.open
              ? 'border-primary/30 bg-primary/5'
              : 'text-muted-foreground',
        )}
      >
        {facts.testimony.urgent ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> : <Clock className="mt-0.5 h-4 w-4 flex-none" />}
        <span>{facts.testimony.message}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Where it stands</h4>
          <p className="text-[12px] text-foreground/80">{facts.standing}</p>
        </div>
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Latest version</h4>
          <p className="text-[12px] text-foreground/80">
            {facts.latestVersionLabel ? (
              facts.latestVersionHtml ? (
                <a href={facts.latestVersionHtml} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{facts.latestVersionLabel}</a>
              ) : facts.latestVersionLabel
            ) : 'No versions on file.'}
          </p>
        </div>
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Committee activity</h4>
          <p className="text-[12px] text-foreground/80">
            {facts.committeeCodes.length > 0 ? facts.committeeCodes.join(', ') : 'No committees'} · {facts.reportCount} report(s)
          </p>
        </div>
      </div>

      {facts.nextSteps.length > 0 && (
        <div className="border-t border-dashed pt-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested next steps</h4>
          <div className="space-y-1.5">
            {facts.nextSteps.map((step, i) => {
              const Icon = STEP_ICON[step.action];
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-none text-primary" />
                  <span className="flex-1 text-[12.5px]">{step.text}</span>
                  <Button variant="ghost" size="sm" className="h-6 flex-none px-2 text-[11px] text-primary" onClick={() => onNextStep(step.action)}>
                    Go
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
