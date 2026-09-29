import { NextRequest, NextResponse } from 'next/server';
import { resolveOAuthProvider, type OAuthIdentity } from '@/services/oauth';
import { isKnownProvider, oauthCookieNames } from '@/lib/auth/oauth-registry';
import { isValidOAuthState, decodeSignupPayload } from '@/lib/auth/google-oauth';
import { resolveGoogleUser, type ResolveGoogleUserResult } from '@/db/queries/users';
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
 * Resolves a verified OAuth identity to an app user.
 *
 * Today only Google exists, and its identity maps 1:1 onto resolveGoogleUser's
 * input, so this delegates. This function is the seam where a second provider's
 * account resolution slots in: generalize resolveGoogleUser (or add a sibling)
 * and dispatch on providerId here — the routes above and below stay untouched.
 */
async function resolveOAuthUser(
  providerId: string,
  identity: OAuthIdentity
): Promise<ResolveGoogleUserResult> {
  return resolveGoogleUser({
    googleId: identity.providerAccountId,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    picture: identity.picture,
  });
}

/**
 * Completes an OAuth sign-in flow for the provider named in the URL.
 *
 * Provider-agnostic: verifies state, exchanges the code, resolves the account,
 * then mints an ordinary session with the same createSession/setSessionCookie
 * the password path uses — an OAuth session is indistinguishable from a password
 * one, so nothing downstream (guards, contexts, data-client) needs to know.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;

  if (!isKnownProvider(providerId)) {
    return new NextResponse('Unknown OAuth provider', { status: 404 });
  }

  const cookies = oauthCookieNames(providerId);

  function failureRedirect(code: AuthErrorCode): NextResponse {
    const response = NextResponse.redirect(new URL(`/?authError=${code}`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  function clearOAuthCookies(response: NextResponse): void {
    for (const name of Object.values(cookies)) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 });
    }
  }

  const search = request.nextUrl.searchParams;

  // The user pressed "Cancel" on the provider's consent screen.
  const oauthError = search.get('error');
  if (oauthError) {
    return failureRedirect(oauthError === 'access_denied' ? 'access_denied' : 'unknown');
  }

  const code = search.get('code');
  const returnedState = search.get('state');
  const storedState = request.cookies.get(cookies.state)?.value ?? null;
  const codeVerifier = request.cookies.get(cookies.codeVerifier)?.value ?? null;

  // CSRF: a callback whose state does not match the one we set is either forged
  // or stale, and is refused before the code is spent.
  if (!code || !isValidOAuthState(returnedState, storedState) || !codeVerifier) {
    return failureRedirect('state_mismatch');
  }

  const provider = resolveOAuthProvider(providerId);
  if (!provider) {
    return new NextResponse('Unknown OAuth provider', { status: 404 });
  }

  let config;
  try {
    config = provider.configFromEnv();
  } catch (error) {
    console.error(`[oauth/${providerId}/callback] Not configured:`, error);
    return failureRedirect('not_configured');
  }

  try {
    const identity = await provider.exchangeCode({ config, code, codeVerifier });

    const result = await resolveOAuthUser(providerId, identity);

    if (!result.ok) {
      return failureRedirect(result.reason);
    }

    const { user, isNewUser } = result;

    // Org side-payloads apply only to a genuinely new account. Replaying them
    // for a returning user would let a stale cookie silently re-create orgs.
    let inviteFailed = false;
    if (isNewUser) {
      const payload = decodeSignupPayload(request.cookies.get(cookies.payload)?.value);

      if (payload.inviteToken) {
        const claimed = await claimInviteToken(payload.inviteToken, user.email);
        if (claimed.ok) {
          await addMember(claimed.tenantId, user.id, 'worker', { skipAuth: true });
        } else {
          // The account is already created and valid, so sign them in anyway
          // and tell them the invite did not apply.
          console.warn(`[oauth/${providerId}/callback] Invite claim failed:`, claimed.reason);
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
    console.error(`[oauth/${providerId}/callback]`, error);
    return failureRedirect('exchange_failed');
  }
}
