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
export function billActionHref(billId: string, action: 'testimony' | 'contact', returnTo: string): string {
  return `/bills/${billId}/${action}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`;
}

/** Whether the query string carries anything besides the open-bill param. */
export function hasNonBillParams(search: string): boolean {
  return Array.from(new URLSearchParams(search).keys()).some((key) => key !== BILL_PARAM);
}
