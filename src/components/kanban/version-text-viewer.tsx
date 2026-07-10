'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VersionTextViewerProps {
  text: string;
  label?: string; // e.g. "Read text" (default) or "Read report"
  defaultOpen?: boolean;
}

export function VersionTextViewer({ text, label = 'Read text', defaultOpen = false }: VersionTextViewerProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('mr-1 h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        {label}
      </Button>
      {open && (
        <ScrollArea className="mt-1.5 max-h-64 rounded-md border bg-muted/40">
          <pre className="whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed font-mono text-foreground/80">
            {text}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}
