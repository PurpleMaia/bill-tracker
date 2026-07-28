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
import {
  normalizeComparison,
  errorComparison,
  type VersionComparison,
  type RawSectionChange,
} from '@/lib/version-diff';

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
