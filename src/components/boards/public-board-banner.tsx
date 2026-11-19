'use client';

import { useEffect, useState } from 'react';
import { Check, LogIn, Star } from 'lucide-react';
import type { PublicBoardOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { LoginLink } from '@/components/auth/login-link';
import { initials } from './active-board-banner';

/**
 * Follow control for a public board. Signed out it's a login prompt that
 * returns here; signed in it toggles the follow, seeded from the viewer's
 * followed list.
 */
function FollowControl({ tenantId, orgName }: { tenantId: string; orgName: string }) {
  const { user, loading } = useAuth();
  // Keyed on the id, not the object, so a session refresh doesn't refetch.
  const userId = user?.id;
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) {
      setFollowing(null);
      return;
    }
    let cancelled = false;
    data.boards
      .listFollowed()
      .then((orgs) => {
        if (!cancelled) setFollowing(orgs.some((o) => o.tenantId === tenantId));
      })
      // Fail closed to "not following"; clicking still works.
      .catch(() => {
        if (!cancelled) setFollowing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tenantId]);

  if (loading) return null;

  if (!user) {
    return (
      <Button asChild size="sm" className="shrink-0">
        <LoginLink aria-label="Login to follow">
          <LogIn className="h-4 w-4 sm:mr-1.5" />
          <span className="sr-only sm:not-sr-only">Login to follow</span>
        </LoginLink>
      </Button>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      if (following) {
        await data.boards.unfollow({ tenantId });
        setFollowing(false);
      } else {
        await data.boards.follow({ tenantId });
        setFollowing(true);
        toast({ title: `Following ${orgName}`, description: 'Their board is now under the Following tab.' });
      }
    } catch {
      toast({ title: 'Something went wrong', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={following ? 'outline' : 'default'}
      className="shrink-0"
      disabled={busy || following === null}
      onClick={toggle}
      aria-pressed={!!following}
    >
      {following ? <Check className="h-4 w-4 sm:mr-1.5" /> : <Star className="h-4 w-4 sm:mr-1.5" />}
      <span className="sr-only sm:not-sr-only">{following ? 'Following' : 'Follow'}</span>
    </Button>
  );
}

/**
 * "Whose board is this?" banner for a public /org/<slug> board. Same olive
 * strip as the Following board's banner, plus a follow action for visitors
 * arriving from a link. Sharing lives with the org (Browse, Org Settings), not here.
 */
export function PublicBoardBanner({ org }: { org: PublicBoardOrg }) {
  return (
    <div className="flex items-center gap-3 border-b border-olive/30 bg-olive-soft px-4 py-3">
      <div
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-olive-dark text-sm font-bold text-white"
      >
        {initials(org.name)}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate text-base font-semibold">{org.name}&rsquo;s board</h1>
        <p className="truncate text-xs text-olive-dark">
          {org.description || 'Public board · read-only'}
        </p>
      </div>
      <FollowControl tenantId={org.tenantId} orgName={org.name} />
    </div>
  );
}
