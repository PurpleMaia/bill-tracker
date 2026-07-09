'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Check, FileText, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// Deterministic monogram tint from the org name, so each card has a stable,
// distinct avatar color without needing an uploaded logo.
const MONOGRAM_TINTS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

function monogram(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const tint = MONOGRAM_TINTS[Math.abs(hash) % MONOGRAM_TINTS.length];
  return { initials: initials || '•', tint };
}

function OrgCard({
  org,
  busy,
  onToggle,
}: {
  org: PublicOrg;
  busy: boolean;
  onToggle: () => void;
}) {
  const { initials, tint } = monogram(org.name);
  return (
    <li className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            tint,
          )}
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{org.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {org.billCount} {org.billCount === 1 ? 'bill' : 'bills'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {org.followerCount} {org.followerCount === 1 ? 'follower' : 'followers'}
            </span>
          </div>
        </div>
      </div>

      <p
        className={cn(
          'mt-3 line-clamp-3 flex-1 text-sm',
          org.description ? 'text-muted-foreground' : 'italic text-muted-foreground/60',
        )}
      >
        {org.description || 'No description yet.'}
      </p>

      <Button
        variant={org.isFollowing ? 'outline' : 'default'}
        size="sm"
        className="mt-4 w-full"
        disabled={busy}
        onClick={onToggle}
        aria-pressed={org.isFollowing}
      >
        {org.isFollowing ? (
          <>
            <Check className="mr-1.5 h-4 w-4" /> Following
          </>
        ) : (
          'Follow'
        )}
      </Button>
    </li>
  );
}

export function BrowseOrgsList() {
  const [orgs, setOrgs] = useState<PublicOrg[] | null>(null);
  const { follow, unfollow } = useActiveBoards();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const list = await data.boards.listPublicOrgs();
    setOrgs(list);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (org: PublicOrg) => {
    setBusyId(org.tenantId);
    try {
      // follow/unfollow already refresh the followed-orgs set internally; we
      // only need to reload the public list here so this card's isFollowing
      // flag (and the follower count) reflect the change.
      if (org.isFollowing) await unfollow(org.tenantId);
      else await follow(org.tenantId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!orgs) return null;
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) => o.name.toLowerCase().includes(q) || o.description.toLowerCase().includes(q),
    );
  }, [orgs, query]);

  if (orgs === null) {
    return <p className="text-sm text-muted-foreground">Loading organizations…</p>;
  }

  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <Building2 className="h-8 w-8" />
        <p className="text-sm">No organizations have made their board public yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search organizations…"
          className="pl-9"
          aria-label="Search organizations"
        />
      </div>

      {filtered && filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Search className="h-8 w-8" />
          <p className="text-sm">No organizations match &ldquo;{query}&rdquo;.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((org) => (
            <OrgCard
              key={org.tenantId}
              org={org}
              busy={busyId === org.tenantId}
              onToggle={() => toggle(org)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
