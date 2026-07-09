'use client';

import { Eye } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { orgMonogram } from '@/lib/org-monogram';
import { cn } from '@/lib/utils';

/**
 * Prominent "whose board am I viewing" badge for the View Board header. Sits at
 * the far left of the header row (before search) so the org identity reads
 * first, left-to-right: colored monogram + org name + a read-only cue.
 */
export function ActiveBoardIdentity() {
  const { followedOrgs, selectedOrgId } = useActiveBoards();
  const current = followedOrgs.find((o) => o.tenantId === selectedOrgId);
  if (!current) return null;

  const { initials, tint } = orgMonogram(current.name);

  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 py-1 pl-1.5 pr-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold',
          tint,
        )}
        aria-hidden
      >
        {initials}
      </div>
      <div className="leading-tight">
        <p className="max-w-[12rem] truncate text-sm font-semibold">{current.name}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Viewing · read-only
        </p>
      </div>
    </div>
  );
}
