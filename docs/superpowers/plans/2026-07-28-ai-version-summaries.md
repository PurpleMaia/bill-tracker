# AI Version Summaries & Diff Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI summaries for bill versions and committee reports (persisted, cached per document) plus on-demand AI summaries of what changed between two versions (never persisted), both gated server-side on per-user AI opt-in.

**Architecture:** Document summaries persist to the existing `ai_summary` column with two new provenance columns; a non-NULL `ai_summary` is always a cache hit. Diff summaries are computed per request from `bill-diff.ts`'s already-structured `SectionDiff[]` — the LLM explains tagged changes, it never finds them. Both paths check `user_preferences.ai_opt_in` server-side before any inference, because the existing client-side check in `report-summary.tsx` is not enforcement.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely, PostgreSQL, OpenAI-compatible client against a self-hosted endpoint (`VLLM`/`LLM` env), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-ai-version-summaries-design.md`

## Global Constraints

- **Prompt version constant:** `SUMMARY_PROMPT_VERSION = 'v1'` and `DIFF_PROMPT_VERSION = 'v1'`. Backfilled rows use `'v0'`.
- **Cache rule:** a document summary is a HIT when `ai_summary IS NOT NULL`. A MISS only when NULL. Prompt version is provenance, never a staleness check.
- **Diff summaries are never persisted.** No table, no columns, no in-memory cache.
- **No `summary_model` column.** Model name for display comes from `process.env.VLLM || process.env.LLM`.
- **Opt-in is checked server-side on every generation call**, read fresh from the DB via `getUserPreferences`. Never trust a client-supplied flag.
- **Never auto-generate.** Both summary kinds require an explicit user click.
- **Bill versions and committee reports behave identically** everywhere.
- **LLM call style** (match `services/llm.ts`): `temperature: 0.0`, ` /no_think` appended to the user turn, model from `process.env.VLLM || process.env.LLM`, rate-limited with `limitFixedWindow`.
- **Architecture rules (CLAUDE.md):** all queries in `src/db/queries/*`; `src/lib/` is DB-free; client components call `data.*` from `@/lib/data-client`, never raw `fetch`; a `'use server'` file may only export async functions; auth via `@/lib/auth-guards`.
- **Before committing any task:** `npm test`, `npm run typecheck`, and `npm run build` must all pass.

## File Structure

**Create:**
- `src/db/migrations/000028_add_summary_provenance.up.sql` / `.down.sql` — two columns per table + `v0` backfill.
- `src/lib/version-labels.ts` — PURE label parsing (`HD1` → House first draft). Shared by both prompts.
- `src/lib/summary-prompts.ts` — PURE prompt construction: both system prompts and both user-turn builders. No DB, no network, no LLM client. This is the unit-testable core.
- `src/db/queries/summaries.ts` — read/write `ai_summary` + provenance for both tables.
- `src/app/actions/summaries.ts` — `'use server'` action arm.
- `src/app/api/bills/[id]/summarize/route.ts` — fetch arm for document summaries.
- `src/app/api/bills/[id]/summarize-diff/route.ts` — fetch arm for diff summaries.
- `src/lib/data-client/summaries.client.ts` — fetch wrappers + `defineClient` registration.
- `src/lib/__tests__/version-labels.test.ts`, `src/lib/__tests__/summary-prompts.test.ts`.

**Modify:**
- `src/db/types.ts` — regenerated/hand-added columns.
- `src/db/queries/bill-mappers.ts:26-49` — carry provenance in `mapVersionRow` / `mapReportRow`.
- `src/types/legislation.ts:20-44` — add provenance fields to `BillVersion` / `CommitteeReport`.
- `src/services/llm.ts` — add `summarizeDocument` and `summarizeDiff`.
- `src/lib/data-client/index.ts` — register `summaries`.
- `src/components/kanban/report-summary.tsx` — call the real op instead of `stubSummarize`; provenance footer.
- `src/components/kanban/version-diff-accordion.tsx:69-86` — Summarize button in the "Summary of changes" block.

