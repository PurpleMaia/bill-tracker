'use client';

// ==============================================
// useContacts — shared client cache for logged legislator contacts
// ==============================================
// The Take Action header tab (count), the Contact Legislators view, and the
// contact page's "Mark as contacted" all read the same list. Mirrors
// useTestimonies: a module-level store, one fetch for every consumer,
// refreshed only after a mutation. Keyed by user AND active org, since an org
// member also sees their teammates' contacts.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';
import { buildContactOpportunities } from '@/lib/legislators/contact-stage';
import type { LegislatorContact, LogContactsInput } from '@/types/contacts';

interface ContactsState {
  /** `${userId}:${tenantId ?? ''}` — whose list is cached. */
  key: string | null;
  items: LegislatorContact[] | null;
  error: string | null;
  loading: boolean;
}

let state: ContactsState = { key: null, items: null, error: null, loading: false };
let stale = false;
let requestSeq = 0;
const listeners = new Set<() => void>();

function setState(patch: Partial<ContactsState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ContactsState {
  return state;
}

function cacheKey(userId: string, tenantId: string | undefined) {
  return `${userId}:${tenantId ?? ''}`;
}

function loadFor(userId: string, tenantId: string | undefined, force = false) {
  const key = cacheKey(userId, tenantId);
  const same = state.key === key;
  if (!force && same) {
    if (state.loading) return;
    if (state.items !== null && !stale) return;
  }
  stale = false;
  const seq = ++requestSeq;
  setState({ key, loading: true, error: null, items: same ? state.items : null });
  data.contacts
    .list(tenantId)
    .then((items) => {
      if (seq === requestSeq && state.key === key) setState({ items, loading: false });
    })
    .catch((err) => {
      if (seq === requestSeq && state.key === key) {
        setState({ error: err?.message ?? 'Failed to load your contacts', loading: false });
      }
    });
}

/** Flags the cache stale (or refreshes it now if someone is watching). */
export function invalidateContacts() {
  if (listeners.size > 0 && state.key !== null) {
    const [userId, tenantId] = state.key.split(':');
    loadFor(userId, tenantId || undefined, true);
  } else {
    stale = true;
  }
}

export function useContacts() {
  const { user, activeTenant, loading: authLoading } = useAuth();
  const tenantId = activeTenant?.tenantId;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (user) {
      loadFor(user.id, tenantId);
    } else if (!authLoading && state.key !== null) {
      setState({ key: null, items: null, error: null, loading: false });
    }
  }, [user, tenantId, authLoading]);

  const refetch = useCallback(() => {
    if (user) loadFor(user.id, tenantId, true);
  }, [user, tenantId]);

  /** Logs contacts for the active org (if any) and merges them into the cache. */
  const log = useCallback(
    async (input: Omit<LogContactsInput, 'tenantId'>) => {
      const created = await data.contacts.log({ ...input, tenantId });
      if (state.items && user && state.key === cacheKey(user.id, tenantId)) {
        setState({ items: [...created, ...state.items] });
      } else {
        stale = true;
      }
      return created;
    },
    [user, tenantId],
  );

  const remove = useCallback(async (contactId: string) => {
    await data.contacts.remove(contactId);
    if (state.items) setState({ items: state.items.filter((c) => c.id !== contactId) });
  }, []);

  // Only show the current key's data — never a previous user's or org's.
  const current = user && snapshot.key === cacheKey(user.id, tenantId);

  return {
    items: current ? snapshot.items : null,
    error: current ? snapshot.error : null,
    loading: snapshot.loading,
    refetch,
    log,
    remove,
  };
}

/**
 * Your Bills (same list and scope as the board: My Bills / All Bills, active
 * org) split into to-contact / contacted / earlier. `ready` is false until both
 * the bills and the contacts have loaded.
 */
export function useContactOpportunities() {
  const { bills, loadingBills } = useBills();
  const contacts = useContacts();
  const groups = useMemo(
    () => buildContactOpportunities(bills, contacts.items ?? []),
    [bills, contacts.items],
  );
  return {
    ...groups,
    contacts,
    ready: contacts.items !== null && !loadingBills,
  };
}
