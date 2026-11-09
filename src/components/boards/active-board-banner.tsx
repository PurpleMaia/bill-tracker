'use client';

import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { OrgSwitcherDropdown } from './org-switcher-dropdown';

// First letter/digit of the first two words. Array.from splits by code point
// (so an emoji isn't cut in half), and words with no letter, like "🌺" or "&",
// are skipped rather than rendered.
function initials(name: string) {
  const firsts = name
    .split(/\s+/)
    .map((w) => Array.from(w).find((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((ch): ch is string => !!ch);
  return firsts.slice(0, 2).join('').toUpperCase() || '?';
}

/**
 * "Whose board is this?" banner above the Following board. The kanban is the
 * same component as Your Bills, so testers couldn't tell the two apart; the
 * olive strip, org name, and read-only line make it unmistakably someone
 * else's board. Hosts the org switcher so it's found next to the org name.
 */
export function ActiveBoardBanner() {
  const { followedOrgs, selectedOrgId } = useActiveBoards();
  const current = followedOrgs.find((o) => o.tenantId === selectedOrgId);
  if (!current) return null;

  return (
    <div className="flex items-center gap-3 border-b border-olive/30 bg-olive-soft px-4 py-3">
      <div
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-olive-dark text-sm font-bold text-white"
      >
        {initials(current.name)}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <h2 className="truncate text-base font-semibold">{current.name}&rsquo;s board</h2>
        <p className="truncate text-xs text-olive-dark">
          You&rsquo;re viewing another org&rsquo;s bills · read-only · track any bill onto your own board
        </p>
      </div>
      <OrgSwitcherDropdown />
    </div>
  );
}