**Why this split:** all prompt text and label parsing live in `src/lib/` as pure functions so they are testable with no DB and no mocking (per CLAUDE.md's testing rule). `llm.ts` only orchestrates. `summaries.ts` only persists.

---

### Task 1: Migration — provenance columns and `v0` backfill

**Files:**
- Create: `src/db/migrations/000028_add_summary_provenance.up.sql`
- Create: `src/db/migrations/000028_add_summary_provenance.down.sql`
- Modify: `src/db/types.ts` (add columns to `BillVersions` and `CommitteeReports`)

**Interfaces:**
- Consumes: nothing.
- Produces: `bill_versions.summary_prompt_version`, `bill_versions.summary_generated_at`, and the same two on `committee_reports`. TS types `BillVersions.summary_prompt_version: string | null`, `BillVersions.summary_generated_at: Timestamp | null`.

- [ ] **Step 1: Write the up migration**

```sql
-- src/db/migrations/000028_add_summary_provenance.up.sql
ALTER TABLE bill_versions
  ADD COLUMN summary_prompt_version text,
  ADD COLUMN summary_generated_at   timestamptz;

ALTER TABLE committee_reports
  ADD COLUMN summary_prompt_version text,
  ADD COLUMN summary_generated_at   timestamptz;

-- Grandfather summaries that predate provenance tracking so they are served as
-- cache hits and never re-billed. 'v0' means "written by an unknown prompt".
UPDATE bill_versions
   SET summary_prompt_version = 'v0'
 WHERE ai_summary IS NOT NULL;

UPDATE committee_reports
   SET summary_prompt_version = 'v0'
 WHERE ai_summary IS NOT NULL;
```

- [ ] **Step 2: Write the down migration**

```sql
-- src/db/migrations/000028_add_summary_provenance.down.sql
ALTER TABLE bill_versions
  DROP COLUMN summary_prompt_version,
  DROP COLUMN summary_generated_at;

ALTER TABLE committee_reports
  DROP COLUMN summary_prompt_version,
  DROP COLUMN summary_generated_at;
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:up`
Expected: succeeds with no error.

- [ ] **Step 4: Verify the backfill did what it claims**

Run this and read the output — do not assume:

```bash
psql "$DATABASE_URL" -c "SELECT summary_prompt_version, count(*) FROM bill_versions GROUP BY 1;"
psql "$DATABASE_URL" -c "SELECT count(*) AS bad FROM bill_versions WHERE ai_summary IS NOT NULL AND summary_prompt_version IS NULL;"
```

Expected: every row with a non-NULL `ai_summary` has `summary_prompt_version = 'v0'`; the `bad` count is `0`. Rows with no summary keep NULL.

- [ ] **Step 5: Add the columns to `src/db/types.ts`**

In `export interface BillVersions` and `export interface CommitteeReports`, add:

```typescript
  summary_prompt_version: string | null;
  summary_generated_at: Timestamp | null;
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/000028_add_summary_provenance.up.sql \
        src/db/migrations/000028_add_summary_provenance.down.sql \
        src/db/types.ts
git commit -m "feat: add summary provenance columns with v0 backfill"
```

---

### Task 2: Pure label parsing

**Files:**
- Create: `src/lib/version-labels.ts`
- Test: `src/lib/__tests__/version-labels.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `describeVersionLabel(label: string): string | null` — returns e.g. `'House, first committee draft'`, or `null` when the label is unrecognized (caller then omits the line rather than guessing).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/version-labels.test.ts
import { describe, it, expect } from 'vitest';
import { describeVersionLabel } from '../version-labels';

describe('describeVersionLabel', () => {
  it('describes House drafts by ordinal', () => {
    expect(describeVersionLabel('HB1494_HD1')).toBe('House, first committee draft');
    expect(describeVersionLabel('HB1494_HD2')).toBe('House, second committee draft');
  });

  it('describes Senate drafts', () => {
    expect(describeVersionLabel('SB2374_SD1')).toBe('Senate, first committee draft');
  });

  it('describes conference drafts without a chamber', () => {
    expect(describeVersionLabel('HB235_CD1')).toBe('Conference draft');
  });

  it('treats a bare bill number as the introduced version', () => {
    expect(describeVersionLabel('HB1494')).toBe('As introduced');
    expect(describeVersionLabel('SB2374')).toBe('As introduced');
  });

  it('is case-insensitive and tolerates trailing underscores', () => {
    expect(describeVersionLabel('hb1494_hd1')).toBe('House, first committee draft');
    expect(describeVersionLabel('HB1494_HD1_')).toBe('House, first committee draft');
  });

  // Load-bearing: an unknown label must NOT be guessed at. The prompt omits
  // the pipeline-position line entirely rather than assert something false.
  it('returns null for unrecognized labels', () => {
    expect(describeVersionLabel('HB1494_ZZ9')).toBeNull();
    expect(describeVersionLabel('')).toBeNull();
    expect(describeVersionLabel('garbage')).toBeNull();
  });

  it('returns null past the supported ordinal range rather than inventing a word', () => {
    expect(describeVersionLabel('HB1494_HD9')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/version-labels.test.ts`
Expected: FAIL — cannot resolve `../version-labels`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/version-labels.ts
// PURE label parsing for Hawaiʻi bill version labels. No DB, no network.
//
// Labels look like: HB1494 (as introduced), HB1494_HD1 (House draft 1),
// SB2374_SD2 (Senate draft 2), HB235_CD1 (conference draft). Some labels in
// the corpus point at documents that 404 (HB1494_CD1) — parsing the label is
// independent of whether the document exists.
//
// An unrecognized label returns null on purpose: the prompt then omits the
// pipeline-position line instead of asserting something we cannot verify.

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

const CHAMBER_BY_CODE: Record<string, string> = {
  HD: 'House',
  SD: 'Senate',
};

/**
 * Describes where a version sits in the legislative process, e.g.
 * 'House, first committee draft'. Returns null when the label is not a shape
 * we recognize — callers MUST omit the position line in that case.
 */
export function describeVersionLabel(label: string): string | null {
  const trimmed = label.trim().replace(/_+$/, '');
  if (!trimmed) return null;

  const parts = trimmed.split('_');

  // Bare bill number, e.g. HB1494 / SB2374.
  if (parts.length === 1) {
    return /^[A-Z]+\d+$/i.test(parts[0]) ? 'As introduced' : null;
  }

  const suffix = parts[parts.length - 1].toUpperCase();
  const match = /^([A-Z]{2})(\d+)$/.exec(suffix);
  if (!match) return null;

  const [, code, digits] = match;
  const ordinal = ORDINALS[Number(digits) - 1];
  if (!ordinal) return null;

  if (code === 'CD') return 'Conference draft';

  const chamber = CHAMBER_BY_CODE[code];
  if (!chamber) return null;

  return `${chamber}, ${ordinal} committee draft`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/version-labels.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/version-labels.ts src/lib/__tests__/version-labels.test.ts
git commit -m "feat: pure version-label parsing for summary prompts"
```

---

### Task 3: Pure prompt construction

**Files:**
- Create: `src/lib/summary-prompts.ts`
- Test: `src/lib/__tests__/summary-prompts.test.ts`

**Interfaces:**
- Consumes: `describeVersionLabel` (Task 2); `VersionComparison`, `SectionDiff` from `@/lib/version-diff`.
- Produces:
  - `SUMMARY_PROMPT_VERSION = 'v1'`, `DIFF_PROMPT_VERSION = 'v1'`
  - `DOCUMENT_SYSTEM_PROMPT: string`, `DIFF_SYSTEM_PROMPT: string`
  - `buildDocumentUserTurn(input: { label: string; kind: 'bill version' | 'committee report'; committees: string | null; text: string }): string`
  - `buildDiffUserTurn(input: { comparison: VersionComparison; committees: string | null }): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/summary-prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_SYSTEM_PROMPT,
  DIFF_SYSTEM_PROMPT,
  buildDocumentUserTurn,
  buildDiffUserTurn,
} from '../summary-prompts';
import type { VersionComparison, SectionDiff } from '../version-diff';

function frag(kind: SectionDiff['fragments'][number]['kind'], text: string) {
  return { kind, text, struck: kind === 'removed', underlined: kind === 'added' };
}

function comparison(sections: SectionDiff[], overrides: Partial<VersionComparison> = {}): VersionComparison {
  return {
    olderLabel: 'HB1494_HD1',
    newerLabel: 'HB1494_HD2',
    sections,
    totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
    parseIncomplete: false,
    error: null,
    ...overrides,
  };
}

describe('system prompts', () => {
  it('both forbid relying on recalled bill numbers', () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/REUSED/);
    expect(DIFF_SYSTEM_PROMPT).toMatch(/REUSED/);
  });

  it('the diff prompt forbids finding changes itself', () => {
    expect(DIFF_SYSTEM_PROMPT).toMatch(/MUST NOT look for changes yourself/);
  });
});

describe('buildDocumentUserTurn', () => {
  it('includes label, kind, derived position, committees, and text', () => {
    const turn = buildDocumentUserTurn({
      label: 'HB1494_HD1',
      kind: 'bill version',
      committees: 'AGR, ECD, FIN',
      text: 'SECTION 1. The legislature finds...',
    });
    expect(turn).toContain('Document: HB1494_HD1 (bill version)');
    expect(turn).toContain('Produced by: House, first committee draft');
    expect(turn).toContain('Committees (in order): AGR, ECD, FIN');
    expect(turn).toContain('SECTION 1. The legislature finds...');
  });

  it('omits the position line for an unrecognized label instead of guessing', () => {
    const turn = buildDocumentUserTurn({
      label: 'garbage', kind: 'bill version', committees: null, text: 'text',
    });
    expect(turn).not.toContain('Produced by:');
    expect(turn).not.toContain('Committees');
  });
});

