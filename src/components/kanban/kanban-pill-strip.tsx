'use client';

import { Button } from '@/components/ui/button';

interface KanbanPillStripProps {
  onScrollToIntroduced: () => void;
  onScrollToCrossover: () => void;
  onScrollToConference: () => void;
  onScrollToGovernor: () => void;
}

export function KanbanPillStrip({
  onScrollToIntroduced,
  onScrollToCrossover,
  onScrollToConference,
  onScrollToGovernor,
}: KanbanPillStripProps) {
  return (
    <div className="md:hidden overflow-x-auto px-3 py-2 border-b bg-background/90">
      <div className="flex gap-2 w-max">
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToIntroduced}>
          Introduced
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToCrossover}>
          Crossover
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToConference}>
          Conference
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToGovernor}>
          Governor
        </Button>
      </div>
    </div>
  );
}
