'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BillTextView {
  title: string;
  subtitle?: string;
  text: string;
  /** Optional link to the same content on capitol.hawaii.gov. */
  htmlLink?: string | null;
}

interface BillTextSidePanelProps {
  view: BillTextView | null;
  onClose: () => void;
}

/**
 * A slide-over panel that renders the raw text of a bill version or committee
 * report. Positioned absolutely over its relatively-positioned parent (the
 * versions panel), so it never spawns a competing focus trap inside the dialog.
 */
export function BillTextSidePanel({ view, onClose }: BillTextSidePanelProps) {
  const open = view !== null;

  // Close on Escape without stealing the dialog's own Escape handling when the
  // panel is shut.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          'absolute inset-0 z-20 bg-black/20 transition-opacity motion-reduce:transition-none',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label={view?.title ?? 'Bill text'}
        aria-hidden={!open}
        className={cn(
          'absolute inset-y-0 right-0 z-30 flex w-full max-w-[92%] flex-col border-l bg-background shadow-xl',
          'transition-transform duration-200 ease-out motion-reduce:transition-none sm:max-w-[85%]',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 shrink-0">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{view?.title}</h3>
            {view?.subtitle && (
              <p className="truncate text-xs text-muted-foreground">{view.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {view?.htmlLink && (
              <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                <a href={view.htmlLink} target="_blank" rel="noopener noreferrer">
                  Open original
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              aria-label="Close text"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <pre className="whitespace-pre-wrap break-words px-4 py-4 text-[12px] leading-relaxed font-mono text-foreground/90">
            {view?.text}
          </pre>
        </ScrollArea>
      </aside>
    </>
  );
}
