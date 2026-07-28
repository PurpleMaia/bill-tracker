// Fetches bill documents from data.capitol.hawaii.gov.
//
// Two things about these documents drive this module:
//  1. They are windows-1252 (Microsoft Word exports; `file` reports ISO-8859
//     with CRLF). Reading them as UTF-8 does not throw — it silently mangles
//     en-dashes and curly quotes, corrupting legislative text. So we decode
//     explicitly.
//  2. A bill_versions row can carry an html_link to a document that does not
//     exist: HB1494_CD1 and SB2575_SD2 both 404 while sibling versions return
//     200. So a non-2xx guard is required, not defensive.
//
// Published bill text is immutable, so responses are cached by URL for the
// process lifetime with no invalidation.

import type { DiffError } from '@/lib/version-diff';

export class BillHtmlError extends Error {
  constructor(
    message: string,
    readonly code: DiffError,
  ) {
    super(message);
    this.name = 'BillHtmlError';
  }
}

const FETCH_TIMEOUT_MS = 10_000;

const cache = new Map<string, string>();

/** Clears the in-process HTML cache. */
export function clearBillHtmlCache(): void {
  cache.clear();
}

/**
 * Fetches a capitol.hawaii.gov bill document and decodes it as windows-1252.
 * Throws BillHtmlError with code 'fetch-failed' on timeout, network error, or
 * a non-2xx response.
 */
export async function fetchBillHtml(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/html' },
    });
  } catch {
    throw new BillHtmlError(`Failed to fetch ${url}`, 'fetch-failed');
  }

  if (!response.ok) {
    throw new BillHtmlError(`Fetch of ${url} returned ${response.status}`, 'fetch-failed');
  }

  // Explicit windows-1252 decode — see the note at the top of this file.
  const buffer = await response.arrayBuffer();
  const html = new TextDecoder('windows-1252').decode(buffer);

  cache.set(url, html);
  return html;
}
