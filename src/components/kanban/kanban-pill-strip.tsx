'use client';

import { Button } from '@/components/ui/button';
import type { BoardPhase } from '@/hooks/contexts/kanban-board-context';

const PHASES: { phase: BoardPhase; label: string }[] = [
  { phase: 'introduced', label: 'Introduced' },
  { phase: 'crossover', label: 'Crossover' },
  { phase: 'conference', label: 'Conference' },
  { phase: 'governor', label: 'Governor' },
];

interface KanbanPillStripProps {
  onScrollTo: (phase: BoardPhase) => void;
}

/**
 * Phone jump pills: one tap scrolls the board to a legislative phase. Bare
 * pills (no row chrome) — the mobile header row places them beside Filters.
 */
export function KanbanPillStrip({ onScrollTo }: KanbanPillStripProps) {
  return (
    <div className="flex w-max gap-2">
      {PHASES.map(({ phase, label }) => (
        <Button
          key={phase}
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => onScrollTo(phase)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
