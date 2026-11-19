'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicOrg, MyOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Building2, Check, ExternalLink, Eye, FileText, Globe, Lock, LogIn, Plus, Search, Settings, Star, Users } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { RISE_IN, riseDelay } from '@/lib/core/motion';
import { LoginLink } from '@/components/auth/login-link';
import { ScrollToTopButton } from '@/components/main/scroll-to-top-button';
import { publicBoardPath, publicBoardUrl } from '@/lib/boards/board-routes';
import { CopyLinkButton } from './copy-link-button';
import { OrganizationDialog, type OrganizationTab } from '@/components/admin/organization-dialog';

// Skeleton mirroring one OrgCard's shape while the list loads.
function OrgCardSkeleton() {
  return (
    <li className="flex flex-col rounded-lg border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
      <div className="mt-4 shrink-0 space-y-2 sm:mt-0 sm:w-64">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="mt-4 h-9 w-full rounded-md" />
      </div>
    </li>
  );
}

// Skeleton for the right-column blobs (At a glance / Following).
function SideBlobSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border bg-secondary/40 p-5">
      <Skeleton className="mb-3 h-4 w-28" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Full-page loading state: same two-column shape as the loaded page.
function BrowseSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Skeleton className="mb-4 h-10 w-full rounded-md" />
          <ul className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <OrgCardSkeleton key={i} />
            ))}
          </ul>
        </div>
        <aside className={cn('order-first flex shrink-0 flex-col gap-4 lg:order-none lg:w-72', RISE_IN)} style={riseDelay(2)}>
          <SideBlobSkeleton rows={2} />
          <SideBlobSkeleton rows={3} />
        </aside>
      </div>
    </div>
  );
}

