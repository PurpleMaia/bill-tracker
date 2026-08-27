# Google OAuth Sign-In — Design

**Date:** 2026-08-14
**Status:** Approved for implementation

## Goal

Let people sign in and sign up with Google, alongside the existing
email/password auth. Google is an additional path, not a replacement:
every existing password account keeps working exactly as it does today.

Google is the only provider in scope. Nothing here should make adding a
second provider harder, but no abstraction is built for one that does not
exist.

## Background

The `user` table already carries `google_id`, `auth_provider` (default
`'local'`), and `profile_picture_url`, added by migration
`000007_add-google-auth-columns`. No code has ever read or written them.
This design finally uses those columns; **no new migration is needed.**

Two facts about the existing auth shape drive the design:

- Passwords live in a separate `auth_key` table (`user_id`,
  `hashed_password`), not on `user`. A Google-only account is simply a
  `user` row with no `auth_key` row.
- `createSession(userId)` in `src/lib/auth/session.ts` is the single
  session-minting entry point, and `setSessionCookie` the single cookie
  writer. Both are provider-agnostic already.

## OAuth mechanics: no provider library

The flow was originally to be built on `arctic`. Installing it turned
out to be blocked by a **pre-existing** peer-dependency conflict in this
repo (`knip@^5.33.3` vs `@eslint-community/eslint-utils`), unrelated to
this feature. Rather than force a lockfile resolution that five sibling
worktrees share, the flow talks to Google's endpoints directly.

What that does and does not mean:

- **PKCE and `state`** are generated with `crypto.randomBytes` and a
  SHA-256 hash — ~15 lines, covered by unit tests.
- **Token exchange** is a single `fetch` POST.
- **The ID token's signature is deliberately not verified, and no JWKS
  handling is written.** This follows Google's own documented guidance:
  the token arrives directly from Google's token endpoint over TLS in a
  server-to-server exchange, so the channel already authenticates it.
  Signature verification is required only for tokens received from an
  untrusted party, such as one passed up from a browser.
- `aud`, `iss`, and `exp` **are** checked, so a token minted for a
  different OAuth client cannot be replayed against this one.

So this is hand-rolled OAuth *plumbing*, not hand-rolled *crypto*. If
the `knip` conflict is ever fixed, swapping in a provider library would
touch only `services/google-oauth.ts`.

## Architecture

Two new API routes, following the shape of the existing `api/auth/*`
routes.

### `GET /api/auth/google` — start

1. Generate a PKCE `code_verifier` and a random `state` nonce.
2. Build Google's authorization URL (scopes: `openid`, `email`,
   `profile`).
3. Store `code_verifier`, `state`, and the signup payload (see below) in
   short-lived (10 minute) `HttpOnly` cookies.
4. 302 to Google.

### `GET /api/auth/google/callback` — finish

1. Compare the returned `state` against the cookie; mismatch or missing
   is a hard failure (CSRF).
2. Exchange the code for tokens using the stored `code_verifier`.
3. Decode the ID token for `sub`, `email`, `email_verified`, `name`,
   `picture`.
4. Resolve the user (see "User resolution").
5. Mint a session with the **existing** `createSession(userId)` and set
   the **existing** cookie via `setSessionCookie`.
6. Clear the temporary cookies; 302 back into the app.

**The load-bearing property:** nothing downstream of `createSession`
changes. `validateSession`, all four auth-guards, `initial-auth.ts`,
`AuthProvider`, and the data-client are untouched. A Google session is
byte-identical to a password session. `google_id` / `auth_provider` are
bookkeeping on the user row, not a second kind of session.

### Carrying the signup payload

Password registration accepts two side-payloads: `orgName` (creates a
tenant, user becomes its admin) and `inviteToken` (claimed atomically,
user joins as worker). Both must survive the redirect to Google and back
so Google signup behaves identically to password signup.

The OAuth `state` parameter is the conventional place for this, but
Google echoes it back in a URL — visible in browser history and server
logs — and caps its length. Since a cookie is already being set for the
PKCE verifier, **the payload goes in that same `HttpOnly` cookie and
`state` stays a pure random nonce** used only to match the two. Same
round-trip guarantee, nothing sensitive in a URL.

## User resolution

One function, `resolveGoogleUser({ googleId, email, emailVerified, name,
picture })`, in `src/db/queries/users.ts` (per the CLAUDE.md rule that
`db/queries` is the single source of truth for data access). Four cases,
checked in order:

1. **`google_id` matches an existing user** → log them in. Returning
   Google user.
2. **No `google_id` match, email matches an existing user** → link.
   **Hard-require `emailVerified === true`**; if false, reject rather
   than link. On success set `google_id` and `profile_picture_url`, set
   `email_verified = true` (Google has proven ownership), and set
   `auth_provider = 'both'`. **Do not touch `auth_key`** — their password
   keeps working.
