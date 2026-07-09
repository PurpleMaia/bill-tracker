'use client';

import { ChevronDown } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function OrgSwitcherDropdown() {
  const { followedOrgs, selectedOrgId, selectOrg } = useActiveBoards();
  const current = followedOrgs.find((o) => o.tenantId === selectedOrgId);
  if (followedOrgs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <span className="max-w-[12rem] truncate">Viewing: {current?.name ?? 'Select org'}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={selectedOrgId ?? ''} onValueChange={selectOrg}>
          {followedOrgs.map((o) => (
            <DropdownMenuRadioItem key={o.tenantId} value={o.tenantId} className="cursor-pointer">
              {o.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
