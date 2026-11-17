'use client';

import { useQuery } from '@tanstack/react-query';
import { data } from '@/lib/data-client';
import type { LegislatorOption } from '@/types/legislation';

/**
 * Legislator picker options (A–Z, with active committee roles). The roster
 * barely changes within a session, so it is fetched once per page load and
 * shared by every consumer (rail, mobile sheet, filter chips) via the cache.
 */
export function useLegislatorOptions() {
  return useQuery<LegislatorOption[]>({
    queryKey: ['legislators', 'options'],
    queryFn: () => data.legislators.getOptions(),
    staleTime: Infinity,
  });
}
