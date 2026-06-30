// NOTE: intentionally NOT a 'use server' module. These are internal
// server-to-server data mappers (consumed by bills-read / bills-write), never
// called directly from a client, so they need no server-action boundary — and
// keeping them plain lets the module export the AdditionalBillData type.

import type { Bill, BillTracker, Tag, BillDetails, StatusUpdate } from '@/types/legislation';
import { Bills, StatusUpdates } from '@/db/types';
import { Selectable } from 'kysely';

// ==============================================
// BILL HELPER DATA MAPPING FUNCTIONS
// ===============================================

export interface AdditionalBillData {
  statusUpdates?: Record<string, Selectable<StatusUpdates>[]>;
  tags?: Record<string, Tag[]>;
  trackedBy?: Record<string, BillTracker[]>;
  trackedCount?: Record<string, number>;
  updates?: StatusUpdate[]; // For getBillDetails - direct updates array
  orgBillStatuses?: Record<string, string>; // org-scoped bill statuses keyed by bill_id
}

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
export async function mapBillDataToBillClient(billData: BillData): Promise<Map<string, Bill>> {
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

/**
 * Generic converter for database bill data to client-side Bill format.
 * Can return either Bill (basic card data) or BillDetails (extended metadata).
 *
 * @param bill The raw bill data from the database
 * @param additionalData Optional additional data (status updates, tags, etc.)
 * @param includeExtendedFields If true, returns BillDetails with extended metadata
 * @returns Converted Bill or BillDetails object
 */
export async function convertDataToBillShape(
  bill: Selectable<Bills>,
  additionalData?: AdditionalBillData,
  includeExtendedFields?: false
): Promise<Bill>;

export async function convertDataToBillShape(
  bill: Selectable<Bills>,
  additionalData?: AdditionalBillData,
  includeExtendedFields?: true
): Promise<BillDetails>;

export async function convertDataToBillShape(
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
    bill_url: bill.bill_url ?? '',
    bill_number: bill.bill_number ?? '',
    bill_title: bill.bill_title ?? '',
    current_bill_status: additionalData?.orgBillStatuses?.[bill.id] ?? (typeof bill.bill_status === 'string' ? bill.bill_status : ''),
    current_status_string: bill.current_status_string ?? '',
    description: bill.description ?? '',
    archived: bill.archived ?? false,
    dead: bill.dead ?? false,
    committee_assignment: bill.committee_assignment ?? null,
    introducer: bill.introducer ?? '',
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
