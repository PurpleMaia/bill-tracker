/**
 * Validate a `returnTo` value before navigating to it. Only same-origin
 * relative paths pass; anything that could leave the app (`//host`, `/\host`,
 * `https://…`, `javascript:…`, encoded variants) returns null so callers fall
 * back to a fixed route instead of becoming an open redirect.
 *
 * Expects the already-decoded value `searchParams.get()` returns.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  if (!raw.startsWith('/')) return null;
  if (raw[1] === '/' || raw[1] === '\\') return null;
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) < 0x20) return null;
  }

  // A second decode catches `/%2F…` and `/%5C…`, which some routers and
  // browsers normalise into a protocol-relative URL.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return null;

  // Final guard: resolving against a dummy origin must stay on that origin.
  try {
    if (new URL(raw, 'http://x').origin !== 'http://x') return null;
  } catch {
    return null;
  }
  return raw;
}
