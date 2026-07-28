'use server';

import type { Bill, BillTracker, BillDetails, StatusUpdate, BillVersion, CommitteeReport } from '@/types/legislation';
import { db } from '@/db/kysely/client';
import { StatusUpdates } from '@/db/types';
import { Selectable, sql } from 'kysely';
import { getBatchBillTags } from '@/db/queries/tags';
import { mapBillDataToBillClient, convertDataToBillShape, mapVersionRow, mapReportRow } from '@/db/queries/bill-mappers';

// ==============================================
// BILL FETCH FUNCTIONS
// ===============================================

/**
 * Gets all food-related bills that have been adopted (at least one adoption)
 * Used for public view
 * @param showArchived Whether to include archived bills (default: false)
 */
export async function getAllTrackedBills(showArchived: boolean = false, tenantId?: string, includeTrackedBy: boolean = false): Promise<Bill[]> {
    console.log(`[BILLS FETCH (PUBLIC)] Fetching all food+ tracked bills, tenant: ${tenantId?.slice(0, 6) ?? 'public'}...`);
    try {
        // Fetch all bills that have been adopted at least once
        let query = db
          .selectFrom('bills as b')
          .innerJoin('user_bills as ub', 'b.id', 'ub.bill_id') // Only bills that have been adopted
          .selectAll('b');

        if (tenantId) {
          // Tenant-scoped: show all bills tracked by anyone in this tenant
          query = query.where('ub.tenant_id', '=', tenantId);
        } else {
          // Public: only food-related bills
          query = query.where('food_related', '=', true);
        }

        // Conditionally exclude archived bills
        if (!showArchived) {
          query = query.where('b.archived', '=', false);
        }

        const bills = await query
          .orderBy('b.updated_at', 'desc')  // Most recently updated first
          .execute();

        if (bills.length === 0) {
          console.log('[BILLS FETCH (PUBLIC)] No bills found in database (check if archived)');
          return [];
        }

        const billIds = bills.map(bill => bill.id);

        console.log(`[BILLS FETCH (PUBLIC)] Found ${billIds.length} food-related adopted bills, fetching status updates & tags...`);
        const additionalData = await getAdditionalBillData(billIds, includeTrackedBy, tenantId);

        const billObjects = await mapBillDataToBillClient({
          bills,
          additionalData
        });

        console.log(`[BILLS FETCH (PUBLIC)] Rendering ${billObjects.size} food-related adopted bills...`);
        return Array.from(billObjects.values());
      } catch (e) {
        console.log('Data fetch did not work: ', e);
        return [];
      }
    }

/**
 * Gets ALL food-related bills from the database (regardless of adoption status)
 * Used for logged in Food+ members who want to see all bills
 * @param showArchived Whether to include archived bills (default: false)
 */
export async function getAllFoodRelatedBills(showArchived: boolean = false, includeTrackedBy: boolean = false, tenantId?: string): Promise<Bill[]> {
    console.log('[BILLS FETCH (ALL)] Fetching all food-related bills for member view...');
    try {
        let query = db
          .selectFrom('bills as b')
          .selectAll('b')
          .where('food_related', '=', true); // Only food-related bills

        // Conditionally exclude archived bills
        if (!showArchived) {
          query = query.where('b.archived', '=', false);
        }

        const bills = await query
          .orderBy('b.updated_at', 'desc')  // Most recently updated first
          .execute()

        if (bills.length === 0) {
          console.log('[BILLS FETCH (ALL)] No food-related bills found in database (check if archived)');
          return [];
        }

        const billIds = bills.map(bill => bill.id);

        console.log(`[BILLS FETCH (ALL)] Found ${billIds.length} food-related adopted bills, fetching status updates & tags...`);
        const additionalData = await getAdditionalBillData(billIds, includeTrackedBy, tenantId);

        const billObjects = await mapBillDataToBillClient({
          bills,
          additionalData
        });

        console.log(`[BILLS FETCH (ALL)] Rendering ${billObjects.size} food-related adopted bills...`);

        return Array.from(billObjects.values());
    } catch (e) {
      console.log('Data fetch did not work: ', e);
      return [];
    }
}

/**
 * Gets all bills tracked by a specific user
 * If user is a supervisor, also includes bills adopted by their interns
 * @param userId User ID to get tracked bills for
 * @param showArchived Whether to include archived bills (default: false)
 */
