import type { User } from '@/types/user';
import type { Membership } from '@/types/tenant';
import type { UserPreferences } from '@/types/preferences';

/**
 * The auth state the server already knows at render time, handed to
 * AuthProvider so the first paint is correct.
 *
 * Without this the client had to hydrate, call /api/auth/session, and only
 * then fetch preferences — three sequential round trips before any real
 * content, which is why the header flashed a spinner and gated pages showed a
 * skeleton before resolving to a login wall.
 *
 * `resolved: false` means the server could not determine the session. The
 * client then falls back to its own checkSession() call.
 *
 * This file is deliberately free of server-only imports: 'use client'
 * components (providers.tsx, auth-context.tsx) consume these, and pulling in
 * next/headers here would drag cookies() into the client bundle.
 */
export interface InitialAuth {
  resolved: boolean;
  user: User | null;
  memberships: Membership[];
  preferences: UserPreferences | null;
}

export const UNRESOLVED_AUTH: InitialAuth = {
  resolved: false,
  user: null,
  memberships: [],
  preferences: null,
};
