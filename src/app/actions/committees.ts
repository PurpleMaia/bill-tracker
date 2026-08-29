'use server';

import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeNames, type CommitteeNameMap } from '@/db/queries/committees';

/** Server-action arm for data.committees.getNames. Committee names are public. */
export async function getCommitteeNamesAction(): Promise<CommitteeNameMap> {
  await optionalSession.fromAction();
  return getCommitteeNames();
}
