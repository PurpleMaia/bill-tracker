'use server';

import { revalidatePath } from 'next/cache';
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { getAllBills } from '@/services/data/bills-read';

interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

interface ProposalInput {
  billId: string;
  currentStatus: BillStatus;
  suggestedStatus: BillStatus;
  note?: string;
}

interface UserContext {
  userId: string;
  role: 'intern' | 'supervisor' | 'admin' | 'worker';
  username?: string;
  email?: string;
}

// ============================================
// AUTH HELPERS
// ============================================

async function getCurrentUser(): Promise<UserContext | null> {
  // Replace with your actual auth implementation
  // const session = await getServerSession(authOptions);
  // if (!session?.user) return null;
  // return {
  //   userId: session.user.id,
  //   role: session.user.role,
  //   username: session.user.username,
  //   email: session.user.email,
  // };
  
  // Placeholder - implement your auth logic
  return null;
}

function canCommitStatus(role?: string): boolean {
  return role === 'supervisor' || role === 'admin';
}

// ============================================
// BILL FETCHING ACTIONS
// ============================================

export async function getAllBillsAction(): Promise<ActionResult<Bill[]>> {
  try {
    const bills = await getAllBills();
    return { success: true, data: bills };
  } catch (error) {
    console.error('Error fetching all bills:', error);
    return { success: false, error: 'Failed to fetch bills' };
  }
}

export async function getAllFoodRelatedBillsAction(): Promise<ActionResult<Bill[]>> {
  try {
    // Replace with your actual Kysely query
    // const bills = await db
    //   .selectFrom('bills')
    //   .where('is_food_related', '=', true)
    //   .selectAll()
    //   .execute();
    
    const bills: Bill[] = []; // Replace with actual query
    return { success: true, data: bills };
  } catch (error) {
    console.error('Error fetching food-related bills:', error);
    return { success: false, error: 'Failed to fetch food-related bills' };
  }
}

export async function getUserAdoptedBillsAction(userId: string): Promise<ActionResult<Bill[]>> {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    // Replace with your actual Kysely query
    // const bills = await db
    //   .selectFrom('bills')
    //   .innerJoin('user_bills', 'bills.id', 'user_bills.bill_id')
    //   .where('user_bills.user_id', '=', userId)
    //   .selectAll('bills')
    //   .execute();
    
    const bills: Bill[] = []; // Replace with actual query
    return { success: true, data: bills };
  } catch (error) {
    console.error('Error fetching user adopted bills:', error);
    return { success: false, error: 'Failed to fetch user bills' };
  }
}

export async function getBillTagsAction(billId: string): Promise<ActionResult<string[]>> {
  try {
    if (!billId) {
      return { success: false, error: 'Bill ID is required' };
    }

    // Replace with your actual Kysely query
    // const tags = await db
    //   .selectFrom('bill_tags')
    //   .innerJoin('tags', 'bill_tags.tag_id', 'tags.id')
    //   .where('bill_tags.bill_id', '=', billId)
    //   .select('tags.name')
    //   .execute();
    
    const tags: string[] = []; // Replace with actual query
    return { success: true, data: tags };
  } catch (error) {
    console.error('Error fetching bill tags:', error);
    return { success: false, error: 'Failed to fetch tags' };
  }
}

// Fetch bills with tags in a single action (more efficient)
export async function getBillsWithTagsAction(
  type: 'all' | 'food-related' | 'user-adopted',
  userId?: string
): Promise<ActionResult<Bill[]>> {
  try {
    let bills: Bill[] = [];

    // Fetch bills based on type
    // Replace with your actual Kysely queries
    switch (type) {
      case 'user-adopted':
        if (!userId) {
          return { success: false, error: 'User ID required for adopted bills' };
        }
        // bills = await db.selectFrom('bills')...
        break;
      case 'food-related':
        // bills = await db.selectFrom('bills').where('is_food_related', '=', true)...
        break;
      case 'all':
      default:
        // bills = await db.selectFrom('bills')...
        break;
    }

    // Fetch tags for all bills in parallel
    // This could be optimized with a single JOIN query
    const billsWithTags = await Promise.all(
      bills.map(async (bill) => {
        try {
          // const tags = await db.selectFrom('bill_tags')...
          const tags: string[] = [];
          return { ...bill, tags };
        } catch {
          return { ...bill, tags: [] };
        }
      })
    );

    return { success: true, data: billsWithTags };
  } catch (error) {
    console.error('Error fetching bills with tags:', error);
    return { success: false, error: 'Failed to fetch bills' };
  }
}

