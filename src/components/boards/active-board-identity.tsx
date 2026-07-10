'use client';

import { Eye } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { orgMonogram } from '@/lib/org-monogram';

/**
 * Prominent "whose board am I viewing" badge for the View Board header. Sits at
 * the far left of the header row (before search). Dark-lime with white text so
 * the org identity pops; reads top-to-bottom: "Viewing" eyebrow + org name.
 */
export function ActiveBoardIdentity() {
  const { followedOrgs, selectedOrgId } = useActiveBoards();
  const current = followedOrgs.find((o) => o.tenantId === selectedOrgId);
  if (!current) return null;

  const { initials } = orgMonogram(current.name);

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-olive-dark py-1 pl-1.5 pr-3 text-white">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/15 text-sm font-bold text-white"
        aria-hidden
      >
        {initials}
      </div>
      <div className="leading-tight">
        <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-white/80">
          <Eye className="h-3 w-3" />
          Viewing
        </p>
        <p className="max-w-[12rem] truncate text-sm font-semibold">{current.name}</p>
      </div>
    </div>
  );
}
