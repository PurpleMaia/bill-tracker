'use client';

import React from 'react';
import type { Bill } from '@/types/legislation';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import LLMUpdateColumnButton from '../llm/llm-update-column-button';
import RefreshColumnButton from '../scraper/update-column-button';

interface ColumnOptionsMenuProps {
  bills: Bill[];
  onRefreshStart: () => void;
  onRefreshEnd: () => void;
}

export default function ColumnOptionsMenu({
  bills,
  onRefreshStart,
  onRefreshEnd,
}: ColumnOptionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Column options">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className='flex flex-col space-y-2'>
          <LLMUpdateColumnButton
            bills={bills}
            onRefreshStart={onRefreshStart}
            onRefreshEnd={onRefreshEnd}
          />
          <RefreshColumnButton
            bills={bills}
            onRefreshStart={onRefreshStart}
            onRefreshEnd={onRefreshEnd}
          />
        </div>   
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
