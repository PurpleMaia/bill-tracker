# Bill Education Tooltips & Explainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every piece of legislative jargon on a bill explainable in one interaction on any device, and give causally-hard terms a narrative `/learn` page that explains why each stage exists.

**Architecture:** A pure glossary registry in `src/lib/glossary/` (static slugs + runtime resolvers that delegate to existing copy sources), a single `<Term>` component that renders a Radix Tooltip on fine-pointer devices and a Radix Popover otherwise, per-surface wiring at a capped marking density, and a static `/learn` walkthrough with anchors the tooltips deep-link into.

**Tech Stack:** Next.js 15 App Router, TypeScript, Radix UI (`@radix-ui/react-tooltip` ^1.1.8 and `@radix-ui/react-popover` ^1.1.6 — both already dependencies), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-bill-education-tooltips-design.md`

## Global Constraints

- `src/lib/` is DB-free. The glossary module contains no queries, no network, no React.
- No barrel `index.ts` files. Import by deep path (`@/lib/glossary/terms`).
- Delegate, never duplicate: status copy comes from `COLUMN_DESCRIPTIONS`, committee names from `committeeFullName`, version positions from `describeVersionLabel`. One source of truth per fact.
- A missing definition renders plain text with **no affordance** — never a marker that opens an empty card.
- `<Term>` defaults to **popover** before pointer detection resolves (SSR has no `matchMedia`).
- Trigger is a real `<button>` and calls `stopPropagation()`.
- Never render a `<button>` inside an `<a>`.
- Marking density: kanban cards get status + committee + deadline only. Bill dialog/briefing/contact/testimony get full marking.
- Chips get no added icon. ⓘ appears only in the sibling-link case.
- Tests are pure unit tests in `src/lib/__tests__/` (flat, not mirrored). No DB, no mocking.
- `/learn` adds no `db/queries` function and no API route; it reads bills through the existing `data.bills` client path.
- Run `npm test`, `npm run typecheck`, and `npm run build` before each commit. The build catches `'use server'` export violations typecheck misses.
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`. No `Co-Authored-By` lines.

## File Structure

**Create:**
- `src/lib/glossary/terms.ts` — `TermSlug`, `GlossaryTerm`, static `GLOSSARY` registry (Tier 2 + Tier 3 copy)
- `src/lib/glossary/resolvers.ts` — `resolveStatusTerm`, `resolveCommitteeTerm`, `resolveVersionTerm`, `resolveDeadlineTerm`
- `src/lib/bills/progress-stages.ts` — `PROGRESS_STAGES` lifted out of the dialog, plus stage descriptions and `getProgressValue`/`getCurrentStageName`
- `src/components/ui/term.tsx` — the `<Term>` component and `useFinePointer` hook
- `src/app/learn/page.tsx` — the `/learn` walkthrough
- `src/components/learn/learn-walkthrough.tsx` — walkthrough body (client component; reads `?bill=`)
- `src/lib/__tests__/glossary.test.ts` — registry integrity + resolver tests
- `src/lib/__tests__/progress-stages.test.ts` — stage mapping tests

**Modify:**
- `src/lib/core/providers.tsx` — add root `TooltipProvider`
- `src/components/kanban/bill-details-dialog.tsx` — import `PROGRESS_STAGES` from the new module; wire Tier 2 terms
- `src/components/kanban/kanban-card.tsx` — status/committee/deadline terms via `<Term>`
- `src/components/kanban/kanban-spreadsheet.tsx`, `bill-briefing.tsx`, `bill-versions-panel.tsx`, `version-compare.tsx`, `versions-reports-tab.tsx`, `bills/bill-reference-panel.tsx`, `app/bills/[id]/contact/page.tsx`, `kanban-pill-strip.tsx` — wiring

---

### Task 1: Lift `PROGRESS_STAGES` into a shared module

The dialog hardcodes the stage arc at `bill-details-dialog.tsx:81-101`. `/learn` needs the same arc; duplicating it would drift. This task is pure refactor — no behavior change.

**Files:**
- Create: `src/lib/bills/progress-stages.ts`
- Modify: `src/components/kanban/bill-details-dialog.tsx:81-101`
- Test: `src/lib/__tests__/progress-stages.test.ts`

**Interfaces:**
- Consumes: `BillStatus` from `@/types/legislation`
- Produces:
  - `PROGRESS_STAGES: readonly ProgressStage[]` where `ProgressStage = { id: string; name: string; statuses: string[]; description: string }`
  - `getProgressValue(status: BillStatus): number`
  - `getCurrentStageName(status: BillStatus): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/progress-stages.test.ts
import { describe, it, expect } from 'vitest';
import { PROGRESS_STAGES, getProgressValue, getCurrentStageName } from '@/lib/bills/progress-stages';
import { KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';
import type { BillStatus } from '@/types/legislation';

describe('PROGRESS_STAGES', () => {
  it('gives every stage a unique id and a non-empty description', () => {
    const ids = PROGRESS_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const stage of PROGRESS_STAGES) {
      expect(stage.description.length).toBeGreaterThan(0);
    }
  });

  it('maps every KANBAN_COLUMNS status to exactly one stage', () => {
    for (const col of KANBAN_COLUMNS) {
      if (col.id === 'unassigned') continue;
      const matches = PROGRESS_STAGES.filter((s) => s.statuses.includes(col.id));
      expect(matches, `status ${col.id}`).toHaveLength(1);
    }
  });

  it('returns an increasing progress value along the arc', () => {
    expect(getProgressValue('introduced' as BillStatus))
      .toBeLessThan(getProgressValue('conferencePassed' as BillStatus));
  });

  it('names the current stage, falling back for unknown statuses', () => {
    expect(getCurrentStageName('governorSigns' as BillStatus)).toBe('Law');
    expect(getCurrentStageName('nonsense' as BillStatus)).toBe('Not Assigned');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/progress-stages.test.ts`
