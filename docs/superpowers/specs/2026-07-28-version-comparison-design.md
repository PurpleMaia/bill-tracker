# Version Comparison Rework — Design

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation planning
**Supersedes the diff portions of:** `2026-07-09-bill-versions-reports-design.md`

## Problem

Two independent problems in the Versions & Reports tab.

### 1. The diff output is wrong

`bill_versions.original_text` stores whitespace-collapsed plain text — **one giant
line with zero newlines**. Verified against the local database:

```
label                 len    newlines
SB2374                6560   0
SB2374_SD1            6585   0
HB1494_HD1           17822   0
HB1494_HD2           10514   0
```

`hawaii-bill-diff`'s `compareBills` is line-based. Fed two single-line documents
it reports "1 line modified" (or, when it sees Word metadata, hundreds of bogus
line changes). Measured on HB1494 HD1→HD2:

| Function | Result |
|---|---|
| `compareBillsFromHtml` (line-based) | 0 added, **134 removed, 216 modified**, 34 unchanged — noise |
| `compareBillContent` (section-based) | 12 sections, **9 real changes**, per-word formatting flags |

The stored text cannot be repaired by splitting — the sentence and paragraph
boundaries are gone. The source HTML must be parsed instead.

### 2. The timeline's diff link is in the wrong place

Each timeline row has a `Diff vs <label>` button that expands an inline
single-column diff (`version-diff-inline.tsx`), duplicating the Compare panel
that already sits beside it on desktop. Two diff renderers, two visual
languages, and the panel the user is looking at doesn't respond to the timeline.

## Findings that constrain the design

Established by probing the real corpus and live capitol.hawaii.gov documents.
These are load-bearing — several contradict reasonable first assumptions.

1. **`html_link` is populated and fetchable.** Every version row has one, e.g.
   `https://data.capitol.hawaii.gov/sessions/session2025/bills/HB1494_HD1_.HTM`.
   HTTP 200, ~60–96 KB. Some labels 404 (`HB1494_CD1`, `SB2575_SD2`) — the link
   column can point at documents that do not exist.

2. **The HTML is windows-1252, not UTF-8.** `file` reports ISO-8859 with CRLF.
   A naive UTF-8 read mangles en-dashes and curly quotes. Decoding must be
   explicit.

3. **Amendment marks ARE present, but not as `<strike>`/`<u>`.** Grepping for
   `<strike`, `line-through`, or `text-decoration:underline` returns **zero**
   hits; the only literal `<u>` tags are appropriations-table column headers.
   Nevertheless `parseBillHtml` extracts **52 strikethrough and 47 underline**
   elements from HB1494_HD1 — the package's parser knows the Word-export
   encoding of these marks. Do not re-derive this with regexes; use the package.

4. **`compareBillContent` yields true amendment semantics.** Sample from
   section 4, HD1→HD2:

   ```
   [unchanged]          "SECTION 4. The director of finance is authorized…"
   [removed/strike]     "or constructing"
   [modified]           "the"
   [unchanged]          "stadium"
   [added/underline]    "the university of Hawaii at Manoa campus"
   ```

   Formatting-flagged fragments per pair: 61 (HD1→HD2), 92 (HD1→SD1),
   44 (HB235 HD1→CD1).

5. **Section parsing is heuristic and lossy.** Every document logs
   `"No sections found with primary regex, trying alternative approach..."`.
   Recovered section numbers are non-contiguous:

   ```
   HB1494_HD1 → 1,2,3,4,5,6,9,13,14,15,16,17
   HB1494_HD2 → 1,2,3,4,5,6,9,12,13,14,15
   ```

   Sections 7, 8, 10, 11 are dropped from both. **Consequence:** aligning by
   position would compare HD1 §13 against HD2 §12 and report both as rewritten.
   HD1→HD2 already mislabels §12 as "added" purely because HD1's parse missed
   it. Alignment must key on section number.

6. **Change volume is uneven.** 4–13 sections per comparison, but up to **95
   fragments in a single section**. Expanding everything by default is
   unreadable.

