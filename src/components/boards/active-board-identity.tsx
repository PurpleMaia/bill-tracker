'use client';

import { useActiveBoards } from '@/hooks/contexts/active-boards-context';

/**
 * Prominent "whose board am I viewing" badge for the View Board header. Sits at
 * the far left of the header row (before search). Dark-lime with white text so
 * the org identity pops.
 */
export function ActiveBoardIdentity() {
  const { followedOrgs, selectedOrgId } = useActiveBoards();
  const current = followedOrgs.find((o) => o.tenantId === selectedOrgId);
  if (!current) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-olive-dark py-2 pl-2 pr-2 text-white">
      <div className="leading-tight">
        <p className="max-w-[12rem] truncate text-sm font-semibold">{current.name}</p>
      </div>
    </div>
  );
}
