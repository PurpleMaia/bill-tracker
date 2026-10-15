/**
 * The app's public origin, for building absolute URLs that leave the server
 * (redirects, OAuth redirect_uri, email links).
 *
 * Do NOT derive this from `request.url` in a route handler: behind a reverse
 * proxy (Dokku/nginx) `next start` reports the container's internal origin,
 * e.g. `http://localhost:5000`, so redirects built from it send the browser to
 * an address that only exists inside the container.
 */
export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002').replace(/\/$/, '');
}

/** Absolute URL for an app-relative path (`/`, `/?authError=x`, ...). */
export function appUrl(path: string): URL {
  return new URL(path, `${getAppUrl()}/`);
}