describe('buildDiffUserTurn', () => {
  // The core cost/quality rule: unchanged SECTIONS are dropped entirely, but
  // unchanged FRAGMENTS inside a changed section are kept as context.
  it('drops unchanged sections and keeps changed ones', () => {
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '1', kind: 'unchanged', changeCount: 0, presence: 'both',
          fragments: [frag('unchanged', 'boilerplate that must not be sent')] },
        { sectionNumber: '4', kind: 'modified', changeCount: 2, presence: 'both',
          fragments: [
            frag('unchanged', 'The director of finance is authorized to issue'),
            frag('removed', 'or constructing'),
            frag('added', 'the university of Hawaii at Manoa campus'),
          ] },
      ]),
      committees: 'AGR, ECD, FIN',
    });

    expect(turn).not.toContain('boilerplate that must not be sent');
    expect(turn).toContain('SECTION 4 [modified]');
    expect(turn).toContain('[removed] or constructing');
    expect(turn).toContain('[added] the university of Hawaii at Manoa campus');
    // Context inside a changed section is retained — a bare [removed] fragment
    // is meaningless without the sentence around it.
    expect(turn).toContain('[unchanged] The director of finance is authorized to issue');
  });

  it('labels both sides with their derived pipeline position', () => {
    const turn = buildDiffUserTurn({ comparison: comparison([]), committees: null });
    expect(turn).toContain('Older: House, first committee draft');
    expect(turn).toContain('Newer: House, second committee draft');
  });

  it('notes a section present in only one version', () => {
    const turn = buildDiffUserTurn({
      comparison: comparison([
        { sectionNumber: '9', kind: 'removed', changeCount: 1, presence: 'olderOnly',
          fragments: [frag('removed', 'dropped section body')] },
      ]),
      committees: null,
    });
    expect(turn).toContain('only in HB1494_HD1');
  });

  it('passes through parseIncomplete so the prompt can caveat', () => {
    expect(buildDiffUserTurn({ comparison: comparison([], { parseIncomplete: true }), committees: null }))
      .toContain('Parse incomplete: yes');
    expect(buildDiffUserTurn({ comparison: comparison([]), committees: null }))
      .toContain('Parse incomplete: no');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/summary-prompts.test.ts`
Expected: FAIL — cannot resolve `../summary-prompts`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/summary-prompts.ts
// PURE prompt construction for AI summaries. No DB, no network, no LLM client —
// so every rule that decides cost and grounding is unit-testable.
//
// Spec: docs/superpowers/specs/2026-07-28-ai-version-summaries-design.md

import { describeVersionLabel } from './version-labels';
import type { VersionComparison, SectionDiff } from './version-diff';

/** Bump when the document prompt changes. Provenance only — NOT a cache key. */
export const SUMMARY_PROMPT_VERSION = 'v1';
/** Bump when the diff prompt changes. Diff summaries are never persisted. */
export const DIFF_PROMPT_VERSION = 'v1';

export const DOCUMENT_SYSTEM_PROMPT = [
  '# Hawaiʻi Bill Document Summarizer',
  '',
  '## 1. Purpose',
  'You summarize official documents from the Hawaii State Legislature for',
  'community advocates. You will receive the',
  'full text of one document: either a bill version or a committee report.',
  'Produce a plain-language summary for a reader who is not a lawyer.',
  '',
  '## 2. Grounding (CRITICAL)',
  '- Summarize ONLY what the document says, plus the pipeline position given to',
  '  you in section 3. Do not add background, history, or outside knowledge about',
  "  the bill, its sponsors, prior sessions, or its likelihood of passing.",
  '- You may have seen this bill number before. Bill numbers are REUSED between',
  '  sessions — HB1494 in one year is an unrelated measure in another. Anything you',
  '  recall about a bill number is not evidence. Never use it.',
  '- Do not speculate about intent, motives, or political implications.',
  '- If the document is a fragment, malformed, or too short to summarize, say so',
  '  in one sentence instead of guessing. Do not pad a thin document with the',
  '  pipeline context to reach the word count.',
  '- Never invent section numbers, dollar amounts, dates, or agency names. Every',
  '  figure you state must appear in the text.',
  '',
  '## 3. Pipeline position (supplied, verified)',
  'The user turn gives you where this document sits in the legislative process —',
  "its version label, the bill's committee assignments in order, and which body",
  'produced it. This comes from official records, not from your memory, so you may',
  'state it.',
  '',
  'Use it for at most ONE clause of orientation, e.g. "the version reported by the',
  'House Finance Committee". Then summarize the document. Do not narrate the',
  "bill's journey, predict what happens next, or explain the legislative process.",
  '',
  '## 4. What to cover',
  'In order of importance:',
  '1. What the measure would do, in one or two sentences.',
  '2. Who it affects — agencies, industries, populations named in the text.',
  '3. Money: appropriations, fees, or funding sources, with amounts as written.',
  '4. Dates: effective dates, sunset dates, deadlines.',
  "5. For a committee report only: the committee's recommendation (pass, pass as",
  '   amended, defer, hold) and the amendments it describes.',
  '',
  '## 5. Style',
  '- 100–180 words. No preamble, no "This bill...", no restating the title.',
  '- Plain language. Expand legislative jargon on first use.',
  '- Use "would" for anything not yet law.',
  '- Prose, not bullets. No markdown headings.',
  '- Neutral. You are not advocating for or against the measure.',
  '',
  '## 6. Output',
  'Return only the summary text. No title, no labels, no commentary.',
].join('\n');

export const DIFF_SYSTEM_PROMPT = [
  '# Hawaiʻi Bill Amendment Summarizer',
  '',
  '## 1. Purpose',
  'You explain what changed between two versions of a Hawaii State Legislature',
  'bill, for community advocates tracking food-related legislation.',
  '',
  '## 2. Your input is a computed diff — trust it (CRITICAL)',
  'The changes have ALREADY been identified by a parser that reads Hawaiʻi\'s',
  'official amendment marks. You will receive them section by section, with each',
  'fragment tagged:',
  "- [removed]   — struck from the bill (Hawaiʻi marks deletions with strikethrough)",
  '- [added]     — inserted into the bill (marked with underline)',
  '- [modified]  — reworded',
  '- [unchanged] — context only, provided so the changes read in context',
  '',
  'YOU MUST NOT look for changes yourself, contradict a tag, or claim something',
  'changed that is not tagged as changed. Do not describe [unchanged] text as new',
  'or removed. If the diff shows no substantive change, say exactly that.',
  '',
  'You may have seen these bill numbers before. Bill numbers are REUSED between',
  'sessions, so anything you recall about them is not evidence. The diff and the',
  'pipeline position below are your only sources.',
  '',
  '## 3. Who made this change (supplied, verified)',
  'The user turn tells you which body produced each version — e.g. HD1 is a House',
  'draft, SD1 a Senate draft, CD1 a conference draft — and the bill\'s committee',
  'assignments in order. This comes from official records, so you may state it.',
  '',
  'Use it to make the changes legible: an appropriation cut in a Finance committee',
  'draft, or scope narrowed when the bill crossed to the Senate, is more meaningful',
  'to a reader than the same change described without attribution. One clause is',
  'enough.',
  '',
  'Do NOT claim a specific committee or legislator authored a specific change',
  'unless the input says so — the version label identifies the chamber and draft',
  'stage, not the author of any individual edit.',
  '',
  '## 4. What to cover',
  '1. The single most consequential change first — what it does, not where it is.',
  '2. Then remaining substantive changes, grouped by what they affect rather than',
  '   by section order.',
  '3. Money and dates explicitly: an appropriation cut from $500,000 to $250,000,',
  '   or an effective date moved, is always substantive. State both the old and',
  '   new values.',
  '4. Say plainly when a change narrows or broadens scope — who is newly covered',
  '   or newly excluded.',
  '5. Ignore pure renumbering, punctuation, and formatting churn.',
  '',
  '## 5. Style',
  '- 80–150 words. Shorter when the changes are minor.',
  '- Lead with substance: "The appropriation drops from $500,000 to $250,000."',
  '  Not: "In section 4, the bill was amended."',
  '- Cite section numbers only when they help a reader find the change.',
  '- Plain language, neutral, "would" for anything not yet law.',
  '- Prose, not bullets. No markdown headings.',
  '',
  '## 6. Partial diffs',
  'If told the parse was incomplete, add one final sentence noting that some',
  'sections could not be compared. Do not speculate about their contents.',
  '',
  '## 7. Output',
  'Return only the summary text. No title, no labels, no commentary.',
].join('\n');

/** Longest run of unchanged context kept around a change, in characters. */
const CONTEXT_CHAR_BUDGET = 400;

export function buildDocumentUserTurn(input: {
  label: string;
  kind: 'bill version' | 'committee report';
  committees: string | null;
  text: string;
}): string {
  const lines: string[] = [`Document: ${input.label} (${input.kind})`];

  const position = describeVersionLabel(input.label);
  if (position) {
    if (input.committees) lines.push(`Committees (in order): ${input.committees}`);
    lines.push(`Produced by: ${position}`);
  }

  lines.push('', 'Text:', input.text);
  return lines.join('\n');
}

function renderSection(section: SectionDiff, comparison: VersionComparison): string[] {
  const lines = [`SECTION ${section.sectionNumber} [${section.kind}]`];

  if (section.presence !== 'both') {
    const only = section.presence === 'olderOnly' ? comparison.olderLabel : comparison.newerLabel;
    lines.push(`  (this section appears only in ${only})`);
  }

  for (const fragment of section.fragments) {
    // Unchanged fragments are context. Truncate long runs so a 17 KB section
    // does not arrive in full, but never drop them — a bare [removed] fragment
    // is meaningless without the sentence around it.
    const text =
      fragment.kind === 'unchanged' && fragment.text.length > CONTEXT_CHAR_BUDGET
        ? `${fragment.text.slice(0, CONTEXT_CHAR_BUDGET)}…`
        : fragment.text;
    lines.push(`  [${fragment.kind}] ${text}`);
  }

  return lines;
}

export function buildDiffUserTurn(input: {
  comparison: VersionComparison;
  committees: string | null;
}): string {
  const { comparison, committees } = input;

  const lines: string[] = [
    `Comparing ${comparison.olderLabel} (older) to ${comparison.newerLabel} (newer).`,
  ];

  const older = describeVersionLabel(comparison.olderLabel);
  const newer = describeVersionLabel(comparison.newerLabel);
  if (older) lines.push(`Older: ${older}`);
  if (newer) lines.push(`Newer: ${newer}`);
  if (committees) lines.push(`Committees (in order): ${committees}`);
  lines.push(`Parse incomplete: ${comparison.parseIncomplete ? 'yes' : 'no'}`);

  // Unchanged SECTIONS are dropped entirely — they are the bulk of the document
  // and contain nothing to report. This is the main cost lever.
  const changed = comparison.sections.filter((s) => s.kind !== 'unchanged');
  for (const section of changed) {
    lines.push('', ...renderSection(section, comparison));
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/summary-prompts.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/summary-prompts.ts src/lib/__tests__/summary-prompts.test.ts
git commit -m "feat: pure prompt construction for document and diff summaries"
```

---

### Task 4: LLM service functions

**Files:**
- Modify: `src/services/llm.ts` (append; do not touch `classifyStatusWithLLM` or `SYSTEM_PROMPT`)

**Interfaces:**
- Consumes: `DOCUMENT_SYSTEM_PROMPT`, `DIFF_SYSTEM_PROMPT`, `buildDocumentUserTurn`, `buildDiffUserTurn` (Task 3); the module-level `client` and `limitFixedWindow` already in `llm.ts`.
- Produces:
  - `summarizeDocumentWithLLM(input: { label: string; kind: 'bill version' | 'committee report'; committees: string | null; text: string; rateLimitKey: string }): Promise<string | null>`
  - `summarizeDiffWithLLM(input: { comparison: VersionComparison; committees: string | null; rateLimitKey: string }): Promise<string | null>`
  - `getSummaryModelName(): string` — the configured model, for the provenance footer.
  - All three return `null` on failure or rate-limit; callers translate that to an error.

- [ ] **Step 1: Add the functions to `src/services/llm.ts`**

Append at the end of the file:

```typescript
// ==============================================
// AI SUMMARIES (documents + version diffs)
// ==============================================
// Spec: docs/superpowers/specs/2026-07-28-ai-version-summaries-design.md
// Prompt construction is PURE and lives in @/lib/summary-prompts — this section
// only orchestrates the call. Opt-in enforcement is the CALLER's job (the action
// and route arms); by the time we get here consent is already verified.

import {
  DOCUMENT_SYSTEM_PROMPT,
  DIFF_SYSTEM_PROMPT,
  buildDocumentUserTurn,
  buildDiffUserTurn,
} from '@/lib/summary-prompts';
import type { VersionComparison } from '@/lib/version-diff';

/** Same fixed window as classification: cheap protection against click-spam. */
const SUMMARY_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

/** The configured model, surfaced in the UI's provenance footer. */
export async function getSummaryModelName(): Promise<string> {
  return process.env.VLLM || process.env.LLM || 'unknown';
}

async function runSummary(
  systemPrompt: string,
  userTurn: string,
  rateLimitKey: string,
): Promise<string | null> {
  const rl = limitFixedWindow(rateLimitKey, SUMMARY_RATE_LIMIT.limit, SUMMARY_RATE_LIMIT.windowMs);
  if (!rl.ok) {
    console.warn('[LLM] summary rate limited', { rateLimitKey, retryAfterMs: retryAfterMs(rl.resetAt) });
    return null;
  }

  const model = process.env.VLLM || process.env.LLM || '';
  if (!model) {
    console.error('[LLM] model not configured. Set VLLM or LLM.');
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userTurn}\n /no_think` },
      ],
      temperature: 0.0,
    });

    const text = response?.choices?.[0]?.message?.content?.trim();
    return text ? text : null;
  } catch (error) {
    console.error('[LLM] summary failed', error);
    return null;
  }
}

