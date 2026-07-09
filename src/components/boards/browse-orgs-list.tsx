'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Check, Eye, FileText, Plus, Search, Star, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orgMonogram } from '@/lib/org-monogram';

// Orientation block: explains what Active Boards is and how following works, so
// the page reads as purposeful even when only a handful of orgs are listed.
function BrowseIntro({ orgCount }: { orgCount: number }) {
  const steps = [
    { icon: Star, title: 'Follow an org', text: 'Its board shows up in your switcher on the View Board tab.' },
    { icon: Eye, title: 'See what they track', text: 'Open their board to view the bills they’re following. You can’t edit it.' },
    { icon: Plus, title: 'Track this bill', text: 'Track any of their bills onto your own board with one click.' },
  ];
  return (
    <div className="mb-6 bg-gradient-to-br from-muted/60 to-background p-6">
      <div className="flex items-center gap-2 text-primary">
        <Building2 className="h-5 w-5" />
        <h2 className="text-lg font-semibold text-foreground">Active Boards</h2>
      </div>
      <p className="mt-1 w-full text-sm text-muted-foreground">
        See which bills other organizations are following, and pull the ones you
        care about onto your own board.
        {orgCount > 0 && (
          <>
            {' '}
            <span className="font-medium text-foreground">
              {orgCount} {orgCount === 1 ? 'org has' : 'orgs have'}
            </span>{' '}
            shared a board so far.
          </>
        )}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-lg bg-background/70 p-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="leading-tight">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
  const { initials, tint } = orgMonogram(org.name);
  return (
    <li className="flex flex-col rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-start sm:gap-5">
      {/* Identity + counts + description */}
      <div className="flex min-w-0 flex-1 flex-col">
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
            'mt-3 text-sm',
            org.description ? 'text-muted-foreground' : 'italic text-muted-foreground/60',
          )}
        >
          {org.description || 'No description yet.'}
        </p>
      </div>

      {/* Recent-bills preview */}
      <div className="mt-4 shrink-0 sm:mt-0 sm:w-64">
        {org.sampleBills.length > 0 ? (
          <>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              BILLS THEY TRACK
            </p>
            <ul className="space-y-1">
              {org.sampleBills.map((b) => (
                <li key={b.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono font-medium text-foreground">
                    {b.billNumber ?? '—'}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {b.billTitle ?? 'Untitled'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs italic text-muted-foreground/60">No bills tracked yet.</p>
        )}

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
      </div>
    </li>
  );
}

// Right-column summary of the whole Active Boards space.
function StatBlob({ orgs }: { orgs: PublicOrg[] }) {
  const totalBills = orgs.reduce((sum, o) => sum + o.billCount, 0);
  const stats = [
    { label: 'Public Organizations', value: orgs.length },
    { label: 'Total Bills Tracked', value: totalBills },
  ];
  return (
    <div className="rounded-xl border border-olive/20 bg-olive-soft p-5">
      <h3 className="border-b border-olive/30 pb-2 text-sm font-semibold uppercase tracking-wide">
        At a glance
      </h3>
      <dl className="mt-3 space-y-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Right-column list of the orgs the viewer already follows.
function FollowedOrgs({ orgs }: { orgs: PublicOrg[] }) {
  const following = orgs.filter((o) => o.isFollowing);
  return (
    <div className="rounded-xl border bg-secondary/60 p-5">
      <h3 className="flex items-baseline justify-between gap-2 border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide">
        Following
        <span className="text-base tabular-nums">{following.length}</span>
      </h3>
      {following.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          You’re not following any orgs yet. Follow one to pin it to your board switcher.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {following.map((o) => {
            const { initials, tint } = orgMonogram(o.name);
            return (
              <li key={o.tenantId} className="flex items-center gap-2.5">
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    tint,
                  )}
                  aria-hidden
                >
                  {initials}
                </div>
                <span className="truncate text-sm">{o.name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
      <div className="mx-auto w-full max-w-6xl">
        <BrowseIntro orgCount={0} />
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <Building2 className="h-8 w-8" />
          <p className="text-sm">No public boards yet.</p>
          <p className="max-w-xs text-xs">
            Orgs show up here once they turn on public board visibility in their settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BrowseIntro orgCount={orgs.length} />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: search + Discover grid */}
        <div className="min-w-0 flex-1">
          <div className="relative mb-4 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search organizations…"
              className="bg-white pl-9"
              aria-label="Search organizations"
            />
          </div>

          {filtered && filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <Search className="h-8 w-8" />
              <p className="text-sm">No organizations match &ldquo;{query}&rdquo;.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
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

        {/* Right: stat blob, then the orgs you follow */}
        <aside className="flex shrink-0 flex-col gap-4 lg:w-72">
          <StatBlob orgs={orgs} />
          <FollowedOrgs orgs={orgs} />
        </aside>
      </div>
    </div>
  );
}