export async function getUserTrackedBills(userId: string, showArchived: boolean = false, includeTrackedBy: boolean = false, tenantId?: string): Promise<Bill[]> {
  console.log(`[BILLS FETCH (USER)] Fetching bills tracked by user: ${userId.slice(0, 6)}...`);
  try {
    // Check user role
    const user = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) {
      console.log('[BILLS FETCH (USER)] User not found:', userId);
      throw new Error('User not found');
    }

    // Get bills directly adopted by the user
    let userBillsQuery = db
      .selectFrom('bills as b')
      .innerJoin('user_bills as ub', 'b.id', 'ub.bill_id') // Only bills that have been adopted (bills that have a bill id in the user_bills table)
      .selectAll('b')
      .where('ub.user_id', '=', userId);

    if (tenantId) {
      userBillsQuery = userBillsQuery.where('ub.tenant_id', '=', tenantId);
    }

    // Conditionally exclude archived bills
    if (!showArchived) {
      userBillsQuery = userBillsQuery.where('b.archived', '=', false);
    }

    const userBills = await userBillsQuery
      .orderBy('b.updated_at', 'desc')
      .execute();

    console.log(`[BILLS FETCH (USER)] Found ${userBills.length} bill(s) directly tracked by user ${userId.slice(0, 6)} (role: ${user.role})`);
    let bills = [...userBills];

    // If user is a supervisor, also get bills from their adopted interns
    if (user.role === 'supervisor') {
      console.log(`[BILLS FETCH (SUPERVISOR)] User is a supervisor, fetching bills managed by intern(s)...`);

      // Get intern IDs adopted by this supervisor
      const supervisorRelations = await db
        .selectFrom('supervisor_users')
        .select(['user_id'])
        .where('supervisor_id', '=', userId)
        .execute();

      const internIds = supervisorRelations.map((rel) => rel.user_id);
      console.log(`[BILLS FETCH (SUPERVISOR)] Found ${internIds.length} interns for this supervisor...`);

      // Get bills adopted by these interns
      if (internIds.length > 0) {
        let internBillsQuery = db
          .selectFrom('bills as b')
          .innerJoin('user_bills as ub', 'b.id', 'ub.bill_id')
          .where('ub.user_id', 'in', internIds);

        if (tenantId) {
          internBillsQuery = internBillsQuery.where('ub.tenant_id', '=', tenantId);
        }

        // Conditionally exclude archived bills
        if (!showArchived) {
          internBillsQuery = internBillsQuery.where('b.archived', '=', false);
        }

        const internBills = await internBillsQuery
          .selectAll('b')
          .orderBy('b.updated_at', 'desc')
          .execute();

        console.log(`[BILLS FETCH (SUPERVISOR)] Found ${internBills.length} bills from adopted interns`);
        // Combine both sets of bills
        bills = [...userBills, ...internBills];
        console.log(`[BILLS FETCH (SUPERVISOR)] Total bills (direct + intern): ${bills.length}`);
      }
    }

    if (bills.length === 0) {
      console.log('[BILLS FETCH (USER)] No food-related tracked bills found (check for archived)');
      return [];
    }

    const billIds = bills.map(bill => bill.id);
    console.log(`[BILLS FETCH (USER)] Fetching status updates & tags for ${billIds.length} bills...`);
    const { statusUpdates, tags, trackedBy, trackedCount, orgBillStatuses } = await getAdditionalBillData(billIds, includeTrackedBy, tenantId);

    const billObjects = await mapBillDataToBillClient({
      bills,
      additionalData: {
        statusUpdates,
        tags,
        trackedBy,
        trackedCount,
        orgBillStatuses,
      }
    });

    console.log(`[BILLS FETCH (USER)] Rendering ${billObjects.size} tracked bills...`);
    return Array.from(billObjects.values());
  } catch (error) {
    console.error('Failed to get user adopted bills:', error);
    return [];
  }
}

/**
 * Helper to fetch status updates and tags for fetched bills
 */
export async function getAdditionalBillData(billIds: string[], includeTrackedBy: boolean = false, tenantId?: string) {
  // Batch fetch status updates for these bills
  const statusUpdates = await getBatchStatusUpdates(billIds);

  // Batch fetch tags for these bills
  const tags = tenantId ? await getBatchBillTags(billIds, tenantId) : {};

  const trackedBy = includeTrackedBy ? await getTrackedByForBills(billIds, tenantId) : {};

  // Gate the tracked-count aggregate on the same flag as tracked-by: the
  // Active Boards read (includeTrackedBy=false) must not expose how many
  // people in the viewed org track each bill. Member/admin views pass true.
  const trackedCount = includeTrackedBy ? await getTrackedCountForBills(billIds, tenantId) : {};

  // Batch fetch org-specific statuses if tenant scoped
  const orgBillStatuses: Record<string, string> = {};
  if (tenantId && billIds.length > 0) {
    const orgRows = await db
      .selectFrom('org_bills')
      .select(['bill_id', 'bill_status'])
      .where('tenant_id', '=', tenantId)
      .where('bill_id', 'in', billIds)
      .execute();
    for (const row of orgRows) {
      orgBillStatuses[row.bill_id] = row.bill_status;
    }
  }

  return { statusUpdates, tags, trackedBy, trackedCount, orgBillStatuses };
}

