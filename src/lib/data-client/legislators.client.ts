import { defineClient } from './define-client';
import { getCommitteeChairsAction } from '@/app/actions/legislators';
import type { CommitteeChair } from '@/db/queries/committee-chairs';

async function getCommitteeChairsFetch(
  billId: string,
  committeeAssignment: string | null,
): Promise<CommitteeChair[]> {
  const qs = committeeAssignment ? `?committees=${encodeURIComponent(committeeAssignment)}` : '';
  const res = await fetch(`/api/bills/${billId}/chairs${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load committee chairs');
  }
  return res.json();
}

export const legislatorsClient = defineClient('legislators', {
  getChairs: { action: getCommitteeChairsAction, fetch: getCommitteeChairsFetch },
});