3. **No match at all, `emailVerified === true`** → create a `user` row
   with `auth_provider = 'google'`, `email_verified = true`,
   `account_status = 'active'`, and **no `auth_key` row**. Skips our
   email-verification round trip entirely. Then apply the signup payload
   using the same tenant/invite logic the register route uses.
4. **`emailVerified === false` and no existing account** → refuse.
   Unverified Google emails are the standard account-takeover vector.

Cases 2 and 3 each run in a single transaction. Case 3's insert must
tolerate a unique-violation on `email` or `google_id` — a double-clicked
sign-in button races itself — by falling back to a re-read of the row.

Case 1 must still respect `account_status`: a non-`'active'` account is
rejected the same way `authenticateUser` rejects it, so Google sign-in
cannot bypass a deactivation.

Username for new users is derived from the Google profile and
de-duplicated, since `user.username` is unique and Google does not supply
one.

### Extraction

The invite-claim logic is currently ~40 lines inlined in
`src/app/api/auth/register/route.ts`, which CLAUDE.md says should not
hold queries at all. Rather than copy it into the callback, it moves to
`src/db/queries/tenants.ts` and both routes call it. Same for the
org-creation block. This is cleanup of code the change already touches,
not unrelated refactoring.

## UI

**Login dialog** (`src/components/auth/login-dialog.tsx`) — the Google
button goes **below the Login button**, directly under the form and above
the existing "New to Bill Tracker?" divider, so it reads as an
alternative way to sign in rather than as part of the sign-up section.
Email/password stays the visual default.

**Register page** (`src/app/register/page.tsx`) — same order: form and
its submit button first, then the Google button, carrying `?invite=` /
`?orgName=` when present.

Both are plain links to `/api/auth/google`, not `fetch` calls — OAuth
requires a full-page navigation, so this is the one deliberate exception
to the data-client rule (there is no client-side data to unwrap).

On callback failure, redirect back with an `?error=` code that the UI
renders as a toast. Follows Google's branding requirements for the mark
and button, which is a condition of using the API.

## Configuration

Three env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a
redirect URI derived from the existing `NEXT_PUBLIC_APP_URL` (the pattern
already used in `services/email.ts`, defaulting to
`http://localhost:9002`).

Both routes fail loudly with a clear message when the secrets are
missing, rather than 500-ing at click time.

**Manual step, outside this codebase:** the OAuth client must be created
in Google Cloud Console, with both the localhost:9002 and production
callback URLs registered as authorized redirect URIs.

## Testing

Per CLAUDE.md, tests are pure-logic only, in `src/lib/__tests__/`, no DB
and no mocking. The testable surface is therefore the pure pieces, which
are deliberately extracted into `src/lib/auth/` so they can be tested:

- `state` nonce generation and constant-time comparison
- signup-payload encode/decode round trip, including rejection of
  malformed and oversized payloads
- the **decision function** mapping `(existing user by google_id?,
  existing user by email?, emailVerified)` to one of the four outcomes —
  this is where the security-relevant logic lives, so it is pure by
  design with `users.ts` doing the DB work around it

DB paths and the live Google round trip get manual verification against a
real OAuth client: new-user signup, returning-user login, linking to an
existing password account, invite acceptance, org creation, and the
unverified-email refusal.

Gates before completion: `npm test`, `npm run typecheck`, `npm run build`
(the build catches `'use server'` export violations that typecheck does
not).

### Verified at implementation time

Against a running dev server, with placeholder Google credentials:

- start route redirects to Google with `code_challenge_method=S256`, the
  correct `redirect_uri`, and `HttpOnly; SameSite=Lax` cookies at a
  600s TTL
- the signup payload round-trips in the cookie and **does not** appear
  in the URL sent to Google
- callback rejects: absent state, forged state with no cookie, and
  state mismatched against the cookie — all before the code is spent
- `error=access_denied` (user cancelled at Google) is handled distinctly
- a failed token exchange sets **no session cookie** and clears the
  OAuth cookies
- missing credentials redirect with `not_configured` rather than 500
- no secrets or PKCE verifiers appear in server logs
- password login and registration still behave as before the extraction
  (bad credentials → 401; bad invite → the same message as before)

Still requires manual verification against a **real** Google OAuth
client, which needs credentials this environment does not have: the
happy paths (new signup, returning login, linking to an existing
password account, invite acceptance, org creation) and the
unverified-email refusal.

## Out of scope

- Any provider other than Google.
- Unlinking a Google account, or a linked-accounts settings UI.
- Retiring password auth.
- Using the Google access token for anything beyond identity (no Drive,
  no Calendar). No refresh tokens are stored.
