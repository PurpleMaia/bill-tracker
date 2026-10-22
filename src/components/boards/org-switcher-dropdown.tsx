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
  // With one followed org there's nothing to switch to.
  if (followedOrgs.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1 border-transparent bg-olive-dark text-white hover:bg-olive-dark/90 hover:text-white"
        >
          Switch org
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
