'use server';

import type { Bill, BillDetails } from '@/types/legislation';
import { KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';
import { db } from '@/db/kysely/client';
import { BillStatus } from '@/db/types';
import { convertDataToBillShape } from '@/db/queries/bill-mappers';
import { getAdditionalBillData, getStatusUpdatesForBill, findExistingBillByURL } from '@/db/queries/bills-read';

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
export async function updateBillStatus(billId: string, newStatus: string, tenantId?: string): Promise<Bill> {
    console.log(`[UPDATE STATUS] Updating bill ${billId.slice(0, 6)} to new status: ${newStatus}, tenant: ${tenantId?.slice(0, 6) ?? 'public'}`);

    // Validate if newStatus is a valid column ID
    if (!KANBAN_COLUMNS.some(col => col.id === newStatus)) {
        console.error(`Invalid status update: ${newStatus}`);
        throw new Error('Invalid status requested');
    }

    try {
        if (tenantId) {
            // Write to org_bills for org-scoped status
            await db
                .insertInto('org_bills')
                .values({
                    tenant_id: tenantId,
                    bill_id: billId,
                    bill_status: newStatus as BillStatus,
                    updated_at: new Date(),
                })
                .onConflict(oc =>
                    oc.columns(['tenant_id', 'bill_id']).doUpdateSet({
                        bill_status: newStatus as BillStatus,
                        updated_at: new Date(),
                    })
                )
                .execute();

            // Recompute derived public status
            const { recomputeDerivedStatus } = await import('@/db/queries/derived-status');
            await recomputeDerivedStatus(billId);
        } else {
            // Public/legacy: write directly to bills table
            await db.updateTable('bills')
                .set({ bill_status: newStatus as BillStatus, updated_at: new Date() })
                .where('id', '=', billId)
                .execute();
        }

        const updatedBill = await db.selectFrom('bills')
            .selectAll()
            .where('id', '=', billId)
            .executeTakeFirst();

        if (!updatedBill) {
            throw new Error('Bill not found');
        }

        return await convertDataToBillShape(updatedBill);
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

export async function updateFoodStatusOrCreateBill(bill: Bill | BillDetails | null, foodState: boolean | null, tenantId?: string): Promise<Bill> {
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
    const { statusUpdates, tags, trackedBy, trackedCount } = await getAdditionalBillData([result.id], true, tenantId);
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
// BILL TRACK FUNCTIONS
// ==============================================

/**
 * Tracks a bill for a user by URL.
 *
 * @param userId The ID of the user tracking the bill.
 * @param billUrl The URL of the bill to track.
 * @returns The tracked Bill object or null if tracking failed.
 */
export async function trackBill(userId: string, billUrl: string, tenantId?: string): Promise<Bill> {
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
      adopted_at: new Date(),
      tenant_id: tenantId ?? null,
    }).executeTakeFirst();

    // Create org_bills row if this is the first adoption in this org
    if (tenantId) {
      const existingOrgBill = await db
        .selectFrom('org_bills')
        .select('bill_id')
        .where('tenant_id', '=', tenantId)
        .where('bill_id', '=', billId)
        .executeTakeFirst();

      if (!existingOrgBill) {
        // Seed the org's status from the bill's current derived status
        // (bill_status), NOT ai_status — ai_status is NULL for ~2/3 of real
        // bills, which used to force newly-tracked bills to 'unassigned'
        // (rendering in the first column regardless of true classification).
        const billData = await db.selectFrom('bills')
          .select(['bill_status', 'ai_status'])
          .where('id', '=', billId)
          .executeTakeFirst();

        await db.insertInto('org_bills').values({
          tenant_id: tenantId,
          bill_id: billId,
          bill_status: (billData?.bill_status as BillStatus)
            ?? (billData?.ai_status as BillStatus)
            ?? 'unassigned',
        }).execute();
      }
    }

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
export async function untrackBill(userId: string, billId: string, tenantId?: string): Promise<boolean> {
  try {
    console.log('untrackBill called with:', { userId, billId, tenantId });
    let query = db.deleteFrom('user_bills')
      .where('user_id', '=', userId)
      .where('bill_id', '=', billId);

    if (tenantId) {
      query = query.where('tenant_id', '=', tenantId);
    }

    await query.executeTakeFirstOrThrow();

    console.log(`Successfully untracked bill ${billId} for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to untrack bill:', error);
    return false;
  }
}

/**
 * Removes a bill from an organization's board entirely — deletes EVERY member's
 * tracking row for this bill in this tenant plus the org's status row. After
 * this, the bill no longer appears on the org board for anyone (the board query
 * joins user_bills scoped by tenant_id; org_bills is cleaned up too).
 *
 * This is the org-admin "Remove from board" action, matching the confirmation
 * copy ("...including for anyone else in {org} tracking it"). It does NOT touch
 * the global bill row (food_related, status) or other tenants' tracking.
 *
 * @returns the number of user_bills rows removed.
 */
export async function removeBillFromOrg(billId: string, tenantId: string): Promise<number> {
  console.log('removeBillFromOrg called with:', { billId, tenantId });
  return await db.transaction().execute(async (trx) => {
    const deleted = await trx
      .deleteFrom('user_bills')
      .where('bill_id', '=', billId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    await trx
      .deleteFrom('org_bills')
      .where('bill_id', '=', billId)
      .where('tenant_id', '=', tenantId)
      .execute();

    const removed = deleted.numDeletedRows != null ? Number(deleted.numDeletedRows) : 0;
    console.log(`Removed bill ${billId} from org ${tenantId} (${removed} tracking row(s)).`);
    return removed;
  });
}
