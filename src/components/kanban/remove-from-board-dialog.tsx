import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { data } from '@/lib/data-client';
import { toast } from '@/hooks/use-toast';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import type { Bill } from '@/types/legislation';

export function RemoveFromBoardDialog({
  bill,
  trigger,
  onRemoved,
}: {
  bill: Pick<Bill, 'id' | 'bill_number'>;
  /** The element that opens the confirm (rendered via AlertDialogTrigger asChild). */
  trigger: React.ReactElement<{ disabled?: boolean }>;
  /** Called after a successful removal (e.g. to close the bill dialog). */
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const queryClient = useQueryClient();
  const { removeBill } = useBills();
  const { activeTenant } = useAuth();

  const handleRemoveBill = async () => {
    // Org-wide removal deletes every member's tracking row for this bill in the
    // tenant, so it requires an active org context and admin role. Without a
    // tenant there is no org board to remove from.
    if (!activeTenant?.tenantId) {
      console.error('Cannot remove bill: no active organization.');
      return;
    }
    setIsRemoving(true);
    let removed = false;
    try {
      // The server checks org-admin and also clears the acting admin's own
      // NULL-tenant row (from the session), so a bill tracked before joining
      // the org doesn't survive the tenant-scoped delete and reappear.
      await data.bills.removeFromOrg({ billId: bill.id, tenantId: activeTenant.tenantId });
      removeBill(bill.id);
      // Search caches is_tracked per bill; drop it so Search stops showing
      // this bill as Tracked.
      queryClient.invalidateQueries({ queryKey: ['bills', 'search'] });
      toast({ title: 'Bill Removed', description: `${bill.bill_number} removed from the board.`, duration: 5000 });
      setOpen(false);
      removed = true;
    } catch (error) {
      console.error('Error removing bill from board:', error);
    } finally {
      setIsRemoving(false);
    }
    // Outside the try so a throwing callback isn't logged as a failed removal.
    if (removed) onRemoved?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {React.cloneElement(trigger, { disabled: isRemoving })}
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Bill from Board?</AlertDialogTitle>
          <AlertDialogDescription>
            {activeTenant
              ? `This bill will be removed from your organization's list, including for anyone else in ${activeTenant.name} tracking it. You can track it again anytime using the Track Bill button.`
              : 'This bill will no longer be tracked on your list, and it will be removed for anyone else tracking it. You can track it again anytime using the Track Bill button.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.stopPropagation(); handleRemoveBill(); }}
            className="bg-destructive hover:bg-destructive/90"
            disabled={isRemoving}
          >
            {isRemoving ? 'Removing...' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
