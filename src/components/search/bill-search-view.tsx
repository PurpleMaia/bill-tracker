'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UrlBillDetailsDialog } from '@/components/kanban/url-bill-details-dialog';
import { ActiveFilterChips } from './active-filter-chips';
import { BillSearchCard } from './bill-search-card';
import { SearchFilterRail } from './search-filter-rail';
import { SearchFiltersSheet } from './search-filters-sheet';
import { SearchIntro } from './search-intro';
import { RecommendedBillsRow } from '@/components/recommendations/recommended-bills-row';
import { TrackButton } from './track-button';
import { ScrollToTopButton } from '@/components/main/scroll-to-top-button';
import { useBillSearch } from '@/hooks/use-bill-search';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBillDialogParam } from '@/hooks/use-bill-dialog-param';
import { useIsMobile } from '@/hooks/use-mobile';
import { hasNonBillParams } from '@/lib/bills/bill-dialog-url';
import {
  DEFAULT_FILTERS,
  parseSearchParams,
  resolveSortMode,
  SEARCH_PAGE_SIZE,
  activeFilterCount,
  type SearchFilters,
  type SortMode,
} from '@/lib/bills/search-params';
import { loadSearchFilters, saveSearchFilters } from '@/lib/bills/search-filter-storage';
import { SESSION_YEARS } from '@/lib/bills/session-years';
import { cn } from '@/lib/core/utils';
import { RISE_IN, riseDelay } from '@/lib/core/motion';

const SORT_LABELS: Record<SortMode, string> = { relevance: 'Relevance', title: 'Title A–Z' };

