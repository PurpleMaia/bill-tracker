/**
 * The provider-agnostic core of the OAuth flow.
 *
 * Pure and DB/network-free (it lives in lib/), so the security-relevant seams —
 * which provider a URL segment resolves to and which cookies a flow owns — are
 * unit-testable without touching env vars or Google's endpoints. The I/O for
 * each provider (config from env, token exchange, ID-token parsing) lives in
 * services/oauth/*; this module only knows provider *identities*.
 *
 * Adding a provider is: register its id here, and add its service implementation
 * under services/oauth/. The parameterized routes in app/api/auth/[provider]/*
 * pick it up automatically.
 */

/** Every OAuth provider the app knows how to start a flow for. */
export const OAUTH_PROVIDER_IDS = ['google'] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

/**
 * The pure descriptor for a provider — just its identity. Everything that needs
 * env vars or the network is a separate function in services/oauth/, keyed by
 * this id, so this stays testable.
 */
export interface OAuthProviderDescriptor {
  id: OAuthProviderId;
}

const DESCRIPTORS: Record<OAuthProviderId, OAuthProviderDescriptor> = {
  google: { id: 'google' },
};

/**
 * Resolves a URL segment (e.g. from /api/auth/[provider]) to a known provider,
 * or null if it is not one we support. Case-insensitive because the segment is
 * user-supplied and browsers do not normalize path case.
 */
export function getOAuthProvider(id: string): OAuthProviderDescriptor | null {
  const normalized = id.toLowerCase();
  if (isKnownProvider(normalized)) {
    return DESCRIPTORS[normalized];
  }
  return null;
}

/** Type guard: is this string one of the providers we support? */
export function isKnownProvider(id: string): id is OAuthProviderId {
  return (OAUTH_PROVIDER_IDS as readonly string[]).includes(id.toLowerCase());
}

/** The three values that must survive the redirect to a provider and back. */
export interface OAuthCookieNames {
  /** CSRF nonce echoed back in the `state` parameter. */
  state: string;
  /** PKCE code verifier. */
  codeVerifier: string;
  /** Base64url signup side-payload (org name / invite token). */
  payload: string;
}

/**
 * Builds the cookie names a provider's flow owns, namespaced by provider id so
 * two providers can be mid-flight in the same browser without clobbering each
 * other's state or verifier.
 */
export function oauthCookieNames(providerId: string): OAuthCookieNames {
  const p = providerId.toLowerCase();
  return {
    state: `${p}_oauth_state`,
    codeVerifier: `${p}_oauth_verifier`,
    payload: `${p}_oauth_payload`,
  };
}
