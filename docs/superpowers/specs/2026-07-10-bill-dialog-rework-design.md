# Bill Dialog Rework — Briefing, Committees, Versions/Compare — Design

**Date:** 2026-07-10
**Status:** Approved (pending spec review)

## Problem

The bill details dialog now has a Versions & Reports tab (timeline + per-item
"Read text"/"Summarize" affordances). The user wants a larger rework:

1. An **AI "Bill Briefing"** — one synthesized summary of bill details + latest
   version + what committees are reporting, plus **suggested next steps**.
2. **Version diffs** — see text differences between drafts.
3. **Per-version and per-report AI summaries** — separately summarizable.
4. **A "Compare" view** — pick any two versions, see side-by-side differences,
   optionally AI-summarize the changes.
5. **Committee chair/member contacts** (future feature) — UI shell now.

## Build Scope (important)

- **AI is OPTIONAL and STUBBED** this pass: the briefing's "Summarize with AI",
  per-version/report summaries, and the compare "summarize changes" show real
  loading/result UX with clearly-labeled placeholder output. The briefing's
  core content is DERIVED (no AI) and always shown. Wiring to the Genkit LLM
  service is a follow-up. (No committee AI-draft this pass.)
- **Version diffs are REAL**, computed via the `hawaii-bill-diff` npm package
  (installed via pnpm — the repo's package manager). Diff input is the stored
  `original_text` of each version (no network fetch needed).
- **Committee contacts are a plain directory** (UI shell) with placeholder
  member data (name, role). NO "Draft note with AI" and NO email/mailto
  affordances this pass — just the list. Those are follow-ups.
- **The Bill Briefing works WITHOUT AI.** It derives almost everything it shows
  from data the app already computes (testimony eligibility/urgency, next
  deadline, latest version, committee/report counts, fiscal flag, dead state).
  AI is an OPTIONAL enhancement layered on top — a user who opts out of AI still
  gets a genuinely useful briefing.

## Layout

Keep the current dialog style (full-screen mobile, `sm:max-w-7xl` desktop,
shared header with bill number + progress bar). Introduce **two top-level
tabs** below the header:

### Tab 1 — Overview (default): left/right split

- **Left panel (~55%, scrolls as one column), stacked top→bottom:**
  1. **Bill Briefing** — a **derived (no-AI-required)** card. It computes and
     surfaces, from existing data:
     - **Action prompt** — if testimony is open, "Testimony is open — submit
       before the hearing" (urgent styling when a hearing is imminent); if
       closed, why. From `getTestimonyEligibility` / `isTestimonyUrgent`.
     - **Where it stands** — current stage/status, dead reason or next deadline
       (with days-away + tier), fiscal flag. From `getNextDeadline` /
       `getDeadlineTier` / `isBillDead` / `isFiscalBill`.
     - **Latest version** — the most recent version label + link. From
       `sortVersions(bill.versions)`.
     - **Committee activity** — assigned-committee codes + count of committee
       reports. From `parseCommitteeCodes` / `bill.reports`.
     - **Suggested next steps** — derived action rows (e.g. Write testimony →
       when open; Compare latest two drafts → when ≥2 versions; Review reports).
     On top of this, an **optional** "✦ Summarize with AI" affordance adds a
     narrative lede (stubbed). Everything above the AI line renders with no AI
     call, so opting out of AI still yields a full briefing.
  2. **Details** — description, introducers, tags (the current left-panel
     metadata).
  3. **Committees** — one block per assigned committee (parsed from
     `committee_assignment`, e.g. "AGR, FIN"): committee code + full name and
     its chair/vice/members (name + role). A plain directory — NO email/mailto,
     NO AI-draft this pass. Placeholder member data.
  - The existing dead/deadline alert stays at the top of the left panel; the
    status-change bar stays pinned at the bottom.
- **Right panel (~45%, its own independent scroll):** **Status Updates** —
  unchanged from today. Independent scroll so a long list never crowds the
  left.

### Tab 2 — Versions & Reports: full dialog width

Two **sub-tabs**:

- **Timeline** (default) — the current timeline, but **current version on top**
  (reverse-chronological; oldest/introduced at the bottom). Each version:
  Read text, **Diff vs previous** (inline, computed by `hawaii-bill-diff`),
  **✦ Summarize** (stubbed). Reports nest under their version, each with Read
  report + **✦ Summarize** (stubbed).
- **Compare** — two version pickers ("compare X with Y"), a **✦ Summarize
  changes** button (stubbed AI), and a **side-by-side two-column diff** (older
  draft left, newer right; aligned add/remove/modify highlighting from
  `hawaii-bill-diff`). On mobile the two columns stack.

### Mobile

Two tabs become the top nav. Overview stacks: Briefing → Details → Committees →
Status Updates. Versions & Reports: sub-tabs persist; Compare columns stack.

## Visual Language

- **Olive** (`--olive`/`--olive-dark`) marks the OPTIONAL AI features (the
  briefing's "Summarize with AI", per-version/report "Summarize", compare
  "Summarize changes") — distinct from the **teal** primary actions. Derived
  (non-AI) content uses the normal palette.
- Diffs use **semantic** add-green / remove-red, separate from brand colors.

## Data & Components

Following CLAUDE.md rules (queries in `db/queries`, pure logic in `lib`, no
inline `db.*` in routes/actions, one fetch):

Existing (from prior work, reused):
- `getBillDetails` already returns `versions` + `reports` on `BillDetails`.
- `groupReportsByVersion` / `sortVersions` in `lib/bill-versions.ts`.

New external-integration wrapper (in `services/`, per CLAUDE.md — third-party
package wrappers live in `src/services/`, not `src/lib/`):
- `src/services/bill-diff.ts` — wraps the `hawaii-bill-diff` package. A **plain
  (non-`'use server'`) module** in the style of `services/email.ts`, so the
  client Compare/Timeline components import and run it directly (the package is
  synchronous and pure for our plain-text path — no network, no server-action
  boundary needed). Exports `diffVersions(older: BillVersion, newer:
  BillVersion): VersionDiff`, where `VersionDiff` is a normalized, UI-ready
  shape (aligned rows with `type: 'add'|'del'|'context'|'modified'`). Feeds the
  package each version's `original_text` as `content`; catches package errors
  and returns a diff with an `error` flag. Unit-tested (pure transformation of
  the package output — the package itself is deterministic on given input).

New pure logic:
- `src/lib/bill-briefing-facts.ts` — `deriveBriefingFacts(bill, today)` — a
  PURE function that assembles the briefing's derived facts (action prompt,
  where-it-stands, latest version, committee activity, next steps) from
  existing helpers (`getTestimonyEligibility`, `isTestimonyUrgent`,
  `getNextDeadline`/`getDeadlineTier`, `isFiscalBill`, `sortVersions`,
  `parseCommitteeCodes`). No DB, no AI. Unit-tested. This is what lets the
  briefing render fully without any AI call.