export async function summarizeDocumentWithLLM(input: {
  label: string;
  kind: 'bill version' | 'committee report';
  committees: string | null;
  text: string;
  rateLimitKey: string;
}): Promise<string | null> {
  const userTurn = buildDocumentUserTurn({
    label: input.label,
    kind: input.kind,
    committees: input.committees,
    text: input.text,
  });
  return runSummary(DOCUMENT_SYSTEM_PROMPT, userTurn, input.rateLimitKey);
}

export async function summarizeDiffWithLLM(input: {
  comparison: VersionComparison;
  committees: string | null;
  rateLimitKey: string;
}): Promise<string | null> {
  const userTurn = buildDiffUserTurn({
    comparison: input.comparison,
    committees: input.committees,
  });
  return runSummary(DIFF_SYSTEM_PROMPT, userTurn, input.rateLimitKey);
}
```

Move the two `import` statements to the top of the file with the existing imports — `llm.ts` is `'use server'`, so imports must not sit mid-file.

- [ ] **Step 2: Verify the `'use server'` export rule still holds**

`llm.ts` is a `'use server'` module, so it may export ONLY async functions. `getSummaryModelName` is async for exactly this reason even though it does no I/O. Confirm no `const`/`type` was exported.

Run: `npm run build`
Expected: passes. (Typecheck alone does NOT catch `'use server'` export violations — per CLAUDE.md, the build does.)

- [ ] **Step 3: Commit**

```bash
git add src/services/llm.ts
git commit -m "feat: LLM summary functions for documents and version diffs"
```

---

### Task 5: Summary persistence queries

**Files:**
- Create: `src/db/queries/summaries.ts`

**Interfaces:**
- Consumes: `db` from `@/db/kysely/client`; `SUMMARY_PROMPT_VERSION` (Task 3).
- Produces:
  - `type SummaryTarget = 'version' | 'report'`
  - `getSummarySource(target: SummaryTarget, id: string): Promise<{ billId: string; label: string; originalText: string | null; aiSummary: string | null; committees: string | null } | null>`
  - `saveSummary(target: SummaryTarget, id: string, summary: string): Promise<void>`

- [ ] **Step 1: Write the implementation**

```typescript
// src/db/queries/summaries.ts
// THE data-access layer for AI summaries. Per CLAUDE.md all Kysely queries live
// in src/db/queries/* — routes and actions are thin transports over these.
//
// Cache rule (spec §1): a summary is a HIT when ai_summary IS NOT NULL. The
// prompt version is provenance, NOT a staleness check — bumping it must not
// re-bill the corpus. Regeneration is explicit: clear ai_summary.

