# AI Version Summaries & Diff Summaries — Design

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation planning
**Builds on:** `2026-07-28-version-comparison-design.md` (the diff engine this consumes)

## Problem

Two AI summary features in the Versions & Reports tab, with different economics:

1. **Document summaries** — "what does this version/report say" for a single
   `bill_versions` or `committee_reports` row.
2. **Diff summaries** — "what changed between these two versions", layered into
   the existing *Summary of changes* block in the Compare Versions area.

Both are gated on per-user AI opt-in, and consent must mean something stronger
than a hidden button.

### The storage question that drove this design

The obvious schema — a `(user_id, version_id) → summary_text` table — stores the
same paragraph once per interested user. The input is a **public legislative
document**; nothing about the summary varies per person, so per-user rows
multiply storage and token spend by the user count and buy nothing. Rejected.

Summaries are keyed by **document** (or document pair), shared by every opted-in
reader. Storage is **flat in user count**.

## Decisions

| Question | Decision |
|---|---|
| Sovereignty requirement | Self-hosted/controlled model. Already handled in `services/llm.ts`; no schema impact. |
| What opt-out protects against | **Participation**, not display. No inference may occur unless a consenting user triggers it. |
| Generation timing | **Lazy.** `ai_summary` stays `NULL` until an opted-in user asks. Never on page load. |
| Cache scope | **Global now, tenant-scoped later.** No `tenant_id` on summaries; a tenant dimension arrives only if orgs want their own prompt lens. |
| Cache invalidation | **Versioned.** Store model + prompt version; a stale entry is a miss and regenerates. |
| Diff summaries | **Not persisted.** Computed per request. |
| Provenance | Returned and displayed for **both** kinds, stored only for document summaries. |

## Architecture

### 1. Document summaries — persisted

A version is immutable (SD1 is SD1 forever) and its summary is expensive (full
`original_text`, 6–18 KB). Cache once, serve forever.

`ai_summary` already exists on both tables. Add provenance:

```sql
ALTER TABLE bill_versions
  ADD COLUMN summary_model           text,
  ADD COLUMN summary_prompt_version  text,
  ADD COLUMN summary_generated_at    timestamptz;

ALTER TABLE committee_reports
  ADD COLUMN summary_model           text,
  ADD COLUMN summary_prompt_version  text,
  ADD COLUMN summary_generated_at    timestamptz;
```

No new table. Growth is bounded by versions people actually opened — a fraction
of the ~30 MB a fully-summarized 3,000-bill corpus would occupy.

The three columns do two jobs:

- **Provenance.** Answer "which model, under which prompt, when" for any AI
  claim in the system.
- **Evolvability.** A row whose `summary_prompt_version` is older than current
  is treated as a cache miss. Improving the prompt improves summaries
  retroactively as they're viewed — no backfill job. Retrofitting this later is
  impossible: existing summaries would have unknown origin forever.

### 2. Diff summaries — dynamic

Different economics on every axis:

| | Document summaries | Diff summaries |
|---|---|---|
| Input | Full `original_text` (6–18 KB) | Changed fragments from `bill-diff.ts` (hundreds of tokens) |
| Cardinality | One per version | `n²/2` possible pairs per bill |
| Reuse | Every reader wants the same paragraph | Most pairs requested once or never |
| Persisted | Yes | **No** |
| Staleness | Handled by `summary_prompt_version` | Impossible — always current |
| Cost driver | Corpus size, once per version | Traffic, per comparison summarized |

Persisting these would mean a table keyed on `(older_version_id,
newer_version_id)`, storing rows nobody reads twice, going stale whenever
`bill-diff.ts`'s **heuristic** parser improves (see finding 5 of the comparison
design: the primary section regex fails on every document). That is schema
complexity and an invalidation story bought to avoid a cheap call. Skipped.

**The input is structured, not prose.** `bill-diff.ts` already returns
`SectionDiff[]` with per-fragment `added`/`removed`/`modified`/`unchanged` kinds
carrying Hawaii's real amendment marks (`struck`, `underlined`). The prompt is
built from the changed fragments plus enough section context to make them
legible — grounded in actual amendment marks, not asked to infer changes from
two blobs of text.

### 3. Consent enforcement

**The current gate is insufficient.** `report-summary.tsx:32` checks
`preferences?.ai_opt_in === true` **client-side** to decide whether to render the
Summarize button. Hiding a button is not enforcement: the underlying operation
can be called directly, and nothing server-side stands between an opted-out user
and an inference. Under a *participation* consent model this is the one property
that must hold — an unenforced claim is not a claim.

Consent moves server-side and gates **generation**, for both summary kinds:

```
summarize(target)                          # version | report | version pair
  ├─ requireSession                        → who is asking
  ├─ getUserPreferences(user.id).ai_opt_in → server-side truth, never client-supplied
  │    └─ false → ApiError(403)            → no LLM call, no tokens, no write
  ├─ document summary: cache hit (summary present AND prompt_version current)
  │    └─ return it — a cache hit is not an inference
  └─ miss (or diff summary) → llm.ts → [persist if document] → return with provenance
```

