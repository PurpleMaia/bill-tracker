/** @deprecated Approvals tab removed from header nav. This component is kept for backwards compatibility but is no longer actively used. */
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
// Removed direct service import - will use API route instead
import type { TempBill, Bill } from '@/types/legislation';
import type { User } from '@/types/user';

export function ApprovalsDashboard() {
  const { tempBills, acceptTempChange, rejectTempChange, bills } = useBills();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'username' | 'date' | 'bill'>('username');
  const [users, setUsers] = useState<Record<string, User>>({});

  // Filter out only pending proposals
  const pendingProposals = useMemo(() => {
    return tempBills.filter(tb => tb.approval_status === 'pending');
  }, [tempBills]);

  // Fetch user information for proposals
  useEffect(() => {
    const fetchUsers = async () => {
      const userIds = pendingProposals
        .map(proposal => proposal.proposed_by?.user_id)
        .filter((id): id is string => !!id);
      
      if (userIds.length > 0) {
        try {
          const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userIds }),
          });

          if (response.ok) {
            const data = await response.json();
            const userMap: Record<string, User> = {};
            data.users.forEach((user: User) => {
              userMap[user.id] = user;
            });
            setUsers(userMap);
          } else {
            console.error('Failed to fetch users:', response.statusText);
          }
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      }
    };

    fetchUsers();
  }, [pendingProposals]);

  // Get unique usernames for filtering
  const usernames = useMemo(() => {
    const names = new Set<string>();
    pendingProposals.forEach(proposal => {
      if (proposal.proposed_by?.user_id) {
        const user = users[proposal.proposed_by.user_id];
        if (user) {
          names.add(user.username);
        }
      }
    });
    return Array.from(names);
  }, [pendingProposals, users]);

  // Filter and sort proposals
  const filteredAndSortedProposals = useMemo(() => {
    let filtered = pendingProposals;

    // Filter by search query (bill number, title, or username)
    if (searchQuery.trim()) {
      filtered = filtered.filter(proposal => {
        const searchLower = searchQuery.toLowerCase();
        const user = proposal.proposed_by?.user_id ? users[proposal.proposed_by.user_id] : null;
        const bill = bills.find(b => b.id === proposal.id);
        
        return (
          proposal.id.toLowerCase().includes(searchLower) ||
          (user && user.username.toLowerCase().includes(searchLower)) ||
          (bill && bill.bill_title?.toLowerCase().includes(searchLower))
        );
      });
    }

    // Sort proposals
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'username':
          const userA = a.proposed_by?.user_id ? users[a.proposed_by.user_id] : null;
          const userB = b.proposed_by?.user_id ? users[b.proposed_by.user_id] : null;
          return (userA?.username || '').localeCompare(userB?.username || '');
        case 'date':
          return new Date(b.proposed_by?.at || 0).getTime() - new Date(a.proposed_by?.at || 0).getTime();
        case 'bill':
          return a.id.localeCompare(b.id);
        default:
          return 0;
      }
    });

    return filtered;
  }, [pendingProposals, searchQuery, sortBy, users, bills]);

  const handleApprove = async (billId: string) => {
    try {
      await acceptTempChange(billId);
      toast({
        title: 'Proposal Approved',
        description: 'The change has been approved and applied.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to approve the proposal.',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async (billId: string) => {
    try {
      await rejectTempChange(billId);
      toast({
        title: 'Proposal Rejected',
        description: 'The change has been rejected.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject the proposal.',
        variant: 'destructive',
      });
    }
  };

  // Check if user has permission to moderate
  const canModerate = user?.role === 'admin' || user?.role === 'supervisor';

  if (!canModerate) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Access Denied</h3>
              <p className="text-muted-foreground mt-2">
                You need supervisor or admin privileges to access the approvals dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Pending Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve changes proposed by interns and other users.
        </p>
      </div>

      {/* Filters and Search */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              placeholder="Search by bill number, title, or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Label htmlFor="sort">Sort by</Label>
            <Select value={sortBy} onValueChange={(value: 'username' | 'date' | 'bill') => setSortBy(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="username">Username</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="bill">Bill Number</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Proposals List */}
      <div className="flex-1 overflow-auto">
        {filteredAndSortedProposals.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">No Pending Proposals</h3>
                <p className="text-muted-foreground mt-2">
                  {pendingProposals.length === 0 
                    ? "There are no pending proposals to review."
                    : "No proposals match your current search criteria."
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedProposals.map((proposal) => {
              const user = proposal.proposed_by?.user_id ? users[proposal.proposed_by.user_id] : null;
              const bill = bills.find(b => b.id === proposal.id);
              
              return (
                <Card key={proposal.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {bill?.bill_title || `Bill ${proposal.id}`}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">
                            {proposal.proposed_by?.role || 'Unknown'}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Proposed by: {user?.username || 'Unknown User'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          {proposal.proposed_by?.at 
                            ? new Date(proposal.proposed_by.at).toLocaleString()
                            : 'Unknown date'
                          }
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Status Change */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{proposal.current_status}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="default">{proposal.proposed_status}</Badge>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(proposal.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        ✓ Approve
                      </Button>
                      <Button
                        onClick={() => handleReject(proposal.id)}
                        variant="destructive"
                      >
                        ✗ Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
