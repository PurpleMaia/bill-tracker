'use client';

import { useEffect, useState, useCallback } from 'react';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

export function BrowseOrgsList() {
  const [orgs, setOrgs] = useState<PublicOrg[] | null>(null);
  const { follow, unfollow, refreshFollowed } = useActiveBoards();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await data.boards.listPublicOrgs();
    setOrgs(list);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (org: PublicOrg) => {
    setBusyId(org.tenantId);
    try {
      if (org.isFollowing) await unfollow(org.tenantId);
      else await follow(org.tenantId);
      await Promise.all([load(), refreshFollowed()]);
    } finally {
      setBusyId(null);
    }
  };

  if (orgs === null) return <p className="text-sm text-muted-foreground">Loading organizations…</p>;
  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Building2 className="h-8 w-8" />
        <p className="text-sm">No organizations have made their board public yet.</p>
      </div>
    );
  }

  return (
    <ul className="mx-auto w-full max-w-2xl divide-y rounded-md border">
      {orgs.map((org) => (
        <li key={org.tenantId} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{org.name}</p>
          </div>
          <Button
            variant={org.isFollowing ? 'outline' : 'default'}
            size="sm"
            disabled={busyId === org.tenantId}
            onClick={() => toggle(org)}
          >
            {org.isFollowing ? 'Following' : 'Follow'}
          </Button>
        </li>
      ))}
    </ul>
  );
}
