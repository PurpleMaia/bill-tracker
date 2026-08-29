import { defineClient } from './define-client';
import { getCommitteeNamesAction } from '@/app/actions/committees';
import type { CommitteeNameMap } from '@/db/queries/committees';

async function getCommitteeNamesFetch(): Promise<CommitteeNameMap> {
  const res = await fetch('/api/committees');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load committee names');
  }
  return res.json();
}

export const committeesClient = defineClient('committees', {
  getNames: { action: getCommitteeNamesAction, fetch: getCommitteeNamesFetch },
});
