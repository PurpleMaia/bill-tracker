import { NextRequest, NextResponse } from 'next/server';
import { resolveOAuthProvider } from '@/services/oauth';
import { generateRandomToken } from '@/services/google-oauth';
import {
  oauthCookieNames,
  isKnownProvider,
} from '@/lib/auth/oauth-registry';
import {
  GOOGLE_OAUTH_COOKIE_MAX_AGE,
  encodeSignupPayload,
} from '@/lib/auth/google-oauth';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';
import { getClientIp } from '@/lib/core/client-ip';

const OAUTH_START_RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };

/**
 * Starts an OAuth sign-in flow for the provider named in the URL.
 *
 * Provider-agnostic: the `[provider]` segment is resolved through the registry,
 * so /api/auth/google, /api/auth/microsoft, ... all run this one handler. GET
 * rather than POST because it is reached by a plain link — OAuth needs a
 * full-page navigation, so there is no fetch to unwrap.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;

  // Unknown provider → 404 rather than a redirect: there is nothing to sign in
  // with, and a bad segment is a broken link, not a user-facing auth error.
  if (!isKnownProvider(providerId)) {
    return new NextResponse('Unknown OAuth provider', { status: 404 });
  }

  const rl = limitFixedWindow(
    `oauth-start:${providerId}:${getClientIp(request)}`,
    OAUTH_START_RATE_LIMIT.limit,
    OAUTH_START_RATE_LIMIT.windowMs
  );
  if (!rl.ok) {
    return NextResponse.redirect(new URL('/?authError=rate_limited', request.url));
  }

  const provider = resolveOAuthProvider(providerId);
  if (!provider) {
    return new NextResponse('Unknown OAuth provider', { status: 404 });
  }

  let config;
  try {
    config = provider.configFromEnv();
  } catch (error) {
    console.error(`[oauth/${providerId}/start]`, error);
    return NextResponse.redirect(new URL('/?authError=not_configured', request.url));
  }

  const state = generateRandomToken();
  const codeVerifier = generateRandomToken();

  // Carried through the round trip so an OAuth signup can still create an org or
  // accept an invite, exactly as password registration does.
  const payload = encodeSignupPayload({
    orgName: request.nextUrl.searchParams.get('orgName') ?? undefined,
    inviteToken: request.nextUrl.searchParams.get('invite') ?? undefined,
  });

  const response = NextResponse.redirect(
    provider.buildAuthUrl({ config, state, codeVerifier })
  );

  const cookies = oauthCookieNames(providerId);

  // state and the PKCE verifier must survive the trip to the provider but must
  // never be readable by scripts, hence HttpOnly with a short TTL. The signup
  // payload rides here rather than in the `state` URL parameter, which providers
  // echo back into browser history and server logs.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax, not Strict: the cookie has to be sent on the provider's cross-site
    // redirect back to us, which Strict would drop.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE,
  };

  response.cookies.set(cookies.state, state, cookieOptions);
  response.cookies.set(cookies.codeVerifier, codeVerifier, cookieOptions);
  if (payload) {
    response.cookies.set(cookies.payload, payload, cookieOptions);
  }

  return response;
}
