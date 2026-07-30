// Resolves the caller's IP from proxy headers, for per-IP rate limiting.
//
// PURE: reads request headers only — no DB, no network.
//
// Header order matters. This app is deployed behind Cloudflare, which sets
// cf-connecting-ip to the true client address and is the only one of these a
// client cannot forge end-to-end. x-forwarded-for is a client-settable header
// that the proxy APPENDS to, so its first entry is attacker-controlled when a
// request arrives without passing through the expected proxy — it is the
// fallback, never the first choice.

export interface IpHeaders {
  get(name: string): string | null;
}

/**
 * Best-effort client IP. Returns 'unknown' when no header identifies the
 * caller, which callers use as a rate-limit bucket like any other — a shared
 * bucket for unidentifiable traffic is the conservative outcome.
 */
export function getClientIp(request: { headers: IpHeaders }): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';

  return request.headers.get('x-real-ip') || 'unknown';
}
