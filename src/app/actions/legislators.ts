'use server';

import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeChairs } from '@/db/queries/committee-chairs';
import { getConferees } from '@/db/queries/conferees';
import { parseCommitteeCodes } from '@/lib/testimony/committees';
import type { CommitteeChair } from '@/db/queries/committee-chairs';
import type { Conferee } from '@/db/queries/conferees';
import type { ParsedConferee } from '@/lib/testimony/conferees';

/** Server-action arm for data.legislators.getChairs. Chairs are public record. */
export async function getCommitteeChairsAction(
  _billId: string,
  committeeAssignment: string | null,
): Promise<CommitteeChair[]> {
  await optionalSession.fromAction();
  return getCommitteeChairs(parseCommitteeCodes(committeeAssignment));
}

/** Server-action arm for data.legislators.getConferees. Conferees are public record. */
export async function getConfereesAction(
  _billId: string,
  conferees: ParsedConferee[],
): Promise<Conferee[]> {
  await optionalSession.fromAction();
  return getConferees(conferees);
}
