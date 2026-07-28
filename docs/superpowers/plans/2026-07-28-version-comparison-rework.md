# Version Comparison Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken line-based bill version diff with a section-based accordion diff computed from freshly-fetched source HTML, and make the timeline's Compare button drive the right-hand panel's dropdowns.

**Architecture:** `bill_versions.original_text` is whitespace-collapsed to a single line, so line diffing is impossible. Instead, fetch each version's `html_link` server-side (windows-1252 decode, cached), run `hawaii-bill-diff`'s `compareBillContent` for section-scoped changes carrying Hawaii's own strikethrough/underline amendment marks, normalize into a typed `VersionComparison` via a pure function, and render as a collapsed-by-default accordion.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely, `hawaii-bill-diff@1.0.1` (ESM entry only), Radix accordion via shadcn/ui, Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-28-version-comparison-design.md`

## Global Constraints

- **Package resolves via ESM only.** `hawaii-bill-diff`'s `package.json` points `main`/`require` at a nonexistent `dist/index.js`. Only import it from ESM contexts (server modules, client components, Vitest). Never from a `require()` path.
- **Use `compareBillContent`, never `compareBills`/`compareBillsFromHtml`.** The line-based functions produce the broken output being replaced (134 removed / 216 modified of noise on HB1494 HD1→HD2, versus 9 real changes).
- **Never render `parseBillHtml(...).text`.** It leads with Word metadata (author, template filename, timestamps, word counts). Render `sections` only.
- **Align sections by `sectionNumber`, never by array position.** The package drops sections; HD1 yields `1,2,3,4,5,6,9,13,14,15,16,17` and HD2 yields `1,2,3,4,5,6,9,12,13,14,15`. Position-matching would compare HD1 §13 against HD2 §12.
- **Sort section numbers numerically**, so `'12'` follows `'9'`. String sort is wrong.
- **Decode HTML as windows-1252.** These are Word exports; `file` reports ISO-8859 with CRLF. UTF-8 reading silently mangles en-dashes and curly quotes.
- **Fragment text renders as plain text, never markdown.** An observed fragment is `"1.~~"`.
- **Colour is never the sole accessibility channel** (WCAG 1.4.1). Strikethrough/underline plus a visually-hidden "added"/"removed" label accompany colour.
- **Data-client contract:** the `action` and `fetch` arms take identical params and resolve to the SAME already-unwrapped value, throwing on error. See `src/lib/data-client/define-client.ts`.
- **A `'use server'` file may only export async functions** — no type exports, no re-exports. Shared types live in plain modules.
- **CLAUDE.md:** all DB access in `src/db/queries/*`; `src/lib/` is DB-free; third-party/network wrappers in `src/services/*`; client components call `data.*`, never raw `fetch`. Do not delete old API routes. Commit prefixes `feat:`/`fix:`/`refactor:`/`docs:`, and **no `Co-Authored-By` lines**.
- **Verify with:** `npm test`, `npm run typecheck`, and `npm run build` (the build catches `'use server'` export violations that typecheck misses).

---

## File Structure

**Create**
- `src/lib/version-diff.ts` — pure types + normalization + section alignment. DB-free, network-free, fully unit-testable. The correctness core.
- `src/services/bill-html.ts` — fetch a capitol.hawaii.gov document, decode windows-1252, cache by URL. The only network code.
- `src/lib/__tests__/version-diff.test.ts` — alignment, sorting, `parseIncomplete`, fragment mapping, totals.
- `src/lib/__tests__/fixtures/` — committed HTML fixtures (HB1494_HD1/HD2/SD1, HB235_HD1/CD1).
- `src/lib/__tests__/version-diff-fixtures.test.ts` — fixture-backed tests over the real corpus.
- `src/components/kanban/version-diff-accordion.tsx` — the accordion renderer. Presentational only.

**Modify**
- `src/services/bill-diff.ts` — rewritten around `compareBillContent`; drops `diffVersions`, `DiffRow`, `DIFF_ROW_CLASS`, `parseModified`, `MODIFIED_RE`, `toBillData`.
- `src/db/queries/bills-read.ts` — add `getVersionHtmlLinks(billId, olderId, newerId)`.
- `src/app/actions/bills.ts` — add `compareVersionsAction`.
- `src/app/api/bills/[id]/route.ts` — extend GET with a `?resource=version-diff` branch.
- `src/lib/data-client/bills.client.ts` — register `compareVersions`.
- `src/components/kanban/versions-reports-tab.tsx` — owns `{ olderId, newerId }`, passes `onCompare`, flips mobile sub-tab.
- `src/components/kanban/bill-versions-panel.tsx` — Compare button, selected-row marking.
- `src/components/kanban/version-compare.tsx` — async load, states, renders the accordion.
- `src/lib/__tests__/bill-diff.test.ts` — rewritten against the new shape.

**Delete**
- `src/components/kanban/version-diff-inline.tsx`

**Dependency order:** Task 1 (pure types+normalizer) → Task 2 (fetch) → Task 3 (diff service) → Task 4 (query+transports) → Task 5 (accordion) → Task 6 (panel wiring) → Task 7 (cleanup+verify).

---

### Task 1: Pure diff types, normalization, and section alignment

This is the correctness core and has no dependencies. Everything else consumes its types.

**Files:**
- Create: `src/lib/version-diff.ts`
- Test: `src/lib/__tests__/version-diff.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged'`
  - `interface ChangeFragment { kind: ChangeKind; text: string; struck: boolean; underlined: boolean }`
  - `interface SectionDiff { sectionNumber: string; kind: ChangeKind; changeCount: number; fragments: ChangeFragment[]; presence: 'both' | 'olderOnly' | 'newerOnly' }`
  - `interface VersionComparison { olderLabel: string; newerLabel: string; sections: SectionDiff[]; totals: { added: number; removed: number; modified: number; unchanged: number }; parseIncomplete: boolean; error: DiffError | null }`
  - `type DiffError = 'no-html' | 'fetch-failed' | 'parse-failed'`
  - `interface RawSectionChange { type: string; sectionNumber: string; changes: Array<{ type: string; text: string; formatting?: { strikethrough?: boolean; underline?: boolean; bold?: boolean } }> }`
  - `function normalizeComparison(raw: RawSectionChange[], olderLabel: string, newerLabel: string, olderSectionNumbers: string[], newerSectionNumbers: string[]): VersionComparison`
  - `function compareSectionNumbers(a: string, b: string): number`
  - `function hasSectionGaps(numbers: string[]): boolean`
  - `function errorComparison(olderLabel: string, newerLabel: string, error: DiffError): VersionComparison`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/version-diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeComparison,
  compareSectionNumbers,
  hasSectionGaps,
  errorComparison,
  type RawSectionChange,
} from '@/lib/version-diff';

