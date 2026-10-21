'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useAuth } from './contexts/auth-context';
import {
  getPendingRequests,
  getPendingProposals,
  getAllInterns,
  getAllSupervisors,
  getAllInternBills,
  approveUser,
  denyUser,
  assignSupervisorToIntern,
  unassignInternFromSupervisor,
  getAllAccounts,
} from '@/app/actions/admin';

export function useAdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.tenantId;

  // Query keys for cache management (tenant-aware)
  const queryKeys = {
    pendingRequests: ['admin', 'pending-requests', tenantId] as const,
    allAccounts: ['admin', 'all-accounts', tenantId] as const,
    pendingProposals: ['admin', 'pending-proposals', tenantId] as const,
    supervisorRequests: ['admin', 'supervisor-requests', tenantId] as const,
    allInterns: ['admin', 'all-interns', tenantId] as const,
    allSupervisors: ['admin', 'all-supervisors', tenantId] as const,
    allInternBills: ['admin', 'all-intern-bills', tenantId] as const,
  };

  // ============================================
  // QUERIES - Data Fetching with React Query
  // ============================================

  const pendingRequestsQuery = useQuery({
    queryKey: queryKeys.pendingRequests,
    queryFn: async () => {
      const result = await getPendingRequests(tenantId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000, // Consider data fresh for 30 seconds
  });

  const allAccountsQuery = useQuery({
    queryKey: queryKeys.allAccounts,
    queryFn: async () => {
      const result = await getAllAccounts(tenantId);

      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const pendingProposalsQuery = useQuery({
    queryKey: queryKeys.pendingProposals,
    queryFn: async () => {
      const result = await getPendingProposals(tenantId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const allInternsQuery = useQuery({
    queryKey: queryKeys.allInterns,
    queryFn: async () => {
      const result = await getAllInterns(tenantId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 60_000, // Less frequently changing data
  });

  const allSupervisorsQuery = useQuery({
    queryKey: queryKeys.allSupervisors,
    queryFn: async () => {
      const result = await getAllSupervisors(tenantId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 60_000,
  });

  const allInternBillsQuery = useQuery({
    queryKey: queryKeys.allInternBills,
    queryFn: async () => {
      const result = await getAllInternBills(tenantId);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  // ============================================
  // MUTATIONS - Actions with Optimistic Updates
  // ============================================

  const approveUserMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const result = await approveUser(userId, role, tenantId);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    // Optimistic update example
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.pendingRequests });
      const previousData = queryClient.getQueryData(queryKeys.pendingRequests);
      
      // Optimistically remove the user from pending list
      queryClient.setQueryData(queryKeys.pendingRequests, (old: any[]) => 
        old?.filter(user => user.id !== userId) ?? []
      );
      
      return { previousData };
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User has been approved' });
    },
    onError: (error, _userId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.pendingRequests, context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve user',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingRequests });
    },
  });

  const denyUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const result = await denyUser(userId, tenantId);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.pendingRequests });
      const previousData = queryClient.getQueryData(queryKeys.pendingRequests);

      queryClient.setQueryData(queryKeys.pendingRequests, (old: any[]) =>
        old?.filter(user => user.id !== userId) ?? []
      );

      return { previousData };
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User has been denied an account' });
    },
    onError: (error, _userId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.pendingRequests, context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to deny user',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingRequests });
    },
  });

  const assignSupervisorMutation = useMutation({
    mutationFn: async ({ supervisorId, internIds }: { supervisorId: string; internIds: string[] }) => {
      const result = await assignSupervisorToIntern(supervisorId, internIds, tenantId);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_data, variables) => {
      const internCount = variables.internIds.length;
      toast({
        title: 'Success',
        description: `Successfully assigned ${internCount} intern${internCount > 1 ? 's' : ''} to supervisor`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign supervisor',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allInterns });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSupervisors });
    },
  });

  const unassignInternMutation = useMutation({
    mutationFn: async (internId: string) => {
      const result = await unassignInternFromSupervisor(internId, tenantId);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Successfully unassigned intern from supervisor',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unassign intern',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allInterns });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSupervisors });
    },
  });  

  // ============================================
  // RETURN VALUES - Clean API for Component
  // ============================================

  return {
    // Data
    pendingUsers: pendingRequestsQuery.data ?? [],
    pendingProposals: pendingProposalsQuery.data ?? [],
    allAccounts: allAccountsQuery.data ?? [],
    allInterns: allInternsQuery.data ?? [],
    allSupervisors: allSupervisorsQuery.data ?? [],
    allInternBills: allInternBillsQuery.data ?? [],

    // Loading states
    isLoading: pendingRequestsQuery.isLoading,
    isLoadingProposals: pendingProposalsQuery.isLoading,
    isLoadingInterns: allInternsQuery.isLoading,
    isLoadingRelationships: allSupervisorsQuery.isLoading,
    isLoadingBills: allInternBillsQuery.isLoading,

    // Error states
    errors: {
      pendingRequests: pendingRequestsQuery.error,
      pendingProposals: pendingProposalsQuery.error,
      allInterns: allInternsQuery.error,
      allSupervisors: allSupervisorsQuery.error,
      allInternBills: allInternBillsQuery.error,
    },

    // Actions (simplified API - no need to pass refetch functions)
    handleApproveUser: (userId: string, role: string) =>
      approveUserMutation.mutate({ userId, role }),
    handleDenyUser: (userId: string,) =>
      denyUserMutation.mutate(userId),
    handleAssignSupervisor: (supervisorId: string, internIds: string[]) =>
      assignSupervisorMutation.mutate({ supervisorId, internIds }),
    handleUnassignIntern: (internId: string) =>
      unassignInternMutation.mutate(internId),

    // Mutation loading states (useful for disabling buttons)
    isApproving: approveUserMutation.isPending,
    isRejecting: denyUserMutation.isPending,
    isAssigningSupervisor: assignSupervisorMutation.isPending,
    isUnassigningIntern: unassignInternMutation.isPending, 

    // Manual refetch functions if needed
    refetch: {
      pendingRequests: () => queryClient.invalidateQueries({ queryKey: queryKeys.pendingRequests }),
      pendingProposals: () => queryClient.invalidateQueries({ queryKey: queryKeys.pendingProposals }),
      allInterns: () => queryClient.invalidateQueries({ queryKey: queryKeys.allInterns }),
      allSupervisors: () => queryClient.invalidateQueries({ queryKey: queryKeys.allSupervisors }),
      allInternBills: () => queryClient.invalidateQueries({ queryKey: queryKeys.allInternBills }),
      all: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
    },
  };
}