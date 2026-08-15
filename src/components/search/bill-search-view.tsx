'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BillSearchCard } from './bill-search-card';
import { SearchFilterRail } from './search-filter-rail';
import { SearchFiltersSheet } from './search-filters-sheet';
import { useBillSearch } from '@/hooks/use-bill-search';
import { DEFAULT_FILTERS, type SearchFilters } from '@/lib/bills/search-params';

export function BillSearchView() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const {
    bills,
    totalCount,
    debouncedQuery,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useBillSearch(filters);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleClear = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  // Auto-load the next page when the sentinel scrolls into view. The visible
  // "Load more" button below stays the keyboard-accessible path — scroll-driven
  // loading alone is a screen-reader trap.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-6 p-4 md:p-6">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-4">
          <SearchFilterRail filters={filters} onChange={setFilters} onClear={handleClear} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6">
          <label htmlFor="bill-search" className="sr-only">
            Search bills by number, title, or description
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="bill-search"
              type="search"
              role="searchbox"
              placeholder="Search bill number, title, or text…"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              className="pl-9"
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {isLoading
                ? 'Searching…'
                : `${totalCount.toLocaleString()} ${totalCount === 1 ? 'bill' : 'bills'}${
                    filters.q.trim() ? ' · sorted by relevance' : ''
                  }`}
            </p>
            <SearchFiltersSheet filters={filters} onChange={setFilters} onClear={handleClear} />
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load bills: {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : bills.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">No bills found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search term or clear your filters.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={handleClear}>
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {bills.map((bill) => (
              <li key={bill.id}>
                <BillSearchCard bill={bill} query={debouncedQuery} />
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinelRef} aria-hidden="true" className="h-1" />

        {hasNextPage && (
          <div className="py-6 text-center">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="min-h-[44px]"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
