'use client';

import React from 'react';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs,TabsContent } from '@/components/ui/tabs';
import { ArrowRight, ChevronDown, X, Archive, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import AdminHeader from './admin-header';
import { useAdminDashboard } from '@/hooks/use-query-admin';
import { useAuth } from '@/hooks/contexts/auth-context';
import { formatBillStatusName } from '@/lib/utils';
import { BillWithInterns, InternWithBills, PendingProposal, PendingUser, SupervisorWithInterns } from '@/types/admin';
import { InternSelector } from './intern-selector';
import { AssignMultipleBillsDialog } from './assign-multiple-bills-dialog';
// import { ManageInternDialog } from './manage-intern-dialog';
import { PendingInvitesSection } from './pending-invites-section';

export function AdminDashboard() {
  const {
  // Data
  pendingUsers,
  allAccounts,  
  allInterns,
  allSupervisors,
  allInternBills,  

  // Actions  
  handleApproveUser,
  handleDenyUser,  
} = useAdminDashboard();

  const counts = {
    accounts: pendingUsers.length == 0 ? allAccounts.length : pendingUsers.length,
    allTrackedBills: allInternBills ? allInternBills.length : 0,
    allInterns: allInterns ? allInterns.length : 0,
    allSupervisors: allSupervisors ? allSupervisors.length : 0,
  };

  return (
    <div>
      <Tabs defaultValue="pending-requests" className="w-full">
        <AdminHeader count={counts} />
          
          <AccountsTab
            pendingUsers={pendingUsers}
            allAccounts={allAccounts}
            handleApproveUser={handleApproveUser}
            handleDenyUser={handleDenyUser}
          />
  
          <AllInternsTab interns={allInterns}/>
  
          <AllSupervisorsTab supervisors={allSupervisors}/>
  
          <AllInternBillsTab bills={allInternBills}/>

      </Tabs>
    </div>
  );
}

function AccountsTab(
  { pendingUsers, allAccounts, handleApproveUser, handleDenyUser }: {
    pendingUsers: PendingUser[];
    allAccounts: PendingUser[];
    handleApproveUser: (userId: string, role: string) => void
    handleDenyUser: (userId: string) => void;
  }
) {
  const { isLoading, isApproving, isRejecting } = useAdminDashboard();

  if (isLoading) {
    return (
      <TabsContent value="pending-requests" className="mx-8 space-y-8 mt-6">
        <div className="p-8">
          <Skeleton className="h-8 w-1/3 mb-4 rounded-md" />
          <Skeleton className="h-[600px] w-full rounded-md" />
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="pending-requests" className="mx-8 mt-6">
        <div className="space-y-8">
          {/* All Accounts Section */}
          <AllAccountsSection allAccounts={allAccounts} />
          
          {/* Pending Account Requests */}
          <div>
            <h1 className="text-2xl font-bold mb-1">Pending Account Requests</h1>
            <h2 className="text-sm mb-6 text-muted-foreground">Review and manage user account requests</h2>
            <div className="space-y-4">
              {pendingUsers.length === 0 ? (
                <Card className="p-6">
                  <p className="text-center text-muted-foreground">
                    No pending account requests
                  </p>
                </Card>
              ) : (
                pendingUsers.map((user) => (
                  <Card key={user.id} className="p-6 bg-white shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <h3 className="font-semibold">{user.username}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <div className="flex gap-2 text-sm text-muted-foreground items-center">
                          Joined: <span className='text-foreground'>{user.created_at ? user.created_at.toLocaleDateString() : 'Unknown'}</span>

                          {user.requested_admin
                          ? <Badge variant="secondary" className='bg-red-100 text-red-800'>Admin</Badge>
                          : user.requested_supervisor ? (
                            <Badge variant="secondary" className='bg-yellow-100 text-yellow-800'>Supervisor</Badge>
                          ) : <Badge variant="secondary">User</Badge>
                          }
                        </div>
                      </div>
                      <div className="space-x-2">
                        {isApproving || isRejecting ? (
                          <Skeleton className="h-8 w-24 rounded-md" />
                        ) : (
                          <>
                            <Button
                              onClick={() => handleApproveUser(user.id, user.requested_admin ? 'admin' : user.requested_supervisor ? 'supervisor' : 'user')}
                              variant="default"
                            >
                              Approve
                            </Button>
                            <Button
                              onClick={() => handleDenyUser(user.id)}
                              variant="outline"
                            >
                              Deny
                            </Button>
                          </>
                        ) }
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Pending Invites */}
          <PendingInvitesSection />

        </div>
    </TabsContent>
  )
}

function AllAccountsSection({ allAccounts }: { allAccounts: PendingUser[] }) {
  const { activeTenant } = useAuth();
  const isTenantScoped = !!activeTenant;

  const [activeUsers, setActiveUsers] = useState<PendingUser[]>(allAccounts);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [archivingUserId, setArchivingUserId] = useState<string | null>(null);
  const [archiveDialogUserId, setArchiveDialogUserId] = useState<string | null>(null);

  // Filter state
  const [showArchived, setShowArchived] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [usernameSearch, setUsernameSearch] = useState('');

  // Sync activeUsers with allAccounts when it changes
  React.useEffect(() => {
    setActiveUsers(allAccounts);
  }, [allAccounts]);

  const handleRoleChange = (userId: string, newRole: string) => {
    setSelectedRoles(prev => ({
      ...prev,
      [userId]: newRole
    }));
  };

  const handleUpdateRole = async (userId: string) => {
    const newRole = selectedRoles[userId];
    if (!newRole) return;

    setUpdatingUserId(userId);
    try {
      const { updateUserRole } = await import('@/app/actions/admin');
      const result = await updateUserRole(userId, newRole, activeTenant?.tenantId);

      if (result.success) {
        // Update local state
        setActiveUsers(prev =>
          prev.map(user =>
            user.id === userId ? { ...user, role: newRole } : user
          )
        );
      } else {
        alert(result.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleArchiveAccount = async (userId: string) => {
    setArchivingUserId(userId);
    try {
      const { archiveAccount } = await import('@/app/actions/admin');
      const result = await archiveAccount(userId, activeTenant?.tenantId);

      if (result.success) {
        // Update local state
        setActiveUsers(prev =>
          prev.map(user =>
            user.id === userId ? { ...user, account_status: 'archived' } : user
          )
        );
      } else {
        alert(result.error || 'Failed to archive account');
      }
    } catch (error) {
      console.error('Error archiving account:', error);
      alert('Failed to archive account');
    } finally {
      setArchivingUserId(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'supervisor':
        return 'bg-yellow-100 text-yellow-800';
      case 'worker':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'supervisor':
        return 'Supervisor';
      case 'worker':
        return 'Worker';
      default:
        return 'User';
    }
  };

  // Filter users based on filters
  const filteredUsers = React.useMemo(() => {
    return activeUsers.filter(user => {
      // Filter by archived status
      if (!showArchived && user.account_status === 'archived') {
        return false;
      }

      // Filter by role
      if (roleFilter !== 'all' && user.role !== roleFilter) {
        return false;
      }

      // Filter by username search
      if (usernameSearch && !user.username.toLowerCase().includes(usernameSearch.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [activeUsers, showArchived, roleFilter, usernameSearch]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">All Accounts</h1>
      <h2 className="text-sm mb-6 text-muted-foreground">Manage user roles and archive accounts</h2>

      {/* Filter Controls */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Show Archived Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="cursor-pointer">
              Show Archived
            </Label>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2">
            <Label htmlFor="role-filter">Role:</Label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All Roles</option>
              {isTenantScoped ? (
                <>
                  <option value="worker">Worker</option>
                  <option value="admin">Admin</option>
                </>
              ) : (
                <>
                  <option value="user">User</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </>
              )}
            </select>
          </div>

          {/* Username Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Label htmlFor="username-search">Search:</Label>
            <Input
              id="username-search"
              type="text"
              placeholder="Search by username..."
              value={usernameSearch}
              onChange={(e) => setUsernameSearch(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          Showing {filteredUsers.length} of {activeUsers.length} users
        </p>
      </div>

      <div className="space-y-4">
        {filteredUsers.length === 0 ? (
          <Card className="p-6">
            <p className="text-center text-muted-foreground">
              No users found matching your filters
            </p>
          </Card>
        ) : (
          filteredUsers.map((user) => {
            const currentRole = selectedRoles[user.id] || user.role || 'user';
            const hasChanged = currentRole !== user.role;
            const isArchived = user.account_status === 'archived';

            return (
              <React.Fragment key={user.id}>
                <Card className={`p-6 shadow-md ${isArchived ? 'bg-gray-100 opacity-75' : 'bg-white'}`}>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <h3 className="font-semibold">{user.username}</h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <div className="flex gap-2 text-sm text-muted-foreground items-center flex-wrap">
                        Joined: <span className='text-foreground'>{user.created_at ? user.created_at.toLocaleDateString() : 'Unknown'}</span>
                        <Badge variant="secondary" className={getRoleBadgeColor(user.role || 'user')}>
                          {getRoleDisplayName(user.role || 'user')}
                        </Badge>
                        {isArchived && (
                          <Badge variant="secondary" className="bg-gray-300 text-gray-700">
                            Archived
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isArchived && (
                        <>
                          <select
                            value={currentRole}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            disabled={updatingUserId === user.id}
                          >
                            {isTenantScoped ? (
                              <>
                                <option value="worker">Worker</option>
                                <option value="admin">Admin</option>
                              </>
                            ) : (
                              <>
                                <option value="user">User</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="admin">Admin</option>
                              </>
                            )}
                          </select>
                          {hasChanged && (
                            <Button
                              onClick={() => handleUpdateRole(user.id)}
                              disabled={updatingUserId === user.id}
                              size="sm"
                            >
                              {updatingUserId === user.id ? 'Updating...' : 'Update Role'}
                            </Button>
                          )}
                          <Button
                            onClick={() => setArchiveDialogUserId(user.id)}
                            disabled={archivingUserId === user.id}
                            size="sm"
                            variant="outline"
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Archive Confirmation Dialog */}
                <AlertDialog open={archiveDialogUserId === user.id} onOpenChange={(open) => !open && setArchiveDialogUserId(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive Account</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to archive <strong>{user.username}</strong>? This will deactivate their account and they will no longer be able to access the system.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          handleArchiveAccount(user.id);
                          setArchiveDialogUserId(null);
                        }}
                      >
                        Archive
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

function AllInternsTab(
  { interns }: {
    interns: InternWithBills[];
  }
) {
  const { isLoadingInterns } = useAdminDashboard();
  const { activeTenant } = useAuth();
  const [expandedIntern, setExpandedIntern] = useState<string | null>(null);
  const [removingBill, setRemovingBill] = useState<{ internId: string; billId: string; billNumber: string; internName: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  // const [editingIntern, setEditingIntern] = useState<boolean>(false);

  const handleRemoveBill = async () => {
    if (!removingBill) return;

    setIsRemoving(true);
    try {
      const { removeBillFromIntern } = await import('@/app/actions/admin');
      const result = await removeBillFromIntern(removingBill.internId, removingBill.billId, activeTenant?.tenantId);

      if (result.success) {
        // Refresh the page to show updated data
        window.location.reload();
      } else {
        alert(result.error || 'Failed to remove bill');
      }
    } catch (error) {
      console.error('Error removing bill:', error);
      alert('Failed to remove bill');
    } finally {
      setIsRemoving(false);
      setRemovingBill(null);
    }
  };

  if (isLoadingInterns) {
    return (
      <TabsContent value="all-interns" className="mx-8 space-y-8 mt-6">
        <div className="p-8">
          <Skeleton className="h-8 w-1/3 mb-4 rounded-md" />
          <Skeleton className="h-[600px] w-full rounded-md" />
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="all-interns" className="mx-8 space-y-8 mt-6">
          {/* All Interns */}
          <div>
            <h1 className="text-2xl font-bold mb-1 ">All Users</h1>
            <h2 className="text-sm mb-6 text-muted-foreground">View all user accounts</h2>
              <div className="space-y-4">
                {interns.length === 0 ? (
                  <Card className="p-6">
                    <p className="text-center text-muted-foreground">
                      No users found
                    </p>
                  </Card>
                ) : (
                  <Table className='border bg-white shadow-sm'>
                    <TableHeader>
                      <TableRow className='bg-gray-100'>
                        <TableHead className='font-bold'>User</TableHead>
                        <TableHead className='font-bold'>Supervisor</TableHead>
                        <TableHead className='font-bold'>Status</TableHead>
                        <TableHead className='font-bold'>Joined</TableHead>
                        <TableHead className='font-bold'>Tracked Bills</TableHead>                        
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interns.map((intern) => (
                        <React.Fragment key={intern.id}>
                          <TableRow key={intern.id} className="cursor-pointer" onClick={() => {
                            if (expandedIntern === intern.id) {
                              setExpandedIntern(null);
                            } else {
                              setExpandedIntern(intern.id);
                            }
                          }}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <p className='text-foreground font-semibold'>{intern.username}</p>
                                  <p className='text-muted-foreground'>{intern.email}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {intern.supervisor_username 
                                ? intern.supervisor_username 
                                : <span className='text-muted-foreground italic'>Not Assigned</span>}
                              </TableCell>                          
                              <TableCell>
                                {intern.account_status === 'active' ? (
                                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                                ) : intern.account_status === 'pending' ? (
                                  <Badge className="bg-yellow-100 text-yellow-800">Pending Promotion</Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800">{intern.account_status}</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {intern.created_at ? intern.created_at.toLocaleDateString() : 'Unknown'}
                              </TableCell>
                              <TableCell>
                                {intern.adopted_bills.length === 0 ? (
                                  <span className="text-sm text-muted-foreground">No tracked bills</span>
                                ) : (
                                  // Expand List of tracked bills
                                  <div className='flex items-center gap-2'>
                                    {intern.adopted_bills.length} bills                                   
                                      <ChevronDown className={`w-4 h-4 transition-transform ${
                                        expandedIntern === intern.id ? 'rotate-180' : ''
                                      }`} ></ChevronDown>
                                  </div>
                                )}

                                {/* TODO: Make able to edit intern details (suspend, delete, remove bills from them) */}                                
                              </TableCell>

                          </TableRow>

                          {expandedIntern === intern.id && (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-gray-50 p-0">
                                <div className="p-4">
                                  <h3 className="font-semibold mb-2">Adopted Bills</h3>
                                  {intern.adopted_bills.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No adopted bills</p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-gray-100">
                                          <TableHead>Bill Number</TableHead>
                                          <TableHead>Title</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Adopted</TableHead>
                                          <TableHead>Actions</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {intern.adopted_bills.map((bill) => (
                                          <TableRow key={bill.bill_id} className="bg-white">
                                            <TableCell>
                                              <Badge variant="outline">{bill.bill_number || 'N/A'}</Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                              {bill.bill_title || 'No Title'}
                                            </TableCell>
                                            <TableCell className='font-semibold'>
                                                {formatBillStatusName(bill.current_status) || 'Unknown Status'}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                              {bill.adopted_at ? new Date(bill.adopted_at).toLocaleDateString() : 'Unknown'}
                                            </TableCell>
                                            <TableCell>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setRemovingBill({
                                                    internId: intern.id,
                                                    billId: bill.bill_id,
                                                    billNumber: bill.bill_number || 'N/A',
                                                    internName: intern.username
                                                  });
                                                }}
                                                className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}                      
                    </TableBody>
                  </Table>
                )}
               </div>
          </div>

          {/* Remove Bill Confirmation Dialog */}
          <AlertDialog open={!!removingBill} onOpenChange={(open) => !open && setRemovingBill(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Bill from User</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove bill <strong>{removingBill?.billNumber}</strong> from <strong>{removingBill?.internName}</strong>&apos;s tracking list? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRemoveBill}
                  disabled={isRemoving}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isRemoving ? 'Removing...' : 'Remove Bill'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

      </TabsContent>
  )
}

function AllSupervisorsTab(
  { supervisors }: {
    supervisors: SupervisorWithInterns[];
  }
) {
  const {
    isLoadingRelationships,
    allInterns,
    handleAssignSupervisor,
    handleUnassignIntern,
    isAssigningSupervisor,
    isUnassigningIntern
  } = useAdminDashboard();

  // State to manage selected interns for each supervisor
  const [selectedInternsBySupervisor, setSelectedInternsBySupervisor] = useState<Record<string, string[]>>({});

  if (isLoadingRelationships) {
    return (
      <TabsContent value="all-supervisors" className="mx-8 space-y-8 mt-6">
        <div className="p-8">
          <Skeleton className="h-8 w-1/3 mb-4 rounded-md" />
          <Skeleton className="h-[600px] w-full rounded-md" />
        </div>
      </TabsContent>
    );
  }

  const handleSelectionChange = (supervisorId: string, selectedIds: string[]) => {
    setSelectedInternsBySupervisor(prev => ({
      ...prev,
      [supervisorId]: selectedIds
    }));
  };

  const handleAssign = (supervisorId: string) => {
    const selectedIds = selectedInternsBySupervisor[supervisorId] || [];
    if (selectedIds.length > 0) {
      handleAssignSupervisor(supervisorId, selectedIds);
      // Clear selection after assignment
      setSelectedInternsBySupervisor(prev => ({
        ...prev,
        [supervisorId]: []
      }));
    }
  };

  return (
    <TabsContent value="all-supervisors" className="mx-8 space-y-8 mt-6">
      <div>
        <h1 className="text-2xl font-bold mb-1 ">All Supervisors</h1>
        <h2 className="text-sm mb-6 text-muted-foreground">View all supervisor accounts and their users</h2>

        <div className='bg-white rounded-lg shadow-sm border'>
            <div className="p-4 space-y-6">
              {supervisors.length === 0 ? (
                <Card className="p-6">
                  <p className="text-center text-muted-foreground">
                    No supervisors found
                  </p>
                </Card>
              ) : (
                supervisors.map((supervisor) => (
                  <div key={supervisor.supervisor_id} className="border rounded-lg p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {supervisor.supervisor_username}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {supervisor.supervisor_email}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Assigned Users ({supervisor.interns.length})
                      </p>
                      {supervisor.interns.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No users assigned</p>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {supervisor.interns.map((intern) => (
                            <Badge
                              key={intern.id}
                              variant="secondary"
                              className="pl-2 pr-1 py-1 flex items-center gap-1"
                            >
                              <span className="text-xs">{intern.username}</span>
                              <button
                                onClick={() => handleUnassignIntern(intern.id)}
                                disabled={isUnassigningIntern}
                                className="ml-1 hover:bg-muted rounded-sm p-0.5 transition-colors disabled:opacity-50"
                                aria-label={`Unassign ${intern.username}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-sm font-medium text-foreground">
                        Assign New Users
                      </p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <InternSelector
                            interns={allInterns}
                            selectedInternIds={selectedInternsBySupervisor[supervisor.supervisor_id] || []}
                            onSelectionChange={(selectedIds) => handleSelectionChange(supervisor.supervisor_id, selectedIds)}
                            currentSupervisorId={supervisor.supervisor_id}
                            disabled={isAssigningSupervisor}
                          />
                        </div>
                        <Button
                          onClick={() => handleAssign(supervisor.supervisor_id)}
                          disabled={
                            isAssigningSupervisor ||
                            !selectedInternsBySupervisor[supervisor.supervisor_id] ||
                            selectedInternsBySupervisor[supervisor.supervisor_id]?.length === 0
                          }
                          size="default"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Assign
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
        </div>
      </div>
    </TabsContent>
  );
}

function AllInternBillsTab(
  { bills } : {
    bills?: BillWithInterns[];
  }
) {
  const { isLoadingBills } = useAdminDashboard();
  const { activeTenant } = useAuth();
  const [removingBill, setRemovingBill] = useState<{ internId: string; billId: string; billNumber: string; internName: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemoveBill = async () => {
    if (!removingBill) return;

    setIsRemoving(true);
    try {
      const { removeBillFromIntern } = await import('@/app/actions/admin');
      const result = await removeBillFromIntern(removingBill.internId, removingBill.billId, activeTenant?.tenantId);

      if (result.success) {
        // Refresh the page to show updated data
        window.location.reload();
      } else {
        alert(result.error || 'Failed to remove bill');
      }
    } catch (error) {
      console.error('Error removing bill:', error);
      alert('Failed to remove bill');
    } finally {
      setIsRemoving(false);
      setRemovingBill(null);
    }
  };
  
  if (isLoadingBills) {
    return (
      <TabsContent value="all-tracked-bills" className="mx-8 space-y-8 mt-6">
        <div className="p-8">
          <Skeleton className="h-8 w-1/3 mb-4 rounded-md" />
          <Skeleton className="h-[600px] w-full rounded-md" />
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="all-tracked-bills" className="mx-8 space-y-8 mt-6">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">All Tracked Bills</h1>
            <h2 className="text-sm text-muted-foreground">View all bills tracked by users</h2>
          </div>
          <AssignMultipleBillsDialog
            trigger={
              <Button>
                Assign Bills to Users
              </Button>
            }
            onSuccess={() => {
              // Refresh the bills data after successful assignment
              window.location.reload();
            }}
          />
        </div>
          <div className="space-y-4">
            {bills && bills.length === 0 ? (
              <Card className="p-6">
                <p className="text-center text-muted-foreground">
                  No tracked bills found
                </p>
              </Card>
            ) : (
              bills && bills.map((bill) => (
                <Card key={bill.bill_id} className="p-6 bg-white shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="">
                      <p className="text-md font-semibold text-foreground">{bill.bill_number}</p>
                      <p className="text-sm text-muted-foreground">{bill.bill_title || 'No Title'}</p>
                      <div className='mt-2 flex text-muted-foreground gap-2'>
                        <Badge variant='outline'>{formatBillStatusName(bill.current_status)}</Badge>
                      </div>
                    </div>
                    <div className="space-x-2">
                      <p className="text-sm text-muted-foreground mb-2">Tracked by:</p>
                      {bill.tracked_by.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No users tracking this bill</p>
                      ) : (
                        bill.tracked_by.map((intern) => (
                          <Badge key={intern.id} variant="secondary" className="bg-blue-100 text-blue-800 pr-1 pl-3 py-1 inline-flex items-center gap-1">
                            <span>{intern.username}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRemovingBill({
                                  internId: intern.id,
                                  billId: bill.bill_id,
                                  billNumber: bill.bill_number || 'N/A',
                                  internName: intern.username || 'Unknown'
                                });
                              }}
                              className="ml-1 rounded-full hover:bg-blue-200 p-0.5 transition-colors"
                              aria-label={`Remove ${intern.username} from ${bill.bill_number}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
      </div>

      {/* Remove Bill Confirmation Dialog */}
      <AlertDialog open={!!removingBill} onOpenChange={(open) => !open && setRemovingBill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Bill from User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove bill <strong>{removingBill?.billNumber}</strong> from <strong>{removingBill?.internName}</strong>&apos;s tracking list? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveBill}
              disabled={isRemoving}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRemoving ? 'Removing...' : 'Remove Bill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </TabsContent>
  )
}