'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PERSON_NAME_MAX_LENGTH } from '@/lib/auth/validators';

interface NameFieldsProps {
  /** Prefix for the input ids, so two forms on one page never collide. */
  idPrefix: string;
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
}

/**
 * First/last name inputs, side by side. Shared by registration and the edit
 * profile dialog so both enforce the same limit as the server's
 * personNameSchema.
 */
export function NameFields({
  idPrefix,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
}: NameFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-first-name`}>First name</Label>
        <Input
          id={`${idPrefix}-first-name`}
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          maxLength={PERSON_NAME_MAX_LENGTH}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-last-name`}>Last name</Label>
        <Input
          id={`${idPrefix}-last-name`}
          type="text"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          maxLength={PERSON_NAME_MAX_LENGTH}
          required
        />
      </div>
    </div>
  );
}
