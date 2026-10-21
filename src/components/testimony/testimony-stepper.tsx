'use client';

import { cn } from '@/lib/core/utils';
import { Check } from 'lucide-react';

const STEPS = [
  { number: 1, title: 'Write' },
  { number: 2, title: 'Review' },
  { number: 3, title: 'Submit' },
] as const;

export type TestimonyStep = 1 | 2 | 3;

interface TestimonyStepperProps {
  step: TestimonyStep;
  onStepChange: (step: TestimonyStep) => void;
}

export function TestimonyStepper({ step, onStepChange }: TestimonyStepperProps) {
  return (
    <nav aria-label="Testimony progress" className="flex items-center gap-2">
      {STEPS.map((item, index) => {
        const state = item.number < step ? 'done' : item.number === step ? 'current' : 'todo';
        return (
          <div key={item.number} className="flex items-center gap-2">
            {index > 0 && <div className="h-px w-6 sm:w-10 bg-border" />}
            <button
              type="button"
              onClick={() => onStepChange(item.number)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                state === 'current' && 'bg-primary text-primary-foreground',
                state === 'done' && 'text-primary hover:bg-primary/10',
                state === 'todo' && 'text-muted-foreground hover:bg-muted',
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
