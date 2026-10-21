'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { data } from '@/lib/data-client';
import {
  normalizeFilters,
  SEARCH_PAGE_SIZE,
  type SearchFilters,
} from '@/lib/bills/search-params';
import type { BillSearchResult } from '@/types/legislation';

/** Delays a value by `ms`, so one query fires per typing pause, not per key. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Paged bill search backed by React Query's cache. Filter toggles, repeated
 * queries, and back-navigation all hit the cache instead of the network; only a
 * genuinely new filter set costs a request.
 */
export function useBillSearch(filters: SearchFilters, tenantId?: string | null) {
  // Only the text query is debounced — filter clicks should feel immediate.
  const debouncedQuery = useDebounced(filters.q, 250);
  const effective = normalizeFilters({ ...filters, q: debouncedQuery });

  const query = useInfiniteQuery({
    // tenantId is part of the key so switching orgs re-scopes the is_tracked
    // flag instead of serving another org's cached tracked state.
    queryKey: ['bills', 'search', effective, tenantId ?? null],
    queryFn: ({ pageParam }) =>
      data.bills.searchBills({
        ...effective,
        cursor: pageParam as string | null,
        limit: SEARCH_PAGE_SIZE,
        tenantId: tenantId ?? null,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    // Keeps the previous results on screen while the next query resolves, so
    // the list never flashes empty mid-typing.
    placeholderData: (previous) => previous,
  });

  const bills: BillSearchResult[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    bills,
    totalCount,
    // The query actually backing `bills` — debounced, unlike `filters.q`. Pass
    // this (not the raw filter) to anything highlighting matches, so the
    // highlighted terms never race ahead of the results they're drawn on.
    debouncedQuery,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error as Error | null,
  };
}
