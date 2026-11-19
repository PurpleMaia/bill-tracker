'use client';

import { useQuery } from '@tanstack/react-query';
import { data } from '@/lib/data-client';
import { parseConferees, isConferenceStatus } from '@/lib/testimony/conferees';
import { parseIntroducers } from '@/lib/legislators/governor-contact';

/**
 * Every legislator attached to a bill — chairs of its referred committees, its
 * introducers, and (at conference) its conferees — deduped by name. Feeds the
 * "Mark as contacted" picker, so it only loads when `enabled`.
 */
export function useBillLegislators(billId: string, enabled: boolean) {
  return useQuery<string[]>({
    queryKey: ['bills', billId, 'legislators'],
    enabled: enabled && !!billId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const details = await data.bills.getBillDetails({ billId });
      if (!details) return [];

      const introducers = parseIntroducers(details.introducer, details.bill_number ?? '');
      const conferees = isConferenceStatus(details.current_bill_status)
        ? parseConferees(details.updates ?? [])
        : [];

      const [chairList, introducerList, confereeList] = await Promise.all([
        data.legislators.getChairs(billId, details.committee_assignment ?? null),
        introducers.length > 0 ? data.legislators.getConferees(billId, introducers) : [],
        conferees.length > 0 ? data.legislators.getConferees(billId, conferees) : [],
      ]);

      const names = [...confereeList, ...chairList, ...introducerList].map((c) => c.legislatorName);
      return [...new Set(names.filter(Boolean))];
    },
  });
}