/**
 * Fetches all draft versions and committee reports for a bill, ordered oldest
 * first by created_at. Backs the Versions & Reports panel in the bill dialog.
 */
export async function getBillVersionsAndReports(
  billId: string,
): Promise<{ versions: BillVersion[]; reports: CommitteeReport[] }> {
  const [versionRows, reportRows] = await Promise.all([
    db.selectFrom('bill_versions').selectAll().where('bill_id', '=', billId)
      .orderBy('created_at', 'asc').execute(),
    db.selectFrom('committee_reports').selectAll().where('bill_id', '=', billId)
      .orderBy('created_at', 'asc').execute(),
  ]);
  return {
    versions: versionRows.map(mapVersionRow),
    reports: reportRows.map(mapReportRow),
  };
}

/**
 * Fetches the label and source-document link for two specific versions of a
 * bill, for the version-comparison diff. Scoped by bill_id so a caller cannot
 * pull versions belonging to another bill by guessing ids.
 */
export async function getVersionHtmlLinks(
  billId: string,
  olderId: string,
  newerId: string,
): Promise<{
  older: { label: string; htmlLink: string | null } | null;
  newer: { label: string; htmlLink: string | null } | null;
}> {
  const rows = await db
    .selectFrom('bill_versions')
    .select(['id', 'label', 'html_link'])
    .where('bill_id', '=', billId)
    .where('id', 'in', [olderId, newerId])
    .execute();

  const find = (id: string) => {
    const row = rows.find((r) => r.id === id);
    return row ? { label: row.label, htmlLink: row.html_link } : null;
  };

  return { older: find(olderId), newer: find(newerId) };
}

/**
 * Fetches detailed bill information including status updates and extended metadata.
 * Used by BillDetailsDialog to get full bill information on-demand.
 *
 * @param billId The ID of the bill to fetch
 * @returns BillDetails object with all metadata and status updates
 */
export async function getBillDetails(billId: string): Promise<BillDetails> {
  console.log(`[BILL DETAILS] Fetching details for bill: ${billId.slice(0, 6)}...`);

  try {
    const bill = await db
      .selectFrom('bills')
      .selectAll()
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      console.error(`[BILL DETAILS] Bill not found: ${billId}`);
      throw new Error('Bill not found');
    }

    const [updates, { versions, reports }] = await Promise.all([
      getStatusUpdatesForBill(billId),
      getBillVersionsAndReports(billId),
    ]);
    console.log(`[BILL DETAILS] Found ${updates.length} status updates, ${versions.length} versions, ${reports.length} reports for bill ${billId.slice(0, 6)}`);

    // Use the generic converter with includeExtendedFields flag
    const billDetails = await convertDataToBillShape(
      bill,
      { updates, versions, reports },
      true  // includeExtendedFields = true to get BillDetails
    );

    console.log(`[BILL DETAILS] Successfully converted bill details for ${billId.slice(0, 6)}`);
    return billDetails;
  } catch (error) {
    console.error('[BILL DETAILS] Failed to get bill details:', error);
    throw error instanceof Error ? error : new Error('Failed to get bill details');
  }
}

async function getBatchStatusUpdates(billIds: string[]): Promise<Record<string, Selectable<StatusUpdates>[]>> {
  try {
    if (!Array.isArray(billIds) || billIds.length === 0) {
      return {};
    }

    // Fetch all status updates for the given bill IDs
    const updates = await db
      .selectFrom('status_updates as su')
      .selectAll()
      .where('su.bill_id', 'in', billIds)
      .orderBy(sql`cast(su.date as date)`, 'desc')
      .execute();

    const updatesByBillId = updates.reduce((acc, update) => {
      if (!acc[update.bill_id]) {
        acc[update.bill_id] = [];
      }
      acc[update.bill_id].push(update);
      return acc;
    }, {} as Record<string, Selectable<StatusUpdates>[]>);

    // Ensure all requested bill IDs have an entry (even if empty)
    billIds.forEach(billId => {
      if (!updatesByBillId[billId]) {
        updatesByBillId[billId] = [];
      }
    });

    return updatesByBillId;
  } catch (error) {
    console.error('Failed to get batch status updates:', error);
    return {};
  }
}


