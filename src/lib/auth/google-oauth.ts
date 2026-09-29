/**
 * Pure helpers for the Google OAuth flow.
 *
 * Deliberately free of DB and network access so the security-relevant
 * decisions — CSRF state matching, what the signup payload is allowed to
 * carry, and which account a Google identity resolves to — are unit-testable
 * without mocking. The routes in app/api/auth/google/* do the I/O around
 * these; src/db/queries/users.ts does the writes.
 */

import { timingSafeEqual } from 'crypto';

/**
 * The signup side-payload that has to survive the redirect to Google and back.
 *
 * Password registration takes these on the POST body; the OAuth flow has no
 * body to put them in, so they ride in an HttpOnly cookie (NOT the `state`
 * URL parameter — Google echoes that back into browser history and logs).
 */
export interface GoogleSignupPayload {
  /** Name of an organization to create, with the new user as its admin. */
  orgName?: string;
  /** Invite token to claim, joining the new user to an existing org. */
  inviteToken?: string;
}

/** Cookie names for the values that must outlive the redirect to Google. */
export const GOOGLE_OAUTH_COOKIES = {
  state: 'google_oauth_state',
  codeVerifier: 'google_oauth_verifier',
  payload: 'google_oauth_payload',
} as const;

/** Ten minutes: long enough to finish Google's consent screen, no longer. */
export const GOOGLE_OAUTH_COOKIE_MAX_AGE = 60 * 10;

/**
 * Upper bound on the encoded payload cookie. Cookies are capped near 4KB by
 * browsers, and nothing legitimate here comes close — orgName is validated to
 * 100 chars and an invite token is a hex string. A payload larger than this is
 * someone probing, so it is refused rather than truncated.
 */
export const MAX_PAYLOAD_COOKIE_LENGTH = 1024;

/** Matches the register route's own bound on organization names. */
const MAX_ORG_NAME_LENGTH = 100;

/**
 * Compares the `state` Google echoed back against the one we stored.
 *
 * Constant-time to avoid leaking how much of the value matched. Lengths are
 * compared first because timingSafeEqual throws on a length mismatch, and the
 * length of a nonce is not a secret.
 */
export function isValidOAuthState(received: string | null, stored: string | null): boolean {
  if (!received || !stored) return false;
  if (received.length !== stored.length) return false;

  return timingSafeEqual(Buffer.from(received), Buffer.from(stored));
}

/**
 * Serializes the signup payload for the cookie.
 *
 * Returns null when there is nothing to carry, so the caller can skip setting
 * a cookie at all rather than storing an empty object.
 */
export function encodeSignupPayload(payload: GoogleSignupPayload): string | null {
  const cleaned: GoogleSignupPayload = {};

  const orgName = payload.orgName?.trim();
  if (orgName) cleaned.orgName = orgName;

  const inviteToken = payload.inviteToken?.trim();
  if (inviteToken) cleaned.inviteToken = inviteToken;

  if (!cleaned.orgName && !cleaned.inviteToken) return null;

  return Buffer.from(JSON.stringify(cleaned), 'utf8').toString('base64url');
}

/**
 * Parses the payload cookie back into a payload.
 *
 * Every failure mode — absent, oversized, non-JSON, wrong shape, over-long
 * orgName — collapses to an empty payload rather than throwing. A corrupt
 * cookie should cost the user their org pre-fill, not their ability to sign
 * in; the cookie is HttpOnly and ours, so this is defense in depth.
 */
export function decodeSignupPayload(encoded: string | null | undefined): GoogleSignupPayload {
  if (!encoded) return {};
  if (encoded.length > MAX_PAYLOAD_COOKIE_LENGTH) return {};

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const { orgName, inviteToken } = parsed as Record<string, unknown>;
    const payload: GoogleSignupPayload = {};

    if (typeof orgName === 'string') {
      const trimmed = orgName.trim();
      // Mirrors the register route's validation rather than trusting the round trip.
      if (trimmed.length > 0 && trimmed.length <= MAX_ORG_NAME_LENGTH) {
        payload.orgName = trimmed;
      }
    }

    if (typeof inviteToken === 'string' && inviteToken.trim().length > 0) {
      payload.inviteToken = inviteToken.trim();
    }

    return payload;
  } catch {
    return {};
  }
}

/** What the callback should do with the Google identity it just verified. */
export type GoogleAccountAction =
  /** A user already carries this google_id — just sign them in. */
  | { type: 'login'; userId: string }
  /** An account with this email exists; attach the Google identity to it. */
  | { type: 'link'; userId: string }
  /** No account matches; create one. */
  | { type: 'create' }
  /** Refuse, because Google has not proven the user owns this mailbox. */
  | { type: 'reject'; reason: 'unverified_email' };

/**
 * Decides which of the four outcomes a Google identity resolves to.
 *
 * Pure and separated from the DB work so the security-critical ordering is
 * testable: google_id matches win outright (a returning user whose Google
 * account has since changed its email must not be treated as a new signup),
 * and both linking and creating require Google to have verified the email.
 *
 * The unverified-email refusal is the important one. Google reports
 * `email_verified: false` for identities that never proved mailbox ownership,
 * so honouring such an email would let someone claim an account by asserting
 * its address.
 */
export function decideGoogleAccountAction(input: {
  userIdByGoogleId: string | null;
  userIdByEmail: string | null;
  emailVerified: boolean;
}): GoogleAccountAction {
  // A known google_id is proof enough on its own — the link was established on
  // a previous sign-in, so this does not depend on the current verified flag.
  if (input.userIdByGoogleId) {
    return { type: 'login', userId: input.userIdByGoogleId };
  }

  // Everything below either attaches to or creates an account keyed on the
  // email Google reported, which is only trustworthy once Google has verified it.
  if (!input.emailVerified) {
    return { type: 'reject', reason: 'unverified_email' };
  }

  if (input.userIdByEmail) {
    return { type: 'link', userId: input.userIdByEmail };
  }

  return { type: 'create' };
}

/**
 * Derives a username candidate from a Google profile.
 *
 * `user.username` is unique and required, but Google supplies no username —
 * only a display name and an email. The email local-part is the more stable
 * source (display names are often duplicated), normalized to the character set
 * the rest of the app uses. Uniqueness is settled by the caller, which has the
 * DB; this only produces the candidate.
 */
export function deriveUsernameCandidate(email: string, name?: string | null): string {
  const localPart = email.split('@')[0] ?? '';
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.length >= 3) return normalized.slice(0, 30);

  // Fall back to the display name when the local-part is too short or is all
  // punctuation, so we never build a username out of an empty string.
  const fromName = (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName.length >= 3) return fromName.slice(0, 30);

  return `user${normalized}${fromName}`.slice(0, 30);
}
