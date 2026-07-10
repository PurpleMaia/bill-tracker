'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/contexts/auth-context';
import { stubSummarize } from './ai-stub';
import { Sparkles, Loader2 } from 'lucide-react';

interface SummarySectionProps {
  /** The raw text to summarize (bill version or committee report). */
  text: string;
  /** Existing saved AI summary, if any. Rendered directly when present. */
  existingSummary?: string | null;
  /** The View link(s) to open the source — shown when the user opted out of AI. */
  viewButtons?: ReactNode;
  /** Word for the source in copy, e.g. "version" or "committee report". */
  noun?: string;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: string }
  | { status: 'error' };

/**
 * Per-item AI summary. Resolves in priority order:
 *  1. A saved `existingSummary` → render it.
 *  2. AI opted in, no summary → a "Summarize" button (stubbed AI for now).
 *  3. AI opted out → verbiage pointing to the View button to read the source.
 */
export function SummarySection({ text, existingSummary, viewButtons, noun = 'document' }: SummarySectionProps) {
  const { preferences } = useAuth();
  const aiOptedIn = preferences?.ai_opt_in === true;

  const [state, setState] = useState<State>(
    existingSummary ? { status: 'done', summary: existingSummary } : { status: 'idle' },
  );

  // A saved summary always wins, regardless of opt-in.
  if (state.status === 'done') {
    return <SummaryCard summary={state.summary} />;
  }

  // Opted out of AI: no summarize button; point to the source.
  if (!aiOptedIn) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>AI summaries are off. Open the {noun} to read it in full.</span>
        {viewButtons}
      </div>
    );
  }

  async function summarize() {
    setState({ status: 'loading' });
    try {
      const summary = await stubSummarize(text);
      setState({ status: 'done', summary });
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={summarize}
        disabled={state.status === 'loading'}
        className="h-7 gap-1 self-start px-1.5 text-xs text-olive-dark hover:bg-transparent hover:text-olive-dark/80 focus-visible:bg-transparent"
      >
        {state.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {state.status === 'loading' ? 'Summarizing…' : 'Summarize'}
      </Button>
      {state.status === 'error' && (
        <span className="px-1.5 text-[11px] text-destructive">Couldn&apos;t summarize — try again.</span>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: string }) {
  return (
    <div className="rounded-md border border-olive-dark/30 bg-olive-soft/40 p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-olive-dark" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-olive-dark">AI summary</span>
      </div>
      <p className="text-[11px] leading-relaxed text-foreground/80">{summary}</p>
    </div>
  );
}
