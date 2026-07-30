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
// Published bill text is immutable, so responses are cached by URL — but the
// cache is BOUNDED. These documents are Word exports of 1.4-1.9 MB each, so an
// unbounded map keyed by every version ever compared is hundreds of MB of
// resident heap that is never released. Immutability justifies caching; it does
// not justify keeping every document forever.

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

/**
 * Documents held at once. A comparison needs 2, and the common flow is a reader
 * stepping through adjacent drafts of one bill, so this keeps a bill's whole
 * version history warm (the corpus tops out around 7 drafts) without growing
 * with traffic. At ~2 MB per document the ceiling is roughly 32 MB.
 */
const CACHE_MAX_ENTRIES = 16;

// Insertion-ordered LRU: Map preserves insertion order, so the oldest key is
// always the first one iteration yields. A read re-inserts to mark it recent.
const cache = new Map<string, string>();

/** Clears the in-process HTML cache. */
export function clearBillHtmlCache(): void {
  cache.clear();
}

/** Number of documents currently cached. Exposed for tests. */
export function billHtmlCacheSize(): number {
  return cache.size;
}

function cacheGet(url: string): string | undefined {
  const hit = cache.get(url);
  if (hit === undefined) return undefined;
  // Re-insert so this becomes the most-recently-used entry.
  cache.delete(url);
  cache.set(url, hit);
  return hit;
}

function cacheSet(url: string, html: string): void {
  // Delete first so an existing key moves to the end rather than keeping its
  // original position.
  cache.delete(url);
  cache.set(url, html);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * Fetches a capitol.hawaii.gov bill document and decodes it as windows-1252.
 * Throws BillHtmlError with code 'fetch-failed' on timeout, network error, or
 * a non-2xx response.
 */
export async function fetchBillHtml(url: string): Promise<string> {
  const cached = cacheGet(url);
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

  cacheSet(url, html);
  return html;
}
