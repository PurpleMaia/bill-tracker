'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BillDetailsDialog } from '@/components/kanban/bill-details-dialog';
import { ActiveFilterChips } from './active-filter-chips';
import { BillSearchCard } from './bill-search-card';
import { SearchFilterRail } from './search-filter-rail';
import { SearchFiltersSheet } from './search-filters-sheet';
import { SearchIntro } from './search-intro';
import { useBillSearch } from '@/hooks/use-bill-search';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  type SearchFilters,
} from '@/lib/bills/search-params';

/** Sessions the corpus covers, newest first. Mirrors the rail's YEARS list. */
const SESSION_YEARS = [2026, 2025];

export function BillSearchView() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [openBillId, setOpenBillId] = useState<string | null>(null);
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
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleClear = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const handleCardClick = useCallback((billId: string) => setOpenBillId(billId), []);

  // Auto-load the next page when the sentinel scrolls into view. The visible
  // "Load more" button below stays the keyboard-accessible path — scroll-driven
  // loading alone is a screen-reader trap.
  //
  // `root` is the results pane, not the viewport: the pane is its own scroll
  // container, so a viewport-rooted observer would never fire.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { root: resultsRef.current, rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // A new filter set is a new result list — jump back to the top so the user
  // isn't left mid-way down a list they didn't scroll.
  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0 });
  }, [debouncedQuery, filters.years, filters.chambers, filters.stages, filters.deadFilter]);

  // Reveal the scroll-to-top button once the hero (and its search bar) has
  // scrolled out of view, since it's the only way back to them now.
  useEffect(() => {
    const node = resultsRef.current;
    if (!node) return;
    const onScroll = () => setShowScrollTop(node.scrollTop > 400);
    node.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  const hasQuery = filters.q.trim().length > 0;
  const isPristine = !hasQuery && activeFilterCount(filters) === 0;

  const searchInput = (
    <>
      <label htmlFor="bill-search" className="sr-only">
        Search bills by number, title, or description
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        {/*
          type="text", not type="search": WebKit renders its own clear affordance
          inside a search input, which sat right next to ours and showed two X
          buttons. We keep our own so it's styled and labeled consistently.
        */}
        <Input
          id="bill-search"
          type="text"
          role="searchbox"
          placeholder="Search bill number, title, or text…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="h-11 pl-9 pr-9"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, q: '' })}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );

  return (
    // h-full + min-h-0 makes this a fixed-height shell inside the (main) layout's
    // scrollable <main>. Without it the whole page scrolled as one unit, which
    // dragged the search header away and made the tail of the filter rail
    // unreachable. The rail and the results below each own their scrolling.
    <div className="mx-auto flex h-full w-full min-h-0 max-w-6xl gap-6 p-4 md:p-6">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="h-full min-h-0 overflow-y-auto pr-2">
          <SearchFilterRail filters={filters} onChange={setFilters} onClear={handleClear} />
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* One scroll container holding the hero, the meta row, and the results,
            so the CTA scrolls away with everything else rather than staying
            pinned. The scroll-to-top button below brings it back. */}
        <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-4">
            <SearchIntro
              onSuggestionClick={(term) => setFilters({ ...filters, q: term })}
              sessionYears={SESSION_YEARS}
              showSuggestions={isPristine}
            >
              {searchInput}
            </SearchIntro>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {isLoading ? (
                  'Searching…'
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {totalCount.toLocaleString()}
                    </span>{' '}
                    {totalCount === 1 ? 'bill' : 'bills'}
                    {hasQuery && ' · sorted by relevance'}
                  </>
                )}
              </p>
              <SearchFiltersSheet filters={filters} onChange={setFilters} onClear={handleClear} />
            </div>

            <div className="empty:hidden [&:not(:empty)]:mt-2.5">
              <ActiveFilterChips filters={filters} onChange={setFilters} onClear={handleClear} />
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
                  <BillSearchCard
                    bill={bill}
                    query={debouncedQuery}
                    onCardClick={handleCardClick}
                  />
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

        {/* Back to the search bar once the hero has scrolled out of reach. */}
        {showScrollTop && (
          <Button
            size="icon"
            onClick={() =>
              resultsRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }
            aria-label="Scroll back to search"
            className="absolute bottom-4 right-4 h-11 w-11 rounded-full shadow-lg"
          >
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* The board's own dialog, reused rather than reimplemented — BillsProvider
          wraps the whole app, so it works here. It degrades for logged-out
          visitors: the testimony and contact CTAs become login prompts. */}
      <BillDetailsDialog
        billID={openBillId}
        isOpen={openBillId !== null}
        onClose={() => setOpenBillId(null)}
      />
    </div>
  );
}
