'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { data } from '@/lib/data-client';
import type { CommitteeNameMap } from '@/db/queries/committees';

/**
 * The committee acronym→name lookup, fetched ONCE from the DB and cached for the
 * session. This is the async→sync boundary: the map lives in React state so the
 * many synchronous callers (kanban cards, tooltips, the glossary resolvers) can
 * read it during render without each awaiting a query.
 *
 * Default is an empty map. Until the fetch resolves — or if it fails — callers
 * see no names, which the pure helpers already handle gracefully (committeeFullName
 * passes codes through unchanged; resolveCommitteeTerm returns null so no empty
 * tooltip appears). So a slow or failed fetch degrades to bare codes, never a crash.
 */
const CommitteeNamesContext = createContext<CommitteeNameMap>({});

export function CommitteeNamesProvider({ children }: { children: React.ReactNode }) {
  const [names, setNames] = useState<CommitteeNameMap>({});

  useEffect(() => {
    let cancelled = false;
    data.committees
      .getNames()
      .then((map) => {
        if (!cancelled) setNames(map);
      })
      .catch(() => {
        // Leave the empty map in place — callers fall back to bare codes.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CommitteeNamesContext.Provider value={names}>{children}</CommitteeNamesContext.Provider>
  );
}

/** The committee acronym→name map. Empty until the one-time fetch resolves. */
export function useCommitteeNames(): CommitteeNameMap {
  return useContext(CommitteeNamesContext);
}
