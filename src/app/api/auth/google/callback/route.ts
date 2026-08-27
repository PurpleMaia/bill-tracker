import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthConfig, exchangeGoogleCode } from '@/services/google-oauth';
import {
  GOOGLE_OAUTH_COOKIES,
  isValidOAuthState,
  decodeSignupPayload,
} from '@/lib/auth/google-oauth';
import { resolveGoogleUser } from '@/db/queries/users';
import { claimInviteToken, createOrgForNewUser, addMember } from '@/db/queries/tenants';
import { createSession } from '@/lib/auth/session';
import { setSessionCookie } from '@/lib/auth/cookies';

/** Error codes the login/register UI knows how to render. */
type AuthErrorCode =
  | 'not_configured'
  | 'state_mismatch'
  | 'access_denied'
  | 'exchange_failed'
  | 'unverified_email'
  | 'account_inactive'
  | 'invite_invalid'
  | 'unknown';

/**
 * Sends the user back to the app with an error the dialog can surface, and
 * clears the temporary OAuth cookies on the way out so a failed attempt never
 * leaves a stale verifier behind.
 */
function failureRedirect(request: NextRequest, code: AuthErrorCode): NextResponse {
  const response = NextResponse.redirect(new URL(`/?authError=${code}`, request.url));
  clearOAuthCookies(response);
  return response;
}

function clearOAuthCookies(response: NextResponse): void {
  for (const name of Object.values(GOOGLE_OAUTH_COOKIES)) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}

/**
 * Completes the Google sign-in flow.
 *
 * Verifies state, exchanges the code, resolves the account, then mints an
 * ordinary session with the same createSession/setSessionCookie the password
 * path uses — a Google session is indistinguishable from a password one, so
 * nothing downstream (guards, contexts, data-client) needs to know about OAuth.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // The user pressed "Cancel" on Google's consent screen.
  const oauthError = params.get('error');
  if (oauthError) {
    return failureRedirect(request, oauthError === 'access_denied' ? 'access_denied' : 'unknown');
  }

  const code = params.get('code');
  const returnedState = params.get('state');
  const storedState = request.cookies.get(GOOGLE_OAUTH_COOKIES.state)?.value ?? null;
  const codeVerifier = request.cookies.get(GOOGLE_OAUTH_COOKIES.codeVerifier)?.value ?? null;

  // CSRF: a callback whose state does not match the one we set is either forged
  // or stale, and is refused before the code is spent.
  if (!code || !isValidOAuthState(returnedState, storedState) || !codeVerifier) {
    return failureRedirect(request, 'state_mismatch');
  }

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (error) {
    console.error('[google-oauth/callback] Not configured:', error);
    return failureRedirect(request, 'not_configured');
  }

  try {
    const claims = await exchangeGoogleCode({ config, code, codeVerifier });

    const result = await resolveGoogleUser({
      googleId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified,
      name: claims.name,
      picture: claims.picture,
    });

    if (!result.ok) {
      return failureRedirect(request, result.reason);
    }

    const { user, isNewUser } = result;

    // Org side-payloads apply only to a genuinely new account. Replaying them
    // for a returning user would let a stale cookie silently re-create orgs.
    let inviteFailed = false;
    if (isNewUser) {
      const payload = decodeSignupPayload(
        request.cookies.get(GOOGLE_OAUTH_COOKIES.payload)?.value
      );

      if (payload.inviteToken) {
        const claimed = await claimInviteToken(payload.inviteToken, user.email);
        if (claimed.ok) {
          await addMember(claimed.tenantId, user.id, 'worker', { skipAuth: true });
        } else {
          // The account is already created and valid, so sign them in anyway
          // and tell them the invite did not apply.
          console.warn('[google-oauth/callback] Invite claim failed:', claimed.reason);
          inviteFailed = true;
        }
      } else if (payload.orgName) {
        await createOrgForNewUser(payload.orgName, user.id);
      }
    }

    const token = await createSession(user.id);

    const destination = new URL('/', request.url);
    if (inviteFailed) destination.searchParams.set('authError', 'invite_invalid');

    const response = NextResponse.redirect(destination, {
      headers: { 'Set-Cookie': setSessionCookie(token) },
    });
    clearOAuthCookies(response);

    return response;
  } catch (error) {
    console.error('[google-oauth/callback]', error);
    return failureRedirect(request, 'exchange_failed');
  }
}
