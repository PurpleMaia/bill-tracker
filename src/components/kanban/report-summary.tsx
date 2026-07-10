'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

interface ReportSummaryProps {
  /** The raw text to summarize (bill version or committee report). */
  text: string;
  /** Existing saved summary, if any. Shown immediately when present. */
  existingSummary?: string | null;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: string }
  | { status: 'error' };

/**
 * "Summarize" affordance: a button that (eventually) asks AI to summarize the
 * text and renders the result inline. The AI call is stubbed for now — it
 * returns a placeholder after a short delay so the loading/result UX is
 * reviewable. Wiring to the Genkit LLM service is a follow-up.
 */
export function ReportSummary({ text, existingSummary }: ReportSummaryProps) {
  const [state, setState] = useState<State>(
    existingSummary ? { status: 'done', summary: existingSummary } : { status: 'idle' },
  );

  async function summarize() {
    setState({ status: 'loading' });
    try {
      // TODO: replace with a real summarize call (Genkit flow + server action).
      const summary = await stubSummarize(text);
      setState({ status: 'done', summary });
    } catch {
      setState({ status: 'error' });
    }
  }

  if (state.status === 'done') {
    return (
      <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
        <div className="mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            AI summary
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-foreground/80">{state.summary}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={summarize}
        disabled={state.status === 'loading'}
        className="h-7 gap-1 self-start px-1.5 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:bg-transparent"
      >
        {state.status === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {state.status === 'loading' ? 'Summarizing…' : 'Summarize'}
      </Button>
      {state.status === 'error' && (
        <span className="px-1.5 text-[11px] text-destructive">
          Couldn&apos;t summarize — try again.
        </span>
      )}
    </div>
  );
}

/** Placeholder AI call. Replace with a real Genkit-backed summarize action. */
function stubSummarize(text: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const words = text.trim().split(/\s+/).length;
      resolve(
        `AI summaries aren't wired up yet. This is a placeholder for a ~${words}-word document. ` +
          `Once connected, this will give a plain-language recap of the report's recommendation and key changes.`,
      );
    }, 900);
  });
}