export function BillSearchView() {
  const { user, activeTenant } = useAuth();
  const isLoggedIn = Boolean(user);
  // Seed filters from the URL once, so a link into the page (e.g. a board
  // column's "+" -> /find-bills?stages=…&tracked=untracked) lands pre-filtered.
  // Lazy init reads the params a single time; the filter controls own state
  // thereafter (they don't push back to the URL). A missing `years` param keeps
  // the default live-session scope rather than widening to all sessions.
  const searchParams = useSearchParams();
  // Whether the entry URL carried filter params. A deep link must win over
  // stored filters; only when the URL is bare do we restore the last session.
  const urlHadParams = useRef(false);
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const raw = new URLSearchParams(searchParams.toString());
    // `bill` only reopens a dialog (see useBillDialogParam); it isn't a filter.
    urlHadParams.current = hasNonBillParams(raw.toString());
    const parsed = parseSearchParams(raw);
    return { ...parsed, years: parsed.years.length ? parsed.years : DEFAULT_FILTERS.years };
  });

  // Restore the last-used filters from localStorage AFTER mount (the read must
  // run client-side; a lazy initializer would see no `window` during SSR and
  // React doesn't re-run it on hydration). A deep link with params wins, so we
  // only restore when the entry URL was bare. `hydrated` is state, not a ref,
  // so flipping it commits a render before the persist effect runs — the
  // initial defaults can never overwrite what's stored.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!urlHadParams.current) {
      const stored = loadSearchFilters();
      if (stored) setFilters(stored);
    }
    setHydrated(true);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filter changes so they survive navigation and reload. Gated on
  // `hydrated` so the persist effect first runs only after the restore above
  // has committed — the initial defaults are never written over stored filters.
  useEffect(() => {
    if (!hydrated) return;
    saveSearchFilters(filters);
  }, [hydrated, filters]);
  const { billId: openBillId, open: openBillDialog } = useBillDialogParam();
  const {
    bills,
    totalCount,
    debouncedQuery,
    resultSetKey,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useBillSearch(filters, activeTenant?.tenantId);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const handleClear = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const handleCardClick = useCallback((billId: string) => openBillDialog(billId), [openBillDialog]);

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
  }, [
    debouncedQuery,
    filters.years,
    filters.chambers,
    filters.stages,
    filters.deadFilter,
    filters.trackedFilter,
    filters.introducerIds,
    filters.chairIds,
    filters.sort,
  ]);

  const hasQuery = filters.q.trim().length > 0;
  // Recommendations only on the untouched page; a search or filter means the
  // user is looking for something specific.
  const showRecommendations = !hasQuery && activeFilterCount(filters) === 0;
  // The full placeholder runs past a phone-width input; phones get the short one.
  const isMobile = useIsMobile();
  // The dialog takes only a bill id; the Track control needs the bill number for
  // its label and toasts, so resolve the open row from the loaded results.
  const openBill = openBillId ? bills.find((b) => b.id === openBillId) : undefined;

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
        <Input
          id="bill-search"
          type="text"
          role="searchbox"
          placeholder={isMobile ? 'Bill number, title, or keyword' : 'Search bill number, title, or text…'}
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
    <div className="mx-auto flex h-full w-full min-h-0 max-w-6xl gap-6 p-4 md:p-6">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="h-full min-h-0 overflow-y-auto pr-2">
          <SearchFilterRail
            filters={filters}
            onChange={setFilters}
            onClear={handleClear}
            loggedIn={isLoggedIn}
          />
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* One scroll container holding the hero, the meta row, and the results,
            so the CTA scrolls away with everything else rather than staying
            pinned. The scroll-to-top button below brings it back. */}
        <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className={cn('mb-4', RISE_IN)}>
            <SearchIntro
              onSuggestionClick={(term) => setFilters({ ...filters, q: term })}
              sessionYears={SESSION_YEARS}
              showSuggestions={!hasQuery}
            >
              {searchInput}
            </SearchIntro>

            {/* Recommendations sit above the count/sort bar: that bar governs only
                the full results below, never the recommendations' own ordering. */}
            {showRecommendations && (
              <>
                <div className="mt-4">
                  <RecommendedBillsRow onCardClick={handleCardClick} />
                </div>
                <h2 className="text-sm font-semibold">All bills</h2>
              </>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {isLoading ? (
                    'Searching…'
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        {totalCount.toLocaleString()}
                      </span>{' '}
                      {totalCount === 1 ? 'bill' : 'bills'}
                    </>
                  )}
                </p>
                {/* Shows the effective order ('auto' resolved); picking one
                    pins it explicitly so it no longer follows the auto rule.
                    While 'auto', the value is a key no item has, so picking
                    the option already shown still fires onValueChange and pins it. */}
                <Select
                  value={filters.sort === 'auto' ? `auto:${resolveSortMode(filters)}` : filters.sort}
                  onValueChange={(sort) => setFilters({ ...filters, sort: sort as SortMode })}
                >
                  <SelectTrigger
                    aria-label="Sort results"
                    className="h-8 w-auto gap-1.5 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:text-foreground"
                  >
                    <SelectValue>{SORT_LABELS[resolveSortMode(filters)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(['relevance', 'title'] as const).map((mode) => (
                      <SelectItem key={mode} value={mode} className="text-xs">
                        {SORT_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SearchFiltersSheet
                filters={filters}
                onChange={setFilters}
                onClear={handleClear}
                loggedIn={isLoggedIn}
              />
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
          ) : !error && filters.chairIds.length > 0 && totalCount === 0 ? (
            <div className={cn('py-16 text-center', RISE_IN)}>
              <p className="text-sm font-medium">
                Nothing is waiting on{' '}
                {filters.chairIds.length === 1 ? 'this legislator\u2019s' : 'these legislators\u2019'}{' '}
                committees right now.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleClear}>
                Clear filters
              </Button>
            </div>
          ) : bills.length === 0 ? (
            <div className={cn('py-16 text-center', RISE_IN)}>
              <p className="text-sm font-medium">No bills found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search term or clear your filters.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleClear}>
                Clear filters
              </Button>
            </div>
          ) : (
            // Keyed by result set: a new filter set remounts every card so the
            // whole list cascades in, even bills that were already showing.
            <ul key={resultSetKey} className="space-y-3">
              {bills.map((bill, i) => (
                <li
                  key={bill.id}
                  // Stagger restarts per page, so an appended page cascades in
                  // from its own first card instead of all landing at the cap.
                  // Stable keys mean cards already shown never replay.
                  className={RISE_IN}
                  style={riseDelay(i % SEARCH_PAGE_SIZE)}
                >
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

      </div>

      {/* Back to the search bar once the hero has scrolled out of reach. */}
      <ScrollToTopButton scrollRef={resultsRef} label="Scroll back to search" />

      {/* The board's own dialog, reused rather than reimplemented — BillsProvider
          wraps the whole app, so it works here. It degrades for logged-out
          visitors: the testimony and contact CTAs become login prompts.
          trackSlot adds the Track control the board's own copy doesn't need:
          a bill opened from search may not be tracked yet. */}
      <UrlBillDetailsDialog
        trackSlot={
          openBill ? (
            <TrackButton
              billId={openBill.id}
              billNumber={openBill.bill_number}
              initialTracked={openBill.is_tracked}
            />
          ) : undefined
        }
      />
    </div>
  );
}
