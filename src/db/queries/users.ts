import { db } from '@/db/kysely/client';
import type { User } from '@/types/user';
import type { SystemRole } from '@/types/tenant';
import {
  decideGoogleAccountAction,
  deriveUsernameCandidate,
} from '@/lib/auth/google-oauth';

/** The subset of user fields these lookups return. */
export interface BasicUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export async function getUserById(userId: string): Promise<BasicUser | null> {
  try {
    const user = await db
      .selectFrom('user')
      .select(['id', 'email', 'username', 'role'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    return null;
  }
}

export async function getUsersByIds(userIds: string[]): Promise<BasicUser[]> {
  try {
    if (userIds.length === 0) {
      return [];
    }

    const users = await db
      .selectFrom('user')
      .select(['id', 'email', 'username', 'role'])
      .where('id', 'in', userIds)
      .execute();

    return users.map(user => ({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    }));
  } catch (error) {
    console.error('Error fetching users by IDs:', error);
    return [];
  }
}

/** Identity fields lifted from a verified Google ID token. */
export interface GoogleIdentity {
  /** Google's `sub` claim — the stable per-account identifier. */
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
}

export type ResolveGoogleUserResult =
  | { ok: true; user: User; isNewUser: boolean }
  | { ok: false; reason: 'unverified_email' | 'account_inactive' };

/** Maps a `user` row to the client-facing User shape. */
function toUser(row: {
  id: string;
  email: string;
  username: string;
  role: string;
  system_role: string;
}): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    systemRole: row.system_role as SystemRole,
    role: row.role,
  };
}

/**
 * Picks a username that is free, starting from the Google-derived candidate.
 *
 * `user.username` is unique but Google supplies no username, so collisions are
 * expected (two people named `jsmith` at different domains). Suffixes are
 * appended rather than failing the signup.
 */
async function findAvailableUsername(
  trx: typeof db,
  candidate: string
): Promise<string> {
  const taken = await trx
    .selectFrom('user')
    .select('username')
    .where('username', 'like', `${candidate}%`)
    .execute();

  const used = new Set(taken.map((r) => r.username));
  if (!used.has(candidate)) return candidate;

  for (let i = 2; i < 1000; i++) {
    const next = `${candidate.slice(0, 26)}${i}`;
    if (!used.has(next)) return next;
  }

  // Astronomically unlikely; a random tail beats throwing on a valid signup.
  return `${candidate.slice(0, 22)}${Date.now().toString(36).slice(-6)}`;
}

/**
 * Resolves a verified Google identity to a user row, creating or linking as
 * needed.
 *
 * The branch logic lives in the pure `decideGoogleAccountAction` so it can be
 * unit-tested; this function does only the I/O around that decision. See
 * docs/superpowers/specs/2026-08-14-google-oauth-design.md.
 */
export async function resolveGoogleUser(
  identity: GoogleIdentity
): Promise<ResolveGoogleUserResult> {
  const email = identity.email.toLowerCase().trim();

  return db.transaction().execute(async (trx) => {
    const [byGoogleId, byEmail] = await Promise.all([
      trx
        .selectFrom('user')
        .select(['id', 'email', 'username', 'role', 'system_role', 'account_status'])
        .where('google_id', '=', identity.googleId)
        .executeTakeFirst(),
      trx
        .selectFrom('user')
        .select(['id', 'email', 'username', 'role', 'system_role', 'account_status'])
        .where('email', '=', email)
        .executeTakeFirst(),
    ]);

    const action = decideGoogleAccountAction({
      userIdByGoogleId: byGoogleId?.id ?? null,
      userIdByEmail: byEmail?.id ?? null,
      emailVerified: identity.emailVerified,
    });

    if (action.type === 'reject') {
      return { ok: false as const, reason: 'unverified_email' as const };
    }

    if (action.type === 'login') {
      // Google sign-in must not become a way around a deactivated account —
      // the password path enforces this in authenticateUser, so mirror it.
      if (byGoogleId!.account_status !== 'active') {
        return { ok: false as const, reason: 'account_inactive' as const };
      }

      // Keep the avatar fresh; it is the one profile field Google owns.
      if (identity.picture) {
        await trx
          .updateTable('user')
          .set({ profile_picture_url: identity.picture })
          .where('id', '=', byGoogleId!.id)
          .execute();
      }

      return { ok: true as const, user: toUser(byGoogleId!), isNewUser: false };
    }

    if (action.type === 'link') {
      if (byEmail!.account_status !== 'active') {
        return { ok: false as const, reason: 'account_inactive' as const };
      }

      // Attach the Google identity to the existing account. auth_key is left
      // untouched on purpose: their password keeps working alongside Google.
      await trx
        .updateTable('user')
        .set({
          google_id: identity.googleId,
          auth_provider: 'both',
          // Google verified this mailbox, which is the same proof our own
          // verification email seeks.
          email_verified: true,
          ...(identity.picture ? { profile_picture_url: identity.picture } : {}),
        })
        .where('id', '=', byEmail!.id)
        .execute();

      return { ok: true as const, user: toUser(byEmail!), isNewUser: false };
    }

    // action.type === 'create'
    const username = await findAvailableUsername(
      trx as unknown as typeof db,
      deriveUsernameCandidate(email, identity.name)
    );

    const inserted = await trx
      .insertInto('user')
      .values({
        email,
        username,
        role: 'user',
        // No email round trip needed — Google already verified the address.
        account_status: 'active',
        email_verified: true,
        requested_admin: false,
        google_id: identity.googleId,
        auth_provider: 'google',
        profile_picture_url: identity.picture ?? null,
      })
      // A double-clicked sign-in button races itself; the second insert loses
      // on the unique index and is re-read below instead of erroring.
      .onConflict((oc) => oc.doNothing())
      .returning(['id', 'email', 'username', 'role', 'system_role'])
      .executeTakeFirst();

    if (inserted) {
      return { ok: true as const, user: toUser(inserted), isNewUser: true };
    }

    const existing = await trx
      .selectFrom('user')
      .select(['id', 'email', 'username', 'role', 'system_role'])
      .where('google_id', '=', identity.googleId)
      .executeTakeFirst();

    if (!existing) {
      throw new Error('[resolveGoogleUser] Insert conflicted but no row found');
    }

    return { ok: true as const, user: toUser(existing), isNewUser: false };
  });
}
