import { NextRequest } from 'next/server';
import { GET as oauthStart } from '../[provider]/route';

/**
 * Legacy entry point for starting Google sign-in.
 *
 * Kept per CLAUDE.md ("do not delete old API routes"): the app and any bookmarks
 * still hit /api/auth/google. In Next.js App Router this static segment shadows
 * the sibling [provider] dynamic route, so this file is what actually runs for
 * Google — it therefore delegates to the provider-agnostic handler with the
 * provider pinned to 'google', keeping a single implementation.
 */
export function GET(request: NextRequest) {
  return oauthStart(request, { params: Promise.resolve({ provider: 'google' }) });
}