// Orientation block: explains what Active Boards is and how following works, so
// the page reads as purposeful even when only a handful of orgs are listed.
function BrowseIntro({ orgCount }: { orgCount: number }) {
  const steps = [
    { icon: Star, title: 'Follow an org', text: 'Its board shows up under the Following tab.' },
    { icon: Eye, title: 'Open any board', text: 'Public boards open for anyone — no account needed. They’re read-only.' },
    { icon: Plus, title: 'Track this bill', text: 'Track any of their bills onto your own board with one click.' },
  ];
  return (
    <div className={cn('mb-6 bg-gradient-to-br from-muted/60 to-background p-6', RISE_IN)}>
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
      {/* How-it-works steps: desktop only. On phones they pushed the list a
          screen down; the line above already says what the page is for. */}
      <div className="mt-4 hidden gap-3 md:grid md:grid-cols-3">
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

// The viewer's own org, pinned above the discovery list. Olive background so it
// reads unmistakably as "yours" against the white browse cards. Read-only: it
// only points admins to Org Settings and tells members to ask their admin.
function MyOrgCard() {
  const { activeTenant } = useAuth();
  const [org, setOrg] = useState<MyOrg | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Admins open Organization Settings right from the card; closing it reloads
  // the card so a new description or visibility shows at once.
  const [orgTab, setOrgTab] = useState<OrganizationTab | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const tenantId = activeTenant?.tenantId;
  const isAdmin = activeTenant?.orgRole === 'admin';

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    // Only the first load shows placeholders; a reload swaps data in place.
    if (reloadKey === 0) setLoaded(false);
    data.boards
      .getMyOrgStats({ tenantId })
      .then((res) => {
        if (!cancelled) setOrg(res);
      })
      // Fail silent — the discovery list below is unaffected.
      .catch(() => {
        if (!cancelled) setOrg(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const handleOrgTabChange = (tab: OrganizationTab | null) => {
    setOrgTab(tab);
    if (tab === null) setReloadKey((k) => k + 1);
  };

  const settingsLink = (
    <button
      type="button"
      onClick={() => setOrgTab('settings')}
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      <Settings className="h-3 w-3" />
      Organization Settings
    </button>
  );

  // Not a member of any org (public/logged-out) — nothing to show.
  if (!activeTenant) return null;

  const displayName = org?.name ?? activeTenant.name;

  return (
    <div
      className={cn('mb-4 rounded-xl border border-olive/20 bg-olive-soft p-5 shadow-sm', RISE_IN)}
      style={riseDelay(1)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-olive-dark">
          Your organization
        </p>
        {org && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              org.publicBoard
                ? 'bg-olive/15 text-olive-dark'
                : 'bg-red-100 text-red-700',
            )}
          >
            {org.publicBoard ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {org.publicBoard ? 'Public' : 'Private'}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Identity + counts — 1/3 width */}
        <div className="flex min-w-0 flex-col sm:basis-2/3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{displayName}</p>
            {org ? (
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
            ) : loaded ? null : (
              <div className="mt-2 h-3 w-24 animate-pulse rounded bg-olive/20" />
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {!isAdmin ? (
              'Ask your organization admin to update these details.'
            ) : (
              <>Edit how your organization is viewed in {settingsLink}.</>
            )}
          </p>

          {org && <PublicLinkRow publicBoard={org.publicBoard} slug={org.slug} isAdmin={isAdmin} />}
        </div>

        {/* Bills-they-track preview — 2/3 width */}
        <div className="min-w-0 sm:basis-1/3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bills they track
          </p>
          {org && org.sampleBills.length > 0 ? (
            <ul className="space-y-1">
              {org.sampleBills.map((b) => (
                <li key={b.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono font-medium text-foreground">
                    {b.billNumber ?? '—'}
                  </span>
                  <span className="truncate text-muted-foreground">{b.billTitle ?? 'Untitled'}</span>
                </li>
              ))}
            </ul>
          ) : loaded ? (
            <p className="text-xs italic text-muted-foreground/60">No bills tracked yet.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="h-3 w-full animate-pulse rounded bg-olive/20" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-olive/20" />
            </div>
          )}
        </div>
      </div>

      {isAdmin && <OrganizationDialog tab={orgTab} onTabChange={handleOrgTabChange} />}
    </div>
  );
}

/**
 * Your org's shareable board link — what an org pastes on its website, in a
 * newsletter or in an email. Private boards have no link yet; admins are told
 * how to get one in the card's hint line, members here.
 */
function PublicLinkRow({ publicBoard, slug, isAdmin }: { publicBoard: boolean; slug: string; isAdmin: boolean }) {
  if (!publicBoard) {
    if (isAdmin) return null;
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Your board is private. Ask your admin to make it public to get a shareable link.
      </p>
    );
  }
  const url = publicBoardUrl(slug);
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Public link · anyone can view
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-olive/20 bg-background/70 px-2 py-1.5 text-xs">
          {url}
        </code>
        <CopyLinkButton url={url} variant="default" />
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href={publicBoardPath(slug)} aria-label="Open your public board">
            <ExternalLink className="h-4 w-4 sm:mr-1.5" />
            <span className="sr-only sm:not-sr-only">Open</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

function boardHref(tenantId: string) {
  return `/boards?org=${encodeURIComponent(tenantId)}`;
}

function OrgCard({
  org,
  index,
  busy,
  onToggle,
  isLoggedOut,
}: {
  org: PublicOrg;
  /** Position in the list — its slot in the entrance cascade. */
  index: number;
  busy: boolean;
  onToggle: () => void;
  isLoggedOut: boolean;
}) {
  return (
    <li
      className={cn(
        // relative: anchors the name link's stretched hit area (below), which
        // makes the whole card open the board.
        'group relative flex cursor-pointer flex-col rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:border-primary/40 hover:shadow-md sm:flex-row sm:items-start sm:gap-5',
        'has-[a[data-card-link]:focus-visible]:ring-2 has-[a[data-card-link]:focus-visible]:ring-ring has-[a[data-card-link]:focus-visible]:ring-offset-2',
        RISE_IN,
      )}
      // After the intro and Your organization card (slots 0–1). Searching only
      // removes cards, so the ones left stay put rather than replaying.
      style={riseDelay(2 + index)}
    >
      {/* Identity + counts + description */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-w-0 flex-1">
          {/* The card's one link. Its ::after covers the whole card, so a click
              anywhere opens the board, while screen readers hear a single link
              named after the org. The follow button sits above it (z-10). */}
          <Link
            href={publicBoardPath(org.slug)}
            data-card-link
            aria-label={`View ${org.name}’s board`}
            className="block truncate font-semibold leading-tight outline-none after:absolute after:inset-0 after:rounded-lg group-hover:text-primary"
          >
            {org.name}
          </Link>
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

        <p
          className={cn(
            'mt-3 text-sm',
            org.description ? 'text-muted-foreground' : 'italic text-muted-foreground/60',
          )}
        >
          {org.description || 'No description yet.'}
        </p>

        {/* Says the card opens a board. Always visible: phones have no hover.
            Decorative — the card link above already carries this name. */}
        <span
          aria-hidden
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          View board
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
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

        {/* Following is per-user state, so logged-out visitors get a sign-in
            prompt rather than a button whose request the API would reject.
            relative z-10 lifts it above the card-wide link so it stays clickable. */}
        <div className="relative z-10 mt-4 flex gap-2">
          {isLoggedOut ? (
            <Button asChild size="sm" className="flex-1">
              <LoginLink>
                <LogIn className="mr-1 h-4 w-4" />
                Login to follow
              </LoginLink>
            </Button>
          ) : (
            <Button
              variant={org.isFollowing ? 'outline' : 'default'}
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={onToggle}
              aria-pressed={org.isFollowing}
            >
              {org.isFollowing ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" /> Following
                </>
              ) : (
                <>
                  <Star className="mr-1.5 h-4 w-4" /> Follow
                </>
              )}
            </Button>
          )}
        </div>
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
    <div className="rounded-xl border bg-secondary/60 p-5">
      <h3 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide">
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
          You’re not following any orgs yet. Follow one to see its board under the Following tab.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {following.map((o) => (
            <li key={o.tenantId} className="truncate text-sm">
              <Link href={boardHref(o.tenantId)} className="hover:text-primary hover:underline">
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BrowseOrgsList() {
  const [orgs, setOrgs] = useState<PublicOrg[] | null>(null);
  const { follow, unfollow } = useActiveBoards();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Only treat the viewer as logged out once the session has actually resolved,
  // so the Follow button doesn't flip from prompt to action on hydration.
  const isLoggedOut = !authLoading && !user;

  const load = useCallback(async () => {
    const list = await data.boards.listPublicOrgs();
    setOrgs(list);
  }, []);

  // Keyed on the viewer's identity, not just mount: isFollowing is computed
  // per-user server-side, so the anonymous response is wrong the moment someone
  // logs in through the "Login to follow" dialog. Without this refetch every
  // card would keep saying "Follow" for orgs they already follow.
  useEffect(() => {
    if (authLoading) return;
    load();
  }, [load, authLoading, user?.id]);

  const toggle = async (org: PublicOrg) => {
    setBusyId(org.tenantId);
    try {
      // follow/unfollow already refresh the followed-orgs set internally; we
      // only need to reload the public list here so this card's isFollowing
      // flag (and the follower count) reflect the change.
      if (org.isFollowing) {
        await unfollow(org.tenantId);
      } else {
        await follow(org.tenantId);
        // Point at where the board went — the moment someone is most likely to
        // notice the Following tab.
        toast({
          title: `Following ${org.name}`,
          description: 'Their board is now under the Following tab.',
          duration: 6000,
          action: (
            <ToastAction altText="View their board" onClick={() => router.push(boardHref(org.tenantId))}>
              View their board
            </ToastAction>
          ),
        });
      }
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
    return <BrowseSkeleton />;
  }

  if (orgs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <BrowseIntro orgCount={0} />
        <MyOrgCard />
        <div
          className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground', RISE_IN)}
          style={riseDelay(2)}
        >
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

      {/* Your org: full-width under the Active Boards section, above the columns */}
      <MyOrgCard />

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
            <div className={cn('flex flex-col items-center gap-2 py-16 text-center text-muted-foreground', RISE_IN)}>
              <Search className="h-8 w-8" />
              <p className="text-sm">No organizations match &ldquo;{query}&rdquo;.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {filtered?.map((org, i) => (
                <OrgCard
                  key={org.tenantId}
                  org={org}
                  index={i}
                  busy={busyId === org.tenantId}
                  onToggle={() => toggle(org)}
                  isLoggedOut={isLoggedOut}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Stat blob, then the orgs you follow. Below lg this stacks first, so
            your stats lead on phones/tablets; lg+ makes it the right column. */}
        <aside className={cn('order-first flex shrink-0 flex-col gap-4 lg:order-none lg:w-72', RISE_IN)} style={riseDelay(2)}>
          <StatBlob orgs={orgs} />
          {/* Following is per-user, so the panel is meaningless when logged out. */}
          {!isLoggedOut && <FollowedOrgs orgs={orgs} />}
        </aside>
      </div>

      <ScrollToTopButton label="Scroll back to top" />
    </div>
  );
}
