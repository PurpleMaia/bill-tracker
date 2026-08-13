// SERVER ONLY: imports next/headers. Client components must import the
// InitialAuth type and UNRESOLVED_AUTH from './initial-auth-types' instead —
// pulling this module into a client bundle is a build error.
import { cookies } from 'next/headers';
import { auth } from './session';
import { getUserMemberships } from '@/db/queries/tenants';
import { getUserPreferences } from '@/db/queries/user-preferences';
import { UNRESOLVED_AUTH, type InitialAuth } from './initial-auth-types';

export { UNRESOLVED_AUTH, type InitialAuth };

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
    // Reading cookies is what makes a route dynamic. Touch them directly first
    // so Next's static-generation probe gets its DynamicServerError from here,
    // where we can tell it apart from a real failure — auth() swallows the
    // throw and returns null, which we would otherwise record as a confident
    // "signed out" and bake into a prerender.
    await cookies();

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
    // Next throws DynamicServerError while probing whether a route can be
    // prerendered. That's expected control flow, not a fault: rethrow so the
    // route is correctly marked dynamic instead of logging a scary error and
    // prerendering a signed-out shell. Matched by digest rather than by
    // importing from next/dist internals, whose paths move between versions.
    if ((error as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') throw error;

    // Anything else: never let an auth lookup break rendering — fall back to
    // the client path.
    console.error('[getInitialAuth] Falling back to client session check:', error);
    return UNRESOLVED_AUTH;
  }
}
