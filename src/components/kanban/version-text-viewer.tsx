'use client';

import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

interface ReadTextButtonProps {
  label?: string; // e.g. "Read text" (default) or "Read report"
  onClick: () => void;
}

/**
 * A trigger that opens the raw-text side panel. Hover darkens the text only
 * (no background fill), to stay quiet inside the dense timeline.
 */
export function ReadTextButton({ label = 'Read text', onClick }: ReadTextButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:bg-transparent"
    >
      <ChevronRight className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
