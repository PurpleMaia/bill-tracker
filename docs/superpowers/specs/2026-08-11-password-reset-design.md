# Password Reset Flow — Design

**Date:** 2026-08-11
**Branch:** `feat/reset-password`

## Problem

Users who forget their password have no self-service recovery path. The only
existing account-recovery machinery is the email-verification token, which is
stored as a plain column on `user` (`verification_token`) and is single-purpose.

## Goals

- A user can request a reset link from the login dialog by entering their email.
- If that email belongs to a user, Resend delivers a link containing a
  single-use token.
- Clicking the link opens a reset page (styled like `/register`) where the user
  sets a new password.
- Consuming the token invalidates the user's existing sessions and logs them in
  with a fresh one.

## Non-Goals

- **No changes to `account_status` semantics.** There is a known pre-existing
  inconsistency: `registerUser` sets new users to `active`, but
  `/api/auth/verify-email` downgrades them to `pending` on verification, and
  `authenticateUser` refuses login to anything that is not `active`. Separately,
  `db/queries/access.ts` sets `account_status = 'pending'` when an active user
  requests an admin/supervisor role, revoking their login as a side effect.
  Both are real bugs, both are out of scope here, and this feature must not
  depend on or alter that behavior. Filed for separate work.
- No password-strength meter, no "security questions", no MFA.
- No admin-initiated password reset.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Request-step UI | Inline view swap inside `login-dialog.tsx` | Keeps the request one click from the login form; avoids a page that exists only to hold one input. |
| Token storage | SHA-256 hash only | Matches `sessions.session_token`. A DB leak yields no usable reset links. `invite_tokens` stores plaintext; we deliberately do not copy that. |
| Token lifetime | 1 hour | Short window for a high-value credential. |
| Reuse | Single-use; a new request invalidates the user's prior unused tokens | Prevents an old link in an inbox from working after a re-request. |
| Post-reset | Delete all sessions, then create one fresh session | Evicts an attacker holding a stolen session; the legitimate user is not made to log in twice. |
| Enumeration | `/forgot-password` returns an identical response whether or not the email exists | The endpoint is unauthenticated; a differing response is an account-existence oracle. |

## Architecture

```
login-dialog.tsx  ──POST /api/auth/forgot-password──▶  password-reset.ts
   (view: 'forgot')                                    createPasswordResetToken
                                                              │
                                                       services/email.ts
                                                    sendPasswordResetEmail
                                                              │
                                                       ▼ (email link)
/reset-password?token=…  ──GET  /api/auth/reset-password──▶ peek (no consume)
                         ──POST /api/auth/reset-password──▶ consume + update
                                                            + drop sessions
                                                            + new session
```

