import { defineClient } from './define-client';
import {
  getCommitteeChairsAction,
  getConfereesAction,
  getLegislatorOptionsAction,
} from '@/app/actions/legislators';
import type { CommitteeChair } from '@/db/queries/committee-chairs';
import type { Conferee } from '@/db/queries/conferees';
import type { LegislatorOption } from '@/types/legislation';
import type { ParsedConferee } from '@/lib/testimony/conferees';

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

async function getConfereesFetch(
  billId: string,
  conferees: ParsedConferee[],
): Promise<Conferee[]> {
  const res = await fetch(`/api/bills/${billId}/conferees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conferees }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load conferees');
  }
  return res.json();
}

async function getLegislatorOptionsFetch(): Promise<LegislatorOption[]> {
  const res = await fetch('/api/legislators');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load legislators');
  }
  return res.json();
}

export const legislatorsClient = defineClient('legislators', {
  getChairs: { action: getCommitteeChairsAction, fetch: getCommitteeChairsFetch },
  getConferees: { action: getConfereesAction, fetch: getConfereesFetch },
  getOptions: { action: getLegislatorOptionsAction, fetch: getLegislatorOptionsFetch },
});
