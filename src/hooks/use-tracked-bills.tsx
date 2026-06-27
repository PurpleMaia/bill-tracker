'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { trackBill, untrackBill } from '@/services/data/bills-write';
import { assignBill, unassignBillFromUser } from '@/services/data/bill-assignment';
import { getBillTags } from '@/services/data/tags';
import { useToast } from '@/hooks/use-toast';
import { useBills } from '@/hooks/contexts/bills-context';
import { Bill } from '@/types/legislation';

export function useTrackedBills() {
  const { user, activeTenant } = useAuth();
  const { setBills, addBill, updateBill } = useBills();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  /**
   * Handles the tracking of a bill by the current user. Calls trackBill service and adds the bill to the list on success.
   * @param billUrl - The URL of the bill to track.
   * @returns A boolean indicating whether the tracking was successful.
   */
  const handleTrackBill = async (billUrl: string) => {
    if (!user) return false;
    try {
      const trackedBill = await trackBill(user.id, billUrl, activeTenant?.tenantId);
      if (trackedBill) {
        // Add the bill to the list
        console.log('Bill tracked successfully, adding to list...');
        addBill(trackedBill);

        // Fetch tags for the newly tracked bill
        console.log('Fetching tags for newly tracked bill...');
        const tags = await getBillTags(trackedBill.id, activeTenant!.tenantId);
        updateBill(trackedBill.id, { tags });

        toast({
          title: 'Bill tracked',
          description: 'The bill was successfully added to your tracked list.',
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error tracking bill:', err);
      return false;
    }
  }

  /**
   * Handles the untracking of a bill by the current user. Calls unadoptBill service and updates the global bills state on success.
   * @param billId - The ID of the bill to untrack.
   * @returns A boolean indicating whether the untracking was successful.
   */
  const handleUntrackBill = useCallback(async (billId: string, options?: { suppressToast?: boolean; keepInList?: boolean }) => {
    if (!user) return false;
    try {
      const success = await untrackBill(user.id, billId, activeTenant?.tenantId);
      if (success) {
        if (options?.keepInList) {
          setBills((prev) =>
            prev.map((bill) => {
              if (bill.id !== billId) return bill;
              const trackedBy = bill.tracked_by?.filter((tracker) => tracker.id !== user.id) ?? [];
              const trackedCount = Math.max(0, (bill.tracked_count ?? trackedBy.length + 1) - 1);
              return {
                ...bill,
                tracked_by: trackedBy,
                tracked_count: trackedCount,
              };
            })
          );
        } else {
          // Remove the bill from the local state
          setBills(prev => prev.filter(bill => bill.id !== billId));
        }
        if (!options?.suppressToast) {
          toast({
            title: 'Bill removed',
            description: 'The bill was successfully removed from your tracked list.',
          });
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error untracking bill:', err);
      return false;
    }
  }, [setBills, toast, user]);

  /**
   * Handles assigning a bill to another user. Only admins and supervisors can use this.
   * @param targetUserId - The ID of the user to assign the bill to.
   * @param billUrl - The URL of the bill to assign.
   * @returns A boolean indicating whether the assignment was successful.
   */
  const handleAssignBill = async (targetUserId: string, bill: Bill) => {
    if (!user) return null;
    try {
      const tracker = await assignBill(user.id, targetUserId, bill, activeTenant?.tenantId);
      if (tracker) {
        console.log('Bill assigned successfully');
        toast({
          title: 'Bill assigned',
          description: 'The bill was successfully assigned to the user.',
        });
        setBills((prev) =>
          prev.map((existing) => {
            if (existing.id !== bill.id) return existing;
            const trackedBy = existing.tracked_by ? [...existing.tracked_by] : [];
            if (!trackedBy.find((item) => item.id === tracker.id)) {
              trackedBy.unshift(tracker);
            }
            const trackedCount = (existing.tracked_count ?? trackedBy.length) + 1;
            return { ...existing, tracked_by: trackedBy, tracked_count: trackedCount };
          })
        );
        return true;
      }

      return false;
    } catch (err: any) {
      console.error('Error assigning bill:', err);
      toast({
        title: 'Assignment failed',
        description: err?.message || 'Failed to assign the bill. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const handleUnassignBill = async (targetUserId: string, bill: Bill) => {
    if (!user) return null;
    try {
      const success = await unassignBillFromUser(user.id, targetUserId, bill.id, activeTenant?.tenantId);
      if (success) {
        toast({
          title: 'Bill unassigned',
          description: 'The bill was successfully unassigned.',
        });
        setBills((prev) =>
          prev.map((existing) => {
            if (existing.id !== bill.id) return existing;
            const trackedBy = existing.tracked_by?.filter((item) => item.id !== targetUserId) ?? [];
            const trackedCount = Math.max(0, (existing.tracked_count ?? trackedBy.length + 1) - 1);
            return { ...existing, tracked_by: trackedBy, tracked_count: trackedCount };
          })
        );
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Error unassigning bill:', err);
      toast({
        title: 'Unassign failed',
        description: err?.message || 'Failed to unassign the bill. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    error,
    trackBill: handleTrackBill,
    untrackBill: handleUntrackBill,
    assignBill: handleAssignBill,
    unassignBill: handleUnassignBill,
  };
}