const frag = (type: string, text: string, fmt?: Record<string, boolean>) => ({
  type,
  text,
  formatting: { strikethrough: false, underline: false, bold: false, ...fmt },
});

describe('compareSectionNumbers', () => {
  it('orders numerically, not lexically', () => {
    expect(['12', '9', '2', '10'].sort(compareSectionNumbers)).toEqual(['2', '9', '10', '12']);
  });

  it('puts non-numeric section numbers last, stably', () => {
    expect(['4', 'A', '2'].sort(compareSectionNumbers)).toEqual(['2', '4', 'A']);
  });
});

describe('hasSectionGaps', () => {
  it('detects the real HB1494_HD1 gap (7, 8, 10, 11 dropped)', () => {
    expect(hasSectionGaps(['1', '2', '3', '4', '5', '6', '9', '13', '14', '15', '16', '17'])).toBe(true);
  });

  it('is false for a contiguous sequence', () => {
    expect(hasSectionGaps(['1', '2', '3', '4'])).toBe(false);
  });

  it('is false for an empty or single-section list', () => {
    expect(hasSectionGaps([])).toBe(false);
    expect(hasSectionGaps(['1'])).toBe(false);
  });
});

describe('normalizeComparison', () => {
  it('maps formatting flags to struck/underlined and preserves kinds', () => {
    const raw: RawSectionChange[] = [
      {
        type: 'modified',
        sectionNumber: '4',
        changes: [
          frag('unchanged', 'SECTION 4. The director of finance is authorized'),
          frag('removed', 'or constructing', { strikethrough: true }),
          frag('added', 'the university of Hawaii at Manoa campus', { underline: true }),
        ],
      },
    ];
    const c = normalizeComparison(raw, 'HB1494_HD1', 'HB1494_HD2', ['4'], ['4']);
    const section = c.sections[0];
    expect(section.kind).toBe('modified');
    expect(section.fragments[1]).toMatchObject({ kind: 'removed', struck: true, underlined: false });
    expect(section.fragments[2]).toMatchObject({ kind: 'added', underlined: true, struck: false });
    // changeCount excludes unchanged fragments.
    expect(section.changeCount).toBe(2);
    expect(section.presence).toBe('both');
  });

  it('aligns by section number: a section only in the newer parse is newerOnly', () => {
    const raw: RawSectionChange[] = [
      { type: 'modified', sectionNumber: '13', changes: [frag('added', 'x')] },
      { type: 'added', sectionNumber: '12', changes: [frag('added', 'y')] },
    ];
    const c = normalizeComparison(
      raw,
      'HD1',
      'HD2',
      ['9', '13'],       // older parse: no 12
      ['9', '12', '13'], // newer parse: has 12
    );
    const byNumber = Object.fromEntries(c.sections.map((s) => [s.sectionNumber, s]));
    expect(byNumber['12'].presence).toBe('newerOnly');
    expect(byNumber['13'].presence).toBe('both');
    // Numeric ordering: 12 before 13.
    expect(c.sections.map((s) => s.sectionNumber)).toEqual(['12', '13']);
  });

  it('marks a section present only in the older parse as olderOnly', () => {
    const raw: RawSectionChange[] = [
      { type: 'removed', sectionNumber: '16', changes: [frag('removed', 'gone', { strikethrough: true })] },
    ];
    const c = normalizeComparison(raw, 'HD1', 'HD2', ['16'], []);
    expect(c.sections[0].presence).toBe('olderOnly');
  });

  it('sets parseIncomplete when either parse has gaps', () => {
    const raw: RawSectionChange[] = [{ type: 'unchanged', sectionNumber: '1', changes: [frag('unchanged', 'a')] }];
    expect(normalizeComparison(raw, 'A', 'B', ['1', '2'], ['1', '2']).parseIncomplete).toBe(false);
    expect(normalizeComparison(raw, 'A', 'B', ['1', '4'], ['1', '2']).parseIncomplete).toBe(true);
    expect(normalizeComparison(raw, 'A', 'B', ['1', '2'], ['1', '4']).parseIncomplete).toBe(true);
  });

  it('computes totals from section verdicts', () => {
    const raw: RawSectionChange[] = [
      { type: 'modified', sectionNumber: '1', changes: [frag('added', 'a')] },
      { type: 'modified', sectionNumber: '2', changes: [frag('added', 'b')] },
      { type: 'removed', sectionNumber: '3', changes: [frag('removed', 'c')] },
      { type: 'added', sectionNumber: '4', changes: [frag('added', 'd')] },
      { type: 'unchanged', sectionNumber: '5', changes: [frag('unchanged', 'e')] },
    ];
    const c = normalizeComparison(raw, 'A', 'B', ['1', '2', '3', '4', '5'], ['1', '2', '3', '4', '5']);
    expect(c.totals).toEqual({ added: 1, removed: 1, modified: 2, unchanged: 1 });
  });

  it('preserves markdown-active artifacts as literal text', () => {
    const raw: RawSectionChange[] = [
      { type: 'modified', sectionNumber: '1', changes: [frag('modified', '1.~~')] },
    ];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].fragments[0].text).toBe('1.~~');
  });

  it('drops empty and whitespace-only fragments', () => {
    const raw: RawSectionChange[] = [
      {
        type: 'modified',
        sectionNumber: '1',
        changes: [frag('added', 'real'), frag('added', ''), frag('added', '   ')],
      },
    ];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].fragments).toHaveLength(1);
    expect(c.sections[0].changeCount).toBe(1);
  });

  it('tolerates a missing formatting object', () => {
    const raw = [
      { type: 'modified', sectionNumber: '1', changes: [{ type: 'added', text: 'x' }] },
    ] as RawSectionChange[];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].fragments[0]).toMatchObject({ struck: false, underlined: false });
  });

  it('coerces an unrecognized change type to modified', () => {
    const raw = [
      { type: 'weird', sectionNumber: '1', changes: [{ type: 'bogus', text: 'x' }] },
    ] as RawSectionChange[];
    const c = normalizeComparison(raw, 'A', 'B', ['1'], ['1']);
    expect(c.sections[0].kind).toBe('modified');
    expect(c.sections[0].fragments[0].kind).toBe('modified');
  });
});

