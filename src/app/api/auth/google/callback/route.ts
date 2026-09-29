import { NextRequest } from 'next/server';
import { GET as oauthCallback } from '../../[provider]/callback/route';

/**
 * Legacy entry point for the Google sign-in callback.
 *
 * Kept per CLAUDE.md ("do not delete old API routes"): Google's configured
 * redirect URI is /api/auth/google/callback, and this static segment shadows the
 * sibling [provider] dynamic route, so this file is what actually runs for
 * Google. It delegates to the provider-agnostic callback with the provider
 * pinned to 'google', keeping a single implementation.
 */
export function GET(request: NextRequest) {
  return oauthCallback(request, { params: Promise.resolve({ provider: 'google' }) });
}