7. **`parseBillHtml(...).text` leads with Word metadata** — author, template
   filename, timestamps, word counts. Never render `.text`; render `sections`.

8. **Text can contain markdown-active artifacts.** One observed fragment is
   `"1.~~"`. Fragments must render as plain text.

9. **The package resolves only via its ESM entry.** `package.json` points
   `main`/`require` at a nonexistent `dist/index.js`; only `dist/index.es.js`
   and `dist/index.cjs.js` ship. The existing note in `bill-diff.ts` stands.

## Approach

Fetch the source HTML server-side on demand, cache it, and diff with
`compareBillContent`. No migration.

Rejected: **adding an `original_html` column.** It is the faster runtime path
but requires a migration plus a backfill, and the ingest process that writes
`original_text` lives outside this app — new versions would silently arrive with
a null column. Fetch-on-demand needs no coordination and is always current. The
service boundary below keeps that swap to one file if fetching proves too slow.

Rejected: **owning the diff algorithm.** Considered because `compareBills`
returns `modified` as a formatted string (`Line N: "old" → "new"`) that today's
code regex-parses apart. But `compareBillContent` returns structured sections
with formatting flags — a real API, not a string contract — and reproducing the
Word-export strikethrough extraction (finding 3) would be significant work with
worse fidelity.

## Architecture

```
Client: VersionCompare (olderId, newerId)
  → data.bills.compareVersions({ billId, olderId, newerId })    [data-client]
    → action arm + fetch arm (identical params, identical return)
      → db/queries/bills-read: html_link for both version ids
      → services/bill-html.ts:  fetch + windows-1252 decode      [cached]
      → services/bill-diff.ts:  compareBillContent(html1, html2)
      → lib/version-diff.ts:    normalize → VersionComparison    [pure]
```

Per CLAUDE.md: the query lives in `db/queries`, the third-party and network
wrappers in `services/`, the pure normalization in `lib/` (unit-testable), and
the client calls `data.*` — never raw `fetch`.

### Why server-side

capitol.hawaii.gov sends no CORS headers, so the browser cannot fetch these
documents. Server-side also allows a shared cache and keeps ~90 KB × 2 of HTML
off the client.

### New: `src/services/bill-html.ts`

```ts
/** Fetch a capitol.hawaii.gov bill document and decode it correctly. */
export async function fetchBillHtml(url: string): Promise<string>
```

- Fetch as `ArrayBuffer`; decode via `new TextDecoder('windows-1252')`
  (finding 2).
- Module-level `Map<string, string>` cache keyed by URL. Published bill text is
  immutable, so entries never need invalidation within a process.
- Timeout (10s) and a non-2xx guard — `html_link` can 404 (finding 1).
- Throws typed errors the caller maps to `error` codes below.

### Rewritten: `src/services/bill-diff.ts`

Keeps the ESM-only import note (finding 9). Calls `compareBillContent`,
suppresses the package's `console.log` chatter (finding 5) so it does not spam
server logs, and hands raw output to the normalizer. Deleted from this file:
`compareBills`, `DiffRow`, `parseModified`, `MODIFIED_RE`, `toBillData`,
`DIFF_ROW_CLASS`.

Diff results memoized per `(olderId, newerId)` — the expensive part is parsing,
not fetching, and users toggle back and forth between pairs.

### New: `src/lib/version-diff.ts` (pure)

```ts
type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

interface ChangeFragment {
  kind: ChangeKind;
  text: string;
  struck: boolean;      // formatting.strikethrough — Hawaii's deletion mark
  underlined: boolean;  // formatting.underline    — Hawaii's insertion mark
}

interface SectionDiff {
  sectionNumber: string;   // '4', '12' — the alignment key, never an index
  kind: ChangeKind;        // section-level verdict
  changeCount: number;     // non-unchanged fragments; drives the collapsed row
  fragments: ChangeFragment[];
  presence: 'both' | 'olderOnly' | 'newerOnly';
}

interface VersionComparison {
  olderLabel: string;
  newerLabel: string;
  sections: SectionDiff[];   // sorted numerically by sectionNumber
  totals: { added: number; removed: number; modified: number; unchanged: number };
  parseIncomplete: boolean;
  error: 'no-html' | 'fetch-failed' | 'parse-failed' | null;
}
```