// ============================================
// PROPOSAL ACTIONS
// ============================================

export async function loadProposalsAction(): Promise<ActionResult<TempBill[]>> {
  try {
    const user = await getCurrentUser();
    
    // Replace with your actual Kysely query
    // Different queries based on role:
    // - Admin/Supervisor: see all pending proposals
    // - Intern: see only their own proposals
    // const proposals = await db
    //   .selectFrom('proposals')
    //   .where('status', '=', 'pending')
    //   .selectAll()
    //   .execute();

    const proposals: TempBill[] = []; // Replace with actual query
    return { success: true, data: proposals };
  } catch (error) {
    console.error('Error loading proposals:', error);
    return { success: false, error: 'Failed to load proposals' };
  }
}

export async function saveProposalAction(input: ProposalInput): Promise<ActionResult<TempBill>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    // Validate input
    if (!input.billId) {
      return { success: false, error: 'Bill ID is required' };
    }
    if (!input.suggestedStatus?.trim()) {
      return { success: false, error: 'Suggested status is required' };
    }

    const currentStatus = input.currentStatus?.trim() || 'unassigned';

    // Replace with your actual Kysely insert/update
    // const proposal = await db
    //   .insertInto('proposals')
    //   .values({
    //     bill_id: input.billId,
    //     current_status: currentStatus,
    //     suggested_status: input.suggestedStatus,
    //     note: input.note,
    //     proposed_by: user.userId,
    //     proposed_at: new Date(),
    //     status: 'pending',
    //   })
    //   .onConflict((oc) => oc.column('bill_id').doUpdateSet({
    //     suggested_status: input.suggestedStatus,
    //     note: input.note,
    //     proposed_at: new Date(),
    //   }))
    //   .returningAll()
    //   .executeTakeFirst();

    const proposal: TempBill = {
      id: input.billId,
      bill_title: null,
      current_status: currentStatus as BillStatus,
      suggested_status: input.suggestedStatus,
      target_idx: 0,
      source: 'human',
      approval_status: 'pending',
      proposed_by: {
        user_id: user.userId,
        role: user.role,
        at: new Date().toISOString(),
        note: input.note,
        username: user.username,
        email: user.email,
      },
    };

    revalidatePath('/bills');
    revalidatePath('/admin');
    
    return { success: true, data: proposal };
  } catch (error) {
    console.error('Error saving proposal:', error);
    return { success: false, error: 'Failed to save proposal' };
  }
}

export async function approveProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!canCommitStatus(user.role)) {
      return { success: false, error: 'You do not have permission to approve changes' };
    }

    if (!proposalId) {
      return { success: false, error: 'Proposal ID is required' };
    }

    // Replace with your actual Kysely transaction
    // await db.transaction().execute(async (trx) => {
    //   // Get the proposal
    //   const proposal = await trx
    //     .selectFrom('proposals')
    //     .where('id', '=', proposalId)
    //     .selectAll()
    //     .executeTakeFirst();
    //
    //   if (!proposal) throw new Error('Proposal not found');
    //
    //   // Update bill status
    //   await trx
    //     .updateTable('bills')
    //     .set({ 
    //       current_status: proposal.suggested_status,
    //       updated_at: new Date(),
    //     })
    //     .where('id', '=', proposal.bill_id)
    //     .execute();
    //
    //   // Mark proposal as approved
    //   await trx
    //     .updateTable('proposals')
    //     .set({ 
    //       status: 'approved',
    //       approved_by: user.userId,
    //       approved_at: new Date(),
    //     })
    //     .where('id', '=', proposalId)
    //     .execute();
    // });

    revalidatePath('/bills');
    revalidatePath('/admin');
    
    return { success: true };
  } catch (error) {
    console.error('Error approving proposal:', error);
    return { success: false, error: 'Failed to approve proposal' };
  }
}

