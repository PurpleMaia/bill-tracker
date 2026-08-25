'use server';

import type { Bill, BillTracker, BillDetails, StatusUpdate, BillVersion, CommitteeReport, BillSearchResult, BillSearchResponse, SearchBillsParams } from '@/types/legislation';
import {
  isBillNumberQuery,
  chamberPrefixes,
  encodeCursor,
  decodeCursor,
  SEARCH_PAGE_SIZE,
} from '@/lib/bills/search-params';
import { STATUS_TO_SIMPLIFIED } from '@/lib/bills/kanban-columns';
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

    // extract the billtype, billnumber, and YEAR from the URL. Bills are keyed
    // by (bill_number, year): the same base number (e.g. SB1432) exists in both
    // 2025 and 2026, so year is required to resolve to the right bill.
    const urlObj = new URL(billURl);
    const billType = urlObj.searchParams.get('billtype');
    const billNumber = urlObj.searchParams.get('billnumber');
    const yearParam = urlObj.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : null;

    const billTitle = billType && billNumber ? `${billType}${billNumber}` : null;

    if (!billTitle) {
      console.log('Invalid bill URL, cannot extract bill type and number:', billURl);
      throw new Error('Invalid bill URL');
    }

    // Matches the base number exactly OR a suffixed variant ("SB1432 SD2 ...").
    // The trailing space in the LIKE pattern is a word boundary so "SB20" does
    // NOT match "SB200"/"SB2000". Escape LIKE metacharacters in the base number.
    const likeBase = billTitle.replace(/([%_\\])/g, '\\$1');

    // Among rows for the same base, prefer the exact base, then the most-amended
    // (latest) suffixed variant. Longer bill_number ⇒ more amendment suffixes ⇒
    // the bill's current form.
    const variantPreference = sql`case when bill_number = ${billTitle} then 0 else 1 end, length(bill_number) desc, bill_number desc`;

    const baseQuery = db
      .selectFrom('bills')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('bill_number', '=', billTitle),
          eb('bill_number', 'like', `${likeBase} %`),
        ]),
      );

    // Pass 1: same-year match (the correct, unambiguous result).
    if (year !== null && Number.isFinite(year)) {
      const sameYear = await baseQuery
        .where('year', '=', year)
        .orderBy(variantPreference)
        .executeTakeFirst();
      if (sameYear) {
        console.log(`Found existing bill (same year ${year}) for:`, billURl);
        const updates = await getStatusUpdatesForBill(sameYear.id);
        return await convertDataToBillShape(sameYear, { updates }, true);
      }
    }

    // Pass 2: fall back to any year, most recent first (bill not yet scraped for
    // the URL's year). Year desc takes precedence, then variant preference.
    const anyYear = await baseQuery
      .orderBy(sql`coalesce(year, 0) desc`)
      .orderBy(variantPreference)
      .executeTakeFirst();

    if (anyYear) {
      console.log(`Found existing bill (any-year fallback, year ${anyYear.year}) for:`, billURl);
      const updates = await getStatusUpdatesForBill(anyYear.id);
      return await convertDataToBillShape(anyYear, { updates }, true);
    }

    console.log('No existing bill found in database for URL:', billURl);
    return null;
  } catch (error) {
    console.error('Database search failed', error)
    return null
  }
}

/**
 * Searches the FULL bills table — the only bill query with no user_bills join,
 * so it can surface bills nobody tracks yet.
 *
 * Two branches: a bill-number lookup (exact, then trigram prefix) and an FTS
 * branch ranked by ts_rank over the weighted search_vector. Pagination is
 * keyset, not OFFSET, so deep pages stay flat.
 */