describe('errorComparison', () => {
  it('returns an empty comparison carrying the error code', () => {
    const c = errorComparison('A', 'B', 'fetch-failed');
    expect(c.error).toBe('fetch-failed');
    expect(c.sections).toEqual([]);
    expect(c.totals).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 0 });
    expect(c.parseIncomplete).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/version-diff.test.ts`
Expected: FAIL — cannot resolve `@/lib/version-diff`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/version-diff.ts`:

```ts
// Pure normalization for bill version comparisons. No DB, no network, no
// package imports — takes the shape hawaii-bill-diff's compareBillContent
// returns and produces the typed structure the UI renders.
//
// The load-bearing rule here is section alignment. The package's section regex
// silently drops sections (HB1494_HD1 parses 1,2,3,4,5,6,9,13,14,15,16,17 —
// 7, 8, 10, 11 are missing), so section lists differ in length AND content
// between two versions of the same bill. Aligning by array position would
// compare unrelated sections. We key on sectionNumber and report gaps.

export type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

export type DiffError = 'no-html' | 'fetch-failed' | 'parse-failed';

/** One run of text within a section, carrying Hawaii's amendment marks. */
export interface ChangeFragment {
  kind: ChangeKind;
  text: string;
  /** formatting.strikethrough — Hawaii's deletion mark. */
  struck: boolean;
  /** formatting.underline — Hawaii's insertion mark. */
  underlined: boolean;
}

export interface SectionDiff {
  /** The alignment key, e.g. '4', '12'. Never an array index. */
  sectionNumber: string;
  kind: ChangeKind;
  /** Non-unchanged fragments; drives the collapsed row's label. */
  changeCount: number;
  fragments: ChangeFragment[];
  presence: 'both' | 'olderOnly' | 'newerOnly';
}

export interface VersionComparison {
  olderLabel: string;
  newerLabel: string;
  sections: SectionDiff[];
  totals: { added: number; removed: number; modified: number; unchanged: number };
  /** True when either parse dropped sections — the diff is not complete. */
  parseIncomplete: boolean;
  error: DiffError | null;
}

/** The subset of compareBillContent's output we depend on. */
export interface RawSectionChange {
  type: string;
  sectionNumber: string;
  changes: Array<{
    type: string;
    text: string;
    formatting?: { strikethrough?: boolean; underline?: boolean; bold?: boolean };
  }>;
}

const KINDS: ChangeKind[] = ['added', 'removed', 'modified', 'unchanged'];

function toKind(raw: string): ChangeKind {
  return (KINDS as string[]).includes(raw) ? (raw as ChangeKind) : 'modified';
}

/**
 * Numeric section ordering, so '12' sorts after '9'. Non-numeric section
 * numbers sort last (and among themselves lexically) rather than being dropped.
 */
export function compareSectionNumbers(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

/**
 * True when a parsed section sequence skips numbers, meaning the package's
 * fallback regex failed to recognize sections that exist in the document.
 */
export function hasSectionGaps(numbers: string[]): boolean {
  const parsed = numbers
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (parsed.length < 2) return false;
  return parsed[parsed.length - 1] - parsed[0] + 1 !== parsed.length;
}

export function errorComparison(
  olderLabel: string,
  newerLabel: string,
  error: DiffError,
): VersionComparison {
  return {
    olderLabel,
    newerLabel,
    sections: [],
    totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
    parseIncomplete: false,
    error,
  };
}

export function normalizeComparison(
  raw: RawSectionChange[],
  olderLabel: string,
  newerLabel: string,
  olderSectionNumbers: string[],
  newerSectionNumbers: string[],
): VersionComparison {
  const inOlder = new Set(olderSectionNumbers);
  const inNewer = new Set(newerSectionNumbers);

  const sections: SectionDiff[] = (raw ?? []).map((section) => {
    const fragments: ChangeFragment[] = (section.changes ?? [])
      // Empty/whitespace runs are parser noise, not content.
      .filter((change) => typeof change.text === 'string' && change.text.trim() !== '')
      .map((change) => ({
        kind: toKind(change.type),
        text: change.text,
        struck: change.formatting?.strikethrough === true,
        underlined: change.formatting?.underline === true,
      }));

    const number = section.sectionNumber;
    const presence: SectionDiff['presence'] =
      inOlder.has(number) && inNewer.has(number)
        ? 'both'
        : inNewer.has(number)
          ? 'newerOnly'
          : 'olderOnly';

    return {
      sectionNumber: number,
      kind: toKind(section.type),
      changeCount: fragments.filter((f) => f.kind !== 'unchanged').length,
      fragments,
      presence,
    };
  });

  sections.sort((a, b) => compareSectionNumbers(a.sectionNumber, b.sectionNumber));

  const totals = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const section of sections) totals[section.kind] += 1;

  return {
    olderLabel,
    newerLabel,
    sections,
    totals,
    parseIncomplete: hasSectionGaps(olderSectionNumbers) || hasSectionGaps(newerSectionNumbers),
    error: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/version-diff.test.ts`
Expected: PASS (all cases).

Then `npm run typecheck` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/version-diff.ts src/lib/__tests__/version-diff.test.ts
git commit -m "feat: pure section-diff normalization with number-keyed alignment"
```

---

### Task 2: Fetch and decode source HTML

**Files:**
- Create: `src/services/bill-html.ts`

**Interfaces:**
- Consumes: `DiffError` from `src/lib/version-diff.ts` (Task 1).
- Produces:
  - `class BillHtmlError extends Error { code: DiffError }`
  - `async function fetchBillHtml(url: string): Promise<string>`
  - `function clearBillHtmlCache(): void` (test/debug affordance)

No unit test: this is network code, and project convention keeps tests pure (no DB, no network, no mocking). Verified manually in Step 2 below and end-to-end in Task 7.

- [ ] **Step 1: Write the implementation**

Create `src/services/bill-html.ts`:

```ts
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
  } catch (cause) {
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
```

- [ ] **Step 2: Verify against the live source manually**

Run:

```bash
npx tsx -e "
import { fetchBillHtml } from './src/services/bill-html';
const html = await fetchBillHtml('https://data.capitol.hawaii.gov/sessions/session2025/bills/HB1494_HD1_.HTM');
console.log('bytes:', html.length, 'has <html>:', html.includes('<html'));
try {
  await fetchBillHtml('https://data.capitol.hawaii.gov/sessions/session2025/bills/HB1494_CD1_.HTM');
  console.log('ERROR: 404 did not throw');
} catch (e) { console.log('404 ->', e.code); }
"
```

Expected: a byte count around 96,000, `has <html>: true`, and `404 -> fetch-failed`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/bill-html.ts
git commit -m "feat: fetch and windows-1252 decode capitol bill HTML with caching"
```

---

### Task 3: Rewrite the diff service around compareBillContent

**Files:**
- Modify: `src/services/bill-diff.ts` (full rewrite)
- Modify: `src/lib/__tests__/bill-diff.test.ts` (rewrite against the new shape)
- Create: `src/lib/__tests__/fixtures/` (5 HTML files)
- Create: `src/lib/__tests__/version-diff-fixtures.test.ts`

**Interfaces:**
- Consumes: `fetchBillHtml`, `BillHtmlError` (Task 2); `normalizeComparison`, `errorComparison`, `VersionComparison`, `RawSectionChange` (Task 1).
- Produces:
  - `async function compareVersionHtml(input: { olderLabel: string; newerLabel: string; olderUrl: string | null; newerUrl: string | null }): Promise<VersionComparison>`
  - `function diffParsedHtml(olderHtml: string, newerHtml: string, olderLabel: string, newerLabel: string): VersionComparison`

- [ ] **Step 1: Save the HTML fixtures**

Run:

```bash
mkdir -p src/lib/__tests__/fixtures
for f in HB1494_HD1 HB1494_HD2 HB1494_SD1 HB235_HD1 HB235_CD1; do
  curl -sS -o "src/lib/__tests__/fixtures/$f.htm" \
    "https://data.capitol.hawaii.gov/sessions/session2025/bills/${f}_.HTM"
  echo "$f: $(wc -c < "src/lib/__tests__/fixtures/$f.htm") bytes"
done
```

Expected: five files, roughly 61,000–96,000 bytes each. Keep them byte-exact (windows-1252) — do NOT convert to UTF-8; the code under test does the decoding.

- [ ] **Step 2: Write the failing fixture test**

Create `src/lib/__tests__/version-diff-fixtures.test.ts`:

```ts
// Fixture-backed tests over the real corpus. These pin the measured behaviour
// of hawaii-bill-diff's section parsing, so a package upgrade that changes it
// fails loudly instead of silently degrading the diff.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffParsedHtml } from '@/services/bill-diff';

const FIXTURES = join(__dirname, 'fixtures');

function html(name: string): string {
  // Fixtures are stored byte-exact as windows-1252, matching what the network
  // returns; decode the same way the service does.
  return new TextDecoder('windows-1252').decode(readFileSync(join(FIXTURES, `${name}.htm`)));
}

describe('diffParsedHtml over real Hawaii bill documents', () => {
  it('produces a small number of real section changes for HB1494 HD1 -> HD2', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HB1494_HD1', 'HB1494_HD2');
    expect(c.error).toBeNull();
    // The line-based path reported 134 removed / 216 modified of noise here.
    // Section-based comparison finds a handful of real changes.
    expect(c.sections.length).toBeGreaterThan(0);
    expect(c.sections.length).toBeLessThan(30);
    const changed = c.sections.filter((s) => s.kind !== 'unchanged');
    expect(changed.length).toBeGreaterThan(0);
  });

  it('surfaces Hawaii amendment marks as struck/underlined fragments', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    const fragments = c.sections.flatMap((s) => s.fragments);
    expect(fragments.some((f) => f.struck)).toBe(true);
    expect(fragments.some((f) => f.underlined)).toBe(true);
  });

  it('flags parseIncomplete for HB1494, whose sections 7/8/10/11 are dropped', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    expect(c.parseIncomplete).toBe(true);
  });

  it('never emits Word metadata as section content', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    const allText = c.sections.flatMap((s) => s.fragments).map((f) => f.text).join(' ');
    // parseBillHtml(...).text leads with these; sections must not contain them.
    expect(allText).not.toContain('Bill HD.dotm');
    expect(allText).not.toContain('HB template, revision no.');
  });

  it('orders sections numerically', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    const numeric = c.sections
      .map((s) => Number.parseInt(s.sectionNumber, 10))
      .filter((n) => Number.isFinite(n));
    expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
  });

  it('handles HB235 HD1 -> CD1', () => {
    const c = diffParsedHtml(html('HB235_HD1'), html('HB235_CD1'), 'HB235_HD1', 'HB235_CD1');
    expect(c.error).toBeNull();
    expect(c.sections.filter((s) => s.kind !== 'unchanged').length).toBeGreaterThan(0);
  });

  it('returns a parse-failed comparison for non-bill HTML', () => {
    const c = diffParsedHtml('<html><body>not a bill</body></html>', '<html><body>nope</body></html>', 'A', 'B');
    expect(c.error).toBe('parse-failed');
    expect(c.sections).toEqual([]);
  });
});
```

- [ ] **Step 3: Rewrite the unit test for the service**

Replace the whole contents of `src/lib/__tests__/bill-diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compareVersionHtml } from '@/services/bill-diff';

describe('compareVersionHtml', () => {
  it('returns a no-html error when either version lacks an html_link', async () => {
    const a = await compareVersionHtml({
      olderLabel: 'HB1334', newerLabel: 'HD1',
      olderUrl: null, newerUrl: 'https://example.invalid/b.htm',
    });
    expect(a.error).toBe('no-html');
    expect(a.sections).toEqual([]);
    expect(a.olderLabel).toBe('HB1334');
    expect(a.newerLabel).toBe('HD1');

    const b = await compareVersionHtml({
      olderLabel: 'HB1334', newerLabel: 'HD1',
      olderUrl: 'https://example.invalid/a.htm', newerUrl: null,
    });
    expect(b.error).toBe('no-html');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/bill-diff.test.ts src/lib/__tests__/version-diff-fixtures.test.ts`
Expected: FAIL — `compareVersionHtml` / `diffParsedHtml` are not exported from `@/services/bill-diff`.

- [ ] **Step 5: Rewrite the service**

Replace the whole contents of `src/services/bill-diff.ts`:

```ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/bill-diff.test.ts src/lib/__tests__/version-diff-fixtures.test.ts`
Expected: PASS.

If the "returns a parse-failed comparison for non-bill HTML" case fails because the package returns a section for trivial HTML, inspect what it actually returns and adjust the assertion to match observed behaviour — do not loosen `diffParsedHtml`'s contract to make a test pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/bill-diff.ts src/lib/__tests__/bill-diff.test.ts \
        src/lib/__tests__/version-diff-fixtures.test.ts src/lib/__tests__/fixtures
git commit -m "refactor: diff bill versions via compareBillContent on source HTML"
```

---

### Task 4: Query + both transport arms + data-client registration

**Files:**
- Modify: `src/db/queries/bills-read.ts` (add after `getBillVersionsAndReports`, ~line 279)
- Modify: `src/app/actions/bills.ts`
- Modify: `src/app/api/bills/[id]/route.ts` (extend the existing `GET`, lines 9-21)
- Modify: `src/lib/data-client/bills.client.ts`

**Interfaces:**
- Consumes: `compareVersionHtml` (Task 3); `VersionComparison` (Task 1).
- Produces:
  - `async function getVersionHtmlLinks(billId, olderId, newerId): Promise<{ older: {label, htmlLink} | null; newer: {label, htmlLink} | null }>` in `db/queries/bills-read.ts`
  - `interface CompareVersionsParams { billId: string; olderId: string; newerId: string }` — declared in `src/types/legislation.ts` (NOT in the `'use server'` file, which may only export async functions)
  - `async function compareVersionsAction(params: CompareVersionsParams): Promise<VersionComparison>`
  - `data.bills.compareVersions(params) => Promise<VersionComparison>`

- [ ] **Step 1: Add the query**

In `src/db/queries/bills-read.ts`, directly after `getBillVersionsAndReports`:

```ts
/**
 * Fetches the label and source-document link for two specific versions of a
 * bill, for the version-comparison diff. Scoped by bill_id so a caller cannot
 * pull versions belonging to another bill by guessing ids.
 */
export async function getVersionHtmlLinks(
  billId: string,
  olderId: string,
  newerId: string,
): Promise<{
  older: { label: string; htmlLink: string | null } | null;
  newer: { label: string; htmlLink: string | null } | null;
}> {
  const rows = await db
    .selectFrom('bill_versions')
    .select(['id', 'label', 'html_link'])
    .where('bill_id', '=', billId)
    .where('id', 'in', [olderId, newerId])
    .execute();

  const find = (id: string) => {
    const row = rows.find((r) => r.id === id);
    return row ? { label: row.label, htmlLink: row.html_link } : null;
  };

  return { older: find(olderId), newer: find(newerId) };
}
```

- [ ] **Step 2: Add the params type to the shared types module**

In `src/types/legislation.ts`, append:

```ts
/** Params for a version-to-version diff request. */
export interface CompareVersionsParams {
  billId: string;
  olderId: string;
  newerId: string;
}
```

- [ ] **Step 3: Add the action arm**

In `src/app/actions/bills.ts`, add the imports and the action. Note this file is `'use server'` — it may export only async functions, so `CompareVersionsParams` is imported as a type, not declared here.

Add to the existing imports:

```ts
import type { CompareVersionsParams } from '@/types/legislation';
import type { VersionComparison } from '@/lib/version-diff';
import { getVersionHtmlLinks } from '@/db/queries/bills-read';
import { compareVersionHtml } from '@/services/bill-diff';
```

Append:

```ts
/**
 * Mirrors GET /api/bills/[id]?resource=version-diff. Public data (bill text is
 * public record), so optional auth only — matching the bills-list branch.
 */
export async function compareVersionsAction(
  params: CompareVersionsParams,
): Promise<VersionComparison> {
  const { billId, olderId, newerId } = params;
  await optionalSession.fromAction();

  const { older, newer } = await getVersionHtmlLinks(billId, olderId, newerId);

  return compareVersionHtml({
    olderLabel: older?.label ?? 'older',
    newerLabel: newer?.label ?? 'newer',
    olderUrl: older?.htmlLink ?? null,
    newerUrl: newer?.htmlLink ?? null,
  });
}
```

- [ ] **Step 4: Add the fetch arm's route branch**

In `src/app/api/bills/[id]/route.ts`, add imports:

```ts
import { getBillDetails, getVersionHtmlLinks } from '@/db/queries/bills-read';
import { compareVersionHtml } from '@/services/bill-diff';
```

(replacing the existing `getBillDetails` import line), and replace the body of `GET` with:

```ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);

    // Version-diff branch: /api/bills/[id]?resource=version-diff&olderId=..&newerId=..
    if (url.searchParams.get('resource') === 'version-diff') {
      const olderId = url.searchParams.get('olderId');
      const newerId = url.searchParams.get('newerId');
      if (!olderId || !newerId) {
        return NextResponse.json(
          { error: 'olderId and newerId are required' },
          { status: 400 },
        );
      }
      const { older, newer } = await getVersionHtmlLinks(id, olderId, newerId);
      const comparison = await compareVersionHtml({
        olderLabel: older?.label ?? 'older',
        newerLabel: newer?.label ?? 'newer',
        olderUrl: older?.htmlLink ?? null,
        newerUrl: newer?.htmlLink ?? null,
      });
      return NextResponse.json({ comparison }, { status: 200 });
    }

    const bill = await getBillDetails(id);
    return NextResponse.json({ bill }, { status: 200 });
  } catch (error: any) {
    console.error('Error in bill GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Register the operation in the data-client**

In `src/lib/data-client/bills.client.ts`, add to the imports:

```ts
import type { CompareVersionsParams } from '@/types/legislation';
import type { VersionComparison } from '@/lib/version-diff';
import { compareVersionsAction } from '@/app/actions/bills';
```

Add the fetch arm above `export const billsClient`:

```ts
async function compareVersionsFetch(params: CompareVersionsParams): Promise<VersionComparison> {
  const qs = new URLSearchParams({
    resource: 'version-diff',
    olderId: params.olderId,
    newerId: params.newerId,
  });

  const res = await fetch(`/api/bills/${params.billId}?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to compare versions');
  }
  const data = await res.json();
  return data.comparison as VersionComparison;
}
```

And extend the client registration:

```ts
export const billsClient = defineClient('bills', {
  getBills: { action: getBillsAction, fetch: getBillsFetch },
  updateStatus: { action: updateBillStatusAction, fetch: updateBillStatusFetch },
  compareVersions: { action: compareVersionsAction, fetch: compareVersionsFetch },
});
```

- [ ] **Step 6: Verify both arms typecheck and build**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run build`
Expected: succeeds. This is the step that catches `'use server'` export violations — if it complains about a non-async export in `actions/bills.ts`, the `CompareVersionsParams` interface was declared there instead of in `types/legislation.ts`.

