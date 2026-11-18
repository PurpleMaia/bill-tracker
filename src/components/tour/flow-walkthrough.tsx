'use client';

import { useEffect, useState } from 'react';
import type { Walkthrough } from '@/lib/tour/flow-walkthroughs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, CircleHelp, TriangleAlert } from 'lucide-react';

function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Storage blocked: treat as seen so we never nag on every page load.
    return true;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, 'done');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

interface FlowWalkthroughProps {
  walkthrough: Walkthrough;
  /** localStorage flag; the dialog auto-opens until it's set. */
  storageKey: string;
}

/**
 * "How this works" for an action flow: a header button that opens a worked
 * example of the whole flow, ending with what the Hawaiʻi Bill Tracker can't do for the user.
 * Opens on its own the first time someone enters the flow.
 */
export function FlowWalkthrough({ walkthrough, storageKey }: FlowWalkthroughProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeen(storageKey)) setOpen(true);
  }, [storageKey]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) markSeen(storageKey);
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setOpen(true)} aria-label="How this works">
        <CircleHelp className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">How this works</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{walkthrough.title}</DialogTitle>
            <DialogDescription>{walkthrough.goal}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm font-medium">{walkthrough.example}</p>
            <ol className="space-y-3">
              {walkthrough.steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">{walkthrough.caveat.title}</p>
              <p className="text-sm text-muted-foreground">{walkthrough.caveat.body}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">What happens next</p>
              <p className="text-sm text-muted-foreground">{walkthrough.next}</p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
