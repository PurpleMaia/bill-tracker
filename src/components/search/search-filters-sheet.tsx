'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SearchFilterRail } from './search-filter-rail';
import { activeFilterCount, type SearchFilters } from '@/lib/bills/search-params';

interface SearchFiltersSheetProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
  loggedIn: boolean;
}

/** Mobile-only wrapper: the same rail, slid in from the left on demand. */
export function SearchFiltersSheet({ filters, onChange, onClear, loggedIn }: SearchFiltersSheetProps) {
  const count = activeFilterCount(filters);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px] lg:hidden">
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
          Filters
          {count > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter bills</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <SearchFilterRail
            filters={filters}
            onChange={onChange}
            onClear={onClear}
            loggedIn={loggedIn}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
