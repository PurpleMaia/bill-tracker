/**
 * Resolves a provider id to its OAuthProvider implementation.
 *
 * The pure "is this a known provider" check is in lib/auth/oauth-registry.ts;
 * this maps a *validated* id to the service arm that does the I/O. To add a
 * provider: implement OAuthProvider under services/oauth/, register its id in
 * lib/auth/oauth-registry.ts, and add it to the map below.
 */

import { getOAuthProvider, type OAuthProviderId } from '@/lib/auth/oauth-registry';
import type { OAuthProvider } from './provider';
import { googleProvider } from './google';

const IMPLEMENTATIONS: Record<OAuthProviderId, OAuthProvider> = {
  google: googleProvider,
};

/**
 * Returns the OAuthProvider implementation for a URL segment, or null when the
 * segment is not a provider we support (so the route can 404 cleanly).
 */
export function resolveOAuthProvider(idFromUrl: string): OAuthProvider | null {
  const descriptor = getOAuthProvider(idFromUrl);
  if (!descriptor) return null;
  return IMPLEMENTATIONS[descriptor.id];
}

export type { OAuthProvider, OAuthConfig, OAuthIdentity } from './provider';
