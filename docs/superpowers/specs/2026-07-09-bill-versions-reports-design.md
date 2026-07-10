# Bill Versions & Committee Reports — Design

**Date:** 2026-07-09
**Status:** Approved (pending spec review)

## Problem

The Bill Details dialog surfaces description, status updates, tags, and the
status-change control, but nothing about the bill's **draft versions**
(HB139 → HD1 → HD2 → SD1) or its **committee reports** (HSCR65, SSCR1197, …).
That data now exists in the local database (`bill_versions`,
`committee_reports`, migration `000022`) but was not exposed in the app:

- The generated Kysely types were stale — regenerated via `npm run codegen`
  so `BillVersions` and `CommitteeReports` interfaces now exist in
  `src/db/types.ts`.
- The `BillDraft` type in `src/types/legislation.ts` was defined but never
  populated; it is superseded by the real DB-backed shapes.

The dialog also carries a stray **AI Update button** in the status-change bar
that clutters the primary action.

## Goals

1. Remove the AI Update button from the dialog's status-change bar.
2. Add a **Versions & Reports** view to the dialog that:
   - surfaces the **most recent version + most recent committee report + AI
     summary** prominently ("Latest" card),
   - shows a **vertical timeline of versions with committee reports nested
     under the version they belong to**,
   - offers, per entry, **HTML/PDF links + an inline full-text viewer + an AI
     summary slot** (summary shown when present; graceful "no summary yet"
     otherwise, since `ai_summary` is null in the current seed).
3. Work well on mobile as its own tab.

## Data (as seeded — verified against `civtrack_local3`)

`bill_versions`: `label` (e.g. `HB139`, `HB139_SD1`, `HB139_HD2`),
`html_link`, `pdf_link`, `original_text` (~7–9k chars of full bill text),
`ai_summary` (**null in seed**), `created_at`.

`committee_reports`: `label` (e.g. `HB139_HD1_HSCR65`), `report_code`
(e.g. `HSCR65`), `html_link`, `pdf_link`, `original_text` (~2–4k chars),
`ai_summary` (**null in seed**), `created_at`.

Links point to `data.capitol.hawaii.gov/sessions/session2025/bills/…`.

**Version ↔ report relationship:** a report label embeds its version segment —
`HB139_HD1_HSCR65` belongs to the `HB139_HD1` version. Grouping is done by
parsing that segment.

## Layout Decision

**Chosen: tabbed right panel.** The dialog keeps its two-panel split; the
left panel (Details, tags, status control) stays permanently visible as
context. The right panel gets tabs: **Activity | Versions & Reports**.

Rejected alternatives:
- *Third column* — at 1024px each of three columns is ~340px, too tight to read
  bill text or a timeline.
- *Top-level dialog tabs* — would hide the bill Details behind a tab, removing
  the anchor context users want while reading versions.

The desktop dialog widens modestly (`sm:max-w-6xl` → `sm:max-w-7xl`) so both
panels breathe with the richer right-side content.

## The Versions & Reports Panel

Two zones, top to bottom (critical-info-first, then progressive disclosure):

### Zone A — "Latest" card (pinned at top)

Compact card surfacing what the user asked to see first:
- most recent **version** (latest by `created_at`) with its label + HTML/PDF
  links,
- its **AI summary** (`ai_summary` when present; muted "No summary yet — full
  text available below" otherwise),
- most recent **committee report** with label/`report_code` + HTML/PDF +
  "Read text".

### Zone B — Version timeline (reports nested)

Vertical timeline, one node per version in chronological order. Each node:
- version label (base version marked "introduced"; latest marked "current"),
- HTML / PDF buttons + a "▸ Read text" disclosure,
- nested beneath it, its committee reports (label/`report_code` + HTML/PDF +
  "▸ Read report").

Reports whose version segment matches no known version fall into an **"Other
reports"** group at the bottom — no data is dropped silently.

### Inline text viewer

"Read text" / "Read report" expands the entry in place, rendering
`original_text` in a monospace, vertically scrollable, `max-h` block
(bill text is preformatted). Collapsed by default to keep the timeline
scannable; the current/latest version may default to expanded.

## Mobile

The mobile dialog already renders full-screen with `Details | Activity` tabs.
Add a third tab → `Details | Activity | Versions` (`grid-cols-3`). The Latest
card + timeline stack and scroll vertically. All link/disclosure targets are
sized ≥44×44px for touch.

## Components & Data Flow

Following CLAUDE.md navigation rules (queries in `db/queries`, pure logic in
`lib`, no inline `db.*` in routes/actions, one fetch):

1. **`src/db/queries/bills-read.ts`** — `getBillVersionsAndReports(billId)`
   returns `{ versions, reports }` ordered by `created_at`. Called from within
   `getBillDetails` so the data arrives in the **existing single fetch** — no
   extra round-trip.
2. **`src/db/queries/bill-mappers.ts`** — mappers DB row → client
   `BillVersion` / `CommitteeReport`.
3. **`src/types/legislation.ts`** — add client `BillVersion` and
   `CommitteeReport` types; extend `BillDetails` to carry
   `versions: BillVersion[]` and `reports: CommitteeReport[]`. Remove/deprecate
   the unused `BillDraft` type.
4. **`src/lib/bill-versions.ts`** (pure, DB-free) —
   `parseVersionFromReportLabel(label)` and
   `groupReportsByVersion(versions, reports)`. Mirrors how `derived-status.ts`
   keeps its algorithm pure and unit-testable.
5. **`src/lib/__tests__/bill-versions.test.ts`** — unit tests for the pure
   parsing/grouping (matching, unmatched → "Other", base-version handling).
6. **`src/components/kanban/bill-versions-panel.tsx`** — the Latest card +
   timeline + inline viewer. Imported by the dialog into the new tab.
7. **`src/components/kanban/bill-details-dialog.tsx`** — remove
   `AIUpdateSingleButton` from the status bar; add the right-panel tabs
   (desktop) and third mobile tab; widen to `sm:max-w-7xl`.

## Error / Empty States

- Bill with no versions and no reports → empty state in the panel
  ("No versions or reports available yet") consistent with the existing
  "No status updates" empty state.
- `original_text` null → hide the "Read text" disclosure for that entry.
- `html_link` / `pdf_link` null → hide that individual button.

## Testing

- Pure unit tests for `bill-versions.ts` (parsing + grouping), per the
  "pure logic only" test convention.
- `npm run typecheck` and `npm run build` (build catches `'use server'`
  export violations).

## Open Items (confirm later)

- **Version↔report ordering / matching semantics** — string-based segment
  matching is built defensively now (unmatched → "Other reports"). The exact
  ordering of the timeline and the precise base-version matching rule are to be
  confirmed against real (non-seed) data later.
- **AI summaries** — `ai_summary` is null in seed; the UI has the slot ready.
  Populating summaries is out of scope for this change.
