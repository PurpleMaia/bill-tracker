'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/core/utils';
import { Info } from 'lucide-react';

interface BillInfoFabProps {
  /** The bill reference panel shown in the sheet. */
  panel: React.ReactNode;
  /** Extra classes, e.g. to lift the button above a bottom bar. */
  className?: string;
}

/**
 * Mobile-only: a floating "Bill info" button in the bottom-left corner that
 * opens the bill reference panel as a sheet, so it doesn't take a row at the
 * top of the page.
 */
export function BillInfoFab({ panel, className }: BillInfoFabProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* Light teal, not the primary deep teal, so the floating helper doesn't
            compete with the page's own primary buttons. Hover darkens rather than
            using secondary/80, which would turn translucent over content. */}
        <Button
          size="sm"
          variant="secondary"
          className={cn(
            'fixed bottom-4 left-4 z-40 h-10 rounded-full border border-primary/20 px-4 shadow-lg hover:bg-secondary hover:brightness-95',
            className,
          )}
          data-flow-tour="reference"
        >
          <Info className="mr-1.5 h-4 w-4" />
          Bill info
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] p-0 sm:w-[380px]">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-sm">Bill reference</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100dvh-57px)]">{panel}</div>
      </SheetContent>
    </Sheet>
  );
}