export async function rejectProposalAction(proposalId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!canCommitStatus(user.role)) {
      return { success: false, error: 'You do not have permission to reject changes' };
    }

    if (!proposalId) {
      return { success: false, error: 'Proposal ID is required' };
    }

    // Replace with your actual Kysely update
    // await db
    //   .updateTable('proposals')
    //   .set({ 
    //     status: 'rejected',
    //     rejected_by: user.userId,
    //     rejected_at: new Date(),
    //   })
    //   .where('id', '=', proposalId)
    //   .execute();

    revalidatePath('/bills');
    revalidatePath('/admin');
    
    return { success: true };
  } catch (error) {
    console.error('Error rejecting proposal:', error);
    return { success: false, error: 'Failed to reject proposal' };
  }
}

// ============================================
// BILL STATUS ACTIONS
// ============================================

export async function updateBillStatusAction(
  billId: string,
  status: BillStatus
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!canCommitStatus(user.role)) {
      return { success: false, error: 'You do not have permission to update bill status' };
    }

    if (!billId || !status) {
      return { success: false, error: 'Bill ID and status are required' };
    }

    // Replace with your actual Kysely update
    // await db
    //   .updateTable('bills')
    //   .set({ 
    //     current_status: status,
    //     updated_at: new Date(),
    //   })
    //   .where('id', '=', billId)
    //   .execute();

    revalidatePath('/bills');
    
    return { success: true };
  } catch (error) {
    console.error('Error updating bill status:', error);
    return { success: false, error: 'Failed to update bill status' };
  }
}

// ============================================
// NICKNAME ACTION
// ============================================

export async function updateBillNicknameAction(
  billId: string,
  nickname: string
): Promise<ActionResult<{ nickname: string | null }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!billId) {
      return { success: false, error: 'Bill ID is required' };
    }

    const trimmedNickname = nickname.trim() || null;

    // Replace with your actual Kysely upsert
    // await db
    //   .insertInto('user_bill_nicknames')
    //   .values({
    //     user_id: user.userId,
    //     bill_id: billId,
    //     nickname: trimmedNickname,
    //   })
    //   .onConflict((oc) => 
    //     oc.columns(['user_id', 'bill_id']).doUpdateSet({
    //       nickname: trimmedNickname,
    //       updated_at: new Date(),
    //     })
    //   )
    //   .execute();

    revalidatePath('/bills');
    
    return { success: true, data: { nickname: trimmedNickname } };
  } catch (error) {
    console.error('Error updating bill nickname:', error);
    return { success: false, error: 'Failed to update nickname' };
  }
}

// ============================================
// BULK ACTIONS
// ============================================

export async function approveAllProposalsAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!canCommitStatus(user.role)) {
      return { success: false, error: 'You do not have permission to approve changes' };
    }

    // Replace with your actual Kysely transaction
    // const result = await db.transaction().execute(async (trx) => {
    //   const pendingProposals = await trx
    //     .selectFrom('proposals')
    //     .where('status', '=', 'pending')
    //     .where('source', '=', 'human')
    //     .selectAll()
    //     .execute();
    //
    //   for (const proposal of pendingProposals) {
    //     await trx.updateTable('bills')...
    //     await trx.updateTable('proposals')...
    //   }
    //
    //   return pendingProposals.length;
    // });

    const count = 0; // Replace with actual count

    revalidatePath('/bills');
    revalidatePath('/admin');
    
    return { success: true, data: { count } };
  } catch (error) {
    console.error('Error approving all proposals:', error);
    return { success: false, error: 'Failed to approve all proposals' };
  }
}

export async function rejectAllProposalsAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    if (!canCommitStatus(user.role)) {
      return { success: false, error: 'You do not have permission to reject changes' };
    }

    // Replace with your actual Kysely update
    // const result = await db
    //   .updateTable('proposals')
    //   .set({ 
    //     status: 'rejected',
    //     rejected_by: user.userId,
    //     rejected_at: new Date(),
    //   })
    //   .where('status', '=', 'pending')
    //   .where('source', '=', 'human')
    //   .execute();

    const count = 0; // Replace with actual count from result.numUpdatedRows

    revalidatePath('/bills');
    revalidatePath('/admin');
    
    return { success: true, data: { count } };
  } catch (error) {
    console.error('Error rejecting all proposals:', error);
    return { success: false, error: 'Failed to reject all proposals' };
  }
}