import { db } from '@/db/kysely/client';
import { SUMMARY_PROMPT_VERSION } from '@/lib/summary-prompts';

export type SummaryTarget = 'version' | 'report';

const TABLE = {
  version: 'bill_versions',
  report: 'committee_reports',
} as const;

export interface SummarySource {
  billId: string;
  label: string;
  originalText: string | null;
  aiSummary: string | null;
  /** bills.committee_assignment — the same field the status classifier uses. */
  committees: string | null;
}

/**
 * Loads everything needed to summarize one document, plus the bill's committee
 * assignments for the prompt's pipeline-position block. Returns null when the
 * row does not exist.
 */
export async function getSummarySource(
  target: SummaryTarget,
  id: string,
): Promise<SummarySource | null> {
  const row = await db
    .selectFrom(TABLE[target])
    .innerJoin('bills', 'bills.id', `${TABLE[target]}.bill_id`)
    .select([
      `${TABLE[target]}.bill_id as billId`,
      `${TABLE[target]}.label as label`,
      `${TABLE[target]}.original_text as originalText`,
      `${TABLE[target]}.ai_summary as aiSummary`,
      'bills.committee_assignment as committees',
    ])
    .where(`${TABLE[target]}.id`, '=', id)
    .executeTakeFirst();

  return row ?? null;
}

/** Persists a generated summary with its provenance. */
export async function saveSummary(
  target: SummaryTarget,
  id: string,
  summary: string,
): Promise<void> {
  await db
    .updateTable(TABLE[target])
    .set({
      ai_summary: summary,
      summary_prompt_version: SUMMARY_PROMPT_VERSION,
      summary_generated_at: new Date(),
    })
    .where('id', '=', id)
    .execute();
}
```

If Kysely rejects the dynamic `TABLE[target]` string interpolation in `select`/`where`, split into two explicit branches (one per table) rather than casting to `any` — the type safety is the point.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes. If the dynamic table name fails to typecheck, apply the two-branch fallback above, then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/summaries.ts
git commit -m "feat: summary read/write queries for versions and reports"
```

---

### Task 6: Server actions with opt-in enforcement

**Files:**
- Create: `src/app/actions/summaries.ts`

**Interfaces:**
- Consumes: `requireSession` from `@/lib/auth-guards`; `getUserPreferences` from `@/db/queries/user-preferences`; Task 5's queries; Task 4's LLM functions; `compareVersionHtml` from `@/services/bill-diff`; `Errors` from `@/lib/errors`.
- Produces:
  - `type SummaryResult = { summary: string; model: string }`
  - `summarizeDocumentAction(input: { target: SummaryTarget; id: string }): Promise<SummaryResult>`
  - `summarizeDiffAction(input: { billId: string; olderId: string; newerId: string }): Promise<SummaryResult>`
  - Both THROW on failure (the data-client contract: return the unwrapped value, throw on error).

- [ ] **Step 1: Write the implementation**

```typescript
// src/app/actions/summaries.ts
'use server';

// Action arm for AI summaries. THE consent boundary: opt-in is read from the DB
// here, server-side, before any inference. The client-side check in
// report-summary.tsx is a UI courtesy, NOT enforcement (spec §3).
//
// A cache hit is not an inference — it returns without calling the model.

import { requireSession } from '@/lib/auth-guards';
import { getUserPreferences } from '@/db/queries/user-preferences';
import { getSummarySource, saveSummary, type SummaryTarget } from '@/db/queries/summaries';
import { summarizeDocumentWithLLM, summarizeDiffWithLLM, getSummaryModelName } from '@/services/llm';
import { compareVersionHtml } from '@/services/bill-diff';
import { db } from '@/db/kysely/client';
import { ApiError } from '@/lib/errors';

export interface SummaryResult {
  summary: string;
  model: string;
}

const AI_NOT_OPTED_IN = new ApiError(
  'AI_NOT_OPTED_IN',
  403,
  'AI summaries are off for your account. Enable them in Settings.',
);

/** Reads consent from the DB. Never trust a client-supplied flag. */
async function requireAiOptIn(): Promise<void> {
  const { user } = await requireSession.fromAction();
  const prefs = await getUserPreferences(user.id);
  if (prefs.ai_opt_in !== true) throw AI_NOT_OPTED_IN;
}

export async function summarizeDocumentAction(input: {
  target: SummaryTarget;
  id: string;
}): Promise<SummaryResult> {
  await requireAiOptIn();

  const source = await getSummarySource(input.target, input.id);
  if (!source) throw new ApiError('NOT_FOUND', 404, 'Document not found.');

  const model = await getSummaryModelName();

  // Cache hit: no inference, no tokens, no write.
  if (source.aiSummary) return { summary: source.aiSummary, model };

  if (!source.originalText || source.originalText.trim().length === 0) {
    throw new ApiError('NO_TEXT', 422, 'This document has no stored text to summarize.');
  }

  const summary = await summarizeDocumentWithLLM({
    label: source.label,
    kind: input.target === 'version' ? 'bill version' : 'committee report',
    committees: source.committees,
    text: source.originalText,
    rateLimitKey: `llm:summary:${input.target}:${input.id}`,
  });

  if (!summary) {
    throw new ApiError('SUMMARY_FAILED', 502, "Couldn't summarize this document. Try again.");
  }

  await saveSummary(input.target, input.id, summary);
  return { summary, model };
}

export async function summarizeDiffAction(input: {
  billId: string;
  olderId: string;
  newerId: string;
}): Promise<SummaryResult> {
  await requireAiOptIn();

  // Diff summaries are never persisted (spec §2), so this recomputes the
  // comparison every call. The input is small — changed fragments only.
  const versions = await db
    .selectFrom('bill_versions')
    .select(['id', 'label', 'html_link'])
    .where('bill_id', '=', input.billId)
    .execute();

  const older = versions.find((v) => v.id === input.olderId);
  const newer = versions.find((v) => v.id === input.newerId);
  if (!older || !newer) throw new ApiError('NOT_FOUND', 404, 'Version not found.');

  const bill = await db
    .selectFrom('bills')
    .select('committee_assignment')
    .where('id', '=', input.billId)
    .executeTakeFirst();

  const comparison = await compareVersionHtml({
    olderLabel: older.label,
    newerLabel: newer.label,
    olderUrl: older.html_link,
    newerUrl: newer.html_link,
  });

  // No diff, no summary (spec §Error handling). An ungrounded account of a
  // legislative amendment is worse than none.
  if (comparison.error || comparison.sections.length === 0) {
    throw new ApiError('NO_DIFF', 422, 'These versions could not be compared, so there is nothing to summarize.');
  }

  const summary = await summarizeDiffWithLLM({
    comparison,
    committees: bill?.committee_assignment ?? null,
    rateLimitKey: `llm:diff:${input.olderId}:${input.newerId}`,
  });

  if (!summary) {
    throw new ApiError('SUMMARY_FAILED', 502, "Couldn't summarize these changes. Try again.");
  }

  return { summary, model: await getSummaryModelName() };
}
```