Two load-bearing properties:

- **Opt-in is checked at the point of inference.** No route, stale client, or
  direct API call lets an opted-out user cause a model call. The check reads
  from the DB per call, so revoking consent takes effect immediately.
- **A cache hit is not an inference.** This is what keeps lazy generation from
  collapsing into per-user regeneration. The second opted-in reader gets the
  stored paragraph; no model runs, nothing is billed. Consent governs *causing*
  generation — the irreversible act.

Reads stay client-gated. Fetching a version needs no opt-in check (reading a row
is not inference); `SummarySection` keeps showing "AI summaries are off" to
opted-out users. That is a UI courtesy, not a security boundary.

**Stated limitation:** an opted-out user can infer that a summary exists if the
UI copy differs between `NULL` and populated. The guarantee is **causal** — your
reading never triggered a model — not that others' AI activity is invisible to
you. Making the opted-out branch render identically in both cases is a one-line
change in `SummarySection` if the stronger property is ever wanted; not taken,
because the copy would get vaguer for no real gain.

## UI

### Document summaries

`SummarySection` (`report-summary.tsx`) keeps its current three-state resolution
— saved summary → Summarize button → opted-out copy. `SummaryCard` gains a
provenance footer showing the model that produced the text.

### Diff summaries

The Compare Versions area's **Summary of changes** block
(`version-diff-accordion.tsx:71-79`) today renders a mechanical count:

```
SB2374 → SB2374_SD1 · 3 modified · 2 removed
```

The AI summary becomes a **narrative second layer inside that same block**,
behind a Summarize button. On first load the block looks exactly as it does
today — **no automatic generation**. The mechanical count is always present and
free; the narrative is opt-in and on demand.

Keeping it behind a deliberate click is load-bearing: dynamic summaries scale
with **traffic**, so auto-generating on open would bill per page view.

Provenance is returned alongside the summary and shown in the same footer style
as document summaries, so both summary cards read as one system.

### Error handling

`bill-diff.ts` can legitimately yield nothing usable — some `html_link`s 404
(`HB1494_CD1`, `SB2575_SD2`), and parsing is heuristic with an
`errorComparison(..., 'parse-failed')` path.

**No diff, no summary.** When `comparison.error` is non-null or
`comparison.sections` is empty, the Summarize affordance does not appear; the
existing diff-error state stands. The value of this feature is that it is
grounded in real amendment marks — falling back to whole-text summarization
throws that grounding away exactly when things are already going wrong, and a
confidently wrong account of a legislative amendment is the worst failure mode a
bill tracker can have.

When `parseIncomplete` is true the diff is partial but real. The summary may be
generated, and the existing "Some sections couldn't be parsed" warning
(`version-diff-accordion.tsx:81-86`) already communicates the caveat. If partial
parses prove common, a future refinement is surfacing "partial — N sections
recovered" in the summary card itself.

### Generation failures

A failed generation is not persisted, so a version whose text is malformed or
over-length is re-attempted — and re-billed — by every opted-in user who tries.
Acceptable at current scale; noted as a known cost. Recording failures to
suppress retries is a follow-on if it shows up in practice.

## Where the code goes

Per CLAUDE.md's navigation rules:

- **Migration** — `src/db/migrations/000028_add_summary_provenance.{up,down}.sql`
- **Queries** — summary read/write in `src/db/queries/` alongside the existing
  version queries; mappers updated in `bill-mappers.ts` to carry provenance.
- **LLM calls** — `src/services/llm.ts` (both prompts; the diff prompt builds
  from `SectionDiff[]`).
- **Prompt-building from a comparison** — pure, in `src/lib/version-diff.ts` or a
  sibling; unit-testable with no DB or network.
- **Auth** — `requireSession` from `@/lib/auth-guards`; opt-in check via
  `getUserPreferences`.
- **Client** — components call `data.*` from `@/lib/data-client`, never raw
  `fetch`. New operations need an action arm, a fetch arm, and registration in
  the domain's `defineClient`.

## Testing

Pure unit tests in `src/lib/__tests__/`, per convention:

- Prompt construction from a `VersionComparison` — changed fragments included,
  unchanged bulk excluded, section context preserved.
- Cache staleness: current `summary_prompt_version` → hit; older → miss.
- The no-diff/no-summary predicate across `error`, empty `sections`, and
  `parseIncomplete` inputs.

Opt-in enforcement is server-side and DB-backed, so it is out of scope for the
pure-unit-test suite; it is verified by inspection of the guard path.

## Out of scope

- Per-tenant summary framing (revisit if orgs want their own prompt lens).
- Persisting or caching diff summaries, including in-memory/LRU. Available if
  repeat-view cost proves painful; not built speculatively.
- Recording failed generations.
- Making summary existence invisible to opted-out users.