**Alignment rule (the correctness core).** Match sections by `sectionNumber`
across the two parses. Unmatched → `presence: 'olderOnly' | 'newerOnly'`. Sort
**numerically**, so `'12'` follows `'9'` — string sort would order it before.
Never align by array position (finding 5).

**`parseIncomplete`** is true when either parse yields a non-contiguous section
sequence, i.e. sections were dropped. Surfaced in the UI rather than hidden: a
missing section must not read as an unchanged one.

## UI

### Timeline → Compare wiring

The selected pair lifts into `versions-reports-tab.tsx` as the single source of
truth:

```
VersionsReportsTab  ── state: { olderId, newerId }
  ├── BillVersionsPanel   (onCompare)                 ← left,  42%
  └── VersionCompare      (olderId, newerId, setters) ← right, 58%
```

Each timeline row's button is relabeled **Compare** (from `Diff vs <label>`) and
calls `onCompare(previous.id, version.id)` — the clicked version becomes
*newer*, its immediate predecessor *older*.

**The timeline's Compare populates the dropdowns; the dropdowns compute the
diff.** There is no separate gating press. Both entry points converge on the
same `(olderId, newerId)` state and the same on-selection compute path, which is
how the dropdowns already behave today. The dropdowns remain independently
usable for non-adjacent comparisons (introduced vs current) that timeline links
cannot express.

Details:

- **Selected row is marked** with `aria-current="true"` and a chip/medallion
  treatment — not a colored left border (per project convention). Without it, a
  click sends its effect to another panel with no acknowledgement at the click
  site.
- **Mobile switches sub-tabs.** Below 1024px the panels are sub-tabs, so
  `onCompare` also flips to Compare; otherwise the tap appears inert. Returning
  to Timeline preserves the selection.
- The first timeline row (base version) has no predecessor and shows no Compare
  button.

### The accordion

Replaces the two-column monospace grid, which existed only because a line diff
had nothing better to show. Built on the existing `src/components/ui/accordion.tsx`
(Radix — keyboard nav and ARIA come free).

```
┌─────────────────────────────────────────────────────┐
│ Summary of changes                                  │
│ 6 sections modified · 2 removed · 1 added           │
├─────────────────────────────────────────────────────┤
│ ▸  SECTION 4    modified · 11 changes               │
│ ▸  SECTION 6    modified · 54 changes               │
│ ▾  SECTION 12   added                               │
│      SECTION 12. The director of finance…           │
│      ̶o̶r̶ ̶c̶o̶n̶s̶t̶r̶u̶c̶t̶i̶n̶g̶  the stadium on                   │
│      ̲t̲h̲e̲ ̲u̲n̲i̲v̲e̲r̲s̲i̲t̲y̲ ̲o̲f̲ ̲H̲a̲w̲a̲i̲i̲ ̲a̲t̲ ̲M̲a̲n̲o̲a̲ ̲c̲a̲m̲p̲u̲s̲          │
│ ▸  SECTION 16   removed                             │
├─────────────────────────────────────────────────────┤
│    4 unchanged sections                             │
└─────────────────────────────────────────────────────┘
```

- **Collapsed by default**, changed sections first in document order (finding 6).
- Unchanged sections collapse into one summary row at the bottom.
- **Amendment marks carry the meaning**, mirroring how Hawaii prints bills:
  deletions struck through in the red family, insertions underlined in the green
  family, unchanged text plain. Because the marks come from the source document,
  the rendering matches the official text.
- **Accessibility:** colour is never the sole channel (WCAG 1.4.1) — the
  strikethrough/underline is the redundant visual cue, plus a visually-hidden
  "added"/"removed" label per fragment for screen readers. Accordion headers are
  ≥44 px touch targets.
