'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2 } from 'lucide-react';

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/tenants/create-own', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Organization created',
          description: `${trimmed} is ready. You're now its admin.`,
        });
        // Full reload so the server re-seeds memberships and the user lands as
        // admin of the new org.
        window.location.href = '/';
      } else {
        toast({
          title: 'Failed to create organization',
          description: data.error || 'Please try again.',
          variant: 'destructive',
        });
        setIsLoading(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Start your own organization to track bills with a team. You&apos;ll
            become its admin and can invite others.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hawaii Food Coalition"
              maxLength={100}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            <Building2 className="mr-2 h-4 w-4" />
            {isLoading ? 'Creating...' : 'Create Organization'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
