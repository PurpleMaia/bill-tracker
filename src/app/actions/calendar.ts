'use server';

import { requireSession } from '@/lib/auth/auth-guards';
import { getStatusUpdatesForBills, normalizeCalendarBillIds } from '@/db/queries/calendar';
import type { MilestoneUpdate } from '@/lib/calendar/bill-milestones';

/** Server-action arm for data.calendar.getUpdates. Logged-in users only. */
export async function getCalendarUpdatesAction(
  billIds: string[],
): Promise<Record<string, MilestoneUpdate[]>> {
  await requireSession.fromAction();
  return getStatusUpdatesForBills(normalizeCalendarBillIds(billIds));
}