- **Prose, not monospace.** Legislative text is prose; it wraps at a comfortable
  measure.
- **Fragments render as plain text**, never markdown (finding 8). Truncation
  applies to collapsed previews only, never to expanded bodies.

### States

| State | Treatment |
|---|---|
| Loading | Skeleton rows — a cold pair is two ~90 KB fetches plus parse |
| Same version in both dropdowns | "Pick two different versions." |
| Fewer than 2 versions | "Need at least two versions to compare." |
| `error: 'no-html'` | "This version has no source document to compare." |
| `error: 'fetch-failed'` | "Couldn't reach the source document." + Retry |
| `error: 'parse-failed'` | "Couldn't read the source document for these versions." |
| `parseIncomplete` | Quiet inline note above the list: "Some sections couldn't be parsed and aren't shown." |
| No changes | "No differences detected between these versions." |

Responsive: side-by-side ≥1024px, sub-tabs below. Dropping the two-column grid
means the 58% panel comfortably fits prose at 1024px.

## Files

**New**
- `src/services/bill-html.ts` — fetch + windows-1252 decode + URL cache
- `src/lib/version-diff.ts` — pure normalization and section alignment
- `src/components/kanban/version-diff-accordion.tsx` — the accordion
- `src/lib/__tests__/version-diff.test.ts` — normalization and alignment tests
- HTML fixtures for HB1494_HD1 / HD2 / SD1 and HB235_HD1 / CD1

**Modified**
- `src/services/bill-diff.ts` — rewritten around `compareBillContent`
- `src/db/queries/bills-read.ts` — fetch `html_link` pair by version ids
- `src/app/actions/bills.ts` — the action arm (`compareVersionsAction`)
- `src/app/api/bills/[id]/route.ts` — the fetch arm; extends the existing
  per-bill route rather than adding a new one (CLAUDE.md: do not delete or
  duplicate existing routes)
- `src/lib/data-client/bills.client.ts` — register `compareVersions`
- `src/components/kanban/versions-reports-tab.tsx` — owns the pair state
- `src/components/kanban/bill-versions-panel.tsx` — Compare button, selected row
- `src/components/kanban/version-compare.tsx` — renders the accordion. Note the
  contract change: today it computes the diff synchronously inside `useMemo`;
  the new path is async (network + parse), so it gains loading and error state.

**Deleted**
- `src/components/kanban/version-diff-inline.tsx`
- `src/lib/__tests__/bill-diff.test.ts` assertions covering the removed
  `DiffRow`/`parseModified` path (rewritten against the new shape)

## Testing

Pure unit tests in `src/lib/__tests__/` per project convention:

- **Section alignment:** given HD1's `1,2,3,4,5,6,9,13,…` and HD2's
  `1,2,3,4,5,6,9,12,…`, §13 aligns with §13 and §12 is `newerOnly` — never
  §13-vs-§12.
- **Numeric sort:** `'12'` sorts after `'9'`.
- **`parseIncomplete`** true for a gapped sequence, false for contiguous.
- **Fragment mapping:** `formatting.strikethrough` → `struck`, `underline` →
  `underlined`; kinds map correctly.
- **Totals** match the section verdicts.
- **Empty/whitespace text** and the `"1.~~"` artifact survive as literal text.

Fixture-backed tests over the committed HTML confirm the real corpus produces
the measured section counts, so a package upgrade that changes parsing fails
loudly.

Not unit-tested (no DB, no network in tests per convention): the fetch/decode
path and the transport arms. Verified manually against the three probed pairs.

## Out of scope

- Migrating `original_text` or adding `original_html`. Revisit only if
  fetch-on-demand measures too slow.
- Fixing the package's lossy section regex (findings 5) — upstream concern; we
  disclose the gap instead.
- Committee-report diffing. Same machinery would apply; not requested.
- AI summaries of diffs. The existing `SummarySection` is untouched.
