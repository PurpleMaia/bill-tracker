import { auth } from './session';
import { getUserMemberships } from '@/db/queries/tenants';
import { getUserPreferences } from '@/db/queries/user-preferences';
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
 * `resolved: false` means the server could not determine the session (the page
 * is statically rendered, so there were no cookies to read). The client then
 * falls back to its own checkSession() call.
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

/**
 * Resolves the current session on the server. `auth()` is React-cached, so
 * calling this from a layout costs one session lookup per request even if
 * other server components also call auth().
 *
 * Memberships and preferences are fetched in parallel — the client previously
 * awaited preferences INSIDE the session check, serialising two requests that
 * have no dependency on each other beyond needing the user id.
 */
export async function getInitialAuth(): Promise<InitialAuth> {
  try {
    const session = await auth();
    if (!session?.user) {
      // Genuinely signed out — that IS a resolved answer, so the client should
      // not re-check and flash a loading state on top of it.
      return { resolved: true, user: null, memberships: [], preferences: null };
    }

    const [memberships, preferences] = await Promise.all([
      getUserMemberships(session.user.id),
      getUserPreferences(session.user.id).catch(() => null),
    ]);

    return { resolved: true, user: session.user, memberships, preferences };
  } catch (error) {
    // Never let an auth lookup break rendering — fall back to the client path.
    console.error('[getInitialAuth] Falling back to client session check:', error);
    return UNRESOLVED_AUTH;
  }
}
