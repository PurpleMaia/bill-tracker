'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTrackedBills } from '@/hooks/use-tracked-bills';
import { UserPlus } from 'lucide-react';
import { getAssignableUsers } from '@/services/data/legislation';
import { User } from '@/db/types';
import { Selectable } from 'kysely';
import { Bill } from '@/types/legislation';

interface AssignBillDialogProps {
  bill: Bill
  trigger?: React.ReactNode;
}

export function AssignBillDialog({ bill, trigger }: AssignBillDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<Selectable<User>[]>([]);
  const [isFetchingUsers, setIsFetchingUsers] = useState(false);
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user, activeTenant } = useAuth();
  const { assignBill, unassignBill } = useTrackedBills();

  // Fetch assignable users when dialog opens
  useEffect(() => {
    const fetchUsers = async () => {
      if (!isOpen || !user) return;

      setIsFetchingUsers(true);
      try {
        const users = await getAssignableUsers(user.id, activeTenant?.tenantId);
        setAssignableUsers(users);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to load assignable users.',
          variant: 'destructive',
        });
      } finally {
        setIsFetchingUsers(false);
      }
    };

    fetchUsers();
  }, [isOpen, user, toast]);

  const assignedUserIds = useMemo(() => {
    return new Set(bill.tracked_by?.map((tracker) => tracker.id));
  }, [bill.tracked_by]);

  const handleToggleAssignment = async (userId: string, nextChecked: boolean) => {
    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to assign bills.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setPendingUserIds((prev) => new Set(prev).add(userId));
      if (nextChecked) {
        await assignBill(userId, bill);
      } else {
        await unassignBill(userId, bill);
      }
    } catch (error) {
      // Error toast is handled in the hook
      console.error('Error assigning bill:', error);
    } finally {
      setPendingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4" />
            Assign
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Bill to User</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {bill.bill_number
              ? `Assign ${bill.bill_number} to a user.`
              : 'Assign this bill to a user.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-select">Select Users</Label>
            {isFetchingUsers ? (
              <div className="text-sm text-muted-foreground">Loading users...</div>
            ) : assignableUsers.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No users available to assign bills to.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto border rounded-md p-2">
                {assignableUsers.map((assignableUser) => {
                  const isChecked = assignedUserIds.has(assignableUser.id);
                  const isPending = pendingUserIds.has(assignableUser.id);
                  return (
                    <label
                      key={assignableUser.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => handleToggleAssignment(assignableUser.id, Boolean(checked))}
                        disabled={isPending || isFetchingUsers}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {assignableUser.username || assignableUser.email || 'Unknown user'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {assignableUser.role === 'admin' ? 'Admin' : assignableUser.role === 'worker' ? 'User' : assignableUser.role === 'supervisor' ? 'Supervisor' : 'User'}
                        </span>
                      </div>
                      {isPending && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          Updating...
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
