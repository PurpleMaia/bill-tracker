'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { X, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Invite {
  id: string;
  email: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  invited_by_username: string;
}

export function PendingInvitesSection() {
  const { activeTenant } = useAuth();
  const { toast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokeDialogId, setRevokeDialogId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const response = await fetch(`/api/tenants/${activeTenant.tenantId}/invites`);
      if (response.ok) {
        const data = await response.json();
        setInvites(data.invites);
      }
    } catch (error) {
      console.error('Failed to fetch invites:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleRevoke = async () => {
    if (!revokeDialogId || !activeTenant) return;
    setIsRevoking(true);
    try {
      const response = await fetch(
        `/api/tenants/${activeTenant.tenantId}/invites/${revokeDialogId}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        setInvites(prev =>
          prev.map(inv =>
            inv.id === revokeDialogId ? { ...inv, status: 'revoked' } : inv
          )
        );
      }
    } catch (error) {
      console.error('Failed to revoke invite:', error);
    } finally {
      setIsRevoking(false);
      setRevokeDialogId(null);
    }
  };

  const handleCopyLink = async (invite: Invite) => {
    const url = `${window.location.origin}/register?invite=${invite.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    toast({
      title: 'Link copied',
      description: 'Invite link copied to clipboard.',
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (invite: Invite) => {
    if (invite.status === 'accepted') {
      return <Badge className="bg-gray-100 text-gray-800">Accepted</Badge>;
    }
    if (invite.status === 'revoked') {
      return <Badge className="bg-red-100 text-red-800">Revoked</Badge>;
    }
    if (new Date(invite.expires_at) < new Date()) {
      return <Badge className="bg-red-100 text-red-800">Expired</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Pending</Badge>;
  };

  const isPending = (invite: Invite) =>
    invite.status === 'pending' && new Date(invite.expires_at) >= new Date();

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-1/3 mb-4 rounded-md" />
        <Skeleton className="h-[200px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Pending Invites</h1>
      <h2 className="text-sm mb-6 text-muted-foreground">Manage organization invitations</h2>

      {invites.length === 0 ? (
        <Card className="p-6">
          <p className="text-center text-muted-foreground">
            No invites sent yet
          </p>
        </Card>
      ) : (
        <Table className="border bg-white shadow-sm">
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-bold">Email</TableHead>
              <TableHead className="font-bold">Invited By</TableHead>
              <TableHead className="font-bold">Sent</TableHead>
              <TableHead className="font-bold">Expires</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="font-medium">{invite.email}</TableCell>
                <TableCell className="text-muted-foreground">{invite.invited_by_username}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(invite.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(invite.expires_at).toLocaleDateString()}
                </TableCell>
                <TableCell>{getStatusBadge(invite)}</TableCell>
                <TableCell>
                  {isPending(invite) && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyLink(invite)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copy invite link"
                      >
                        {copiedId === invite.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevokeDialogId(invite.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!revokeDialogId} onOpenChange={(open) => !open && setRevokeDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this invitation? The recipient will no longer be able to use the invite link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRevoking ? 'Revoking...' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