New components (all under `src/components/kanban/`):
- `bill-briefing.tsx` — the Briefing card. Renders `deriveBriefingFacts(...)`
  with no AI call; adds an OPTIONAL "✦ Summarize with AI" affordance (stubbed)
  for a narrative lede. Consumes `BillDetails`.
- `committee-contacts.tsx` — the Committees directory block. Parses
  `committee_assignment` into codes and renders placeholder members (name +
  role) as a plain list. NO copy/mailto, NO AI-draft this pass. A
  `lib/committees.ts` pure helper provides `parseCommitteeCodes(assignment)`
  and a static `COMMITTEE_DIRECTORY` placeholder map (code → full name +
  members).
- `version-compare.tsx` — the Compare sub-tab: two pickers + side-by-side diff
  + stubbed summarize.
- `version-diff-inline.tsx` — the inline "Diff vs previous" block for the
  Timeline.
- Refactor `bill-versions-panel.tsx` → the Timeline sub-tab (reverse order),
  and add a small `versions-reports-tab.tsx` that hosts the Timeline/Compare
  sub-tabs.
- Refactor `bill-details-dialog.tsx` into the two top-level tabs
  (Overview split + Versions & Reports), moving today's left/right content into
  the new Overview arrangement.

Stub AI lives in one place: `src/components/kanban/ai-stub.ts` —
`stubSummarize(text)` and `stubBriefingNarrative(bill)` — each returns a
clearly-labeled placeholder after a short delay. Swapping to real Genkit later
means replacing this module's internals. (No draft-note stub this pass; the
committee section has no AI.)

## Error / Empty States

- No versions/reports → existing empty state.
- Compare with the same version chosen twice → "Pick two different versions."
- A version missing `original_text` → its Diff/Compare option is disabled with
  a hint; Read text hidden (as today).
- `hawaii-bill-diff` throwing on odd input → the diff area shows a graceful
  "Couldn't compute a diff for these versions" message (caught in
  `services/bill-diff.ts`, surfaced via the `VersionDiff.error` flag).

## Testing

- Unit tests: `services/bill-diff.ts` (normalization of `hawaii-bill-diff`
  output into aligned rows; same-version and empty-text edge cases),
  `lib/committees.ts` (`parseCommitteeCodes`), and `lib/bill-briefing-facts.ts`
  (`deriveBriefingFacts` — testimony-open vs closed, next-deadline present,
  latest-version selection, next-steps gating). All pure transformations,
  fitting the pure-logic test convention; tests live in `src/lib/__tests__/`.
- `npm run typecheck`, `npm run build` (build catches `'use server'` export
  violations).

## Open Items (follow-ups, out of scope here)

- Real Genkit summarize/briefing/draft-note flows + persistence to `ai_summary`.
- Real committee-member data source (currently placeholder directory).
- Real message sending / contact logging.
- Upgrade diffs from plain-text `compareBills` to HTML section-aware
  `compareBillContent` by fetching `html_link` (better alignment/formatting).
