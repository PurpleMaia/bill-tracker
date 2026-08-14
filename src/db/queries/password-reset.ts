import { createHash, randomUUID } from 'crypto';
import { db } from '../kysely/client';

/** Reset links are short-lived: a password reset is a high-value credential. */
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates a password reset token for a user.
 *
 * Only the SHA-256 hash is persisted (same scheme as sessions.session_token),
 * so the raw token exists solely in the email we send. Any prior unused tokens
 * for the user are deleted first, so re-requesting a link invalidates the old
 * one rather than leaving several live at once.
 *
 * @returns the RAW token, to be embedded in the reset URL
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const rawToken = Buffer.from(bytes).toString('hex');

  // Delete-then-insert must be atomic, and serialised per user. Two concurrent
  // requests could otherwise both clear the table before either inserted,
  // leaving two live reset links for one account and breaking the "a new
  // request invalidates the old link" guarantee.
  //
  // The user row is locked FOR UPDATE first so the second request waits for the
  // first to commit rather than racing it. A partial unique index can't express
  // this instead: the predicate would need `expires_at > NOW()`, and NOW() is
  // not immutable, so Postgres rejects it in an index.
  await db.transaction().execute(async (trx) => {
    await trx
      .selectFrom('user')
      .select('id')
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirst();

    await trx
      .deleteFrom('password_reset_tokens')
      .where('user_id', '=', userId)
      .where('used_at', 'is', null)
      .execute();

    await trx
      .insertInto('password_reset_tokens')
      .values({
        id: randomUUID(),
        user_id: userId,
        token_hash: hashToken(rawToken),
        expires_at: new Date(Date.now() + TOKEN_TTL_MS),
      })
      .execute();
  });

  return rawToken;
}

/**
 * Checks whether a reset token is currently usable WITHOUT consuming it.
 * Used by the reset page on load so that merely opening the link doesn't burn it.
 */
export async function peekPasswordResetToken(rawToken: string): Promise<boolean> {
  const row = await db
    .selectFrom('password_reset_tokens')
    .select('id')
    .where('token_hash', '=', hashToken(rawToken))
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .executeTakeFirst();

  return !!row;
}

/**
 * Atomically claims a reset token, marking it used.
 *
 * The guard conditions live in the UPDATE itself (the same atomic-claim pattern
 * the invite flow uses), so two concurrent submissions cannot both succeed.
 *
 * @returns the owning user's id, or null if the token was invalid, expired, or already used
 */
export async function consumePasswordResetToken(rawToken: string): Promise<string | null> {
  const claimed = await db
    .updateTable('password_reset_tokens')
    .set({ used_at: new Date() })
    .where('token_hash', '=', hashToken(rawToken))
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returning('user_id')
    .executeTakeFirst();

  return claimed?.user_id ?? null;
}

/** Looks up a user by email for the forgot-password request. */
export async function findUserByEmailForReset(
  email: string
): Promise<{ id: string; username: string } | null> {
  const user = await db
    .selectFrom('user')
    .select(['id', 'username'])
    .where('email', '=', email)
    .executeTakeFirst();

  return user ?? null;
}

/** Updates the user's password. Passwords live in auth_key, not on user. */
export async function updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
  await db
    .updateTable('auth_key')
    .set({ hashed_password: hashedPassword })
    .where('user_id', '=', userId)
    .execute();
}

/**
 * Deletes every session belonging to a user.
 * Called after a reset so that a stolen session cannot outlive the password change.
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.deleteFrom('sessions').where('user_id', '=', userId).execute();
}
