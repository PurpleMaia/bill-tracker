'use server';

import type { Bill, BillTracker, Tag, BillDetails, StatusUpdate } from '@/types/legislation';
import { KANBAN_COLUMNS } from '@/lib/kanban-columns';
import { db } from '@/db/kysely/client';
import { Bills, BillStatus, StatusUpdates, User } from '@/db/types';
import { Selectable, sql } from 'kysely';
import { getBatchBillTags } from '@/services/data/tags';

// ==============================================
// BILL FETCH FUNCTIONS
// ===============================================

/**
 * Gets all food-related bills that have been adopted (at least one adoption)
 * Used for public view
 * @param showArchived Whether to include archived bills (default: false)
 */
export async function getAllTrackedBills(showArchived: boolean = false): Promise<Bill[]> {
    console.log('[BILLS FETCH (PUBLIC)] Fetching all food+ tracked bills for public view...');
    try {
        // Fetch all bills that have been adopted at least once
        let query = db
          .selectFrom('bills as b')
          .innerJoin('user_bills as ub', 'b.id', 'ub.bill_id') // Only bills that have been adopted
          .selectAll('b')
          .where('food_related', '=', true); // Only food-related bills

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
        const additionalData = await getAdditionalBillData(billIds);

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
export async function getAllFoodRelatedBills(showArchived: boolean = false, includeTrackedBy: boolean = false): Promise<Bill[]> {
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
        const additionalData = await getAdditionalBillData(billIds, includeTrackedBy);

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
export async function getUserTrackedBills(userId: string, showArchived: boolean = false, includeTrackedBy: boolean = false): Promise<Bill[]> {
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
    const { statusUpdates, tags, trackedBy, trackedCount } = await getAdditionalBillData(billIds, includeTrackedBy);

    const billObjects = await mapBillDataToBillClient({
      bills,
      additionalData: {
        statusUpdates,
        tags,
        trackedBy,
        trackedCount
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
async function getAdditionalBillData(billIds: string[], includeTrackedBy: boolean = false) {
  // Batch fetch status updates for these bills
  const statusUpdates = await getBatchStatusUpdates(billIds);

  // Batch fetch tags for these bills
  const tags = await getBatchBillTags(billIds);

  const trackedBy = includeTrackedBy ? await getTrackedByForBills(billIds) : {};

  const trackedCount = await getTrackedCountForBills(billIds);

  return { statusUpdates, tags, trackedBy, trackedCount };
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

    const updates = await getStatusUpdatesForBill(billId);
    console.log(`[BILL DETAILS] Found ${updates.length} status updates for bill ${billId.slice(0, 6)}`);

    // Use the generic converter with includeExtendedFields flag
    const billDetails = await convertDataToBillShape(
      bill,
      { updates },
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


async function getStatusUpdatesForBill(billId: string): Promise<StatusUpdate[]> {
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

async function getTrackedByForBills(billIds: string[]): Promise<Record<string, BillTracker[]>> {
  if (billIds.length === 0) return {};

  const rows = await db
    .selectFrom('user_bills as ub')
    .innerJoin('user as u', 'ub.user_id', 'u.id')
    .select([
      'ub.bill_id as bill_id',
      'u.id as user_id',
      'u.email as user_email',
      'u.username as user_username',
      'ub.adopted_at as adopted_at',
    ])
    .where('ub.bill_id', 'in', billIds)
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

async function getTrackedCountForBills(billIds: string[]): Promise<Record<string, number>> {
  if (billIds.length === 0) return {};

  const rows = await db
    .selectFrom('user_bills as ub')
    .select([
      'ub.bill_id as bill_id',
      db.fn.countAll().as('tracked_count'),
    ])
    .where('ub.bill_id', 'in', billIds)
    .groupBy('ub.bill_id')
    .execute();

  const trackedCount: Record<string, number> = {};

  rows.forEach((row) => {
    trackedCount[row.bill_id as string] = Number(row.tracked_count ?? 0);
  });

  return trackedCount;
}

// ==============================================
// BILL UPDATE FUNCTIONS
// ==============================================

/**
 * Asynchronously updates the status of a bill.
 * Also updates the updated_at timestamp.
 *
 * @param billId The ID of the bill to update.
 * @param newStatus The new status (Kanban column ID) for the bill.
 * @returns The updated Bill object.
 */
export async function updateBillStatus(billId: string, newStatus: string): Promise<Bill> {
    console.log(`[UPDATE STATUS] Updating bill ${billId.slice(0, 6)} to new status: ${newStatus}`);

    // Validate if newStatus is a valid column ID
    if (!KANBAN_COLUMNS.some(col => col.id === newStatus)) {
        console.error(`Invalid status update: ${newStatus}`);
        throw new Error('Invalid status requested');
    }

    try {
        const updatedBill = await db.updateTable('bills')
        .set({
            bill_status: newStatus as BillStatus,
            updated_at: new Date()
        })
        .where('id', '=', billId)
        .returningAll()
        .executeTakeFirst();

        if (updatedBill) {
            console.log(`[UPDATE STATUS] Successfully updated bill ${billId.slice(0, 6)} to status ${newStatus} in database`);
            const bill = await convertDataToBillShape(updatedBill);

            return bill;
        } else {
            console.error(`Bill with ID ${billId} not found in database.`);
            throw new Error('Bill not found');
        }
    } catch (error) {
        console.error('Database update failed:', error);
        throw new Error('Failed to update bill status');
    }
}

/**
 * Updates the food-related flag for a bill using its URL.
 *
 * @param billURL The URL of the bill to update (if it exists in the database).
 * @param state The new state of the food-related flag.
 * @returns The updated Bill object
 */

export async function updateFoodStatusOrCreateBill(bill: Bill | BillDetails | null, foodState: boolean | null): Promise<Bill> {
  try {    
    console.log(`[UPDATE FOOD STATUS] Updating food-related flag to ${foodState}`);

    if (!bill) {
      throw new Error('Bill data is required to update food-related flag');
    }

    // if bill type is Bill, convert to BillDetails by fetching missing fields
    // Bill type does not have bill_url field, BillDetails does 

    // THIS IS INEFFICIENT, TODO JUST FIND EXISTING BILL BY BILL ID
    let billURL: string = '';
    const isBasicBill = !(bill as BillDetails).bill_url;
    console.log('Is basic Bill type (missing bill_url)?', isBasicBill);
    if (isBasicBill) {
      console.log('Fetching missing bill_url from database for bill ID:', bill.id.slice(0, 6));
      const missingFields = await db
        .selectFrom('bills')
        .select('bill_url')
        .where('id', '=', bill.id)
        .executeTakeFirst();     
      billURL = missingFields?.bill_url ?? '';
    } else {
      billURL = (bill as BillDetails).bill_url;
    }

    const existingBill = await db
      .selectFrom('bills')
      .selectAll()
      .where('id', '=', bill.id)
      .executeTakeFirst();

    if (!existingBill) {
      console.log('Bill not found in database, creating new bill with food-related flag...');

      // Determine AI misclassification type for new bills
      // If user is adding with food_related=true, it means AI missed it (false negative)
      // If user is adding with food_related=false, no misclassification (just adding for reference)
      const aiMisclassificationType = foodState === true ? 'false_negative' : null;

      // Insert new bill with food-related flag
      const insertedBill = await db
        .insertInto('bills')
        .values({
          id: bill.id,
          bill_number: bill.bill_number,
          bill_title: bill.bill_title,
          bill_url: billURL,
          description: bill.description,
          current_status_string: bill.current_status_string ?? '',
          updated_at: new Date(),
          food_related: foodState,
          ai_misclassification_type: aiMisclassificationType
        })
        .returningAll()
        .executeTakeFirst();

      if (insertedBill) {
        console.log(`Successfully created new bill ${insertedBill.bill_number} with food_related set to ${foodState} in database`);
        if (aiMisclassificationType) {
          console.log(`Bill flagged as AI misclassification: ${aiMisclassificationType}`);
        }
        return await convertDataToBillShape(insertedBill);
      } else {
        console.log('Failed to create new bill in database');
        throw new Error('Failed to create new bill');
      }
    }

    // If bill exists, determine if this is a manual correction
    let aiMisclassificationType: 'false_positive' | 'false_negative' | null = null;

    if (existingBill.food_related !== foodState) {
      // User is changing the food_related status - this is a manual correction
      if (existingBill.food_related === true && foodState === false) {
        // AI said food-related, but user says it's not
        aiMisclassificationType = 'false_positive';
      } else if (existingBill.food_related === false && foodState === true) {
        // AI said not food-related, but user says it is
        aiMisclassificationType = 'false_negative';
      }
    }

    console.log('Existing bill found, updating food-related flag to:', foodState, 'with AI misclassification type:', aiMisclassificationType);

    // If bill exists, update its food-related flag
    const result = await db.updateTable('bills')
      .set({
        food_related: foodState,
        ai_misclassification_type: aiMisclassificationType
      })
      .where('id', '=', existingBill.id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error('Failed to update food-related flag');
    }

    console.log(`Successfully updated bill ${result.bill_number} food_related state to ${foodState} in database`);
    if (aiMisclassificationType) {
      console.log(`Bill flagged as AI misclassification: ${aiMisclassificationType}`);
    }    

    // includeTrackedBy = true since this feature is only available to admins and supervisors
    const { statusUpdates, tags, trackedBy, trackedCount } = await getAdditionalBillData([result.id], true);
    const convertedBill = await convertDataToBillShape(result, {
      statusUpdates,
      tags,
      trackedBy,
      trackedCount
    });

    if (!convertedBill) {
      throw new Error('Failed to convert bill data');
    }

    return convertedBill; // to render on board
  } catch (error) {
    console.error('Database update failed', error)
    throw new Error('Failed to update food-related flag');
  }
}

// ==============================================
// BILL SEARCH FUNCTIONS
// ==============================================

/**
 * Asynchronously searches for bills based on a query (ID, bill_title, or description).
 *
 * @param query The search query.
 * @returns A promise that resolves to an array of matching Bill objects.
 */
export async function searchBills(bills: Bill[], query: string): Promise<Bill[]> {

  if (!query) {
    return bills; // Return all sorted bills if query is empty
  }
  const lowerCaseQuery = query.toLowerCase();  

  return bills.filter(bill =>
    bill.id.toLowerCase().includes(lowerCaseQuery) ||
    bill.bill_number.toLowerCase().includes(lowerCaseQuery) ||
    bill.bill_title.toLowerCase().includes(lowerCaseQuery) ||
    bill.description.toLowerCase().includes(lowerCaseQuery)
  );
}

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

// ==============================================
// BILL TRACK FUNCTIONS
// ==============================================

/**
 * Tracks a bill for a user by URL.
 *
 * @param userId The ID of the user tracking the bill.
 * @param billUrl The URL of the bill to track.
 * @returns The tracked Bill object or null if tracking failed.
 */
export async function trackBill(userId: string, billUrl: string): Promise<Bill> {
  try {

    // Find bill by URL
    let billId = '';
    const billResult = await findExistingBillByURL(billUrl);

    // If not found, scrape for this bill and add to database
    if (!billResult) {
      console.log('[TRACK BILL] Bill not found with URL, proceeding to scrape...');

      // scrape bill URL
      console.log('[TRACK BILL] Scraping bill URL:', billUrl, '...');
      const { findBill } = await import('@/services/scraper');
      const newBill = await findBill(billUrl);

      // return the new bills ID (scraper service inserts new bill to DB)
      console.log('[TRACK BILL] Scraped new bill data:', newBill);
      billId = newBill.individualBill.id;
    }

    // If found, use existing bill ID 
    if (billResult) {
      console.log('[TRACK BILL] Bill found with URL...');
      billId = billResult.id;
    }

    // Check if already tracked by user
    const alreadyTracked = await db.selectFrom('user_bills').selectAll()
      .where('user_id', '=', userId)
      .where('bill_id', '=', billId)
      .executeTakeFirst();
    if (alreadyTracked) {
      console.log('Bill already tracked by user', userId.slice(0, 6), 'bill', billId.slice(0, 6));
      throw new Error('Bill already tracked by this user');
    }

    // If not already tracked, add the relation
    await db.insertInto('user_bills').values({
      user_id: userId,
      bill_id: billId,
      adopted_at: new Date()
    }).executeTakeFirst();

    // Return the bill object
    const trackedBillResult = await db.selectFrom('bills')
      .selectAll()
      .where('id', '=', billId)
      .executeTakeFirstOrThrow();
    
    const trackedBill = await convertDataToBillShape(trackedBillResult);

    console.log(`Successfully tracked bill ${billId} for user ${userId}`);

    return { ...trackedBill } as Bill;
  } catch (error) {
    console.error('Failed to adopt bill:', error);
    throw error;
  }
}

/** 
 * Untracks a bill for a user.
 * 
 * @param userId The ID of the user untracking the bill
 * @param billId The ID of the bill to untrack
 * @returns A boolean indicating whether the untracking was successful
 */
export async function untrackBill(userId: string, billId: string): Promise<boolean> {
  try {
    console.log('untrackBill called with:', { userId, billId });
    await db.deleteFrom('user_bills')
      .where('user_id', '=', userId)
      .where('bill_id', '=', billId)
      .executeTakeFirstOrThrow();

    console.log(`Successfully untracked bill ${billId} for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to untrack bill:', error);
    return false;
  }
}

// ==============================================
// BILL ASSIGN FUNCTIONS
// ==============================================

/**
 * Helper to validate if the assigner can assign bills to the target user.
 * Only admins and supervisors can assign bills.
 * Supervisors can only assign to their adopted interns.
 * Admins can assign to interns and supervisors.
 *
 * @param assignerId The ID of the user assigning the bill (must be admin or supervisor)
 * @param targetUserId The ID of the user to assign the bill to
 * @param billUrl The URL of the bill to assign
 * @returns The assigned Bill object
 */
async function validateAssignmentScope(assignerId: string, targetUserId: string) {
  const assigner = await db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', assignerId)
    .executeTakeFirst();

  if (!assigner) {
    throw new Error('Assigner not found');
  }

  if (assigner.role !== 'admin' && assigner.role !== 'supervisor') {
    throw new Error('Only admins and supervisors can assign bills');
  }

  const targetUser = await db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', targetUserId)
    .executeTakeFirst();

  if (!targetUser) {
    throw new Error('Target user not found');
  }

  if (assigner.role === 'supervisor') {
    const adoptionRelation = await db
      .selectFrom('supervisor_users')
      .selectAll()
      .where('supervisor_id', '=', assignerId)
      .where('user_id', '=', targetUserId)
      .executeTakeFirst();

    if (!adoptionRelation) {
      throw new Error('Supervisors can only assign bills to their adopted interns');
    }
  }

  return { assigner, targetUser };
}

export async function assignBill(assignerId: string, targetUserId: string, bill: Bill) {
  try {
    await validateAssignmentScope(assignerId, targetUserId);

    // Check if already tracked by target user
    const alreadyTracked = await db
      .selectFrom('user_bills')
      .selectAll()
      .where('user_id', '=', targetUserId)
      .where('bill_id', '=', bill.id)
      .execute();

    if (alreadyTracked && alreadyTracked.length > 0) {
      console.log('Bill already tracked by user', targetUserId.slice(0, 6), 'bill', bill.id.slice(0, 6));
      throw new Error('Bill already tracked by this user');
    }

    // Add the relation
    const relation = await db.insertInto('user_bills').values({
      user_id: targetUserId,
      bill_id: bill.id,
      adopted_at: new Date()
    })
    .returningAll()
    .executeTakeFirst();

    if (!relation) {
      throw new Error('Failed to assign bill to user');
    }
    
    // Get user info for tracker object
    const trackerUser = await db
      .selectFrom('user')
      .innerJoin('user_bills', 'user.id', 'user_bills.user_id')
      .select(['user.id', 'email', 'username', 'user_bills.adopted_at'])
      .where('user.id', '=', targetUserId)
      .executeTakeFirst();

    if (!trackerUser) {
      throw new Error('Failed to find user for tracker object');
    }

    return {
      id: trackerUser.id,
      email: trackerUser.email,
      username: trackerUser.username,
      adopted_at: trackerUser.adopted_at,
    };
  } catch (error) {
    console.error('Failed to assign bill:', error);
    throw error;
  }
}

export async function unassignBillFromUser(assignerId: string, targetUserId: string, billId: string) {
  try {
    await validateAssignmentScope(assignerId, targetUserId);

    const deleted = await db
      .deleteFrom('user_bills')
      .where('user_id', '=', targetUserId)
      .where('bill_id', '=', billId)
      .executeTakeFirst();

    return !!deleted;
  } catch (error) {
    console.error('Failed to unassign bill:', error);
    throw error;
  }
}

/**
 * Gets the list of users that the current user can assign bills to.
 * Admins can assign to all interns and supervisors.
 * Supervisors can only assign to their adopted interns.
 *
 * @param userId The ID of the user requesting assignable users
 * @returns Array of users that can be assigned bills
 */
export async function getAssignableUsers(userId: string): Promise<Selectable<User>[]> {
  try {
    // Get user role
    const user = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) {
      throw new Error('User not found');
    }

    if (user.role === 'admin') {
      // Admins can assign to everyone
      const users = await db
        .selectFrom('user')
        .selectAll()
        .where('account_status', '=', 'active')
        .orderBy('username', 'asc')
        .execute();

      return users;
    } else if (user.role === 'supervisor') {
      // Supervisors can only assign to their adopted interns
      const supervisorRelations = await db
        .selectFrom('supervisor_users')
        .select(['user_id'])
        .where('supervisor_id', '=', userId)
        .execute();

      const internIds = supervisorRelations.map((rel) => rel.user_id);

      if (internIds.length === 0) {
        return [];
      }

      const users = await db
        .selectFrom('user')
        .selectAll()
        .where('id', 'in', internIds)
        .where('account_status', '=', 'active')
        .orderBy('username', 'asc')
        .execute();

      return users;
    } else {
      throw new Error('Only admins and supervisors can assign bills');
    }
  } catch (error) {
    console.error('Failed to get assignable users:', error);
    throw error;
  }
}

// ==============================================
// BILL HELPER DATA MAPPING FUNCTIONS
// ===============================================

interface BillData {
  bills: Selectable<Bills>[];
  additionalData: AdditionalBillData;
}
/**
 * Converts the raw bill data (object bills[], tags[], trackedBy[], trackedCount[]) from the database to the client-side Bill objects and
 * maps tags and trackedBy to their corresponding bills.
 * @param billData The raw bill data from the database.
 * @returns A map of bill IDs to their corresponding Bill objects.
 */
async function mapBillDataToBillClient(billData: BillData): Promise<Map<string, Bill>> {
  const { bills, additionalData } = billData;
  const { statusUpdates, tags, trackedBy, trackedCount } = additionalData;

  const billObjects = new Map<string, Bill>();

  // Map bills data (data, updates, tags) to Bill client objects
  await Promise.all(bills.map(async (row: Selectable<Bills>) => {
    if (!billObjects.has(row.id)) {
      // Use convertDataToBillShape with additional data to avoid duplicate mapping logic
      const bill = await convertDataToBillShape(row, {
        statusUpdates,
        tags,
        trackedBy,
        trackedCount,
      });
      billObjects.set(row.id, bill);
    }
  }));

  return billObjects;
}

interface AdditionalBillData {
  statusUpdates?: Record<string, Selectable<StatusUpdates>[]>;
  tags?: Record<string, Tag[]>;
  trackedBy?: Record<string, BillTracker[]>;
  trackedCount?: Record<string, number>;
  updates?: StatusUpdate[]; // For getBillDetails - direct updates array
}

/**
 * Generic converter for database bill data to client-side Bill format.
 * Can return either Bill (basic card data) or BillDetails (extended metadata).
 *
 * @param bill The raw bill data from the database
 * @param additionalData Optional additional data (status updates, tags, etc.)
 * @param includeExtendedFields If true, returns BillDetails with extended metadata
 * @returns Converted Bill or BillDetails object
 */
async function convertDataToBillShape(
  bill: Selectable<Bills>,
  additionalData?: AdditionalBillData,
  includeExtendedFields?: false
): Promise<Bill>;

async function convertDataToBillShape(
  bill: Selectable<Bills>,
  additionalData?: AdditionalBillData,
  includeExtendedFields?: true
): Promise<BillDetails>;

async function convertDataToBillShape(
  bill: Selectable<Bills>,
  additionalData?: AdditionalBillData,
  includeExtendedFields: boolean = false
): Promise<Bill | BillDetails> {

  // Extract additional data if provided
  let updates: StatusUpdate[] = [];
  let billTags: Tag[] = [];
  let trackedBy: BillTracker[] = [];
  let trackedCount = 0;

  if (additionalData) {
    // Handle batch status updates (Record<billId, StatusUpdate[]>)
    if (additionalData.statusUpdates) {
      const billUpdates = additionalData.statusUpdates[bill.id] || [];
      updates = billUpdates.map(update => ({
        id: update.id as string,
        statustext: (update.statustext || '') as string,
        date: (update.date || '') as string,
        chamber: (update.chamber || '') as string
      }));
    }

    // Direct updates array (used for getBillDetails)
    if (additionalData.updates) {
      updates = additionalData.updates;
    }

    if (additionalData.tags) {
      billTags = additionalData.tags[bill.id] || [];
    }

    trackedBy = additionalData.trackedBy?.[bill.id] || [];
    trackedCount = additionalData.trackedCount?.[bill.id] ?? 0;
  }

  // Base Bill object
  const baseBill: Bill = {
    // attributes from the database
    id: typeof bill.id === 'string' ? bill.id : '',
    bill_number: bill.bill_number ?? '',
    bill_title: bill.bill_title ?? '',
    current_bill_status: typeof bill.bill_status === 'string' ? bill.bill_status : '',
    current_status_string: bill.current_status_string ?? '',
    description: bill.description ?? '',
    archived: bill.archived ?? false,
    dead: bill.dead ?? false,
    year: bill.year ?? null,

    latest_update: updates[0] || null,

    tags: billTags,
    tracked_by: trackedBy,
    tracked_count: trackedCount,

    llm_suggested: undefined,
    llm_processing: undefined,
    previous_status: undefined,
  };

  // Return extended BillDetails if requested
  if (includeExtendedFields) {
    return {
      ...baseBill,
      bill_url: bill.bill_url ?? '',
      committee_assignment: bill.committee_assignment ?? '',
      introducer: bill.introducer ?? '',
      food_related: bill.food_related ?? null,
      created_at: bill.created_at ?? null,
      updates: updates,
    } as BillDetails;
  }

  return baseBill;
}
