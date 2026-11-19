'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User } from '@/db/types';
import { Selectable } from 'kysely';

interface UserSelectorProps {
  users: Selectable<User>[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UserSelector({
  users,
  selectedUserId,
  onSelect,
  placeholder = 'Select user...',
  disabled = false,
}: UserSelectorProps) {
  return (
    <Select
      value={selectedUserId || undefined}
      onValueChange={onSelect}
      disabled={disabled}
    >
      <SelectTrigger className="w-full" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {users.map((user) => {
            const displayName = user.username;

            return (
              <SelectItem key={user.id} value={user.id} className='hover:bg-slate-100 cursor-pointer'>
                <div className="flex flex-col">
                  <span className="font-medium">{displayName}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {user.role === 'user' ? 'Intern' : user.role}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