export async function getStatusUpdatesForBill(billId: string): Promise<StatusUpdate[]> {
    const updates = await db
      .selectFrom('status_updates as su')
      .select([
        'su.chamber',
        'su.date',
        'su.id',
        'su.statustext',
      ])
      .where('su.bill_id', '=', billId)
      .orderBy(sql`cast(su.date as date)`, 'desc')
      .execute();
    return updates;
}

async function getTrackedByForBills(billIds: string[], tenantId?: string): Promise<Record<string, BillTracker[]>> {
  if (billIds.length === 0) return {};

  let query = db
    .selectFrom('user_bills as ub')
    .innerJoin('user as u', 'ub.user_id', 'u.id')
    .select([
      'ub.bill_id as bill_id',
      'u.id as user_id',
      'u.email as user_email',
      'u.username as user_username',
      'ub.adopted_at as adopted_at',
    ])
    .where('ub.bill_id', 'in', billIds);

  if (tenantId) {
    query = query.where('ub.tenant_id', '=', tenantId);
  }

  const rows = await query
    .orderBy('ub.adopted_at', 'desc')
    .execute();

  const trackedBy: Record<string, BillTracker[]> = {};

  rows.forEach((row) => {
    if (!trackedBy[row.bill_id as string]) {
      trackedBy[row.bill_id as string] = [];
    }

    trackedBy[row.bill_id as string].push({
      id: row.user_id as string,
      email: row.user_email ?? null,
      username: row.user_username ?? null,
      adopted_at: row.adopted_at ?? null,
    });
  });

  return trackedBy;
}

async function getTrackedCountForBills(billIds: string[], tenantId?: string): Promise<Record<string, number>> {
  if (billIds.length === 0) return {};

  let query = db
    .selectFrom('user_bills as ub')
    .select([
      'ub.bill_id as bill_id',
      db.fn.countAll().as('tracked_count'),
    ])
    .where('ub.bill_id', 'in', billIds);

  if (tenantId) {
    query = query.where('ub.tenant_id', '=', tenantId);
  }

  const rows = await query
    .groupBy('ub.bill_id')
    .execute();

  const trackedCount: Record<string, number> = {};

  rows.forEach((row) => {
    trackedCount[row.bill_id as string] = Number(row.tracked_count ?? 0);
  });

  return trackedCount;
}

/**
 * Returns the distinct bill IDs the given user tracks, across every tenant
 * context. Used by Active Boards to reflect whether the current user already
 * tracks a bill they are viewing on another org's board. Deliberately NOT
 * tenant-scoped — it mirrors the not-tenant-scoped "already tracked" guard in
 * trackBill (bills-write.ts).
 */
export async function getUserTrackedBillIds(userId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('user_bills')
    .select('bill_id')
    .where('user_id', '=', userId)
    .execute();
  return [...new Set(rows.map((r) => r.bill_id).filter((id): id is string => id !== null))];
}

// ==============================================
// BILL SEARCH FUNCTIONS
// ==============================================

/**
 * Finds an existing bill in the database by its URL used in adding/removing a bill manually ONLY
 *
 * @param billURL The URL of the bill to find.
 * @returns The found Bill object or null if not found.
 */
export async function findExistingBillByURL(billURl: string): Promise<BillDetails | null> {
  try {

    // extract the billtype and billnumber from the URL
    const urlObj = new URL(billURl);
    const billType = urlObj.searchParams.get('billtype');
    const billNumber = urlObj.searchParams.get('billnumber');

    const billTitle = billType && billNumber ? `${billType}${billNumber}` : null;

    if (!billTitle) {
      console.log('Invalid bill URL, cannot extract bill type and number:', billURl);
      throw new Error('Invalid bill URL');
    }

    // First pass of exact match on bill_number
    const exactMatch = await db.selectFrom('bills')
      .selectAll()
      .where('bill_number', '=', billTitle as string)
      .executeTakeFirst();

    if (exactMatch) {
      console.log(`Found existing bill in database based on: `, billURl)
      const updates = await getStatusUpdatesForBill(exactMatch.id);
      const bill = await convertDataToBillShape(
        exactMatch,
        { updates },
        true
      );

      return bill;
    }

    // Second pass of partial match on bill_number (in case of suffixes)
    const partialMatchResult = await db.selectFrom('bills')
      .selectAll()
      .where('bill_number', 'like', `${billTitle}%`)
      .executeTakeFirst();

    if (partialMatchResult) {
      console.log(`Found existing bill in database based on partial match: `, billURl)
      const updates = await getStatusUpdatesForBill(partialMatchResult.id);
      const bill = await convertDataToBillShape(
        partialMatchResult,
        { updates },
        true
      );

      return bill;
    }

    console.log('No existing bill found in database for URL:', billURl);
    return null;
  } catch (error) {
    console.error('Database search failed', error)
    return null
  }
}