### 1. Migration — `000030_create_password_reset_tokens`

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
```

`src/db/types.ts` gains the corresponding interface and a `PasswordResetTokens`
entry on the `DB` interface.

### 2. Queries — `src/db/queries/password-reset.ts`

All Kysely lives here, per the repo convention that routes are thin transports.

- `createPasswordResetToken(userId: string): Promise<string>` — generates 20
  random bytes via `crypto.getRandomValues`, hex-encodes as the raw token,
  stores `sha256(raw)`. Deletes the user's prior unused tokens first so only one
  is live. Returns the raw token; the raw value is never persisted.
- `peekPasswordResetToken(rawToken: string): Promise<boolean>` — read-only
  validity check (`used_at IS NULL AND expires_at > NOW()`). Used by the page's
  initial load so that merely opening the link does not burn it.
- `consumePasswordResetToken(rawToken: string): Promise<string | null>` — atomic
  `UPDATE … SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND
  expires_at > NOW() RETURNING user_id`. Same atomic-claim pattern the invite
  flow uses in `api/auth/register/route.ts`, so two concurrent submissions
  cannot both succeed.
- `findUserByEmail(email: string)` — returns `{ id, username }` or undefined.
- `updateUserPassword(userId: string, hashedPassword: string): Promise<void>` —
  updates `auth_key.hashed_password` for that user (passwords live in
  `auth_key`, not `user`).
- `deleteAllUserSessions(userId: string): Promise<void>`.

### 3. Email — `src/services/email.ts`

Add `sendPasswordResetEmail(email, username, token)`, mirroring
`sendVerificationEmail`: the same null-Resend development fallback that logs the
URL and returns success, the same Resend error handling, the same inline-HTML
template style, `escapeHtml` on the username. Link target is
`${NEXT_PUBLIC_APP_URL}/reset-password?token=…`. Copy states the 1-hour expiry
and instructs the recipient to ignore the email if they did not request it.

### 4. Validators — `src/lib/auth/validators.ts`

```ts
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(1, { message: "Reset token is required." }),
  password: newPasswordSchema,
});
```

`newPasswordSchema` is the module-private schema already used by
`registerSchema`, so reset and register enforce identical password rules.

### 5. API routes — `src/app/api/auth/`

**`forgot-password/route.ts` — `POST`**
1. Rate limit `forgot-password:${clientIp}` via `limitFixedWindow`, 5 per 15 min,
   returning 429 with `Retry-After` (same shape as the register route).
2. Validate the body with `forgotPasswordSchema`; 400 on failure.
3. Look up the user. If found, mint a token and send the email; failures are
   logged, not surfaced.
4. Always respond `{ success: true, message: "If an account exists for that
   email, we've sent a reset link." }`, regardless of whether the user existed.

**`reset-password/route.ts`**
- `GET ?token=…` → `{ valid: boolean }` via `peekPasswordResetToken`. Does not
  consume.
- `POST { token, password }`:
  1. Rate limit `reset-password:${clientIp}`, 5 per 15 min.
  2. Validate with `resetPasswordSchema`; 400 on failure.
  3. `consumePasswordResetToken` — 400 "This reset link is invalid or has
     expired" if it returns null.
  4. bcrypt-hash the password (cost 10, matching `registerUser`) and write it.
  5. `deleteAllUserSessions(userId)`.
  6. `createSession(userId)`, then return the user and memberships with
     `Set-Cookie: setSessionCookie(token)` — the same auto-login response shape
     the register route returns.

Consuming before writing the password means a downstream failure cannot leave a
reusable token behind. The cost is that such a failure forces a new request,
which is the safe direction to fail.

### 6. UI

**`src/components/auth/login-dialog.tsx`** — add
`view: 'login' | 'forgot'` state.
- Login view: a "Forgot password?" text button under the password field.
- Forgot view: email input, "Send reset link" submit, "← Back to login".
  On submit, show the neutral confirmation inline rather than closing the
  dialog, so the message matches the enumeration-safe API.
- `onOpenChange` resets `view` to `'login'` and clears the forgot-form state.

**`src/app/reset-password/page.tsx`** — new page reusing `/register`'s layout
(centered card, `bg-gray-50`, same field markup), with `useSearchParams` inside
a `Suspense` boundary as Next 15 requires and as `register/page.tsx` already
does. States:
1. `validating` — on mount, `GET /api/auth/reset-password?token=…`.
2. `invalid` — missing/expired/used token: explanatory card plus a link home.
3. `form` — new password + confirm password, with a client-side match check
   before submit.
4. `success` — toast, then `router.push("/")`; the user already holds a session.

## Testing

- `src/lib/__tests__/validators.test.ts` gains cases for `resetPasswordSchema`
  and `forgotPasswordSchema` (empty token rejected, short password rejected in
  production mode, valid input accepted).
- The remainder is DB and transport code, which this repo deliberately does not
  unit-test (tests are pure-logic only, no DB, no mocking).
- Verification: `npm test`, `npm run typecheck`, `npm run build`. The build is
  required because it catches `'use server'` export violations that typecheck
  does not.

## Manual verification

1. `npm run migrate:up`.
2. Request a reset for a known address; confirm the URL appears in the server log
   (works without `RESEND_API_KEY` in development).
3. Open the link — the form appears; reload it to confirm the token was not
   consumed by viewing.
4. Submit a new password; confirm redirect and an authenticated session.
5. Re-open the same link — "invalid or expired".
6. Confirm the old password no longer authenticates and any other session is
   logged out.
7. Request a reset for an address with no account; confirm the response and
   latency are indistinguishable from the found case and no email is sent.
