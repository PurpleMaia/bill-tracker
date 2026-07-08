'use client';

// ==============================================
// useTestimonies — shared client cache for the user's testimony list
// ==============================================
// The Testimonies sub-nav (header) and the three /testimonies views all need
// the same list. A module-level store means one fetch feeds every consumer:
// tab switches render purely from memory (like the kanban/spreadsheet views
// share bills) and the header tabs can show counts. Invalidation is
// event-based, not time-based: the cache refetches only after a mutation
// (draft saved, marked submitted, deleted) flags it stale via
// invalidateTestimonies() — a stale refresh is silent, since the skeleton
// only shows while items === null. The store is keyed by user id and clears
// on logout.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import type { TestimonyListItem, TestimonyProspect } from '@/types/testimony';

interface TestimoniesState {
  userId: string | null;
  items: TestimonyListItem[] | null;
  /** Tracked bills with a hearing scheduled and no testimony started. */
  prospects: TestimonyProspect[] | null;
  error: string | null;
  loading: boolean;
}

let state: TestimoniesState = {
  userId: null,
  items: null,
  prospects: null,
  error: null,
  loading: false,
};
let stale = false;

/**
 * Flags the cached list stale after a mutation elsewhere (the testimony
 * writer's autosave / mark-submitted). The next consumer mount silently
 * refetches; until then cached data keeps rendering.
 */
export function invalidateTestimonies() {
  stale = true;
}
const listeners = new Set<() => void>();

function setState(patch: Partial<TestimoniesState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TestimoniesState {
  return state;
}

function loadFor(userId: string, force = false) {
  const sameUser = state.userId === userId;
  if (!force && sameUser) {
    if (state.loading) return;
    // Cache is valid — serve from memory, no request.
    if (state.items !== null && !stale) return;
  }
  stale = false;

  setState({
    userId,
    loading: true,
    error: null,
    items: sameUser ? state.items : null,
    prospects: sameUser ? state.prospects : null,
  });
  Promise.all([data.testimony.list(), data.testimony.prospects()])
    .then(([items, prospects]) => {
      if (state.userId === userId) setState({ items, prospects, loading: false });
    })
    .catch((err) => {
      if (state.userId === userId) {
        setState({ error: err?.message ?? 'Failed to load testimonies', loading: false });
      }
    });
}

export function useTestimonies() {
  const { user, loading: authLoading } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (user) {
      loadFor(user.id);
    } else if (!authLoading && state.userId !== null) {
      setState({ userId: null, items: null, prospects: null, error: null, loading: false });
    }
  }, [user, authLoading]);

  const refetch = useCallback(() => {
    if (user) loadFor(user.id, true);
  }, [user]);

  /**
   * Optimistically drop one testimony from the cache (after a delete), then
   * refresh in the background — the bill may now qualify as a prospect.
   */
  const removeItem = useCallback(
    (billId: string) => {
      if (state.items) {
        setState({ items: state.items.filter((item) => item.billId !== billId) });
      }
      if (user) loadFor(user.id, true);
    },
    [user],
  );

  return {
    items: snapshot.items,
    prospects: snapshot.prospects,
    error: snapshot.error,
    /** True while the list is being (re)fetched. */
    loading: snapshot.loading,
    refetch,
    removeItem,
  };
}
