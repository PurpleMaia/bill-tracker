'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X } from 'lucide-react';
import { Bill } from '@/types/legislation';
import { formatBillStatusName } from '@/lib/utils';
import { assignMultipleBillsToUsers } from '@/app/actions/admin';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AssignMultipleBillsDialogProps {
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function AssignMultipleBillsDialog({ trigger, onSuccess }: AssignMultipleBillsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState('');

  // Fetch bills when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchBills();
      fetchUsers();
    } else {
      // Reset state when dialog closes
      setSelectedBillIds(new Set());
      setSelectedUserIds(new Set());
      setSearchQuery('');
    }
  }, [isOpen]);

  // Filter bills based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBills(allBills);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    const filtered = allBills.filter(bill =>
      bill.bill_number.toLowerCase().includes(lowerQuery) ||
      bill.bill_title.toLowerCase().includes(lowerQuery) ||
      bill.description.toLowerCase().includes(lowerQuery)
    );
    setFilteredBills(filtered);
  }, [searchQuery, allBills]);

  const fetchBills = async () => {
    setIsLoadingBills(true);
    try {
      const { getAllFoodRelatedBills } = await import('@/services/data/bills-read');
      const bills = await getAllFoodRelatedBills(false, false);
      setAllBills(bills);
      setFilteredBills(bills);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setIsLoadingBills(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const { getAllActiveUsers } = await import('@/app/actions/admin');
      const result = await getAllActiveUsers();
      if (result.success && result.data) {
        // Filter to only show interns and supervisors
        const usersToShow = result.data.filter(user =>
          user.role === 'user' || user.role === 'supervisor'
        );
        setAllUsers(usersToShow as User[]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const toggleBillSelection = (billId: string) => {
    const newSelection = new Set(selectedBillIds);
    if (newSelection.has(billId)) {
      newSelection.delete(billId);
    } else {
      newSelection.add(billId);
    }
    setSelectedBillIds(newSelection);
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const handleAssign = async () => {
    if (selectedBillIds.size === 0 || selectedUserIds.size === 0) {
      alert('Please select at least one bill and one user');
      return;
    }

    setIsAssigning(true);
    try {
      const result = await assignMultipleBillsToUsers(
        Array.from(selectedBillIds),
        Array.from(selectedUserIds)
      );

      if (result.success) {
        alert(`Successfully created ${result.data?.assignmentsCreated} new assignments!`);
        setIsOpen(false);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        alert(result.error || 'Failed to assign bills');
      }
    } catch (error) {
      console.error('Error assigning bills:', error);
      alert('Failed to assign bills');
    } finally {
      setIsAssigning(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'supervisor':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'supervisor':
        return 'Supervisor';
      default:
        return 'Intern';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            Assign Bills to Users
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Assign Bills to Users</DialogTitle>
          <DialogDescription>
            Search and select bills to assign to interns or supervisors
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-4">
          {/* Left Column: Bills Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select Bills</h3>
              <Badge variant="secondary">
                {selectedBillIds.size} selected
              </Badge>
            </div>

            {isLoadingBills ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <Command className="border rounded-lg">
                <CommandInput
                  placeholder="Search by bill number, title..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>No bills found.</CommandEmpty>
                  <CommandGroup>
                    <ScrollArea className="h-[400px]">
                      {filteredBills.map((bill) => (
                        <CommandItem
                          key={bill.id}
                          onSelect={() => toggleBillSelection(bill.id)}
                          className="flex items-start gap-2 cursor-pointer py-3"
                        >
                          <Checkbox
                            checked={selectedBillIds.has(bill.id)}
                            onCheckedChange={() => toggleBillSelection(bill.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{bill.bill_number}</span>
                              <Badge variant="outline" className="text-xs">
                                {formatBillStatusName(bill.current_bill_status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {bill.bill_title}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
          </div>

          {/* Right Column: Users Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Assign To</h3>
              <Badge variant="secondary">
                {selectedUserIds.size} selected
              </Badge>
            </div>

            {isLoadingUsers ? (
              <Skeleton className="h-[400px] w-full" />
            ) : (
              <div className="border rounded-lg">
                <ScrollArea className="h-[450px] p-2">
                  <div className="space-y-2">
                    {allUsers.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        No users found
                      </p>
                    ) : (
                      allUsers.map((user) => (
                        <div
                          key={user.id}
                          onClick={() => toggleUserSelection(user.id)}
                          className="flex items-start gap-2 p-3 rounded-md hover:bg-muted cursor-pointer border"
                        >
                          <Checkbox
                            checked={selectedUserIds.has(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{user.username}</span>
                              <Badge variant="secondary" className={getRoleBadgeColor(user.role)}>
                                {getRoleDisplayName(user.role)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {selectedBillIds.size > 0 && selectedUserIds.size > 0 && (
              <span>
                Assigning {selectedBillIds.size} bill{selectedBillIds.size !== 1 ? 's' : ''} to{' '}
                {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isAssigning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={isAssigning || selectedBillIds.size === 0 || selectedUserIds.size === 0}
            >
              {isAssigning ? 'Assigning...' : 'Assign Bills'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
