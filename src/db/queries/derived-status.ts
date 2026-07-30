import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';
import { deriveBillStatus } from '@/lib/bills/derived-status';

/**
 * Side-effect function: recomputes the derived status for a bill and writes it
 * to bills.bill_status. Call this after any org updates their status in
 * org_bills, or after the scraper updates ai_status.
 *
 * The pure derivation algorithm lives in @/lib/derived-status (deriveBillStatus);
 * this wrapper just supplies it with DB data and persists the result, keeping
 * the algorithm itself free of any database dependency (and unit-testable).
 */
export async function recomputeDerivedStatus(billId: string): Promise<void> {
  // 1. Get AI status
  const bill = await db
    .selectFrom('bills')
    .select('ai_status')
    .where('id', '=', billId)
    .executeTakeFirst();

  if (!bill) return;

  // 2. Get all org statuses
  const orgRows = await db
    .selectFrom('org_bills')
    .select('bill_status')
    .where('bill_id', '=', billId)
    .execute();

  const orgStatuses = orgRows
    .map(r => r.bill_status)
    .filter((s): s is BillStatus => s != null);

  // 3. Compute derived status
  const derived = deriveBillStatus(bill.ai_status as BillStatus | null, orgStatuses);

  // 4. Write back
  await db
    .updateTable('bills')
    .set({ bill_status: derived, updated_at: new Date() })
    .where('id', '=', billId)
    .execute();
}