export async function searchBills(params: SearchBillsParams): Promise<BillSearchResponse> {
  const {
    q,
    years,
    chambers,
    stages,
    deadFilter,
    trackedFilter,
    cursor,
    limit = SEARCH_PAGE_SIZE,
    userId,
    tenantId,
  } = params;
  const trimmed = (q ?? '').trim();

  // Per-user "does this user track this bill" flag. EXISTS keeps searchBills's
  // no-join contract intact (no rows are added or duplicated) while letting the
  // card seed its Tracked state and the tracked/untracked filter apply. Scoped
  // by tenant when in a tenant context, mirroring the board's user_bills reads.
  // Resolves to FALSE when no user is present (logged-out search).
  const isTrackedExpr = userId
    ? tenantId
      ? sql<boolean>`exists (select 1 from user_bills ub where ub.bill_id = bills.id and ub.user_id = ${userId} and ub.tenant_id = ${tenantId})`
      : sql<boolean>`exists (select 1 from user_bills ub where ub.bill_id = bills.id and ub.user_id = ${userId})`
    : sql<boolean>`false`;

  // Expand simplified stage ids back to the concrete BillStatus values stored
  // on the row. STATUS_TO_SIMPLIFIED is the same mapping the kanban board uses.
  const statusValues = stages?.length
    ? Object.entries(STATUS_TO_SIMPLIFIED)
        .filter(([, simplified]) => stages.includes(simplified))
        .map(([status]) => status)
    : [];

  const applyFilters = <T extends { where: any }>(qb: T): T => {
    let out: any = qb;
    if (years?.length) out = out.where('year', 'in', years);
    if (chambers?.length) {
      const prefixes = chamberPrefixes(chambers);
      out = out.where((eb: any) =>
        eb.or(prefixes.map((p) => eb('bill_number', 'like', `${p}%`))),
      );
    }
    if (statusValues.length) out = out.where('bill_status', 'in', statusValues);
    if (deadFilter === 'alive') out = out.where('dead', '=', false);
    if (deadFilter === 'dead') out = out.where('dead', '=', true);
    // Tracked filter is user-scoped — a no-op without a resolved user, so a
    // logged-out request can never accidentally hide every bill.
    if (userId && trackedFilter === 'tracked') out = out.where(isTrackedExpr);
    if (userId && trackedFilter === 'untracked') out = out.where(sql<boolean>`not ${isTrackedExpr}`);
    return out as T;
  };

  // The bill-number branch compares against a punctuation-stripped bill_number
  // ("SB 1251" and "SB-1251" both normalize to SB1251).
  const normalizedNumber = trimmed.replace(/[\s-]/g, '');
  const isNumberQuery = trimmed ? isBillNumberQuery(trimmed) : false;

  // Every branch must produce `real`, the type ts_rank returns. The keyset
  // cursor compares this expression against a `::real` parameter, and an
  // untyped `1.0` would be `numeric` — under which `numeric 0.8 < real 0.8` is
  // TRUE, so the cursor would never advance past a rank tier and pagination
  // would loop on the same rows forever.
  const rankExpr = trimmed
    ? isNumberQuery
      // Bill-number branch: exact match outranks prefix, prefix outranks
      // substring. Values are parameterized by the sql template.
      ? sql<number>`CASE
          WHEN upper(replace(replace(bill_number, ' ', ''), '-', '')) = upper(${normalizedNumber}) THEN 1.0::real
          WHEN upper(replace(replace(bill_number, ' ', ''), '-', '')) LIKE upper(${normalizedNumber + '%'}) THEN 0.8::real
          ELSE 0.6::real END`
      : sql<number>`ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed}))`
    : sql<number>`0::real`;

  // updated_at is nullable in the schema. A NULL in the keyset row-comparison
  // makes the whole predicate NULL (dropping rows silently), so sort on a
  // coalesced stamp instead and use the identical expression in the cursor.
  const sortStamp = sql<Date>`coalesce(updated_at, 'epoch'::timestamptz)`;

  let base = db.selectFrom('bills');

  if (trimmed) {
    base = isNumberQuery
      ? base.where(
          sql<boolean>`replace(replace(bill_number, ' ', ''), '-', '') ILIKE ${'%' + normalizedNumber + '%'}`,
        )
      : base.where(
          sql<boolean>`search_vector @@ websearch_to_tsquery('english', ${trimmed})`,
        );
  }

  base = applyFilters(base);

  // Count before pagination so the header can show the full result size.
  const countRow = await base
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .executeTakeFirst();
  const totalCount = Number(countRow?.count ?? 0);

  let rowsQuery = base
    .select([
      'id',
      'bill_number',
      'bill_title',
      'description',
      'year',
      'bill_status',
      'dead',
      'bill_url',
      'updated_at',
      'nickname',
      'committee_assignment',
    ])
    .select(rankExpr.as('rank'))
    .select(sortStamp.as('sort_stamp'))
    .select(isTrackedExpr.as('is_tracked'))
    .orderBy(sql`rank`, 'desc')
    .orderBy(sql`sort_stamp`, 'desc')
    .orderBy('id', 'desc')
    .limit(limit + 1); // one extra row tells us whether another page exists

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    // Keyset: continue strictly after the last row's (rank, sort_stamp, id).
    // Row-comparison mirrors the ORDER BY exactly, so it can't skip or repeat.
    rowsQuery = rowsQuery.where(
      sql<boolean>`(${rankExpr}, ${sortStamp}, id) < (${decoded.rank}::real, ${decoded.updatedAt}::timestamptz, ${decoded.id}::uuid)`,
    );
  }

  const rows = await rowsQuery.execute();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Latest status update per bill, for the card's activity line. ONE batched
  // query with DISTINCT ON for the whole page — never one query per bill, which
  // would make a 40-card page cost 41 round trips.
  const pageIds = page.map((r: any) => r.id);
  const latestUpdates = pageIds.length
    ? await db
        .selectFrom('status_updates')
        .select(['bill_id', 'id', 'chamber', 'date', 'statustext'])
        .where('bill_id', 'in', pageIds)
        .distinctOn('bill_id')
        .orderBy('bill_id')
        .orderBy('date', 'desc')
        .execute()
    : [];

  const updateByBillId = new Map(latestUpdates.map((u) => [u.bill_id, u]));

  const items: BillSearchResult[] = page.map((r: any) => {
    const update = updateByBillId.get(r.id);
    return {
      id: r.id,
      bill_number: r.bill_number ?? '',
      bill_title: r.bill_title ?? '',
      description: r.description ?? '',
      year: r.year,
      bill_status: r.bill_status,
      dead: r.dead,
      bill_url: r.bill_url,
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      nickname: r.nickname ?? null,
      committee_assignment: r.committee_assignment ?? null,
      latest_update: update
        ? {
            id: update.id,
            chamber: update.chamber,
            date: update.date,
            statustext: update.statustext,
          }
        : null,
      is_tracked: Boolean(r.is_tracked),
    };
  });

  const last: any = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          rank: Number(last.rank),
          // sort_stamp, not updated_at — the cursor must carry the same value
          // the ORDER BY used, or the next page starts from the wrong place.
          updatedAt: new Date(last.sort_stamp).toISOString(),
          id: last.id,
        })
      : null;

  return { items, nextCursor, totalCount };
}
