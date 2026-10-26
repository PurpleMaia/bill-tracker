/**
 * Where to send someone after they log in or sign up.
 *
 * Every login prompt in the app links to /login?next=<where they were>, and the
 * OAuth round trip carries the same value through a cookie. `next` is
 * attacker-controllable (anyone can craft a /login link), so it is only ever
 * honoured as a same-site path — never an absolute URL, protocol-relative URL,
 * or anything a browser might normalize into one. Pure so the rules are
 * unit-testable.
 */

/** Generous for a path + query, small enough to fit the OAuth payload cookie. */
export const MAX_RETURN_PATH_LENGTH = 512;

/** Pages that would bounce straight back into the auth flow. */
const AUTH_PAGES = ['/login', '/register'];

/**
 * Returns `raw` if it is a safe same-site path to redirect to, else `fallback`.
 *
 * Rejects: non-strings, empty/oversized values, anything not starting with a
 * single `/` (`//evil.com` and `/\evil.com` are protocol-relative to browsers),
 * backslashes and control characters (browsers strip or rewrite them), and the
 * auth pages themselves, so a return trip can never loop.
 */
export function safeReturnPath(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  if (raw.length === 0 || raw.length > MAX_RETURN_PATH_LENGTH) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  // Belt and braces: resolve against a dummy origin and confirm it stayed put.
  let url: URL;
  try {
    url = new URL(raw, 'http://return.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'http://return.invalid') return fallback;
  if (AUTH_PAGES.includes(url.pathname)) return fallback;

  return raw;
}

/**
 * Builds a link to an auth page that returns to `next` afterwards. The query
 * param is omitted when there is nowhere useful to return to (home, or an
 * unsafe value), keeping the common URL clean.
 */
function authHref(page: string, next?: string | null): string {
  const target = safeReturnPath(next, '/');
  return target === '/' ? page : `${page}?next=${encodeURIComponent(target)}`;
}

/** `/login`, returning to `next` once signed in. */
export function loginHref(next?: string | null): string {
  return authHref('/login', next);
}

/** `/register`, returning to `next` once the account exists. */
export function registerHref(next?: string | null): string {
  return authHref('/register', next);
}