Expected: FAIL — cannot resolve `@/lib/bills/progress-stages`.

- [ ] **Step 3: Create the module**

Copy the six stages verbatim from `bill-details-dialog.tsx:81-88`, add an `id` and a novice-facing `description` to each. The `statuses` arrays must not change — they include deferred statuses (`deferred1`, `crossoverDeferred2`, …) absent from `KANBAN_COLUMNS`, and dropping them would break the dialog's progress bar.

```ts
// src/lib/bills/progress-stages.ts
// The coarse narrative arc of a bill, shared by the bill dialog's progress bar
// and the /learn walkthrough. This is deliberately COARSER than KANBAN_COLUMNS:
// six stages a newcomer can hold in their head, versus 21 precise statuses.
// Term-level status copy lives in COLUMN_DESCRIPTIONS, not here.
import type { BillStatus } from '@/types/legislation';

export interface ProgressStage {
  id: string;
  name: string;
  /** Status ids that place a bill in this stage. Includes deferred statuses
   *  that are not KANBAN_COLUMNS entries — see EXTENDED_INDEX. */
  statuses: string[];
  /** Novice-facing: what happens here and why the stage exists. */
  description: string;
}

export const PROGRESS_STAGES: readonly ProgressStage[] = [
  {
    id: 'introduced',
    name: 'Introduced',
    statuses: ['introduced'],
    description:
      'A legislator files the bill and it passes First Reading — a formal step that puts it on the record. It is then referred to committees, which decide whether it goes any further.',
  },
  {
    id: 'orig-chamber',
    name: 'Orig. Chamber',
    statuses: ['scheduled1', 'deferred1', 'waiting2', 'scheduled2', 'deferred2', 'waiting3', 'scheduled3', 'deferred3', 'crossoverWaiting1'],
    description:
      'The bill works through committees in the chamber where it started. Each committee must hold a hearing and vote to advance it. Most bills die here, because a committee chair is not required to schedule a hearing at all.',
  },
  {
    id: 'non-orig-chamber',
    name: 'Non-Orig. Chamber',
    statuses: ['crossoverScheduled1', 'crossoverDeferred1', 'crossoverWaiting2', 'crossoverScheduled2', 'crossoverDeferred2', 'crossoverWaiting3', 'crossoverScheduled3', 'crossoverDeferred3', 'passedCommittees'],
    description:
      'After passing its first chamber, the bill crosses over to the other one and starts committee review again from the beginning. Both chambers must agree on identical text before anything can become law — that is why this second pass exists.',
  },
  {
    id: 'conference',
    name: 'Conference',
    statuses: ['conferenceAssigned', 'conferenceScheduled', 'conferenceDeferred', 'conferencePassed'],
    description:
      'When the two chambers pass different versions, a small group of negotiators from each — conferees — meets to produce one compromise draft. If they cannot agree, the bill dies even though both chambers approved a version of it.',
  },
  {
    id: 'governor',
    name: 'Governor',
    statuses: ['transmittedGovernor', 'vetoList'],
    description:
      'The final text goes to the Governor, who can sign it, veto it, or let it become law without a signature. The legislature can override a veto with a two-thirds vote in each chamber.',
  },
  {
    id: 'law',
    name: 'Law',
    statuses: ['governorSigns', 'lawWithoutSignature'],
    description:
      'The bill is now an Act — part of Hawaii law. It usually takes effect on a date written into the text itself.',
  },
];

export const getProgressValue = (status: BillStatus): number => {
  const idx = PROGRESS_STAGES.findIndex((s) => s.statuses.includes(status));
  if (idx === -1) return status === 'introduced' ? (1 / (PROGRESS_STAGES.length + 1)) * 100 : 0;
  return ((idx + 1) / PROGRESS_STAGES.length) * 100;
};

export const getCurrentStageName = (status: BillStatus): string => {
  const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(status));
  if (stage) return stage.name;
  if (status === 'introduced') return 'Introduced';
  return 'Not Assigned';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/progress-stages.test.ts`
Expected: PASS.

If the "exactly one stage" test fails, a `KANBAN_COLUMNS` id is missing from every stage or listed in two. Fix the arrays, not the test.

- [ ] **Step 5: Delete the dialog's local copy and import instead**

In `bill-details-dialog.tsx`, delete lines 81-101 (`PROGRESS_STAGES`, `getProgressValue`, `getCurrentStageName`) and add to the imports:

```ts
import { PROGRESS_STAGES, getProgressValue, getCurrentStageName } from '@/lib/bills/progress-stages';
```

Leave every call site unchanged — the signatures are identical.

- [ ] **Step 6: Verify nothing broke**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass. `PROGRESS_STAGES` is still referenced in the dialog's stage strip, so an unused-import error means a call site was removed by mistake.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bills/progress-stages.ts src/lib/__tests__/progress-stages.test.ts src/components/kanban/bill-details-dialog.tsx
git commit -m "refactor: lift PROGRESS_STAGES into a shared module with stage descriptions"
```

---

### Task 2: Glossary registry (Tier 2 + Tier 3 copy)

**Files:**
- Create: `src/lib/glossary/terms.ts`
- Test: `src/lib/__tests__/glossary.test.ts`

**Interfaces:**
- Produces:
  - `type TermSlug` — string-literal union of every static term
  - `interface GlossaryTerm { term: string; short: string; learnMoreAnchor?: string }`
  - `const GLOSSARY: Record<TermSlug, GlossaryTerm>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/glossary.test.ts
