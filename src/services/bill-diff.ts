// External-integration wrapper for the `hawaii-bill-diff` package (per
// CLAUDE.md, third-party wrappers live in src/services/).
//
// NOTE: hawaii-bill-diff@1.0.1 has a broken CommonJS entry — its package.json
// points `main`/`require` at ./dist/index.js, which doesn't exist (only the ESM
// builds dist/index.es.js and dist/index.cjs.js ship). It therefore resolves
// only via the ESM `import` condition. Keep every consumer of this module on
// the ESM path (server modules, client components, Vitest); do NOT import it
// from a CommonJS / `require()` context or it throws MODULE_NOT_FOUND.
//
// We use compareBillContent (section-scoped, formatting-aware), NOT compareBills
// or compareBillsFromHtml. The line-based functions are unusable here: the
// documents are single-paragraph-per-line Word exports, and on HB1494 HD1->HD2
// the line path reports 134 removed / 216 modified of noise (much of it Word
// metadata) where compareBillContent finds 9 real section changes.
import { compareBillContent, parseBillHtml } from 'hawaii-bill-diff';
import { fetchBillHtml, BillHtmlError } from './bill-html';
import { limitFixedWindow, retryAfterMs } from '@/lib/ratelimit-memory';
import {
  normalizeComparison,
  errorComparison,
  type VersionComparison,
  type RawSectionChange,
} from '@/lib/version-diff';

/**
 * Cost ceiling on the expensive path, keyed by the version PAIR rather than by
 * caller. Two fetches of ~2 MB plus two full parses is the most expensive thing
 * this app does per request, and the work is identical for every caller asking
 * for the same pair — so limiting the pair caps total spend regardless of who
 * asks or how many of them there are.
 *
 * This sits in the service, not the route, deliberately: the data-client can
 * flip between the action and fetch arms, and a guard in only one arm would
 * silently disappear when the flag moved. Everything expensive goes through
 * here.
 *
 * A cache hit still counts against the window. That is intentional — the limit
 * exists to bound work, and a hit is cheap enough that a caller inside the
 * window will not notice, while a cold pair is exactly what needs bounding.
 */
const DIFF_RATE_LIMIT = { limit: 12, windowMs: 60_000 };

/**
 * Runs the package's parsers with console output suppressed. compareBillContent
 * and parseBillHtml log "No sections found with primary regex, trying
 * alternative approach..." on every real document, which would spam server logs
 * on every comparison.
 */
function quietly<T>(run: () => T): T {
  const original = console.log;
  console.log = () => {};
  try {
    return run();
  } finally {
    console.log = original;
  }
}

/** Section numbers the package recovered from one document. */
function sectionNumbersOf(html: string): string[] {
  return quietly(() => parseBillHtml(html).sections.map((s) => s.sectionNumber));
}

/**
 * Compares two already-fetched bill documents. Pure relative to the network —
 * separated from compareVersionHtml so fixture tests can exercise it directly.
 */
export function diffParsedHtml(
  olderHtml: string,
  newerHtml: string,
  olderLabel: string,
  newerLabel: string,
): VersionComparison {
  try {
    const result = quietly(() => compareBillContent(olderHtml, newerHtml));
    const sections = (result?.sections ?? []) as unknown as RawSectionChange[];
    if (sections.length === 0) {
      return errorComparison(olderLabel, newerLabel, 'parse-failed');
    }
    return normalizeComparison(
      sections,
      olderLabel,
      newerLabel,
      sectionNumbersOf(olderHtml),
      sectionNumbersOf(newerHtml),
    );
  } catch {
    return errorComparison(olderLabel, newerLabel, 'parse-failed');
  }
}

/**
 * Fetches both versions' source documents and compares them. Returns a
 * VersionComparison carrying an `error` code rather than throwing, so every
 * failure mode is renderable:
 *  - 'no-html'      the version row has no html_link (never retryable)
 *  - 'fetch-failed' network error, timeout, or non-2xx (retryable)
 *  - 'parse-failed' fetched, but the package yielded nothing usable
 *  - 'rate-limited' too many comparisons of this pair (retryable, after a wait)
 */
export async function compareVersionHtml(input: {
  olderLabel: string;
  newerLabel: string;
  olderUrl: string | null;
  newerUrl: string | null;
}): Promise<VersionComparison> {
  const { olderLabel, newerLabel, olderUrl, newerUrl } = input;

  if (!olderUrl || !newerUrl) {
    return errorComparison(olderLabel, newerLabel, 'no-html');
  }

  // Keyed on the URL pair: that is what identifies the work, and it is stable
  // across both transport arms. Checked AFTER the no-html guard so a version
  // that can never be compared does not consume anyone's budget.
  const rl = limitFixedWindow(
    `diff:${olderUrl}:${newerUrl}`,
    DIFF_RATE_LIMIT.limit,
    DIFF_RATE_LIMIT.windowMs,
  );
  if (!rl.ok) {
    console.warn('[diff] comparison rate limited', {
      olderLabel,
      newerLabel,
      retryAfterMs: retryAfterMs(rl.resetAt),
    });
    return errorComparison(olderLabel, newerLabel, 'rate-limited');
  }

  let olderHtml: string;
  let newerHtml: string;
  try {
    [olderHtml, newerHtml] = await Promise.all([fetchBillHtml(olderUrl), fetchBillHtml(newerUrl)]);
  } catch (error) {
    const code = error instanceof BillHtmlError ? error.code : 'fetch-failed';
    return errorComparison(olderLabel, newerLabel, code);
  }

  return diffParsedHtml(olderHtml, newerHtml, olderLabel, newerLabel);
}
