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
| Cache invalidation | **Explicit.** Prompt version is recorded for provenance; regeneration happens by clearing `ai_summary`, never automatically. |
| Diff summaries | **Not persisted.** Computed per request. |
| Provenance | Model identity comes from **app config**, not a column — one model is applied app-wide. Displayed for both kinds. |
| Bill versions vs. committee reports | **Identical behavior** in every respect. |

## Architecture

### 1. Document summaries — persisted

Applies identically to **`bill_versions` and `committee_reports`**. Both tables
have the same shape (`original_text`, `ai_summary`, `label`, `html_link`), both
already render through the same `SummarySection` component, and every rule below
holds for both without exception. Wherever this spec says "version," read
"version or committee report."

A version is immutable (SD1 is SD1 forever) and its summary is expensive (full
`original_text`, 6–18 KB). Cache once, serve forever.

`ai_summary` already exists on both tables. Add two columns to each:

```sql
ALTER TABLE bill_versions
  ADD COLUMN summary_prompt_version  text,
  ADD COLUMN summary_generated_at    timestamptz;

ALTER TABLE committee_reports
  ADD COLUMN summary_prompt_version  text,
  ADD COLUMN summary_generated_at    timestamptz;

-- Grandfather summaries that predate provenance tracking so they are not
-- regenerated (and re-billed) on first view. 'v0' is permanently stale
-- relative to every real prompt version, but it is not NULL, so it counts
-- as a hit until the prompt is next bumped.
UPDATE bill_versions
   SET summary_prompt_version = 'v0'
 WHERE ai_summary IS NOT NULL;

UPDATE committee_reports
   SET summary_prompt_version = 'v0'
 WHERE ai_summary IS NOT NULL;
```

No new table. Growth is bounded by versions people actually opened — a fraction
of the ~30 MB a fully-summarized 3,000-bill corpus would occupy.

**No `summary_model` column.** One model is applied app-wide, so it cannot vary
per row and storing it per row is redundant. Model identity for display comes
from app config at render time.

`summary_prompt_version` records **which prompt wrote this text**, so a summary
can always be traced to the instructions that produced it. Retrofitting this
later is impossible; existing summaries would have unknown provenance forever.

**Invalidation is deliberate, not automatic.** A non-NULL `ai_summary` is served
regardless of its prompt version — the cache is not silently invalidated when the
prompt changes, because that would re-bill the whole viewed corpus on a wording
tweak. To actually regenerate, clear `ai_summary` for the rows in question (all
of them, or a subset) and they become misses that regenerate on next view. This
keeps prompt-version bumps free and makes regeneration an explicit, costed
decision.

Consequence for the model-swap rule above: bumping the prompt version alone no
longer relabels old summaries, so a swap that must not misattribute requires
clearing `ai_summary` too.

**A model swap must bump `summary_prompt_version`.** Because the displayed model
comes from config rather than the row, a swap without a bump would label old
summaries with the new model's name despite the old model having written them —
a small but real provenance lie. Bumping the prompt version invalidates every
cached summary so it regenerates under the model now being advertised. A model
change should invalidate summaries anyway.

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

`SummarySection` (`report-summary.tsx`) keeps its current three-state resolution,
used identically for bill versions and committee reports:

1. **Saved summary present** → render it. Shown to opted-in users.
2. **Opted in, no summary** → a Summarize button. Clicking generates, persists,
   and renders.
3. **Opted out** → "AI summaries are off. Open the {noun} to read it in full."
   No Summarize button.

`SummaryCard` gains a provenance footer naming the model, read from app config
rather than from the row.

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

Opt-in governs the button exactly as it does for document summaries. An opted-in
user sees Summarize; an opted-out user sees the mechanical count alone, with no
AI affordance. There is no persisted-summary state here, so the three-state
resolution collapses to two.

Provenance is shown in the same footer style as document summaries — model from
config, plus the fact that it was generated just now — so both summary cards read
as one system.

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

## Prompts

