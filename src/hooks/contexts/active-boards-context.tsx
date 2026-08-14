'use client';

import React, {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from 'react';
import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useAuth } from './auth-context';

const LAST_ORG_KEY = 'activeBoardsLastOrgId';

interface ActiveBoardsContextType {
  followedOrgs: PublicOrg[];
  refreshFollowed: () => Promise<void>;
  selectedOrgId: string | null;
  selectOrg: (tenantId: string) => void;
  bills: Bill[];
  loadingBills: boolean;
  testimonyBillIds: Set<string>;
  /** Bill IDs the current user already tracks (any tenant context). */
  trackedBillIds: Set<string>;
  /** Optimistically mark a bill as tracked by the current user. */
  markBillTracked: (billId: string) => void;
  follow: (tenantId: string) => Promise<void>;
  unfollow: (tenantId: string) => Promise<void>;
}

const ActiveBoardsContext = createContext<ActiveBoardsContextType | undefined>(undefined);

export function ActiveBoardsProvider({ children }: { children: ReactNode }) {
  const [followedOrgs, setFollowedOrgs] = useState<PublicOrg[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [testimonyBillIds, setTestimonyBillIds] = useState<Set<string>>(new Set());
  const [trackedBillIds, setTrackedBillIds] = useState<Set<string>>(new Set());

  // Signed-out visitors can reach /boards/browse, but every endpoint below is
  // per-user and would 401 for them, so all of them wait on a resolved session.
  const { user, loading: authLoading } = useAuth();
  const isSignedIn = !authLoading && !!user;

  // Load the current user's own tracked bill IDs once so Active Boards cards
  // can reflect whether the viewer already tracks a bill they're looking at.
  useEffect(() => {
    if (!isSignedIn) {
      setTrackedBillIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = await data.boards.getMyTrackedBillIds();
        if (!cancelled) setTrackedBillIds(new Set(ids));
      } catch (e) {
        if (!cancelled) console.error('Failed to load tracked bill ids:', e);
      }
    })();
    return () => { cancelled = true; };
    // user?.id, not just isSignedIn: switching accounts without an intermediate
    // logout leaves the boolean true, and stale per-user data on screen.
  }, [isSignedIn, user?.id]);

  const markBillTracked = useCallback((billId: string) => {
    setTrackedBillIds((prev) => {
      if (prev.has(billId)) return prev;
      const next = new Set(prev);
      next.add(billId);
      return next;
    });
  }, []);

  const refreshFollowed = useCallback(async () => {
    if (!isSignedIn) {
      setFollowedOrgs([]);
      setSelectedOrgId(null);
      return;
    }
    const orgs = await data.boards.listFollowed();
    setFollowedOrgs(orgs);
    // Reconcile selection: keep current if still followed, else restore
    // localStorage, else fall back to the first followed org.
    setSelectedOrgId((prev) => {
      if (prev && orgs.some((o) => o.tenantId === prev)) return prev;
      const saved = typeof window !== 'undefined' ? localStorage.getItem(LAST_ORG_KEY) : null;
      if (saved && orgs.some((o) => o.tenantId === saved)) return saved;
      return orgs[0]?.tenantId ?? null;
    });
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    refreshFollowed();
  }, [refreshFollowed]);

  const selectOrg = useCallback((tenantId: string) => {
    setSelectedOrgId(tenantId);
    if (typeof window !== 'undefined') localStorage.setItem(LAST_ORG_KEY, tenantId);
  }, []);

  // Refetch bills + org testimony whenever the selected org changes.
  useEffect(() => {
    if (!selectedOrgId) {
      setBills([]);
      setTestimonyBillIds(new Set());
      return;
    }
    let cancelled = false;
    setLoadingBills(true);
    (async () => {
      try {
        const fetched = await data.boards.getBoard({ tenantId: selectedOrgId, showArchived: false });
        if (cancelled) return;
        setBills(fetched);
        const ids = await data.boards.getOrgTestimonyStatus({
          tenantId: selectedOrgId,
          billIds: fetched.map((b) => b.id),
        });
        if (cancelled) return;
        setTestimonyBillIds(new Set(ids));
      } catch (e) {
        if (!cancelled) {
          setBills([]);
          setTestimonyBillIds(new Set());
          console.error('Failed to load active board:', e);
        }
      } finally {
        if (!cancelled) setLoadingBills(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOrgId]);

  const follow = useCallback(async (tenantId: string) => {
    await data.boards.follow({ tenantId });
    await refreshFollowed();
  }, [refreshFollowed]);

  const unfollow = useCallback(async (tenantId: string) => {
    await data.boards.unfollow({ tenantId });
    await refreshFollowed();
  }, [refreshFollowed]);

  return (
    <ActiveBoardsContext.Provider
      value={{
        followedOrgs, refreshFollowed, selectedOrgId, selectOrg,
        bills, loadingBills, testimonyBillIds, trackedBillIds, markBillTracked,
        follow, unfollow,
      }}
    >
      {children}
    </ActiveBoardsContext.Provider>
  );
}

export function useActiveBoards() {
  const ctx = useContext(ActiveBoardsContext);
  if (ctx === undefined) {
    throw new Error('useActiveBoards must be used within an ActiveBoardsProvider');
  }
  return ctx;
}
