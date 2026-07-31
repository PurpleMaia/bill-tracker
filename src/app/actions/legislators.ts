'use server';

import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeChairs } from '@/db/queries/committee-chairs';
import { parseCommitteeCodes } from '@/lib/testimony/committees';
import type { CommitteeChair } from '@/db/queries/committee-chairs';

/** Server-action arm for data.legislators.getChairs. Chairs are public record. */
export async function getCommitteeChairsAction(
  _billId: string,
  committeeAssignment: string | null,
): Promise<CommitteeChair[]> {
  await optionalSession.fromAction();
  return getCommitteeChairs(parseCommitteeCodes(committeeAssignment));
}
