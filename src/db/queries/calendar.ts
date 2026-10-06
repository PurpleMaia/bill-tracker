import { db } from '@/db/kysely/client';
import type { MilestoneUpdate } from '@/lib/calendar/bill-milestones';

/** Upper bound on bills per request — keeps the IN list and payload bounded. */
export const MAX_CALENDAR_BILL_IDS = 1000;

/**
 * Full action history for a set of bills, keyed by bill id. Feeds the
 * calendar's milestone derivation. Status updates are public legislative
 * records, so no tenant scoping applies.
 */
export async function getStatusUpdatesForBills(
  billIds: string[],
): Promise<Record<string, MilestoneUpdate[]>> {
  const result: Record<string, MilestoneUpdate[]> = {};
  if (billIds.length === 0) return result;

  const rows = await db
    .selectFrom('status_updates as su')
    .select(['su.bill_id', 'su.date', 'su.statustext', 'su.chamber'])
    .where('su.bill_id', 'in', billIds)
    .execute();

  for (const id of billIds) result[id] = [];
  for (const row of rows) {
    result[row.bill_id]?.push({ date: row.date, statustext: row.statustext, chamber: row.chamber });
  }
  return result;
}

/** De-duplicate and bound a caller-supplied id list; throws on malformed input. */
export function normalizeCalendarBillIds(input: unknown): string[] {
  if (!Array.isArray(input) || !input.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('billIds must be an array of strings');
  }
  const unique = Array.from(new Set(input as string[]));
  if (unique.length > MAX_CALENDAR_BILL_IDS) {
    throw new Error(`Too many bills (max ${MAX_CALENDAR_BILL_IDS})`);
  }
  return unique;
}
