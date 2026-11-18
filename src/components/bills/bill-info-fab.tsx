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
        <Button
          size="sm"
          className={cn('fixed bottom-4 left-4 z-40 h-10 rounded-full px-4 shadow-lg', className)}
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