- [ ] **Step 7: Verify the route end-to-end**

Start the dev server (`npm run dev`), then with two real version ids from the same bill:

```bash
psql "postgres://localhost:5432/civtrack_local3?sslmode=disable" -c \
  "select bill_id, id, label from bill_versions where label like 'HB1494%' order by label;"

curl -s "http://localhost:9002/api/bills/<BILL_ID>?resource=version-diff&olderId=<HD1_ID>&newerId=<HD2_ID>" \
  | head -c 600
```

Expected: JSON with `comparison.sections` non-empty, `comparison.error: null`, and `comparison.parseIncomplete: true` for HB1494.

- [ ] **Step 8: Commit**

```bash
git add src/db/queries/bills-read.ts src/types/legislation.ts src/app/actions/bills.ts \
        "src/app/api/bills/[id]/route.ts" src/lib/data-client/bills.client.ts
git commit -m "feat: version-diff query plus action and fetch transport arms"
```

---

### Task 5: The section accordion component

**Files:**
- Create: `src/components/kanban/version-diff-accordion.tsx`

**Interfaces:**
- Consumes: `VersionComparison`, `SectionDiff`, `ChangeFragment` (Task 1); `src/components/ui/accordion.tsx` (exists: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`).
- Produces: `function VersionDiffAccordion({ comparison }: { comparison: VersionComparison })`

Presentational only — no data fetching, no error-state copy (Task 6 owns states). Renders a non-error comparison.

- [ ] **Step 1: Write the component**

Create `src/components/kanban/version-diff-accordion.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import type { ChangeFragment, SectionDiff, VersionComparison } from '@/lib/version-diff';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Hawaii prints bills with deletions struck through and insertions underlined.
// These fragments carry the source document's own marks, so we render the same
// convention. Colour is never the only channel (WCAG 1.4.1): the
// strikethrough/underline is a redundant visual cue and each changed fragment
// also carries a visually-hidden "added"/"removed" label for screen readers.
const FRAGMENT_CLASS: Record<ChangeFragment['kind'], string> = {
  added: 'text-[#2F7A3E] bg-[#E7F4E9] underline decoration-[#2F7A3E]/60',
  removed: 'text-[#B4442F] bg-[#FBEAE6] line-through decoration-[#B4442F]/60',
  modified: 'text-[#8A5A00] bg-[#FBF1DD]',
  unchanged: 'text-foreground/75',
};

const SECTION_BADGE: Record<SectionDiff['kind'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  added: { label: 'added', variant: 'default' },
  removed: { label: 'removed', variant: 'outline' },
  modified: { label: 'modified', variant: 'secondary' },
  unchanged: { label: 'unchanged', variant: 'outline' },
};

const SR_LABEL: Partial<Record<ChangeFragment['kind'], string>> = {
  added: 'added: ',
  removed: 'removed: ',
  modified: 'changed: ',
};

function Fragment({ fragment }: { fragment: ChangeFragment }) {
  const srLabel = SR_LABEL[fragment.kind];
  return (
    <span className={cn('rounded px-0.5', FRAGMENT_CLASS[fragment.kind])}>
      {srLabel && <span className="sr-only">{srLabel}</span>}
      {fragment.text}{' '}
    </span>
  );
}

export function VersionDiffAccordion({ comparison }: { comparison: VersionComparison }) {
  const { changed, unchanged } = useMemo(() => {
    const sections = comparison.sections;
    return {
      changed: sections.filter((s) => s.kind !== 'unchanged'),
      unchanged: sections.filter((s) => s.kind === 'unchanged'),
    };
  }, [comparison.sections]);

  if (comparison.sections.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No differences detected between these versions.
      </p>
    );
  }

  const { totals } = comparison;
  const summaryParts = [
    totals.modified > 0 && `${totals.modified} modified`,
    totals.removed > 0 && `${totals.removed} removed`,
    totals.added > 0 && `${totals.added} added`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-2.5">
      <div className="rounded-md border bg-muted/40 p-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Summary of changes
        </span>
        <p className="mt-1 text-[12.5px] text-foreground/80">
          {comparison.olderLabel} → {comparison.newerLabel}
          {summaryParts.length > 0 ? ` · ${summaryParts.join(' · ')}` : ' · no section changes'}
        </p>
      </div>

      {comparison.parseIncomplete && (
        <p className="flex items-start gap-1.5 px-0.5 text-[11.5px] text-muted-foreground">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Some sections couldn&apos;t be parsed and aren&apos;t shown below.</span>
        </p>
      )}

      {changed.length > 0 && (
        <Accordion type="multiple" className="overflow-hidden rounded-md border">
          {changed.map((section) => {
            const badge = SECTION_BADGE[section.kind];
            return (
              <AccordionItem key={section.sectionNumber} value={section.sectionNumber} className="border-b last:border-b-0">
                {/* min-h-11 keeps the header a >=44px touch target. */}
                <AccordionTrigger className="min-h-11 px-3 py-2 text-left hover:no-underline">
                  <span className="flex flex-1 flex-wrap items-center gap-2 pr-2">
                    <span className="text-[13px] font-semibold">SECTION {section.sectionNumber}</span>
                    <Badge variant={badge.variant} className="h-4 px-1.5 text-[10px]">{badge.label}</Badge>
                    {section.changeCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {section.changeCount} {section.changeCount === 1 ? 'change' : 'changes'}
                      </span>
                    )}
                    {section.presence !== 'both' && (
                      <span className="text-[11px] text-muted-foreground">
                        {section.presence === 'newerOnly'
                          ? `only in ${comparison.newerLabel}`
                          : `only in ${comparison.olderLabel}`}
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  {/* Legislative text is prose — wrap it at a comfortable measure.
                      Fragments render as plain text, never markdown. */}
                  <p className="text-[13px] leading-relaxed">
                    {section.fragments.map((fragment, i) => (
                      <Fragment key={i} fragment={fragment} />
                    ))}
                  </p>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {unchanged.length > 0 && (
        <p className="px-0.5 text-[11.5px] text-muted-foreground">
          {unchanged.length} unchanged {unchanged.length === 1 ? 'section' : 'sections'} not shown
          {' ('}
          {unchanged.map((s) => s.sectionNumber).join(', ')}
          {')'}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. If `AccordionTrigger` rejects the `className` prop, check `src/components/ui/accordion.tsx`'s signature and pass through whatever prop it forwards.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/version-diff-accordion.tsx
git commit -m "feat: section accordion for bill version diffs"
```

---

### Task 6: Wire the timeline Compare button to the panel

**Files:**
- Modify: `src/components/kanban/versions-reports-tab.tsx`
- Modify: `src/components/kanban/bill-versions-panel.tsx`
- Modify: `src/components/kanban/version-compare.tsx` (full rewrite)
- Delete: `src/components/kanban/version-diff-inline.tsx`

**Interfaces:**
- Consumes: `VersionDiffAccordion` (Task 5); `data.bills.compareVersions` (Task 4); `VersionComparison` (Task 1); `sortVersions` from `@/lib/bill-versions` (exists).
- Produces: `VersionsReportsTab` gains a required `billId: string` prop.

The dropdowns compute the diff on selection (unchanged behaviour). The timeline's Compare button **populates the dropdowns**; there is no separate gating press. Both entry points converge on the same `{ olderId, newerId }` state.

- [ ] **Step 1: Rewrite version-compare.tsx**

Replace the whole contents of `src/components/kanban/version-compare.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import type { VersionComparison } from '@/lib/version-diff';
import { data } from '@/lib/data-client';
import { sortVersions } from '@/lib/bill-versions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VersionDiffAccordion } from './version-diff-accordion';

const ERROR_COPY: Record<NonNullable<VersionComparison['error']>, string> = {
  'no-html': 'This version has no source document to compare.',
  'fetch-failed': "Couldn't reach the source document.",
  'parse-failed': "Couldn't read the source document for these versions.",
};

export function VersionCompare({
  billId,
  versions,
  olderId,
  newerId,
  onOlderChange,
  onNewerChange,
}: {
  billId: string;
  versions: BillVersion[];
  olderId: string;
  newerId: string;
  onOlderChange: (id: string) => void;
  onNewerChange: (id: string) => void;
}) {
  const ordered = useMemo(() => sortVersions(versions), [versions]);
  const sameVersion = olderId === newerId;

  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumping this re-runs the effect for Retry without changing the selection.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!billId || !olderId || !newerId || sameVersion) {
      setComparison(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    data.bills
      .compareVersions({ billId, olderId, newerId })
      .then((result) => {
        if (!cancelled) setComparison(result);
      })
      .catch(() => {
        if (!cancelled) {
          setComparison({
            olderLabel: ordered.find((v) => v.id === olderId)?.label ?? 'older',
            newerLabel: ordered.find((v) => v.id === newerId)?.label ?? 'newer',
            sections: [],
            totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
            parseIncomplete: false,
            error: 'fetch-failed',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `ordered` is only read for fallback labels; excluded to avoid refetching
    // when the array identity changes but the selected ids do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, olderId, newerId, sameVersion, attempt]);

  if (ordered.length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Need at least two versions to compare.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <VersionPicker value={olderId} onChange={onOlderChange} versions={ordered} label="Older version" />
        <span className="text-xs font-medium text-muted-foreground">compared with</span>
        <VersionPicker value={newerId} onChange={onNewerChange} versions={ordered} label="Newer version" />
      </div>

      {sameVersion ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Pick two different versions.</p>
      ) : loading ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : comparison?.error ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{ERROR_COPY[comparison.error]}</p>
          {/* Only a fetch failure can succeed on a second try — a missing
              html_link never will, so no Retry is offered there. */}
          {comparison.error === 'fetch-failed' && (
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </Button>
          )}
        </div>
      ) : comparison ? (
        <VersionDiffAccordion comparison={comparison} />
      ) : null}
    </div>
  );
}

function VersionPicker({
  value,
  onChange,
  versions,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  versions: BillVersion[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Lift the pair state into versions-reports-tab.tsx**

Replace the whole contents of `src/components/kanban/versions-reports-tab.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { BillVersionsPanel } from './bill-versions-panel';
import { VersionCompare } from './version-compare';
import { sortVersions } from '@/lib/bill-versions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SECTION_HEAD = 'shrink-0 border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

export function VersionsReportsTab({
  billId,
  versions,
  reports,
}: {
  billId: string;
  versions: BillVersion[];
  reports: CommitteeReport[];
}) {
  const isMobile = useIsMobile();
  const ordered = useMemo(() => sortVersions(versions), [versions]);

  // The selected comparison pair is owned here — the single source of truth for
  // both entry points. The dropdowns set it directly; the timeline's Compare
  // button sets it too (populating the dropdowns), and the diff computes off
  // this state either way.
  const [olderId, setOlderId] = useState('');
  const [newerId, setNewerId] = useState('');
  const [tab, setTab] = useState<Tab>('timeline');

  // Default to introduced-vs-current once versions load, and recover if the
  // selected ids are no longer present.
  useEffect(() => {
    if (ordered.length < 2) return;
    const ids = new Set(ordered.map((v) => v.id));
    if (!ids.has(olderId)) setOlderId(ordered[0].id);
    if (!ids.has(newerId)) setNewerId(ordered[ordered.length - 1].id);
  }, [ordered, olderId, newerId]);

  const handleCompare = useCallback(
    (nextOlderId: string, nextNewerId: string) => {
      setOlderId(nextOlderId);
      setNewerId(nextNewerId);
      // On mobile the panels are sub-tabs, so without this the tap looks inert.
      setTab('compare');
    },
    [],
  );

  const timeline = (
    <div className="flex min-h-0 flex-1 flex-col">
      <BillVersionsPanel
        versions={versions}
        reports={reports}
        selectedOlderId={olderId}
        selectedNewerId={newerId}
        onCompare={handleCompare}
      />
    </div>
  );

  const compare = (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-4">
      <VersionCompare
        billId={billId}
        versions={versions}
        olderId={olderId}
        newerId={newerId}
        onOlderChange={setOlderId}
        onNewerChange={setNewerId}
      />
    </div>
  );

  // Mobile: sub-tabs (two scroll regions side by side don't fit at 375px).
  if (isMobile) {
    return <MobileTabs tab={tab} onTabChange={setTab} timeline={timeline} compare={compare} />;
  }

  // Desktop: side-by-side sections — Timeline (left) | Compare (right, wider
  // for the diff). Each scrolls independently.
  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-[42%] min-h-0 flex-col border-r">
        <h3 className={SECTION_HEAD}>Timeline</h3>
        {timeline}
      </section>
      <section className="flex w-[58%] min-h-0 flex-col">
        <h3 className={SECTION_HEAD}>Compare versions</h3>
        {compare}
      </section>
    </div>
  );
}

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function MobileTabs({
  tab,
  onTabChange,
  timeline,
  compare,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  timeline: React.ReactNode;
  compare: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Versions views" className="flex shrink-0 gap-4 border-b px-4">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onTabChange(id)}
              className={cn(
                '-mb-px border-b-2 py-2 text-sm font-medium transition-colors',
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {tab === 'timeline' ? timeline : compare}
    </div>
  );
}
```

- [ ] **Step 3: Add the Compare button and selected marking to the timeline**

In `src/components/kanban/bill-versions-panel.tsx`:

1. Remove the `VersionDiffInline` import (line 10) and add `GitCompare` to the `lucide-react` import (line 11).

2. Change the component signature (line 45) to:

```tsx
export function BillVersionsPanel({
  versions,
  reports,
  selectedOlderId,
  selectedNewerId,
  onCompare,
}: {
  versions: BillVersion[];
  reports: CommitteeReport[];
  selectedOlderId: string;
  selectedNewerId: string;
  onCompare: (olderId: string, newerId: string) => void;
}) {
```

3. Replace the `VersionDiffInline` block (lines 147-151) with nothing — the inline diff is gone.

4. Inside the timeline `<li>`, mark the active row and add the button. Replace the `<li ...>` opening tag and the header row (lines 130-139) with:

```tsx
                const isSelected =
                  selectedNewerId === group.version.id && previous?.id === selectedOlderId;
                return (
                  <li
                    key={group.version.id}
                    className={cn(
                      'relative rounded-md transition-colors',
                      isSelected && 'bg-primary/5 ring-1 ring-primary/25 -mx-2 px-2 py-1.5',
                    )}
                    aria-current={isSelected ? 'true' : undefined}
                  >
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{group.version.label}</span>
                        {isBase && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">introduced</Badge>}
                        {isLatest && <Badge variant="default" className="h-4 px-1.5 text-[10px]">current</Badge>}
                        {isSelected && (
                          <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[10px]">
                            <GitCompare className="h-2.5 w-2.5" aria-hidden="true" /> comparing
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* The base version has no predecessor, so nothing to compare against. */}
                        {previous && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCompare(previous.id, group.version.id)}
                            className="h-7 gap-1 px-1.5 text-xs text-primary hover:bg-transparent hover:text-primary/80"
                          >
                            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                            Compare
                            <span className="sr-only"> {group.version.label} with {previous.label}</span>
                          </Button>
                        )}
                        <LinkButtons link={group.version.pdfLink} type="version" />
                      </div>
                    </div>
```

5. Add `cn` to the imports: `import { cn } from '@/lib/utils';`

- [ ] **Step 4: Pass billId from the dialog**

In `src/components/kanban/bill-details-dialog.tsx`, both call sites (lines 600 and 645) become:

```tsx
<VersionsReportsTab billId={billID} versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
```

Note the identifier is `billID` (capital I-D) — the dialog's own prop, destructured at line 81. Do not use `bill.id`: `bill` is a `useMemo` lookup that can be `undefined` while the bills list loads, whereas `billID` is always present.

- [ ] **Step 5: Delete the inline diff component**

```bash
git rm src/components/kanban/version-diff-inline.tsx
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck` — expected: clean.
Run: `npm test` — expected: all pass.
Run: `npm run build` — expected: succeeds.

- [ ] **Step 7: Manual check in the browser**

`npm run dev`, open a bill with several versions (HB1494 has six), Versions & Reports tab:

1. Clicking **Compare** on a timeline row updates both dropdowns in the right panel to that version and its predecessor, and the accordion reloads.
2. That timeline row shows the "comparing" badge and the tinted background.
3. Expanding a section shows struck-through deletions and underlined insertions.
4. HB1494 shows the "Some sections couldn't be parsed" note.
5. Changing a dropdown directly still recomputes.
6. At 375px width the panels are sub-tabs and tapping Compare switches to the Compare tab.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/kanban
git commit -m "feat: timeline Compare drives the version-compare dropdowns"
```

---

### Task 7: Full verification pass

**Files:** none created; verification and any fixes surfaced.

- [ ] **Step 1: Confirm the dead code is fully gone**

Run:

```bash
grep -rn "diffVersions\|DIFF_ROW_CLASS\|DiffRow\|version-diff-inline" src || echo "clean"
```

Expected: `clean`. Any hit is a leftover reference to the removed line-diff machinery.

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: all pass, including the new `version-diff` and fixture tests.

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 4: Confirm the diff quality against the measured baseline**

Run:

```bash
npx vitest run src/lib/__tests__/version-diff-fixtures.test.ts --reporter=verbose
```

Expected: the HB1494 HD1→HD2 case reports fewer than 30 sections with at least one struck and one underlined fragment — versus the 134-removed/216-modified noise the old line path produced.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: verification pass on version comparison rework"
```

(Skip if nothing changed.)

---

## Self-Review Notes

**Spec coverage:** Data flow → Tasks 2, 3, 4. Diff shape and alignment → Task 1. Timeline wiring → Task 6. Accordion → Task 5. States table → Task 6 (`ERROR_COPY`, loading, same-version, <2 versions) and Task 5 (`parseIncomplete`, no-changes, unchanged-sections roll-up). Testing section → Tasks 1 and 3. Files list → all covered; `src/app/api/bills/[id]/route.ts` extends the existing route per CLAUDE.md rather than adding one.

**Deviation from the spec, deliberate:** the spec listed `CompareVersionsParams` implicitly alongside the action, but `'use server'` files may only export async functions, so Task 4 Step 2 declares it in `src/types/legislation.ts`. Task 4 Step 6 calls out the build error that appears if this is done wrong.

**Known open question flagged in the spec** (not resolved by this plan): whether `parseIncomplete` deserves more prominence than an inline note. Task 5 implements the inline note as specified; changing it is a one-line edit in `version-diff-accordion.tsx`.