- [ ] **Step 2: Verify the `'use server'` export rule**

This file exports `SummaryResult` as an `interface`. A `'use server'` file may export ONLY async functions (CLAUDE.md). Move the interface to `src/types/legislation.ts` and import it here as a type-only import.

Add to `src/types/legislation.ts`:

```typescript
/** A generated AI summary plus the model that produced it. */
export interface SummaryResult {
  summary: string;
  model: string;
}
```

Then in `src/app/actions/summaries.ts` replace the local interface with:

```typescript
import type { SummaryResult } from '@/types/legislation';
```

- [ ] **Step 3: Build to confirm**

Run: `npm run build`
Expected: passes. A `'use server'` export violation fails here even though typecheck is clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/summaries.ts src/types/legislation.ts
git commit -m "feat: summary actions with server-side AI opt-in enforcement"
```

---

### Task 7: API routes (fetch arm)

**Files:**
- Create: `src/app/api/bills/[id]/summarize/route.ts`
- Create: `src/app/api/bills/[id]/summarize-diff/route.ts`

**Interfaces:**
- Consumes: Task 6's actions are NOT reused here — routes call the same underlying pieces via the actions to avoid duplicating the consent logic. Import `summarizeDocumentAction` / `summarizeDiffAction` and call them; they are plain async functions and already enforce opt-in.
- Produces: `POST /api/bills/[id]/summarize` and `POST /api/bills/[id]/summarize-diff`, both returning `SummaryResult` JSON, or `{ error }` with the thrown `ApiError`'s status.

- [ ] **Step 1: Write the document route**

```typescript
// src/app/api/bills/[id]/summarize/route.ts
// Fetch arm for data.summaries.summarizeDocument. Thin transport over the
// action, which owns the opt-in check — so both arms share one consent path.