Both prompts follow the house style already in `services/llm.ts`: a
`SYSTEM_PROMPT` array of lines with numbered markdown sections, called through
the OpenAI-compatible client against the self-hosted endpoint (`VLLM` / `LLM`
env var — which is also where the footer's model name comes from),
`temperature: 0.0`, and the ` /no_think` suffix on the user turn.

Rate limiting reuses `limitFixedWindow` with per-target keys
(`llm:summary:<versionId>`, `llm:diff:<olderId>:<newerId>`) so one user hammering
Summarize cannot run up the bill.

### A. Document summary (versions and committee reports)

One prompt serves both. The document type is passed in the user turn rather than
forked into two prompts, because the summarization task is identical — only the
noun changes.

```
# Hawaiʻi Bill Document Summarizer

## 1. Purpose
You summarize official documents from the Hawaii State Legislature for
community advocates tracking food-related legislation. You will receive the
full text of one document: either a bill version or a committee report.
Produce a plain-language summary for a reader who is not a lawyer.

## 2. Grounding (CRITICAL)
- Summarize ONLY what the document says. Do not add background, history, or
  outside knowledge about the bill, its sponsors, or its likelihood of passing.
- Do not speculate about intent, motives, or political implications.
- If the document is a fragment, malformed, or too short to summarize, say so
  in one sentence instead of guessing.
- Never invent section numbers, dollar amounts, dates, or agency names. Every
  figure you state must appear in the text.

## 3. What to cover
In order of importance:
1. What the measure would do, in one or two sentences.
2. Who it affects — agencies, industries, populations named in the text.
3. Money: appropriations, fees, or funding sources, with amounts as written.
4. Dates: effective dates, sunset dates, deadlines.
5. For a committee report only: the committee's recommendation (pass, pass as
   amended, defer, hold) and the amendments it describes.

## 4. Style
- 100–180 words. No preamble, no "This bill...", no restating the title.
- Plain language. Expand legislative jargon on first use.
- Use "would" for anything not yet law.
- Prose, not bullets. No markdown headings.
- Neutral. You are not advocating for or against the measure.

## 5. Output
Return only the summary text. No title, no labels, no commentary.
```

**User turn:** the document label, its type (`bill version` | `committee
report`), and `original_text`.

`original_text` is whitespace-collapsed single-line plain text (per the
comparison design's findings) — adequate for summarization, which needs no line
structure, unlike diffing.

### B. Diff summary (version pairs)

The critical difference: the input is **not** two documents. It is the
structured `SectionDiff[]` from `bill-diff.ts`, already carrying Hawaiʻi's real
amendment marks. The model is told what changed and asked to explain its
significance — it is never asked to *find* the changes. That grounding is the
entire value of the feature.

```
# Hawaiʻi Bill Amendment Summarizer

## 1. Purpose
You explain what changed between two versions of a Hawaii State Legislature
bill, for community advocates tracking food-related legislation.

## 2. Your input is a computed diff — trust it (CRITICAL)
The changes have ALREADY been identified by a parser that reads Hawaiʻi's
official amendment marks. You will receive them section by section, with each
fragment tagged:
- [removed]   — struck from the bill (Hawaiʻi marks deletions with strikethrough)
- [added]     — inserted into the bill (marked with underline)
- [modified]  — reworded
- [unchanged] — context only, provided so the changes read in context

YOU MUST NOT look for changes yourself, contradict a tag, or claim something
changed that is not tagged as changed. Do not describe [unchanged] text as new
or removed. If the diff shows no substantive change, say exactly that.

## 3. What to cover
1. The single most consequential change first — what it does, not where it is.
2. Then remaining substantive changes, grouped by what they affect rather than
   by section order.
3. Money and dates explicitly: an appropriation cut from $500,000 to $250,000,
   or an effective date moved, is always substantive. State both the old and
   new values.
4. Say plainly when a change narrows or broadens scope — who is newly covered
   or newly excluded.
5. Ignore pure renumbering, punctuation, and formatting churn.

## 4. Style
- 80–150 words. Shorter when the changes are minor.
- Lead with substance: "The appropriation drops from $500,000 to $250,000."
  Not: "In section 4, the bill was amended."
- Cite section numbers only when they help a reader find the change.
- Plain language, neutral, "would" for anything not yet law.
- Prose, not bullets. No markdown headings.

## 5. Partial diffs
If told the parse was incomplete, add one final sentence noting that some
sections could not be compared. Do not speculate about their contents.

## 6. Output
Return only the summary text. No title, no labels, no commentary.
```

**User turn**, built by a pure function from a `VersionComparison`:

```
Comparing HB1494_HD1 (older) to HB1494_HD2 (newer).
Parse incomplete: no

SECTION 4 [modified]
  [unchanged] SECTION 4. The director of finance is authorized to issue
  [removed] or constructing
  [unchanged] the
  [added] the university of Hawaii at Manoa campus

SECTION 9 [removed]
  (this section appears only in HB1494_HD1)
```

Construction rules — this is where cost and quality are actually decided:

- **Sections with `kind: 'unchanged'` are omitted entirely.** They are the bulk
  of the document and contain nothing to report.
- **Within changed sections, `[unchanged]` fragments are kept** — they are the
  context that makes an amendment legible. A bare `[removed] or constructing`
  is meaningless without the sentence around it.
- Long runs of `[unchanged]` are truncated to a window around the nearest change.
- `presence: 'olderOnly' | 'newerOnly'` becomes an explicit note, since a
  whole-section add/drop is a major change that fragment tags alone under-state.
- `parseIncomplete` is passed through to trigger §5.

This is why diff summaries are cheap: a 12-section bill with changes in 3
sections sends 3 sections of fragments, not two 17 KB documents.

## Where the code goes

Per CLAUDE.md's navigation rules:

- **Migration** — `src/db/migrations/000028_add_summary_provenance.{up,down}.sql`,
  touching both `bill_versions` and `committee_reports`.
- **Queries** — summary read/write in `src/db/queries/` alongside the existing
  version queries, covering both tables; mappers updated in `bill-mappers.ts`
  (both the version and report mappers) to carry `summary_prompt_version` and
  `summary_generated_at`.
- **Model identity for display** — app config, alongside wherever `llm.ts` reads
  its model name. Not a per-row value.
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
- Cache staleness: a summary is a **hit** when `ai_summary` is non-NULL and
  `summary_prompt_version` is non-NULL; a **miss** only when `ai_summary` is
  NULL. Backfilled `'v0'` rows are hits. (Prompt-version comparison is not a
  staleness check today — see the note in §1.)
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