import { describe, it, expect } from 'vitest';
import { GLOSSARY } from '@/lib/glossary/terms';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';

describe('GLOSSARY', () => {
  it('gives every term a display name and a short definition', () => {
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.length, slug).toBeGreaterThan(0);
      expect(entry.short.length, slug).toBeGreaterThan(0);
    }
  });

  it('keeps short definitions short enough for a tooltip', () => {
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
      expect(entry.short.split(/\s+/).length, slug).toBeLessThanOrEqual(45);
    }
  });

  it('points every learnMoreAnchor at a real /learn stage', () => {
    const anchors = new Set(PROGRESS_STAGES.map((s) => s.id));
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
      if (!entry.learnMoreAnchor) continue;
      expect(anchors.has(entry.learnMoreAnchor), `${slug} -> ${entry.learnMoreAnchor}`).toBe(true);
    }
  });

  it('covers the Tier 3 deadline jargon', () => {
    for (const slug of ['decking', 'lateral', 'sine-die', 'triple-referral', 'single-referral-filing']) {
      expect(GLOSSARY, slug).toHaveProperty(slug);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/glossary.test.ts`
Expected: FAIL — cannot resolve `@/lib/glossary/terms`.

- [ ] **Step 3: Write the registry**

Every `short` must be ≤45 words and must not assume prior knowledge. `learnMoreAnchor` values must be `PROGRESS_STAGES` ids.

```ts
// src/lib/glossary/terms.ts
// Static glossary for legislative jargon. PURE — no DB, no React.
//
// Terms whose copy already exists elsewhere (statuses, committee names, version
// positions) are NOT duplicated here; they resolve through ./resolvers.ts.
// This file holds only vocabulary that had no home before.

export interface GlossaryTerm {
  term: string;
  /** Tooltip body. Keep to ~45 words — it has to fit a 375px popover. */
  short: string;
  /** A PROGRESS_STAGES id in /learn. Only for terms whose meaning depends on
   *  the surrounding sequence; most terms need no second tier. */
  learnMoreAnchor?: string;
}

export const GLOSSARY = {
  'bill-number': {
    term: 'Bill number',
    short:
      'The bill\'s permanent ID. "HB" means it started in the House, "SB" in the Senate. The number is just the filing order — a lower number does not mean the bill matters more.',
    learnMoreAnchor: 'introduced',
  },
  'relating-to': {
    term: '"Relating to" title',
    short:
      'The bill\'s official subject line, always written as "RELATING TO …". It is a legal label for the area of law being changed, not a summary of what the bill does.',
  },
  introducers: {
    term: 'Introducers',
    short:
      'The legislators who formally filed the bill. The first name listed is usually the lead sponsor. Introducing a bill is not the same as voting for it later.',
  },
  committee: {
    term: 'Committee',
    short:
      'A small group of legislators that reviews bills on one subject before the full chamber sees them. A bill must clear every committee it is referred to, in order, to stay alive.',
    learnMoreAnchor: 'orig-chamber',
  },
  'committee-chair': {
    term: 'Committee chair',
    short:
      'The legislator who runs a committee and decides which bills get a hearing. A chair who never schedules a bill kills it without any vote being taken — this is how most bills die.',
    learnMoreAnchor: 'orig-chamber',
  },
  'committee-report': {
    term: 'Committee report',
    short:
      'The document a committee publishes after voting on a bill. It records the committee\'s recommendation and explains any changes it made to the text.',
  },
  'report-code': {
    term: 'Report code',
    short:
      'An ID for a committee report. "HSCR" is a House standing committee report, "SSCR" the Senate equivalent, and "CCR" a conference committee report. The digits are just a counter.',
  },
  'bill-version': {
    term: 'Bill version',
    short:
      'A snapshot of the bill\'s text. Each committee can amend it, producing a new numbered draft, so one bill usually has several versions. Only the final one can become law.',
    learnMoreAnchor: 'orig-chamber',
  },
  crossover: {
    term: 'Crossover',
    short:
      'The point where a bill passes its first chamber and moves to the other one, which reviews it from the start. Both chambers must pass identical text, so this second pass is unavoidable.',
    learnMoreAnchor: 'non-orig-chamber',
  },
  conference: {
    term: 'Conference committee',
    short:
      'When the House and Senate pass different versions, negotiators from both meet to agree on one final text. If they miss the deadline, the bill dies despite passing both chambers.',
    learnMoreAnchor: 'conference',
  },
  fiscal: {
    term: 'Fiscal bill',
    short:
      'A bill that spends money or affects revenue, so it must also clear a money committee — Finance in the House or Ways and Means in the Senate. That extra stop gets its own later deadline.',
    learnMoreAnchor: 'orig-chamber',
  },
  chamber: {
    term: 'Chamber',
    short:
      'One of the legislature\'s two halves: the House (H) and the Senate (S). A bill must pass both. "H" or "S" here marks which chamber took the action.',
    learnMoreAnchor: 'non-orig-chamber',
  },
  // --- Tier 3: deadline jargon, explained nowhere before ---
  decking: {
    term: 'Decking',
    short:
      'The deadline for publishing a bill\'s final text before a floor vote. Members must have the finished wording in hand a set number of days ahead, so missing the decking date stops the vote.',
    learnMoreAnchor: 'orig-chamber',
  },
  lateral: {
    term: 'Lateral',
    short:
      'The deadline for a bill to move sideways from one committee to the next within the same chamber. A bill still sitting in an earlier committee after this date is finished.',
    learnMoreAnchor: 'orig-chamber',
  },
  'sine-die': {
    term: 'Sine die',
    short:
      'Latin for "without a day" — the final adjournment that ends the session. Anything not passed by then dies and must be reintroduced from scratch next year.',
    learnMoreAnchor: 'law',
  },
  'triple-referral': {
    term: 'Triple referral',
    short:
      'A bill sent to three committees in one chamber. Each is another hearing that must be scheduled, so triple-referred bills have the least time and the lowest odds of surviving.',
    learnMoreAnchor: 'orig-chamber',
  },
  'single-referral-filing': {
    term: 'Single referral filing',
    short:
      'The deadline for bills referred to just one committee in a chamber. Because they have only one hearing to clear, their cutoff comes earlier than multi-committee bills.',
    learnMoreAnchor: 'orig-chamber',
  },
} as const satisfies Record<string, GlossaryTerm>;

export type TermSlug = keyof typeof GLOSSARY;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/glossary.test.ts`
Expected: PASS. A word-count failure means a `short` needs trimming — trim the copy, do not raise the limit.

- [ ] **Step 5: Commit**

```bash
git add src/lib/glossary/terms.ts src/lib/__tests__/glossary.test.ts
git commit -m "feat: add glossary registry for legislative jargon"
```

---

### Task 3: Delegating resolvers

Runtime data (a status id, a committee code, a version label) cannot be a compile-time slug. These resolvers turn data into a `GlossaryTerm`, delegating to the existing copy sources, and return `null` when there is no definition — which is what lets callers omit the affordance.

**Files:**
- Create: `src/lib/glossary/resolvers.ts`
- Modify: `src/lib/__tests__/glossary.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `GlossaryTerm` from `./terms`; `COLUMN_DESCRIPTIONS`, `COLUMN_TITLES` from `@/lib/bills/kanban-columns`; `COMMITTEE_NAMES` from `@/lib/testimony/committees`; `describeVersionLabel` from `@/lib/versions/version-labels`
- Produces:
  - `resolveStatusTerm(statusId: string): GlossaryTerm | null`
  - `resolveCommitteeTerm(code: string): GlossaryTerm | null`
  - `resolveVersionTerm(label: string): GlossaryTerm | null`
  - `resolveDeadlineTerm(deadlineName: string): GlossaryTerm | null`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/__tests__/glossary.test.ts
import {
  resolveStatusTerm,
  resolveCommitteeTerm,
  resolveVersionTerm,
  resolveDeadlineTerm,
} from '@/lib/glossary/resolvers';
import { KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';

describe('resolveStatusTerm', () => {
  it('resolves every kanban column to non-empty copy', () => {
    for (const col of KANBAN_COLUMNS) {
      if (col.id === 'unassigned') continue;
      const term = resolveStatusTerm(col.id);
      expect(term, col.id).not.toBeNull();
      expect(term!.short.length, col.id).toBeGreaterThan(0);
    }
  });

  it('returns null for an unknown status id', () => {
    expect(resolveStatusTerm('not-a-status')).toBeNull();
  });
});

describe('resolveCommitteeTerm', () => {
  it('expands a known committee code', () => {
    const term = resolveCommitteeTerm('FIN');
    expect(term).not.toBeNull();
    expect(term!.short).toContain('Finance');
  });

  it('handles a joint referral', () => {
    expect(resolveCommitteeTerm('WLA/EIG')!.short).toContain('/');
  });

  // committeeFullName passes unknown codes through unchanged, so a naive
  // implementation would "define" XYZ as "XYZ". That must be null instead.
  it('returns null for a code with no known name', () => {
    expect(resolveCommitteeTerm('XYZ')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveCommitteeTerm('')).toBeNull();
  });
});

describe('resolveVersionTerm', () => {
  it('describes a recognized draft label', () => {
    const term = resolveVersionTerm('HB1494_HD1');
    expect(term).not.toBeNull();
    expect(term!.short).toContain('House, first committee draft');
  });

  it('describes a bare bill number as introduced', () => {
    expect(resolveVersionTerm('HB1494')!.short).toContain('As introduced');
  });

  // describeVersionLabel returns null for these on purpose — it refuses to
  // assert a pipeline position it cannot verify.
  it('returns null where describeVersionLabel does', () => {
    expect(resolveVersionTerm('HB1494_HFA4')).toBeNull();
    expect(resolveVersionTerm('HB1494_PROPOSED')).toBeNull();
    expect(resolveVersionTerm('')).toBeNull();
  });
});

describe('resolveDeadlineTerm', () => {
  it('matches deadline names to Tier 3 jargon', () => {
    expect(resolveDeadlineTerm('First Decking')!.term).toBe('Decking');
    expect(resolveDeadlineTerm('Final Decking (Fiscal)')!.term).toBe('Decking');
    expect(resolveDeadlineTerm('Second Lateral')!.term).toBe('Lateral');
    expect(resolveDeadlineTerm('Adjournment Sine Die')!.term).toBe('Sine die');
    expect(resolveDeadlineTerm('First Triple Referral Filing')!.term).toBe('Triple referral');
    expect(resolveDeadlineTerm('Single Referral Filing (SBs)')!.term).toBe('Single referral filing');
  });

  it('returns null for an unrecognized deadline name', () => {
    expect(resolveDeadlineTerm('Some New Deadline')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/glossary.test.ts`
Expected: FAIL — cannot resolve `@/lib/glossary/resolvers`.

- [ ] **Step 3: Write the resolvers**

Note the ordering constraint in `resolveDeadlineTerm`: "Single Referral Filing" must be tested before "Triple Referral", and both before a bare "Referral" check, or a substring match returns the wrong term.

```ts
// src/lib/glossary/resolvers.ts
// Turn runtime bill data into glossary entries by DELEGATING to the copy that
// already exists. Each returns null when there is genuinely no definition, so
// callers render plain text instead of an affordance that opens an empty card.
import type { GlossaryTerm } from './terms';
import { GLOSSARY } from './terms';
import { COLUMN_DESCRIPTIONS, COLUMN_TITLES } from '@/lib/bills/kanban-columns';
import { COMMITTEE_NAMES, committeeFullName } from '@/lib/testimony/committees';
import { describeVersionLabel } from '@/lib/versions/version-labels';

/** Status id -> COLUMN_DESCRIPTIONS copy. */
export function resolveStatusTerm(statusId: string): GlossaryTerm | null {
  const short = COLUMN_DESCRIPTIONS[statusId];
  if (!short) return null;
  return { term: COLUMN_TITLES[statusId] ?? statusId, short };
}

/**
 * Committee code -> full name. Returns null unless EVERY token in a joint
 * referral is known: committeeFullName passes unknown codes through unchanged,
 * so trusting it alone would "define" XYZ as "XYZ".
 */
export function resolveCommitteeTerm(code: string): GlossaryTerm | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split('/').map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (!tokens.length) return null;
  if (!tokens.every((t) => t in COMMITTEE_NAMES)) return null;

  const fullName = committeeFullName(trimmed);
  return {
    term: trimmed.toUpperCase(),
    short: `${fullName} — ${GLOSSARY.committee.short}`,
    learnMoreAnchor: GLOSSARY.committee.learnMoreAnchor,
  };
}

/** Version label -> pipeline position. Null when the label is unrecognized. */
export function resolveVersionTerm(label: string): GlossaryTerm | null {
  const described = describeVersionLabel(label);
  if (!described) return null;
  return {
    term: label.trim(),
    short: `${described}. ${GLOSSARY['bill-version'].short}`,
    learnMoreAnchor: GLOSSARY['bill-version'].learnMoreAnchor,
  };
}

/**
 * Deadline name -> Tier 3 jargon. Names come from dead-bill.ts and combine a
 * qualifier with the jargon ("First Decking", "Final Decking (Fiscal)").
 * Order matters: "Single Referral Filing" contains "Referral", and so does
 * "Triple Referral Filing".
 */
export function resolveDeadlineTerm(deadlineName: string): GlossaryTerm | null {
  const name = deadlineName.toLowerCase();
  if (name.includes('single referral')) return GLOSSARY['single-referral-filing'];
  if (name.includes('triple referral')) return GLOSSARY['triple-referral'];
  if (name.includes('sine die')) return GLOSSARY['sine-die'];
  if (name.includes('decking')) return GLOSSARY.decking;
  if (name.includes('lateral')) return GLOSSARY.lateral;
  if (name.includes('crossover')) return GLOSSARY.crossover;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/glossary.test.ts && npm run typecheck`
Expected: PASS.

If `resolveStatusTerm` fails for some column id, `COLUMN_DESCRIPTIONS` is missing that id — add the description to `kanban-columns.ts` rather than weakening the test. The existing `kanban-columns.test.ts:217-227` covers the same invariant.

- [ ] **Step 5: Commit**

```bash
git add src/lib/glossary/resolvers.ts src/lib/__tests__/glossary.test.ts
git commit -m "feat: add glossary resolvers delegating to existing copy sources"
```

---

### Task 4: The `<Term>` component

**Files:**
- Create: `src/components/ui/term.tsx`
- Modify: `src/lib/core/providers.tsx`

**Interfaces:**
- Consumes: `GLOSSARY`, `TermSlug`, `GlossaryTerm` from `@/lib/glossary/terms`; existing `ui/tooltip` and `ui/popover`
- Produces:
  - `<Term slug={TermSlug} variant?='prose'|'chip'|'icon' side?='top'|'bottom'|'left'|'right' billId?: string>` 
  - `<Term term={GlossaryTerm | null} …>` (same props, dynamic form)
  - `useFinePointer(): boolean`

- [ ] **Step 1: Write the component**

There is no unit test for this file — the project convention is pure-logic tests only, and this is interaction behavior. It is verified manually in Task 7 against the requirement list.

```tsx
// src/components/ui/term.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { GLOSSARY, type GlossaryTerm, type TermSlug } from '@/lib/glossary/terms';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * True only on devices with a real hovering pointer.
 *
 * MUST start false: there is no matchMedia during SSR, and starting true would
 * give every touch user a hover-only affordance on first paint plus a hydration
 * flip. Starting false costs a desktop user one tick of click-to-open.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return fine;
}

type TermVariant = 'prose' | 'chip' | 'icon';

interface TermProps {
  /** Static term. Mutually exclusive with `term`. */
  slug?: TermSlug;
  /** Resolved dynamic term (from ./glossary/resolvers). null = no definition. */
  term?: GlossaryTerm | null;
  /** prose: dotted underline. chip: no marker, inherits the chip's own border.
   *  icon: a standalone ⓘ, for use beside a link. */
  variant?: TermVariant;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Carried into /learn as ?bill= so the walkthrough can mark "you are here". */
  billId?: string;
  className?: string;
  children?: React.ReactNode;
}

const TRIGGER_BASE =
  'inline text-left align-baseline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm';

const VARIANT_CLASS: Record<TermVariant, string> = {
  // Muted dotted underline, inheriting color: reads as a footnote, not a link.
  prose:
    'underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 cursor-help',
  // No marker of its own — the chip's existing border/background is the affordance.
  chip: 'cursor-help',
  icon: 'cursor-help text-muted-foreground hover:text-foreground align-middle',
};

export function Term({
  slug,
  term,
  variant = 'prose',
  side = 'bottom',
  billId,
  className,
  children,
}: TermProps) {
  const finePointer = useFinePointer();
  const resolved: GlossaryTerm | null = slug ? GLOSSARY[slug] : (term ?? null);

  // No definition -> plain text, no affordance. Never a marker over an empty card.
  if (!resolved) return <>{children}</>;

  const learnMoreHref = resolved.learnMoreAnchor
    ? `/learn${billId ? `?bill=${encodeURIComponent(billId)}` : ''}#${resolved.learnMoreAnchor}`
    : null;

  // stopPropagation: almost every term sits inside a tappable parent (kanban
  // card -> opens the bill dialog, spreadsheet row, version link). Without this
  // a tap on the term also fires the parent.
  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`What does "${resolved.term}" mean?`}
      className={cn(TRIGGER_BASE, VARIANT_CLASS[variant], className)}
    >
      {variant === 'icon' ? <Info className="h-3.5 w-3.5" aria-hidden="true" /> : children}
    </button>
  );

  const body = (
    <div className="space-y-1.5">
      <p className="font-semibold text-xs">{resolved.term}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{resolved.short}</p>
      {learnMoreHref && (
        <Link
          href={learnMoreHref}
          onClick={(e) => e.stopPropagation()}
          className="inline-block text-xs font-medium underline underline-offset-2 hover:no-underline"
        >
          Learn more
        </Link>
      )}
    </div>
  );

  // max-w must fit a 375px viewport; collisionPadding keeps it on screen
  // instead of letting it hang off the edge.
  const contentClass = 'max-w-[280px] p-3';

  if (finePointer) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side={side} collisionPadding={12} className={contentClass}>
          {body}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        collisionPadding={12}
        className={contentClass}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Add the root `TooltipProvider`**

There is currently none at the app root; every usage wraps its own. `<Term>` in tooltip mode needs an ancestor provider.

In `src/lib/core/providers.tsx`, add the import and wrap the tree:

```tsx
import { TooltipProvider } from '@/components/ui/tooltip';
```

```tsx
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <AuthProvider>
          <KanbanBoardProvider>
            <BillsProvider>
              {children}
            </BillsProvider>
          </KanbanBoardProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
```

Leave the existing local `TooltipProvider` wrappers (e.g. `kanban-card.tsx`'s `ChipTooltip`) in place — nested providers are valid, and removing them is unrelated churn.

- [ ] **Step 3: Verify it compiles and the tooltip scroll-dismiss works**

Run: `npm run typecheck && npm run build`
Expected: PASS.

If `PopoverContent` rejects `collisionPadding`, check `src/components/ui/popover.tsx` — it may not forward extra props; add `collisionPadding` to its forwarded props rather than dropping it here.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/term.tsx src/lib/core/providers.tsx
git commit -m "feat: add Term component with pointer-aware tooltip/popover and root TooltipProvider"
```

---

### Task 5: The `/learn` walkthrough

**Files:**
- Create: `src/app/learn/page.tsx`
- Create: `src/components/learn/learn-walkthrough.tsx`

**Interfaces:**
- Consumes: `PROGRESS_STAGES` from `@/lib/bills/progress-stages`; `getBillDetails` from `@/db/queries/bills-read`
- Produces: the `/learn` route with an `id` on each stage matching a `PROGRESS_STAGES` id (the anchors Task 2's `learnMoreAnchor` values target)

- [ ] **Step 1: Write the walkthrough component**

`useSearchParams` requires a Suspense boundary in the App Router — the same pattern already used by `src/app/register/`.

```tsx
// src/components/learn/learn-walkthrough.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';
// VERIFIED: data.bills exposes only getBills — there is no getBillDetails on the
// data-client. getBillDetails is a 'use server' query function that client
// components call directly (the same pattern as use-tracked-bills and
// bill-details-dialog.tsx:33). No new query, no new route.
import { getBillDetails } from '@/db/queries/bills-read';

export function LearnWalkthrough() {
  const searchParams = useSearchParams();
  const billId = searchParams.get('bill');
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState<string | null>(null);

  // Reads through the existing data-client path — no new query, no new route.
  // Failure is silent on purpose: the walkthrough is the point, "you are here"
  // is a bonus, and an error banner on an explainer page would be noise.
  useEffect(() => {
    if (!billId) return;
    let cancelled = false;
    getBillDetails(billId)
      .then((bill) => {
        if (cancelled || !bill) return;
        setBillNumber(bill.bill_number ?? null);
        const status = bill.current_bill_status ?? '';
        const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(status));
        setCurrentStageId(stage?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [billId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Explicit back affordance: on touch, arriving here means leaving the
          board and losing scroll position, so the browser back button should
          not be the only exit. */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bills
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
        How a bill becomes law in Hawaii
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Most bills never become law. They die because a deadline passes or a committee chair
        never schedules a hearing — not because anyone votes them down. Here is the path a
        bill has to survive, stage by stage.
      </p>

      {billNumber && (
        <div className="mt-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          You came from <span className="font-semibold">{billNumber}</span>
          {currentStageId
            ? '. Its current stage is highlighted below.'
            : '. Its current stage could not be placed on this path.'}
        </div>
      )}

      <ol className="mt-8 space-y-4">
        {PROGRESS_STAGES.map((stage, i) => {
          const isCurrent = stage.id === currentStageId;
          return (
            <li
              key={stage.id}
              id={stage.id}
              className={cn(
                'scroll-mt-20 rounded-lg border p-4 transition-colors',
                isCurrent ? 'border-primary bg-primary/5' : 'bg-card'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCurrent ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <h2 className="font-semibold">{stage.name}</h2>
                {isCurrent && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Your bill is here
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {stage.description}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Official records live at{' '}
        <a
          href="https://www.capitol.hawaii.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          capitol.hawaii.gov
        </a>
        . Always read the bill text before relying on it or testifying.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Write the page with its Suspense boundary**

```tsx
// src/app/learn/page.tsx
import { Suspense } from 'react';
import { LearnWalkthrough } from '@/components/learn/learn-walkthrough';

export const metadata = {
  title: 'How a bill becomes law | Food+',
  description:
    'A plain-language walkthrough of how a bill moves through the Hawaii State Legislature, and why most bills never become law.',
};

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12" />}>
      <LearnWalkthrough />
    </Suspense>
  );
}
```

- [ ] **Step 3: Confirm `getBillDetails` is callable from a client component**

Already verified: `data.bills` exposes only `getBills`, and `getBillDetails` lives in `@/db/queries/bills-read` as a `'use server'` function that `bill-details-dialog.tsx:124` calls directly from the client. Step 1 follows that pattern.

Confirm it still holds:

Run: `grep -n "^import\|getBillDetails" src/components/kanban/bill-details-dialog.tsx | head -5`
Expected: the direct import from `@/db/queries/bills-read` is present.

Do NOT add a new `db/queries` function or API route. If the direct call fails at build time, drop the `?bill=` enrichment (the page must still render the canonical walkthrough) and note it rather than adding a data layer.

- [ ] **Step 4: Verify the build and the anchors**

Run: `npm run build && npx vitest run src/lib/__tests__/glossary.test.ts`
Expected: build passes; the `learnMoreAnchor` test still passes, confirming every anchor in the registry has a matching `id` on this page.

- [ ] **Step 5: Commit**

```bash
git add src/app/learn/page.tsx src/components/learn/learn-walkthrough.tsx
git commit -m "feat: add /learn walkthrough explaining how a bill becomes law"
```

---

### Task 6: Wire the surfaces

Apply the trigger-shape rule: whole chip triggers when the chip has no other action; otherwise the link keeps the tap and a sibling ⓘ carries the definition. Respect the density cap — cards get status, committee, and deadline only.

**Files:**
- Modify: `src/components/kanban/kanban-card.tsx` (committee chip ~406-423, deadline pill ~439-469)
- Modify: `src/components/kanban/bill-details-dialog.tsx` (title ~281, description ~291, introducers ~495-505, status select ~535-558, chamber badge ~562-617)
- Modify: `src/components/kanban/kanban-spreadsheet.tsx` (~279-345)
- Modify: `src/components/kanban/bill-briefing.tsx` (~82-95)
- Modify: `src/components/kanban/bill-versions-panel.tsx` (~30, 100-124, 165-167, 206)
- Modify: `src/components/kanban/version-compare.tsx` (~118-126)
- Modify: `src/components/bills/bill-reference-panel.tsx` (~40, 55-88)
- Modify: `src/app/bills/[id]/contact/page.tsx` (~474-475, 562-564)
- Modify: `src/components/kanban/kanban-pill-strip.tsx` (~22-33)

**Interfaces:**
- Consumes: `<Term>` from `@/components/ui/term`; resolvers from `@/lib/glossary/resolvers`

- [ ] **Step 1: Kanban card — committee chip and deadline pill**

The committee chip already has a `ChipTooltip` showing `committeeFullName`. Replace it with `<Term>`, which additionally works on touch (the current hover tooltip is unreachable there).

```tsx
import { Term } from '@/components/ui/term';
import { resolveCommitteeTerm, resolveDeadlineTerm } from '@/lib/glossary/resolvers';
import { resolveStatusTerm } from '@/lib/glossary/resolvers';
```

For the committee chip, wrap each code in its own `<Term variant="chip">` using `resolveCommitteeTerm(code)`, replacing the existing `ChipTooltip`. For the deadline pill, wrap the pill in `<Term variant="chip" term={resolveDeadlineTerm(nextDeadline.name)}>` — keep the existing chair-scheduling sentence by leaving the surrounding copy alone; the term card supplements it.

Do NOT add terms for bill number, headline, or description on the card — that is the density cap.

- [ ] **Step 2: Verify tap isolation on the card by hand**

Run: `npm run dev`, open `http://localhost:9002`, and in browser devtools toggle device emulation to a phone (touch, coarse pointer).

Check, and do not proceed until all four hold:
1. Tapping a committee code opens the definition and does **not** open the bill dialog.
2. Tapping outside dismisses the definition and does **not** open the bill dialog.
3. Tapping the card away from any term still opens the bill dialog.
4. Scrolling the column dismisses an open definition.

- [ ] **Step 3: Bill dialog — full marking**

Add, using `billId={bill.id}` on terms that have a `learnMoreAnchor` so `/learn` can mark position:
- Bill number in `DialogTitle` → `<Term slug="bill-number" variant="chip" billId={bill.id}>`
- `DialogDescription` (the RELATING TO title) → wrap the label with `<Term slug="relating-to">`
- "Introducers" field label → `<Term slug="introducers">`
- Status `Select` — for the current status, render `<Term variant="chip" term={resolveStatusTerm(currentStatus)} billId={bill.id}>` beside the label. Do **not** put a `<Term>` inside a `SelectItem`; Radix Select items own their keyboard and pointer handling, and nesting a button inside breaks selection.
- Chamber badge (`H`/`S`) in the status-updates panel → `<Term slug="chamber" variant="chip">`
- The "Fiscal" header badge → `<Term slug="fiscal" variant="chip" billId={bill.id}>`

- [ ] **Step 4: Versions panel — the sibling-ⓘ case**

Version labels are links to PDFs. The link keeps the tap; add a sibling:

```tsx
<a href={version.url} target="_blank" rel="noopener noreferrer">{version.label}</a>
<Term variant="icon" term={resolveVersionTerm(version.label)} billId={billId} />
```

Never wrap the anchor — `<button>` inside `<a>` is invalid HTML.

Report codes (`HSCR65`, shown raw at ~30 and ~124) have no link of their own: wrap them with `<Term slug="report-code" variant="chip">`. Add `<Term slug="committee-report">` to the "Latest committee report" heading.

- [ ] **Step 5: Remaining surfaces**

- `version-compare.tsx` older/newer pickers: sibling ⓘ with `resolveVersionTerm` beside each label.
- `bill-briefing.tsx`: committee codes via `resolveCommitteeTerm`; "Latest version" label via `resolveVersionTerm`.
- `kanban-spreadsheet.tsx`: status badge via `resolveStatusTerm`; committee codes via `resolveCommitteeTerm`; column header "Introducers" via `slug="introducers"`. This surface has no tooltips today, so also confirm nothing in the row's click handler swallows the term tap.
- `bill-reference-panel.tsx`: committee codes, chamber badges, "Introducers" label.
- `contact/page.tsx`: "Chair"/"Vice-Chair" via `slug="committee-chair"`; committee names via `resolveCommitteeTerm`.
- `kanban-pill-strip.tsx`: "Crossover" and "Conference" labels via `slug="crossover"` / `slug="conference"`. These are jump **buttons** — do not nest `<Term>` inside them. Instead leave the buttons alone; the pill strip is navigation, and a term inside a nav button would hijack the jump. Skip this file and note it.

- [ ] **Step 6: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire glossary terms into bill surfaces"
```

---

### Task 7: Manual verification pass

Interaction behavior is not unit-tested (pure-logic-only convention), so it is checked by hand against the spec's requirement list.

- [ ] **Step 1: Desktop (fine pointer)**

Run `npm run dev`. Confirm: terms show on hover with a ~300ms delay; the dotted underline is visible but quiet; "Learn more" is clickable without the tooltip closing first; Tab reaches terms and Enter opens them; Escape closes.

- [ ] **Step 2: Touch emulation**

With device emulation on: terms open on tap; the definition card fits a 375px viewport with no horizontal page scroll; "Learn more" navigates to `/learn#anchor` with `?bill=`; the stage is highlighted and reads "Your bill is here"; "Back to bills" returns.

- [ ] **Step 3: Absent-definition check**

Find a bill whose version label is unrecognized (`_PROPOSED` or an `HFA` label) and confirm the label renders as plain text with **no** ⓘ and no dotted underline. Same for an unknown committee code. This is the requirement that separates "no help here" from "broken".

- [ ] **Step 4: Inside the dialog**

Open a bill dialog and confirm term cards layer above the modal rather than behind it, and that opening one does not close the dialog.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address term interaction issues found in manual verification"
```

---

## Self-Review

**Spec coverage:**
- Content layer (§1) → Tasks 2, 3
- Two entry points (static slug / dynamic resolver) → Tasks 2, 3, 4
- Component layer (§2), pointer detection, tap isolation, portalling, dismissal, a11y, root provider → Task 4
- Absent-definition handling → Task 3 (returns null), Task 4 (renders plain), Task 7 Step 3 (verified)
- Wiring (§3), trigger-shape rule, marking style, density cap, Tiers 1–3 → Task 6
- Explainer (§4), anchors, `?bill=`, back affordance, no new queries → Task 5
- Taxonomy hazard / lift `PROGRESS_STAGES` → Task 1
- Testing (§Testing) → Tasks 1, 2, 3 tests; Task 7 manual
- Out of scope (statustext, tour, linkifier) → not implemented, correctly
- Known issues (raw status IDs) → deliberately untouched

**Deviation from spec, flagged:** the spec's wiring list includes `kanban-pill-strip.tsx`, but those labels are inside jump buttons; nesting an interactive term inside a nav button would hijack the jump. Task 6 Step 5 skips it. Crossover/Conference remain explained via the dialog, briefing, and `/learn`.

**Type consistency:** `GlossaryTerm` / `TermSlug` defined in Task 2, consumed in 3 and 4. Resolver names identical across Tasks 3, 5, 6. `ProgressStage.id` from Task 1 is what Task 2's `learnMoreAnchor` targets and Task 5 renders as `id`, and the Task 2 test asserts the link.

**Placeholders:** none — every code step has real content.
