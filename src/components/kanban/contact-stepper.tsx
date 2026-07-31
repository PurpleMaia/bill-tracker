'use client';

import { cn } from '@/lib/core/utils';
import { Check } from 'lucide-react';

const STEPS = [
  { number: 1, title: 'Position' },
  { number: 2, title: 'Script' },
  { number: 3, title: 'Contact' },
] as const;

export type ContactStep = 1 | 2 | 3;

interface ContactStepperProps {
  step: ContactStep;
  onStepChange: (step: ContactStep) => void;
  /** Steps at or beyond this are disabled (e.g. gated until a position is picked). */
  maxStep?: ContactStep;
}

export function ContactStepper({ step, onStepChange, maxStep = 3 }: ContactStepperProps) {
  return (
    <nav aria-label="Contact progress" className="flex items-center gap-2">
      {STEPS.map((item, index) => {
        const state = item.number < step ? 'done' : item.number === step ? 'current' : 'todo';
        const disabled = item.number > maxStep;
        return (
          <div key={item.number} className="flex items-center gap-2">
            {index > 0 && <div className="h-px w-6 bg-border sm:w-10" />}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onStepChange(item.number as ContactStep)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                disabled && 'cursor-not-allowed opacity-40',
                !disabled && state === 'current' && 'bg-primary text-primary-foreground',
                !disabled && state === 'done' && 'text-primary hover:bg-primary/10',
                !disabled && state === 'todo' && 'text-muted-foreground hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                  state === 'current' && 'border-primary-foreground',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'todo' && 'border-muted-foreground/40',
                )}
              >
                {state === 'done' ? <Check className="h-2.5 w-2.5" /> : item.number}
              </span>
              <span className="hidden sm:inline">{item.title}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
