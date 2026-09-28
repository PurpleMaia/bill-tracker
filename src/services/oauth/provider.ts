/**
 * The provider-agnostic OAuth service contract.
 *
 * An external-integration seam, so it lives in services/ per CLAUDE.md. Each
 * concrete provider (services/oauth/google.ts, and any future one) implements
 * this interface; the parameterized routes in app/api/auth/[provider]/* look an
 * implementation up by id and call it without knowing which provider it is.
 *
 * The pure metadata/lookup lives in lib/auth/oauth-registry.ts; this is the arm
 * that talks to the network and reads credentials from the environment.
 */

import type { OAuthProviderId } from '@/lib/auth/oauth-registry';

/** Credentials + redirect for one provider, read from the environment. */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * The identity claims we consume, normalized across providers.
 *
 * Providers differ in ID-token shape (Google's `sub`/`email_verified`,
 * Microsoft's `oid`/`preferred_username`, ...); each implementation maps its own
 * response into this common shape so the callback route stays provider-agnostic.
 */
export interface OAuthIdentity {
  /** The provider's stable per-account identifier (Google `sub`, etc.). */
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
}

/**
 * One OAuth provider's I/O. Kept deliberately small — everything security- or
 * shape-sensitive that can be pure lives elsewhere and is unit-tested.
 */
export interface OAuthProvider {
  id: OAuthProviderId;

  /** True when this provider's credentials are present in the environment. */
  isConfigured(): boolean;

  /**
   * Reads this provider's config from the environment. Throws with a clear
   * message when credentials are absent, so a misconfigured deploy fails at the
   * first sign-in attempt rather than with an opaque error from the provider.
   */
  configFromEnv(): OAuthConfig;

  /** Builds the URL to redirect the user to for consent (with PKCE + state). */
  buildAuthUrl(input: { config: OAuthConfig; state: string; codeVerifier: string }): string;

  /**
   * Exchanges the authorization code for tokens and returns the normalized
   * identity. Throws on any failure; the route maps that to an error redirect.
   */
  exchangeCode(input: {
    config: OAuthConfig;
    code: string;
    codeVerifier: string;
  }): Promise<OAuthIdentity>;
}
