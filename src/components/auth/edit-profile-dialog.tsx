'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NameFields } from './name-fields';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Re-seed from the current user each time the dialog opens, so a cancelled
  // edit doesn't linger into the next open.
  useEffect(() => {
    if (open) {
      setFirstName(user?.firstName ?? '');
      setLastName(user?.lastName ?? '');
    }
  }, [open, user?.firstName, user?.lastName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) return;

    setIsLoading(true);
    try {
      await updateProfile({ firstName: first, lastName: last });
      toast({ title: 'Profile updated' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Failed to update profile',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Add your first and last name to complete your profile.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <NameFields
            idPrefix="profile"
            firstName={firstName}
            lastName={lastName}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !firstName.trim() || !lastName.trim()}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
