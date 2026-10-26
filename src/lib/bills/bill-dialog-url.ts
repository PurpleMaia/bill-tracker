/**
 * URL helpers for the bill details dialog. The open bill lives in the host
 * page's query string (`?bill=<id>`) so browser back — and the Contact /
 * Testimony pages' Back button via `returnTo` — can land on it again.
 */

export const BILL_PARAM = 'bill';
export const RETURN_TO_PARAM = 'returnTo';

/**
 * Set (or, with `billId` null, remove) the `bill` param on a query string,
 * keeping every other param. Returns `?…`, or `''` when nothing remains.
 */
export function withBillParam(search: string, billId: string | null): string {
  const params = new URLSearchParams(search);
  if (billId === null) params.delete(BILL_PARAM);
  else params.set(BILL_PARAM, billId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Link from the dialog to a bill's testimony/contact page that remembers where to come back to. */
export function billActionHref(billId: string, action: 'testimony' | 'contact', returnTo?: string): string {
  const base = `/bills/${billId}/${action}`;
  return returnTo ? `${base}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : base;
}

/** A path (`/x?a=1&bill=2#h`) with the open-bill param removed, e.g. to return somewhere without reopening a dialog. */
export function stripBillParam(path: string): string {
  const hashAt = path.indexOf('#');
  const hash = hashAt === -1 ? '' : path.slice(hashAt);
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  if (queryAt === -1) return path;
  return beforeHash.slice(0, queryAt) + withBillParam(beforeHash.slice(queryAt), null) + hash;
}

/** Whether the query string carries anything besides the open-bill param. */
export function hasNonBillParams(search: string): boolean {
  return Array.from(new URLSearchParams(search).keys()).some((key) => key !== BILL_PARAM);
}
