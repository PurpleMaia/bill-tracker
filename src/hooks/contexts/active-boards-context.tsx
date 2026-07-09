'use client';

import React, {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from 'react';
import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';

const LAST_ORG_KEY = 'activeBoardsLastOrgId';

interface ActiveBoardsContextType {
  followedOrgs: PublicOrg[];
  refreshFollowed: () => Promise<void>;
  selectedOrgId: string | null;
  selectOrg: (tenantId: string) => void;
  bills: Bill[];
  loadingBills: boolean;
  testimonyBillIds: Set<string>;
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

  const refreshFollowed = useCallback(async () => {
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
  }, []);

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
        bills, loadingBills, testimonyBillIds, follow, unfollow,
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
