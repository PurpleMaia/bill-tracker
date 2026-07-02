// ==============================================
// TESTIMONY ELIGIBILITY — pure rules for when the
// "Write Testimony" action is open or closed
// ==============================================
// Testimony is closed when the bill is enacted into law, dead, or the
// session's final hearing deadline (final decking) has passed — fiscal
// bills (FIN/WAM) get the later fiscal decking date.

import type { BillStatus } from '@/db/types';
import type { SessionDeadlines } from '@/lib/dead-bill';
import { isFiscalBill } from '@/lib/dead-bill';

const ENACTED_STATUSES: BillStatus[] = ['governorSigns', 'lawWithoutSignature'];

export interface TestimonyEligibility {
  allowed: boolean;
  /** Human-readable reason testimony is closed; null when allowed. */
  reason: string | null;
}

export function getTestimonyEligibility(params: {
  dead: boolean;
  billStatus: BillStatus;
  committeeAssignment: string | null;
  deadlines: SessionDeadlines;
  /** Today's date as YYYY-MM-DD (lexicographically comparable). */
  today: string;
}): TestimonyEligibility {
  if (ENACTED_STATUSES.includes(params.billStatus)) {
    return { allowed: false, reason: 'This bill has been enacted into law' };
  }

  if (params.dead) {
    return { allowed: false, reason: 'This bill is dead' };
  }

  const fiscal = params.committeeAssignment ? isFiscalBill(params.committeeAssignment) : false;
  const finalHearingDeadline = fiscal
    ? params.deadlines.deadlines.final_decking_fiscal
    : params.deadlines.deadlines.final_decking_non_fiscal;
  if (params.today > finalHearingDeadline) {
    return { allowed: false, reason: 'The final hearing deadline has passed' };
  }

  return { allowed: true, reason: null };
}
