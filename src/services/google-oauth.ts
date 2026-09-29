/**
 * Google OAuth 2.0 client.
 *
 * An external-integration wrapper, so it lives in services/ per CLAUDE.md. It
 * talks to Google and nothing else — no DB access, no session handling. The
 * pure helpers are in lib/auth/google-oauth.ts and the account writes are in
 * db/queries/users.ts.
 *
 * Implemented against Google's endpoints directly rather than via a provider
 * library: adding one was blocked by a pre-existing peer-dependency conflict
 * in this repo, and the flow below is small enough to own.
 */

import { createHash, randomBytes } from 'crypto';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Accepted `iss` values — Google uses both spellings interchangeably. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Reads the OAuth config from the environment.
 *
 * Throws when the credentials are absent so a misconfigured deploy fails at
 * the first sign-in attempt with a clear message, rather than surfacing an
 * opaque 500 from Google's token endpoint.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google sign-in is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
  }

  // Same base-URL convention as services/email.ts.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`,
  };
}

/** True when Google credentials are present, for conditionally rendering the button. */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Cryptographically random, URL-safe value for `state` and the PKCE verifier. */
export function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** S256 PKCE challenge derived from the verifier. */
export function deriveCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

/**
 * Builds the URL to send the user to Google.
 *
 * `prompt=select_account` so someone signed into several Google accounts is
 * asked which one to use instead of being silently taken through the first.
 * No `access_type=offline`: this is identity only, so we neither want nor
 * store refresh tokens.
 */
export function buildGoogleAuthUrl(input: {
  config: GoogleOAuthConfig;
  state: string;
  codeVerifier: string;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', input.config.clientId);
  url.searchParams.set('redirect_uri', input.config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', deriveCodeChallenge(input.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');

  return url.toString();
}

/** The identity claims we consume from Google's ID token. */
export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
}

/** Decodes one base64url JWT segment. */
function decodeJwtSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/**
 * Validates the ID token's claims and returns them.
 *
 * The signature is deliberately NOT verified here, and that is Google's own
 * documented guidance for this case: the token was just received directly from
 * Google's token endpoint over TLS in a server-to-server exchange, so the
 * channel already authenticates it. Signature checking (and JWKS fetching)
 * is required only for tokens that arrive from an untrusted party, e.g. passed
 * up from a browser.
 *
 * `aud` is still checked, so a token minted for a different OAuth client can
 * never be replayed against this one, along with `iss` and `exp`.
 */
export function parseGoogleIdToken(idToken: string, expectedClientId: string): GoogleIdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Google ID token');
  }

  const claims = decodeJwtSegment(parts[1]) as Partial<GoogleIdTokenClaims>;

  if (!claims || typeof claims !== 'object') {
    throw new Error('Unreadable Google ID token payload');
  }
  if (claims.aud !== expectedClientId) {
    throw new Error('Google ID token was issued for a different client');
  }
  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) {
    throw new Error('Google ID token has an unexpected issuer');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw new Error('Google ID token has expired');
  }
  if (!claims.sub || !claims.email) {
    throw new Error('Google ID token is missing required identity claims');
  }

  return {
    sub: claims.sub,
    email: claims.email,
    // Google sends this as a real boolean, but has historically also sent the
    // string "true"; anything else is treated as unverified.
    email_verified: claims.email_verified === true || (claims.email_verified as unknown) === 'true',
    name: claims.name,
    picture: claims.picture,
    aud: claims.aud,
    iss: claims.iss,
    exp: claims.exp,
  };
}

/**
 * Exchanges the authorization code for tokens and returns the ID token claims.
 */
export async function exchangeGoogleCode(input: {
  config: GoogleOAuthConfig;
  code: string;
  codeVerifier: string;
}): Promise<GoogleIdTokenClaims> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: input.config.redirectUri,
    }),
  });

  if (!response.ok) {
    // Never log the body verbatim at higher levels — it can echo the code.
    const detail = await response.text().catch(() => '');
    console.error('[google-oauth] Token exchange failed:', response.status, detail.slice(0, 200));
    throw new Error('Failed to exchange the Google authorization code');
  }

  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw new Error('Google token response did not include an ID token');
  }

  return parseGoogleIdToken(tokens.id_token, input.config.clientId);
}
