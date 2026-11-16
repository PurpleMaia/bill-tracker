'use client';

import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TOUR_START_EVENT } from '@/lib/tour/welcome-tour';

/** Restarts the welcome tour (handled by <WelcomeTour />, mounted in the main layout). */
export function ReplayTourButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.dispatchEvent(new Event(TOUR_START_EVENT))}
    >
      <PlayCircle className="mr-2 h-4 w-4" />
      Replay the tour
    </Button>
  );
}