import { NextRequest, NextResponse } from 'next/server';
import { summarizeDocumentAction } from '@/app/actions/summaries';
import type { SummaryTarget } from '@/db/queries/summaries';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const target = body.target as SummaryTarget;
    const id = body.id as string;

    if ((target !== 'version' && target !== 'report') || typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    const result = await summarizeDocumentAction({ target, id });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Summarize document error:', error);
    return NextResponse.json({ error: 'Failed to summarize document' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the diff route**

```typescript
// src/app/api/bills/[id]/summarize-diff/route.ts
// Fetch arm for data.summaries.summarizeDiff. Never persists — recomputes the
// comparison and summarizes it per request.

import { NextRequest, NextResponse } from 'next/server';
import { summarizeDiffAction } from '@/app/actions/summaries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: billId } = await params;
    const body = await request.json().catch(() => ({}));
    const olderId = body.olderId as string;
    const newerId = body.newerId as string;

    if (typeof olderId !== 'string' || typeof newerId !== 'string' || !olderId || !newerId) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    const result = await summarizeDiffAction({ billId, olderId, newerId });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Summarize diff error:', error);
    return NextResponse.json({ error: 'Failed to summarize changes' }, { status: 500 });
  }
}
```

Check the `params` signature against a sibling route (e.g. `src/app/api/bills/[id]/testimony/route.ts`) and match whichever form that Next version uses — awaited `Promise<{ id }>` vs plain object.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bills/\[id\]/summarize/route.ts \
        src/app/api/bills/\[id\]/summarize-diff/route.ts
git commit -m "feat: summary API routes (fetch arm)"
```

---

### Task 8: Data-client wiring

**Files:**
- Create: `src/lib/data-client/summaries.client.ts`
- Modify: `src/lib/data-client/index.ts`

**Interfaces:**
- Consumes: Task 6's actions; Task 7's routes.
- Produces: `data.summaries.summarizeDocument({ target, id })` and `data.summaries.summarizeDiff({ billId, olderId, newerId })`, both resolving to `SummaryResult` and throwing on error.

- [ ] **Step 1: Write the client**

```typescript
// src/lib/data-client/summaries.client.ts
import { defineClient } from './define-client';
import { summarizeDocumentAction, summarizeDiffAction } from '@/app/actions/summaries';
import type { SummaryResult } from '@/types/legislation';
import type { SummaryTarget } from '@/db/queries/summaries';

// ---- fetch arm ----

async function summarizeDocumentFetch(input: {
  target: SummaryTarget;
  id: string;
}): Promise<SummaryResult> {
  // The [id] segment is unused by the document route (the body carries the
  // target + id), but the path must still resolve — use the document id.
  const res = await fetch(`/api/bills/${input.id}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to summarize document');
  }
  return res.json();
}

async function summarizeDiffFetch(input: {
  billId: string;
  olderId: string;
  newerId: string;
}): Promise<SummaryResult> {
  const res = await fetch(`/api/bills/${input.billId}/summarize-diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderId: input.olderId, newerId: input.newerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to summarize changes');
  }
  return res.json();
}

export const summariesClient = defineClient('summaries', {
  summarizeDocument: { action: summarizeDocumentAction, fetch: summarizeDocumentFetch },
  summarizeDiff: { action: summarizeDiffAction, fetch: summarizeDiffFetch },
});
```

- [ ] **Step 2: Register the domain**

In `src/lib/data-client/index.ts`, add the import and the entry:

```typescript
import { summariesClient } from './summaries.client';
```

```typescript
export const data = {
  bills: billsClient,
  proposals: proposalsClient,
  access: accessClient,
  preferences: preferencesClient,
  testimony: testimonyClient,
  boards: boardsClient,
  summaries: summariesClient,
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes. `defineClient` structurally requires the fetch arm to match the action arm's signature — a mismatch fails here, which is the point.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data-client/summaries.client.ts src/lib/data-client/index.ts
git commit -m "feat: register summaries domain in the data-client"
```

---

### Task 9: Document summary UI

**Files:**
- Modify: `src/components/kanban/report-summary.tsx`
- Delete: `src/components/kanban/ai-stub.ts` (only if nothing else imports it — check first)

**Interfaces:**
- Consumes: `data.summaries.summarizeDocument` (Task 8).
- Produces: `SummarySection` gains required props `target: 'version' | 'report'` and `documentId: string`. Callers in `bill-versions-panel.tsx` must pass them.

- [ ] **Step 1: Check whether the stub is used elsewhere**

Run: `grep -rn "ai-stub\|stubSummarize" src --include="*.ts" --include="*.tsx"`
Expected: only `report-summary.tsx`. If anything else uses it, leave the file in place.

- [ ] **Step 2: Rewrite the component body**

Replace the `stubSummarize` import with the data-client, add the two new props, and thread the model through to the card:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { Sparkles, Loader2 } from 'lucide-react';

interface SummarySectionProps {
  /** Which table the document lives in. */
  target: 'version' | 'report';
  /** The bill_versions.id or committee_reports.id being summarized. */
  documentId: string;
  /** Existing saved AI summary, if any. Rendered directly when present. */
  existingSummary?: string | null;
  /** Word for the source in copy, e.g. "version" or "committee report". */
  noun?: string;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: string; model: string | null }
  | { status: 'error'; message: string };

/**
 * Per-item AI summary. Resolves in priority order:
 *  1. A saved `existingSummary` → render it.
 *  2. AI opted in, no summary → a "Summarize" button.
 *  3. AI opted out → verbiage pointing to the View button to read the source.
 *
 * The opt-in check here is a UI courtesy only — the server re-checks it before
 * any inference (see actions/summaries.ts).
 */
export function SummarySection({
  target,
  documentId,
  existingSummary,
  noun = 'document',
}: SummarySectionProps) {
  const { preferences } = useAuth();
  const aiOptedIn = preferences?.ai_opt_in === true;

  const [state, setState] = useState<State>(
    existingSummary ? { status: 'done', summary: existingSummary, model: null } : { status: 'idle' },
  );

  if (state.status === 'done') {
    return <SummaryCard summary={state.summary} model={state.model} />;
  }

  if (!aiOptedIn) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>AI summaries are off. Open the {noun} to read it in full.</span>
      </div>
    );
  }

  async function summarize() {
    setState({ status: 'loading' });
    try {
      const result = await data.summaries.summarizeDocument({ target, id: documentId });
      setState({ status: 'done', summary: result.summary, model: result.model });
    } catch (error: any) {
      setState({ status: 'error', message: error?.message || "Couldn't summarize — try again." });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={summarize}
        disabled={state.status === 'loading'}
        className="h-7 gap-1 self-start px-1.5 text-xs text-olive-dark hover:bg-transparent hover:text-olive-dark/80 focus-visible:bg-transparent"
      >
        {state.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {state.status === 'loading' ? 'Summarizing…' : 'Summarize'}
      </Button>
      {state.status === 'error' && (
        <span className="px-1.5 text-[11px] text-destructive">{state.message}</span>
      )}
    </div>
  );
}

export function SummaryCard({ summary, model }: { summary: string; model: string | null }) {
  return (
    <div className="rounded-md border border-olive-dark/30 bg-olive-soft/40 p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-olive-dark" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-olive-dark">AI summary</span>
      </div>
      <p className="text-[11px] leading-relaxed text-foreground/80">{summary}</p>
      {model && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Generated by {model}</p>
      )}
    </div>
  );
}
```

`SummaryCard` is now exported so Task 10 can reuse it — one visual language for both summary kinds.

- [ ] **Step 3: Pass the new props at all four call sites**

`src/components/kanban/bill-versions-panel.tsx` renders `SummarySection` at lines ~37, ~92, ~110, ~143. Each needs `target` and `documentId`:

```typescript
// report context (lines ~37, ~110)
<SummarySection target="report" documentId={report.id} existingSummary={report.aiSummary} noun="committee report" />

// version context (lines ~92, ~143)
<SummarySection target="version" documentId={latestVersion.id} existingSummary={latestVersion.aiSummary} noun="version" />
```

Read each call site and use the variable actually in scope there (`report`, `latestVersion`, `latestReport`, `group.version`) — do not copy these names blindly.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes. Missing `target`/`documentId` at any call site fails here.

- [ ] **Step 5: Delete the stub if unused**

Only if Step 1 showed no other consumer:

```bash
git rm src/components/kanban/ai-stub.ts
```

- [ ] **Step 6: Build and test**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/kanban/
git commit -m "feat: wire document summaries to the real LLM with provenance footer"
```

---

### Task 10: Diff summary UI in the "Summary of changes" block

**Files:**
- Modify: `src/components/kanban/version-diff-accordion.tsx:69-86`
- Modify: `src/components/kanban/version-compare.tsx` (pass the ids down)

**Interfaces:**
- Consumes: `data.summaries.summarizeDiff` (Task 8); `SummaryCard` (Task 9).
- Produces: `VersionDiffAccordion` gains optional props `billId?: string`, `olderId?: string`, `newerId?: string`. When all three are present and the comparison is summarizable, a Summarize button renders inside the existing "Summary of changes" block.

- [ ] **Step 1: Add the AI layer to the accordion's summary block**

In `version-diff-accordion.tsx`, extend the props and add state:

```typescript
'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './report-summary';
import { Sparkles, Loader2 } from 'lucide-react';
// ...existing imports

interface VersionDiffAccordionProps {
  comparison: VersionComparison;
  /** All three required to offer an AI summary; omit to render counts only. */
  billId?: string;
  olderId?: string;
  newerId?: string;
}

type DiffSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: string; model: string }
  | { status: 'error'; message: string };

export function VersionDiffAccordion({
  comparison,
  billId,
  olderId,
  newerId,
}: VersionDiffAccordionProps) {
  const { preferences } = useAuth();
  const aiOptedIn = preferences?.ai_opt_in === true;
  const [aiState, setAiState] = useState<DiffSummaryState>({ status: 'idle' });

  // ...existing changed/unchanged useMemo and the early return stay as-is
```

Then inside the existing "Summary of changes" `<div>` (currently lines 71–79), after the mechanical count `<p>`, add:

```tsx
        {canSummarize && aiState.status !== 'done' && (
          <div className="mt-2 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={summarizeDiff}
              disabled={aiState.status === 'loading'}
              className="h-7 gap-1 self-start px-1.5 text-xs text-olive-dark hover:bg-transparent hover:text-olive-dark/80 focus-visible:bg-transparent"
            >
              {aiState.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiState.status === 'loading' ? 'Summarizing…' : 'Summarize changes'}
            </Button>
            {aiState.status === 'error' && (
              <span className="px-1.5 text-[11px] text-destructive">{aiState.message}</span>
            )}
          </div>
        )}
        {aiState.status === 'done' && (
          <div className="mt-2">
            <SummaryCard summary={aiState.summary} model={aiState.model} />
          </div>
        )}
```

And the predicate + handler, above the `return`:

```typescript
  // No diff, no summary (spec §Error handling). Also requires opt-in and ids.
  const canSummarize =
    aiOptedIn &&
    !!billId && !!olderId && !!newerId &&
    !comparison.error &&
    comparison.sections.length > 0;

  async function summarizeDiff() {
    if (!billId || !olderId || !newerId) return;
    setAiState({ status: 'loading' });
    try {
      const result = await data.summaries.summarizeDiff({ billId, olderId, newerId });
      setAiState({ status: 'done', summary: result.summary, model: result.model });
    } catch (error: any) {
      setAiState({ status: 'error', message: error?.message || "Couldn't summarize — try again." });
    }
  }
```

**Never call `summarizeDiff` from a `useEffect`.** It must fire only from the button (spec: dynamic summaries scale with traffic, so auto-generating bills per page view).

- [ ] **Step 2: Pass the ids from `version-compare.tsx`**

At line ~112 the accordion is rendered as `<VersionDiffAccordion comparison={comparison} />`. Change it to:

```tsx
<VersionDiffAccordion
  comparison={comparison}
  billId={billId}
  olderId={olderId}
  newerId={newerId}
/>
```

`billId`, `olderId`, and `newerId` are already in scope in that component (they drive the `useEffect` that fetches the comparison).

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 4: Verify the no-auto-generate rule by inspection**

Run: `grep -n "useEffect" src/components/kanban/version-diff-accordion.tsx`
Expected: no `useEffect` calls `summarizeDiff`. The only path to it is the button's `onClick`.

- [ ] **Step 5: Commit**

```bash
git add src/components/kanban/version-diff-accordion.tsx src/components/kanban/version-compare.tsx
git commit -m "feat: on-demand AI summary of changes in the compare panel"
```

---

### Task 11: Carry provenance through the mappers

**Files:**
- Modify: `src/types/legislation.ts:20-44`
- Modify: `src/db/queries/bill-mappers.ts:26-49`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: `BillVersion.summaryGeneratedAt: string | null` and `CommitteeReport.summaryGeneratedAt: string | null`, populated by `mapVersionRow` / `mapReportRow`.

This makes the "generated at" date available to the UI for already-saved summaries, where the client has no fresh `SummaryResult` to read a timestamp from.

- [ ] **Step 1: Add the field to both types**

In `src/types/legislation.ts`, add to `BillVersion` and `CommitteeReport`:

```typescript
  /** When the stored AI summary was generated; null if never summarized. */
  summaryGeneratedAt: string | null;
```

- [ ] **Step 2: Populate it in both mappers**

In `src/db/queries/bill-mappers.ts`, add to the object returned by `mapVersionRow` and by `mapReportRow`:

```typescript
    summaryGeneratedAt: row.summary_generated_at
      ? new Date(row.summary_generated_at).toISOString()
      : null,
```

- [ ] **Step 3: Fix the test fixtures the new required field breaks**

Adding a required field breaks object literals in existing tests. Run:

Run: `npm run typecheck`
Expected: errors in `src/lib/__tests__/bill-versions.test.ts`, `bill-briefing-facts.test.ts`, `bill-diff.test.ts` — each builds `BillVersion` literals.

Add `summaryGeneratedAt: null` to each failing fixture, then re-run until clean.

- [ ] **Step 4: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/legislation.ts src/db/queries/bill-mappers.ts src/lib/__tests__/
git commit -m "feat: carry summary provenance through the bill mappers"
```

---

### Task 12: End-to-end manual verification

**Files:** none — this task produces evidence, not code.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: listening on port 9002.

- [ ] **Step 2: Verify the opted-out path shows no AI affordance**

With `ai_opt_in = false` for your user (toggle it off in Settings), open a bill's Versions & Reports tab.
Expected: "AI summaries are off. Open the version to read it in full." on documents, and the Compare panel shows only the mechanical count with NO "Summarize changes" button.

- [ ] **Step 3: Verify the server rejects an opted-out caller**

This is the property the whole consent design rests on — the client check is not enforcement, so test the server directly. With `ai_opt_in` still false:

```bash
curl -i -X POST http://localhost:9002/api/bills/<BILL_ID>/summarize \
  -H 'Content-Type: application/json' \
  -b 'session=<YOUR_SESSION_COOKIE>' \
  -d '{"target":"version","id":"<VERSION_ID>"}'
```

Expected: `HTTP/1.1 403` and `{"error":"AI summaries are off for your account. Enable them in Settings."}`. If this returns 200, the consent boundary is broken — stop and fix Task 6 before continuing.

- [ ] **Step 4: Verify document summarization end to end**

Toggle `ai_opt_in` on. Click Summarize on a version that has `original_text`.
Expected: a summary appears with a "Generated by <model>" footer. Then confirm it persisted:

```bash
psql "$DATABASE_URL" -c "SELECT label, summary_prompt_version, summary_generated_at, left(ai_summary, 60) FROM bill_versions WHERE id = '<VERSION_ID>';"
```

Expected: `summary_prompt_version = 'v1'`, a timestamp, and the summary text.

- [ ] **Step 5: Verify the cache hit does not re-infer**

Reload the page and open the same version.
Expected: the summary renders immediately with no Summarize button and no LLM log line in the dev server output.

- [ ] **Step 6: Verify diff summarization**

In Compare Versions, pick two versions with real changes (HB1494 HD1→HD2 is a known-good pair per the comparison design). Confirm the block shows the mechanical count on load with NO summary, then click "Summarize changes".
Expected: a narrative summary appears describing actual changes. Cross-check two claims against the accordion's own fragments — if the summary asserts a change the diff does not show, the grounding rules need tightening before this ships.

- [ ] **Step 7: Verify a 404 version pair degrades correctly**

Compare against a version whose `html_link` 404s (`HB1494_CD1` or `SB2575_SD2` per the comparison design's finding 1).
Expected: the existing diff-error copy, and NO "Summarize changes" button.

- [ ] **Step 8: Commit nothing; report findings**

If every step passed, report that. If any step failed, report exactly which and the observed output — do not claim completion.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 provenance columns + `v0` backfill | 1 |
| §1 cache rule (non-NULL = hit) | 5, 6 |
| §1 no `summary_model`, model from config | 4 (`getSummaryModelName`) |
| §2 diff summaries not persisted | 6 (`summarizeDiffAction` writes nothing) |
| §2 structured input, not prose | 3 (`buildDiffUserTurn`) |
| §3 server-side opt-in enforcement | 6 (`requireAiOptIn`), verified in 12 step 3 |
| §3 cache hit is not an inference | 6, verified in 12 step 5 |
| Prompts A and B verbatim | 3 |
| Pipeline position, shared label helper | 2, 3 |
| Document summary UI + footer | 9 |
| Diff summary in "Summary of changes", click-only | 10, verified in 12 steps 4/6 |
| No diff, no summary | 6 (`NO_DIFF`), 10 (`canSummarize`), verified in 12 step 7 |
| `parseIncomplete` still generates | 3 (passed through), 10 (not in `canSummarize`) |
| Failed generations not recorded | 6 (throws without writing) |
| Committee reports identical to versions | 1, 5, 6, 9 |
| Tests: prompt construction, label parsing | 2, 3 |

**Gap found and closed:** the spec's test list mentions a cache-staleness test, but with the `v0` backfill the rule collapsed to "non-NULL is a hit," which is a one-line DB predicate in `summaries.ts` rather than pure logic — it has no home in `src/lib/__tests__/` (CLAUDE.md: pure functions only, no DB, no mocking). It is covered by manual verification instead (Task 12 step 5).

**Type consistency:** `SummaryResult` is defined once in `src/types/legislation.ts` (Task 6 step 2) and consumed by Tasks 7, 8, 9, 10. `SummaryTarget` is defined once in `src/db/queries/summaries.ts` (Task 5) and consumed by Tasks 6, 7, 8. `SummaryCard` is exported in Task 9 and imported in Task 10 with matching `{ summary, model }` props. `describeVersionLabel` is defined in Task 2 and consumed only by Task 3.

**Known risk flagged for the implementer:** Task 5's dynamic `TABLE[target]` table name may not satisfy Kysely's type system. The fallback (two explicit branches) is stated inline rather than left as a surprise.
