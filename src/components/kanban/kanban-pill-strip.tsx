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
    // Four equal segments sharing the row with Filters, so all of them fit at
    // phone width instead of scrolling off the edge.
    <div className="grid grid-cols-4 gap-1">
      {PHASES.map(({ phase, label }) => (
        <Button
          key={phase}
          variant="outline"
          size="sm"
          className="h-8 min-w-0 overflow-hidden rounded-full px-1 text-[11px]"
          onClick={() => onScrollTo(phase)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
