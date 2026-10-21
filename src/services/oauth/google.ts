/**
 * Google as an OAuthProvider.
 *
 * A thin adapter over the existing Google client in services/google-oauth.ts:
 * it maps Google's config and ID-token claims into the provider-agnostic
 * OAuthConfig / OAuthIdentity so the parameterized routes never mention Google
 * by name. The Google-specific logic (endpoints, PKCE, ID-token validation) is
 * unchanged and still lives in services/google-oauth.ts.
 */

import {
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
} from '@/services/google-oauth';
import type { OAuthProvider } from './provider';

export const googleProvider: OAuthProvider = {
  id: 'google',

  isConfigured: () => isGoogleOAuthConfigured(),

  configFromEnv: () => getGoogleOAuthConfig(),

  buildAuthUrl: ({ config, state, codeVerifier }) =>
    buildGoogleAuthUrl({ config, state, codeVerifier }),

  exchangeCode: async ({ config, code, codeVerifier }) => {
    const claims = await exchangeGoogleCode({ config, code, codeVerifier });
    return {
      providerAccountId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified,
      name: claims.name,
      picture: claims.picture,
    };
  },
};
