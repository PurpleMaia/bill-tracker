import type { Bill } from '@/types/legislation';
import { db } from '@/db/kysely/client';
import { getAllTrackedBills } from './bills-read';
import { getOrgTestimonyBillIds } from './testimony';

/**
 * What an org's read-only board shows: its bills and which of them it has
 * testimony on. No visibility check — callers decide who may see it (anyone
 * for a public board, the org's own admins for a preview).
 */
export async function getOrgBoardContents(
  tenantId: string,
): Promise<{ bills: Bill[]; testimonyBillIds: string[] }> {
  // includeTrackedBy: false — person-tracking data never leaves the DB here.
  const bills = await getAllTrackedBills(false, tenantId, false);
  const testimonyBillIds = await getOrgTestimonyBillIds(tenantId, bills.map((b) => b.id));
  return { bills, testimonyBillIds };
}

/** An org's identity + visibility, regardless of public_board. Caller must authorize. */
export async function getOrgBoardInfo(tenantId: string) {
  const row = await db
    .selectFrom('tenants')
    .select(['id', 'name', 'slug', 'description', 'public_board'])
    .where('id', '=', tenantId)
    .executeTakeFirst();
  return row ?? null;
}
