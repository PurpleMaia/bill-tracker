'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import type { TestimonyDraft } from '@/types/testimony';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TestimonyRoundSwitcherProps {
  testimonies: TestimonyDraft[];
  activeId: string;
  /** Label of the bill's current hearing round when the user has no testimony for it yet. */
  newRoundLabel: string | null;
  onSelect: (testimonyId: string) => void;
  onCreate: () => void;
  disabled?: boolean;
}

/** Green dot for submitted, blue for draft — matches the card medallions. */
function StateDot({ submitted }: { submitted: boolean }) {
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', submitted ? 'bg-green-600' : 'bg-blue-600')}
      aria-label={submitted ? 'Submitted' : 'Draft'}
    />
  );
}

/**
 * Picks which of the user's testimonies for this bill (one per hearing round)
 * the writer is editing, and starts one for the bill's current round.
 */
export function TestimonyRoundSwitcher({
  testimonies,
  activeId,
  newRoundLabel,
  onSelect,
  onCreate,
  disabled,
}: TestimonyRoundSwitcherProps) {
  const active = testimonies.find((t) => t.id === activeId);
  if (!active || (testimonies.length < 2 && !newRoundLabel)) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={disabled}>
          <StateDot submitted={active.submittedAt !== null} />
          <span className="max-w-[10rem] truncate">{active.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Your testimonies for this bill
        </DropdownMenuLabel>
        {testimonies.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => t.id !== activeId && onSelect(t.id)}
            className={cn('gap-2', t.id === activeId && 'bg-accent/60 font-medium')}
          >
            <StateDot submitted={t.submittedAt !== null} />
            <span className="flex-1 truncate">{t.label}</span>
            <span className="text-[11px] text-muted-foreground">{t.submittedAt ? 'Submitted' : 'Draft'}</span>
          </DropdownMenuItem>
        ))}
        {newRoundLabel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              New for {newRoundLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
