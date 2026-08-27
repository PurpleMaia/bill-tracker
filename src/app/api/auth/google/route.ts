import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleOAuthConfig,
  generateRandomToken,
  buildGoogleAuthUrl,
} from '@/services/google-oauth';
import {
  GOOGLE_OAUTH_COOKIES,
  GOOGLE_OAUTH_COOKIE_MAX_AGE,
  encodeSignupPayload,
} from '@/lib/auth/google-oauth';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';
import { getClientIp } from '@/lib/core/client-ip';

const GOOGLE_START_RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };

/**
 * Starts the Google sign-in flow.
 *
 * GET rather than POST because this is reached by a plain link: OAuth needs a
 * full-page navigation, so there is no fetch to unwrap and the data-client
 * does not apply.
 */
export async function GET(request: NextRequest) {
  const rl = limitFixedWindow(
    `google-oauth:${getClientIp(request)}`,
    GOOGLE_START_RATE_LIMIT.limit,
    GOOGLE_START_RATE_LIMIT.windowMs
  );
  if (!rl.ok) {
    return NextResponse.redirect(new URL('/?authError=rate_limited', request.url));
  }

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (error) {
    console.error('[google-oauth/start]', error);
    return NextResponse.redirect(new URL('/?authError=not_configured', request.url));
  }

  const state = generateRandomToken();
  const codeVerifier = generateRandomToken();

  // Carried through the round trip so a Google signup can still create an org
  // or accept an invite, exactly as password registration does.
  const payload = encodeSignupPayload({
    orgName: request.nextUrl.searchParams.get('orgName') ?? undefined,
    inviteToken: request.nextUrl.searchParams.get('invite') ?? undefined,
  });

  const response = NextResponse.redirect(
    buildGoogleAuthUrl({ config, state, codeVerifier })
  );

  // state and the PKCE verifier must survive the trip to Google but must never
  // be readable by scripts, hence HttpOnly with a short TTL. The signup payload
  // rides here rather than in the `state` URL parameter, which Google echoes
  // back into browser history and server logs.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax, not Strict: the cookie has to be sent on Google's cross-site
    // redirect back to us, which Strict would drop.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE,
  };

  response.cookies.set(GOOGLE_OAUTH_COOKIES.state, state, cookieOptions);
  response.cookies.set(GOOGLE_OAUTH_COOKIES.codeVerifier, codeVerifier, cookieOptions);
  if (payload) {
    response.cookies.set(GOOGLE_OAUTH_COOKIES.payload, payload, cookieOptions);
  }

  return response;
}
