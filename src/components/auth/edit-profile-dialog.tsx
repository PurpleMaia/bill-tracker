'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NameFields } from './name-fields';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';

interface EditProfilePanelProps {
  /** Called after a successful save (the Settings dialog closes itself). */
  onSaved: () => void;
}

/** Name fields — the Settings dialog's Profile tab. */
export function EditProfilePanel({ onSaved }: EditProfilePanelProps) {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Seed from the current user on mount. The Settings dialog mounts this fresh
  // on every open, so a cancelled edit doesn't linger into the next one.
  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  }, [user?.firstName, user?.lastName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) return;

    setIsLoading(true);
    try {
      await updateProfile({ firstName: first, lastName: last });
      toast({ title: 'Profile updated' });
      onSaved();
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add your first and last name to complete your profile.
      </p>
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
  );
}
