# Bill Dialog Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the bill dialog into an Overview tab (AI Bill Briefing + Details + Committee contacts | Status Updates) and a full-width Versions & Reports tab with Timeline (current-first) and Compare (side-by-side diff) sub-tabs.

**Architecture:** Bottom-up. Pure/service helpers first (`hawaii-bill-diff` wrapper in `services/`, a committees helper in `lib/`, a single stubbed-AI module), then leaf components (briefing, committee contacts, inline diff, compare), then the sub-tab host, then the dialog restructure. Real version diffs via `hawaii-bill-diff`; all AI stubbed behind one module; committee members are placeholder data.

**Tech Stack:** Next.js 15, TypeScript, React, shadcn/ui (Tabs, Button, Badge, ScrollArea, Select), Tailwind, Vitest, `hawaii-bill-diff` (installed via pnpm).

## Global Constraints

- **Package manager is pnpm** — the repo has `pnpm-lock.yaml`; never run `npm i`. `hawaii-bill-diff@1.0.1` is already installed.
- **External-integration wrappers live in `src/services/`** — the `hawaii-bill-diff` wrapper goes in `services/bill-diff.ts`, NOT `lib/`. Copied from CLAUDE.md + spec.
- **`src/lib/` is DB-free pure utilities** — the committees helper is pure.
- **Client components call `data.*` / import helpers directly** — the diff wrapper is a plain (non-`'use server'`) module so client components run it directly (no server-action round-trip for a pure CPU op).
- **A `'use server'` file may only export async functions** — keep shared types in plain modules.
- **AI is OPTIONAL and STUBBED this pass** — the briefing's core is DERIVED (no AI, always shown); an optional "Summarize with AI", per-version/report summaries, and compare "summarize changes" use one `ai-stub.ts` module returning labeled placeholders. Diffs are REAL. No committee AI-draft.
- **Olive marks AI features, teal marks primary actions, semantic red/green for diffs.** Tailwind exposes named olive utilities (`text-olive-dark`, `border-olive-dark`, `bg-olive-soft`, `bg-olive`) — prefer these over arbitrary `text-[hsl(var(--olive-dark))]` forms. Where a task's code shows the arbitrary form, substitute the named utility (e.g. `text-[hsl(var(--olive-dark))]` → `text-olive-dark`, `bg-[hsl(var(--olive-soft))]/40` → `bg-olive-soft/40`).
- **Verification:** `npm test`/`pnpm test`, `npm run typecheck`, `npm run build` must pass (build catches `'use server'` violations). Use `npx vitest run <file>` for single-file test runs.
- **Commit style:** prefixes `feat:`/`fix:`/`refactor:`/`docs:`. No `Co-Authored-By` lines.

## File Structure

- `src/services/bill-diff.ts` (new) — wraps `hawaii-bill-diff`; `diffVersions()` → normalized `VersionDiff`.
- `src/lib/committees.ts` (new) — `parseCommitteeCodes()` + static `COMMITTEE_DIRECTORY` placeholder.
- `src/lib/bill-briefing-facts.ts` (new) — pure `deriveBriefingFacts()` (no AI).
- `src/components/kanban/ai-stub.ts` (new) — `stubSummarize`, `stubBriefingNarrative`.
- `src/components/kanban/bill-briefing.tsx` (new) — Briefing card.
- `src/components/kanban/committee-contacts.tsx` (new) — Committees & contacts block.
- `src/components/kanban/version-diff-inline.tsx` (new) — inline "Diff vs previous" for Timeline.
- `src/components/kanban/version-compare.tsx` (new) — Compare sub-tab.
- `src/components/kanban/versions-reports-tab.tsx` (new) — hosts Timeline/Compare sub-tabs; Timeline reuses `bill-versions-panel`.
- `src/components/kanban/bill-versions-panel.tsx` (modify) — reverse to current-first; add inline diff button.
- `src/components/kanban/bill-details-dialog.tsx` (modify) — two top-level tabs; new Overview arrangement.
- Tests: `src/lib/__tests__/bill-diff.test.ts`, `src/lib/__tests__/committees.test.ts`.

---

### Task 1: `hawaii-bill-diff` service wrapper

**Files:**
- Create: `src/services/bill-diff.ts`
- Test: `src/lib/__tests__/bill-diff.test.ts`

**Interfaces:**
- Consumes: `BillVersion` from `@/types/legislation` (`{ id, label, originalText, htmlLink, ... }`); `compareBills`, `generateDiffSummary` from `hawaii-bill-diff`.
- Produces:
  - `interface DiffRow { type: 'add' | 'del' | 'context' | 'modified'; text: string; }`
  - `interface VersionDiff { olderLabel: string; newerLabel: string; rows: DiffRow[]; summaryText: string; error: boolean; }`
  - `diffVersions(older: BillVersion, newer: BillVersion): VersionDiff`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/bill-diff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { diffVersions } from '@/services/bill-diff';
import type { BillVersion } from '@/types/legislation';

const ver = (label: string, originalText: string | null): BillVersion => ({
  id: label, label, htmlLink: null, pdfLink: null,
  originalText, aiSummary: null, createdAt: null,
});

describe('diffVersions', () => {
  it('produces add/del/modified rows from two version texts', () => {
    const older = ver('HB1334', 'SECTION 2. Funded at $5,000,000.\nSECTION 4. Effective 2026.');
    const newer = ver('HD1', 'SECTION 2. Funded at $2,000,000.\nSECTION 3. Report annually.\nSECTION 4. Effective 2026.');
    const d = diffVersions(older, newer);
    expect(d.olderLabel).toBe('HB1334');
    expect(d.newerLabel).toBe('HD1');
    expect(d.error).toBe(false);
    expect(d.rows.length).toBeGreaterThan(0);
    // At least one changed row is surfaced.
    expect(d.rows.some((r) => r.type === 'add' || r.type === 'modified')).toBe(true);
    expect(typeof d.summaryText).toBe('string');
  });

  it('returns an error diff when a version has no text', () => {
    const d = diffVersions(ver('HB1334', null), ver('HD1', 'text'));
    expect(d.error).toBe(true);
    expect(d.rows).toEqual([]);
  });

  it('reports no changes for identical text without erroring', () => {
    const same = 'SECTION 1. Identical text.';
    const d = diffVersions(ver('A', same), ver('B', same));
    expect(d.error).toBe(false);
    expect(d.rows.every((r) => r.type === 'context')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bill-diff.test.ts`
Expected: FAIL — cannot resolve `@/services/bill-diff`.

- [ ] **Step 3: Implement the wrapper**

Create `src/services/bill-diff.ts`. NOTE: plain module, no `'use server'` — imported and run client-side.

```typescript
// External-integration wrapper for the `hawaii-bill-diff` package (per
// CLAUDE.md, third-party wrappers live in src/services/). Plain module — the
// package is synchronous and pure for our plain-text path, so client
// components import and run it directly with no server-action boundary.
import { compareBills, generateDiffSummary } from 'hawaii-bill-diff';
import type { BillVersion } from '@/types/legislation';

export interface DiffRow {
  type: 'add' | 'del' | 'context' | 'modified';
  text: string;
}

export interface VersionDiff {
  olderLabel: string;
  newerLabel: string;
  rows: DiffRow[];
  summaryText: string;
  error: boolean;
}

function toBillData(v: BillVersion) {
  return {
    id: v.id,
    title: v.label,
    version: v.label,
    date: v.createdAt ?? '',
    content: v.originalText ?? '',
    url: v.htmlLink ?? undefined,
  };
}

/**
 * Compare two versions using hawaii-bill-diff and normalize its output into
 * UI-ready rows. Feeds each version's stored `original_text` as content (no
 * network fetch). Returns an error diff (empty rows) when either version lacks
 * text or the package throws.
 */
export function diffVersions(older: BillVersion, newer: BillVersion): VersionDiff {
  const base: Omit<VersionDiff, 'rows' | 'summaryText' | 'error'> = {
    olderLabel: older.label,
    newerLabel: newer.label,
  };

  if (!older.originalText || !newer.originalText) {
    return { ...base, rows: [], summaryText: '', error: true };
  }

  try {
    const result = compareBills(toBillData(older), toBillData(newer));
    const rows: DiffRow[] = [
      ...result.removed.map((text): DiffRow => ({ type: 'del', text })),
      ...result.modified.map((text): DiffRow => ({ type: 'modified', text })),
      ...result.added.map((text): DiffRow => ({ type: 'add', text })),
    ];
    // If the package reported no changes at all, surface the unchanged lines as
    // context so the UI can say "no differences" honestly rather than blank.
    if (rows.length === 0) {
      for (const text of result.unchanged) rows.push({ type: 'context', text });
    }
    return { ...base, rows, summaryText: generateDiffSummary(result), error: false };
  } catch {
    return { ...base, rows: [], summaryText: '', error: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bill-diff.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/bill-diff.ts src/lib/__tests__/bill-diff.test.ts
git commit -m "feat: add hawaii-bill-diff service wrapper"
```

---

### Task 2: Committees helper + placeholder directory

**Files:**
- Create: `src/lib/committees.ts`
- Test: `src/lib/__tests__/committees.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface CommitteeMember { name: string; role: 'Chair' | 'Vice' | 'Member'; email: string; }`
  - `interface CommitteeInfo { code: string; fullName: string; members: CommitteeMember[]; }`
  - `parseCommitteeCodes(assignment: string | null): string[]` — splits `"AGR, EDN/FIN"` → `['AGR','EDN','FIN']`, trimmed, de-duped, empty-safe.
  - `getCommitteeInfo(code: string): CommitteeInfo` — from a static `COMMITTEE_DIRECTORY`; unknown codes get a generic placeholder.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/committees.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCommitteeCodes, getCommitteeInfo } from '../committees';

describe('parseCommitteeCodes', () => {
  it('splits comma- and slash-separated codes, trimmed and de-duped', () => {
    expect(parseCommitteeCodes('AGR, EDN/FIN, AGR')).toEqual(['AGR', 'EDN', 'FIN']);
  });
  it('returns [] for null or empty', () => {
    expect(parseCommitteeCodes(null)).toEqual([]);
    expect(parseCommitteeCodes('   ')).toEqual([]);
  });
});

describe('getCommitteeInfo', () => {
  it('returns known committee with members', () => {
    const info = getCommitteeInfo('FIN');
    expect(info.code).toBe('FIN');
    expect(info.fullName.length).toBeGreaterThan(0);
    expect(info.members.length).toBeGreaterThan(0);
    expect(info.members[0]).toHaveProperty('email');
  });
  it('returns a placeholder for unknown codes', () => {
    const info = getCommitteeInfo('ZZZ');
    expect(info.code).toBe('ZZZ');
    expect(info.members).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/committees.test.ts`
Expected: FAIL — cannot resolve `../committees`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/committees.ts`:

```typescript
// Pure helpers for committee display. Member data here is PLACEHOLDER — a real
// committee-member source is a follow-up. Lives in lib/ (DB-free, pure).

export interface CommitteeMember {
  name: string;
  role: 'Chair' | 'Vice' | 'Member';
  email: string;
}

export interface CommitteeInfo {
  code: string;
  fullName: string;
  members: CommitteeMember[];
}

/** Split a committee_assignment string ("AGR, EDN/FIN") into unique codes. */
export function parseCommitteeCodes(assignment: string | null): string[] {
  if (!assignment) return [];
  const codes = assignment
    .split(/[,/]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
  return Array.from(new Set(codes));
}

// Placeholder directory — a handful of real Hawaii committee names with
// fictional members so the contact UI has something to render.
const COMMITTEE_DIRECTORY: Record<string, Omit<CommitteeInfo, 'code'>> = {
  AGR: {
    fullName: 'Committee on Agriculture & Food Systems',
    members: [
      { name: 'Rep. K. Kahaloa', role: 'Chair', email: 'repkahaloa@capitol.hawaii.gov' },
      { name: 'Rep. D. Tarnas', role: 'Vice', email: 'reptarnas@capitol.hawaii.gov' },
    ],
  },
  FIN: {
    fullName: 'Committee on Finance',
    members: [
      { name: 'Rep. K. Yamashita', role: 'Chair', email: 'repyamashita@capitol.hawaii.gov' },
    ],
  },
  WAM: {
    fullName: 'Committee on Ways and Means',
    members: [
      { name: 'Sen. D. Dela Cruz', role: 'Chair', email: 'sendelacruz@capitol.hawaii.gov' },
    ],
  },
  EDN: {
    fullName: 'Committee on Education',
    members: [
      { name: 'Rep. J. Woodson', role: 'Chair', email: 'repwoodson@capitol.hawaii.gov' },
    ],
  },
};

export function getCommitteeInfo(code: string): CommitteeInfo {
  const entry = COMMITTEE_DIRECTORY[code];
  if (!entry) return { code, fullName: `${code} Committee`, members: [] };
  return { code, ...entry };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/committees.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/committees.ts src/lib/__tests__/committees.test.ts
git commit -m "feat: add committees helper with placeholder directory"
```

---

### Task 3: Stubbed-AI module

**Files:**
- Create: `src/components/kanban/ai-stub.ts`

**Interfaces:**
- Consumes: `BillDetails` from `@/types/legislation`.
- Produces:
  - `stubSummarize(text: string): Promise<string>`
  - `stubBriefingNarrative(bill: BillDetails): Promise<string>`

- [ ] **Step 1: Implement the module**

Create `src/components/kanban/ai-stub.ts`:

```typescript
// One place all OPTIONAL AI features are stubbed. Swap these internals for real
// Genkit calls later; the component API stays the same. There is NO committee
// AI-draft this pass.
import type { BillDetails } from '@/types/legislation';

const STUB = '(placeholder — AI not wired yet)';

function delay<T>(value: T, ms = 900): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function stubSummarize(text: string): Promise<string> {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return delay(
    `Plain-language recap of this ~${words}-word document will appear here once AI is connected. ${STUB}`,
  );
}

// A one-paragraph narrative that AUGMENTS the derived briefing facts. The
// briefing renders fully without ever calling this.
export function stubBriefingNarrative(bill: BillDetails): Promise<string> {
  return delay(
    `A plain-language narrative of ${bill.bill_number} — what it does, how it has changed, and what committees recommend — will appear here once AI is connected. ${STUB}`,
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (No test — thin stub verified via consuming components.)

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/ai-stub.ts
git commit -m "feat: add stubbed-AI module (summarize, optional briefing narrative)"
```

---

### Task 4: Bill Briefing — derived facts + card (AI optional)

**Files:**
- Create: `src/lib/bill-briefing-facts.ts`
- Create: `src/components/kanban/bill-briefing.tsx`
- Test: `src/lib/__tests__/bill-briefing-facts.test.ts`

**Interfaces:**
- Consumes: `BillDetails`, `BillStatus` from `@/types/legislation`; `getTestimonyEligibility`, `isTestimonyUrgent` from `@/lib/testimony-eligibility`; `getNextDeadline`, `getDeadlineTier`, `isFiscalBill`, `parseCommittees` from `@/lib/dead-bill`; `SESSION_DEADLINES` from `@/lib/session-deadlines`; `sortVersions` from `@/lib/bill-versions`; `stubBriefingNarrative` (Task 3); shadcn `Button`; `lucide-react`.
- Produces:
  - `interface BriefingStep { text: string; action: 'testimony' | 'diff' | 'reports'; }`
  - `interface BriefingFacts { testimony: { open: boolean; urgent: boolean; message: string }; standing: string; latestVersionLabel: string | null; latestVersionHtml: string | null; committeeCodes: string[]; reportCount: number; nextSteps: BriefingStep[]; }`
  - `deriveBriefingFacts(bill: BillDetails, today: string): BriefingFacts` (pure, no DB, no AI)
  - `BillBriefing({ bill, today, onNextStep }: { bill: BillDetails; today: string; onNextStep: (a: 'testimony' | 'diff' | 'reports') => void }): JSX.Element`

- [ ] **Step 1: Write the failing test for the facts engine**

Create `src/lib/__tests__/bill-briefing-facts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveBriefingFacts } from '../bill-briefing-facts';
import type { BillDetails, BillVersion } from '@/types/legislation';

const ver = (label: string): BillVersion => ({
  id: label, label, htmlLink: `https://x/${label}.htm`, pdfLink: null,
  originalText: 'text', aiSummary: null, createdAt: null,
});

const baseBill = (over: Partial<BillDetails> = {}): BillDetails => ({
  id: 'b1', bill_number: 'HB1334', bill_title: 'T', nickname: null,
  bill_url: '', year: 2026, current_bill_status: 'scheduled1',
  current_status_string: '', description: 'A food bill.', archived: false,
  dead: false, committee_assignment: 'AGR, FIN', introducer: 'X',
  latest_update: null, food_related: true, created_at: null, updated_at: null,
  updates: [], versions: [ver('HB1334'), ver('HB1334_HD1')], reports: [],
  ...over,
});

describe('deriveBriefingFacts', () => {
  it('marks testimony open early in session and picks the latest version', () => {
    const f = deriveBriefingFacts(baseBill(), '2026-02-01');
    expect(f.testimony.open).toBe(true);
    expect(f.latestVersionLabel).toBe('HB1334_HD1');
    expect(f.committeeCodes).toEqual(['AGR', 'FIN']);
    // testimony open → a testimony next-step is offered
    expect(f.nextSteps.some((s) => s.action === 'testimony')).toBe(true);
    // two versions → a diff next-step is offered
    expect(f.nextSteps.some((s) => s.action === 'diff')).toBe(true);
  });

  it('marks testimony closed and gives a reason for a dead bill', () => {
    const f = deriveBriefingFacts(baseBill({ dead: true }), '2026-02-01');
    expect(f.testimony.open).toBe(false);
    expect(f.testimony.message.length).toBeGreaterThan(0);
    expect(f.nextSteps.some((s) => s.action === 'testimony')).toBe(false);
  });

  it('offers no diff step when there is only one version', () => {
    const f = deriveBriefingFacts(baseBill({ versions: [ver('HB1334')] }), '2026-02-01');
    expect(f.nextSteps.some((s) => s.action === 'diff')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/bill-briefing-facts.test.ts`
Expected: FAIL — cannot resolve `../bill-briefing-facts`.

- [ ] **Step 3: Implement the facts engine**

Create `src/lib/bill-briefing-facts.ts`:

```typescript
// PURE briefing-fact derivation — no DB, no AI. This is what lets the Bill
// Briefing render a useful summary when the user opts out of AI.
import type { BillDetails, BillStatus } from '@/types/legislation';
import type { BillStatus as DBBillStatus } from '@/db/types';
import { getTestimonyEligibility, isTestimonyUrgent } from '@/lib/testimony-eligibility';
import { getNextDeadline, getDeadlineTier, isFiscalBill } from '@/lib/dead-bill';
import { SESSION_DEADLINES } from '@/lib/session-deadlines';
import { sortVersions } from '@/lib/bill-versions';
import { parseCommitteeCodes } from '@/lib/committees';

export interface BriefingStep {
  text: string;
  action: 'testimony' | 'diff' | 'reports';
}

export interface BriefingFacts {
  testimony: { open: boolean; urgent: boolean; message: string };
  standing: string;
  latestVersionLabel: string | null;
  latestVersionHtml: string | null;
  committeeCodes: string[];
  reportCount: number;
  nextSteps: BriefingStep[];
}

export function deriveBriefingFacts(bill: BillDetails, today: string): BriefingFacts {
  const status = bill.current_bill_status as DBBillStatus;
  const committeeAssignment = bill.committee_assignment || null;

  const eligibility = getTestimonyEligibility({
    dead: bill.dead,
    billStatus: status,
    committeeAssignment,
    deadlines: SESSION_DEADLINES,
    today,
  });
  const urgent = eligibility.allowed && isTestimonyUrgent(status);
  const testimony = {
    open: eligibility.allowed,
    urgent,
    message: eligibility.allowed
      ? urgent
        ? 'Testimony is open and a hearing is imminent — submit as soon as possible.'
        : 'You can prepare testimony before a hearing is scheduled. '
      : `Testimony is closed — ${eligibility.reason ?? 'not currently accepting testimony'}.`,
  };

  // Where it stands: dead reason, or next deadline (with days-away + tier), or
  // a plain status line.
  const fiscal = committeeAssignment ? isFiscalBill(committeeAssignment) : false;
  let standing: string;
  if (bill.dead) {
    standing = 'This bill is no longer moving (marked failed).';
  } else {
    const next = committeeAssignment
      ? getNextDeadline(bill.bill_number, status, committeeAssignment, SESSION_DEADLINES, today)
      : null;
    if (next) {
      const daysAway = Math.ceil(
        (new Date(next.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
          86_400_000,
      );
      const tier = getDeadlineTier(daysAway);
      standing =
        `Next deadline: ${next.name} on ${next.date}` +
        (daysAway > 0 ? ` (${daysAway} day${daysAway !== 1 ? 's' : ''} away, ${tier})` : daysAway === 0 ? ' (today)' : '') +
        (fiscal ? ' · fiscal bill' : '');
    } else {
      standing = `Currently ${status}${fiscal ? ' · fiscal bill' : ''}.`;
    }
  }

  const sorted = sortVersions(bill.versions);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const committeeCodes = parseCommitteeCodes(committeeAssignment);

  const nextSteps: BriefingStep[] = [];
  if (testimony.open) {
    nextSteps.push({ text: 'Write and submit testimony on this bill.', action: 'testimony' });
  }
  if (bill.versions.length >= 2) {
    nextSteps.push({ text: 'Compare the two most recent drafts to see what changed.', action: 'diff' });
  }
  if (bill.reports.length > 0) {
    nextSteps.push({ text: `Review the ${bill.reports.length} committee report(s).`, action: 'reports' });
  }

  return {
    testimony,
    standing,
    latestVersionLabel: latest?.label ?? null,
    latestVersionHtml: latest?.htmlLink ?? null,
    committeeCodes,
    reportCount: bill.reports.length,
    nextSteps,
  };
}
```

Note: `BillStatus` import from `@/types/legislation` is used only for the type-cast reference; if unused after implementation, drop it to satisfy the linter. The DB `BillStatus` alias is what the helpers expect.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/bill-briefing-facts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the briefing card**

Create `src/components/kanban/bill-briefing.tsx`. Derived facts render immediately; the AI narrative is an optional add-on.

```typescript
'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import { deriveBriefingFacts } from '@/lib/bill-briefing-facts';
import { stubBriefingNarrative } from './ai-stub';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, PenLine, GitCompare, ScrollText, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEP_ICON = { testimony: PenLine, diff: GitCompare, reports: ScrollText } as const;

export function BillBriefing({
  bill,
  today,
  onNextStep,
}: {
  bill: BillDetails;
  today: string;
  onNextStep: (a: 'testimony' | 'diff' | 'reports') => void;
}) {
  const facts = deriveBriefingFacts(bill, today);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    try {
      setNarrative(await stubBriefingNarrative(bill));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bill briefing</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={summarize}
          disabled={loading}
          className="h-7 gap-1 border-olive-dark/40 px-2 text-xs text-olive-dark"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {narrative ? 'Regenerate' : 'Summarize with AI'}
        </Button>
      </div>

      {/* Optional AI narrative */}
      {narrative && (
        <div className="rounded-md border border-olive-dark/40 bg-olive-soft/40 p-2.5">
          <p className="text-[12.5px] leading-relaxed text-foreground/80">{narrative}</p>
        </div>
      )}

      {/* Derived — always shown, no AI */}
      <div
        className={cn(
          'flex items-start gap-2 rounded-md border p-2.5 text-[12.5px]',
          facts.testimony.urgent
            ? 'border-red-300 bg-red-50 text-red-700'
            : facts.testimony.open
              ? 'border-primary/30 bg-primary/5'
              : 'text-muted-foreground',
        )}
      >
        {facts.testimony.urgent ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> : <Clock className="mt-0.5 h-4 w-4 flex-none" />}
        <span>{facts.testimony.message}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Where it stands</h4>
          <p className="text-[12px] text-foreground/80">{facts.standing}</p>
        </div>
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Latest version</h4>
          <p className="text-[12px] text-foreground/80">
            {facts.latestVersionLabel ? (
              facts.latestVersionHtml ? (
                <a href={facts.latestVersionHtml} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{facts.latestVersionLabel}</a>
              ) : facts.latestVersionLabel
            ) : 'No versions on file.'}
          </p>
        </div>
        <div className="rounded-md border p-2.5">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Committee activity</h4>
          <p className="text-[12px] text-foreground/80">
            {facts.committeeCodes.length > 0 ? facts.committeeCodes.join(', ') : 'No committees'} · {facts.reportCount} report(s)
          </p>
        </div>
      </div>

      {facts.nextSteps.length > 0 && (
        <div className="border-t border-dashed pt-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested next steps</h4>
          <div className="space-y-1.5">
            {facts.nextSteps.map((step, i) => {
              const Icon = STEP_ICON[step.action];
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-none text-primary" />
                  <span className="flex-1 text-[12.5px]">{step.text}</span>
                  <Button variant="ghost" size="sm" className="h-6 flex-none px-2 text-[11px] text-primary" onClick={() => onNextStep(step.action)}>
                    Go
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bill-briefing-facts.ts src/lib/__tests__/bill-briefing-facts.test.ts src/components/kanban/bill-briefing.tsx
git commit -m "feat: add derived bill briefing (no-AI facts + optional AI narrative)"
```

---

### Task 5: Committee directory block

**Files:**
- Create: `src/components/kanban/committee-contacts.tsx`

**Interfaces:**
- Consumes: `BillDetails`; `parseCommitteeCodes`, `getCommitteeInfo` (Task 2).
- Produces: `CommitteeContacts({ bill }: { bill: BillDetails }): JSX.Element`

- [ ] **Step 1: Implement the component (plain list — no email/mailto, no AI-draft)**

Create `src/components/kanban/committee-contacts.tsx`:

```typescript
'use client';

import type { BillDetails } from '@/types/legislation';
import { parseCommitteeCodes, getCommitteeInfo } from '@/lib/committees';

export function CommitteeContacts({ bill }: { bill: BillDetails }) {
  const codes = parseCommitteeCodes(bill.committee_assignment);

  if (codes.length === 0) {
    return <p className="text-xs text-muted-foreground">No committees assigned.</p>;
  }

  return (
    <div className="space-y-2">
      {codes.map((code) => {
        const info = getCommitteeInfo(code);
        return (
          <div key={code} className="rounded-md border p-2.5">
            <div className="text-[12.5px] font-bold">{code}</div>
            <div className="mb-1 text-[11px] text-muted-foreground">{info.fullName}</div>
            {info.members.length > 0 ? (
              info.members.map((m) => (
                <div key={m.email} className="flex items-center gap-2 py-1 text-[12.5px]">
                  <span className="min-w-0 truncate">{m.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      m.role === 'Chair' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {m.role}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-muted-foreground">Member list unavailable.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/committee-contacts.tsx
git commit -m "feat: add committee directory block (list only, placeholder members)"
```

---


### Task 6: Inline version diff (Timeline) + current-first ordering

**Files:**
- Create: `src/components/kanban/version-diff-inline.tsx`
- Modify: `src/components/kanban/bill-versions-panel.tsx`

**Interfaces:**
- Consumes: `diffVersions`, `VersionDiff`, `DiffRow` (Task 1); `BillVersion`; shadcn `Button`; `lucide-react`.
- Produces:
  - `VersionDiffInline({ older, newer }: { older: BillVersion; newer: BillVersion }): JSX.Element`
  - `bill-versions-panel.tsx` timeline renders **current-first** and each non-first (chronologically) version shows a "Diff vs previous" toggle.

- [ ] **Step 1: Implement the inline diff component**

Create `src/components/kanban/version-diff-inline.tsx`:

```typescript
'use client';

import { useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import { diffVersions, type DiffRow } from '@/services/bill-diff';
import { Button } from '@/components/ui/button';
import { GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROW_CLASS: Record<DiffRow['type'], string> = {
  add: 'bg-[#E7F4E9] text-[#2F7A3E]',
  del: 'bg-[#FBEAE6] text-[#B4442F]',
  modified: 'bg-[#FBEAE6] text-[#B4442F]',
  context: 'text-foreground/60',
};

export function VersionDiffInline({ older, newer }: { older: BillVersion; newer: BillVersion }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(() => (open ? diffVersions(older, newer) : null), [open, older, newer]);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}
        className="h-7 gap-1 px-1.5 text-xs text-primary hover:bg-transparent hover:text-primary/80">
        <GitCompare className="h-3.5 w-3.5" /> {open ? 'Hide diff' : `Diff vs ${older.label}`}
      </Button>
      {open && diff && (
        <div className="mt-1.5 max-w-[780px] overflow-hidden rounded-md border font-mono text-[12px]">
          <div className="flex justify-between bg-muted/60 px-2.5 py-1.5 font-sans text-[11px] text-muted-foreground">
            <span>{diff.olderLabel} → {diff.newerLabel}</span>
            <span>{diff.error ? 'no diff available' : `${diff.rows.filter((r) => r.type !== 'context').length} changes`}</span>
          </div>
          {diff.error ? (
            <p className="px-2.5 py-2 font-sans text-[11px] text-muted-foreground">Couldn&apos;t compute a diff for these versions.</p>
          ) : (
            <div className="py-1">
              {diff.rows.map((row, i) => (
                <div key={i} className={cn('whitespace-pre-wrap px-2.5 py-0.5', ROW_CLASS[row.type])}>
                  {row.type === 'add' ? '+ ' : row.type === 'del' || row.type === 'modified' ? '− ' : '  '}{row.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reverse the timeline order and add the diff toggle**

In `src/components/kanban/bill-versions-panel.tsx`:

Add the import near the other component imports:

```typescript
import { VersionDiffInline } from './version-diff-inline';
```

Find the timeline `<ol>` that maps `groups` (currently `{groups.map((group, i) => {`). The `groups` are in ascending (oldest-first) legislative order. Render them reversed so the current version is on top, and give each version (except the oldest) a diff-vs-previous toggle.

Replace the `groups.map(...)` opening and the `isBase`/`isLatest` derivation:

```typescript
              {groups.slice().reverse().map((group, revIdx) => {
                // groups is oldest→newest; we render newest→oldest.
                const origIdx = groups.length - 1 - revIdx;
                const isBase = origIdx === 0;
                const isLatest = latestVersion?.id === group.version.id;
                const previous = origIdx > 0 ? groups[origIdx - 1].version : null;
```

Then, inside that `<li>`, immediately after the existing `ReadTextButton` for the version (the block that renders `group.version.originalText && (...)`), add the diff toggle:

```typescript
                    {previous && group.version.originalText && previous.originalText && (
                      <div className="mt-1">
                        <VersionDiffInline older={previous} newer={group.version} />
                      </div>
                    )}
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck && npx vitest run src/lib/__tests__/bill-versions.test.ts`
Expected: PASS. (Ordering logic in `bill-versions.ts` is unchanged; only the panel's render order flips.)

- [ ] **Step 4: Commit**

```bash
git add src/components/kanban/version-diff-inline.tsx src/components/kanban/bill-versions-panel.tsx
git commit -m "feat: current-first timeline with inline version diffs"
```

---

### Task 7: Compare sub-tab

**Files:**
- Create: `src/components/kanban/version-compare.tsx`

**Interfaces:**
- Consumes: `BillVersion`; `diffVersions`, `DiffRow` (Task 1); `sortVersions` from `@/lib/bill-versions`; `stubSummarize` (Task 3); shadcn `Button`, `Select` family; `lucide-react`.
- Produces: `VersionCompare({ versions }: { versions: BillVersion[] }): JSX.Element`

- [ ] **Step 1: Implement the component**

Create `src/components/kanban/version-compare.tsx`:

```typescript
'use client';

import { useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import { diffVersions, type DiffRow } from '@/services/bill-diff';
import { sortVersions } from '@/lib/bill-versions';
import { stubSummarize } from './ai-stub';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const COL_CLASS: Record<DiffRow['type'], string> = {
  add: 'bg-[#E7F4E9] text-[#2F7A3E]',
  del: 'bg-[#FBEAE6] text-[#B4442F]',
  modified: 'bg-[#FBEAE6] text-[#B4442F]',
  context: 'text-foreground/70',
};

export function VersionCompare({ versions }: { versions: BillVersion[] }) {
  const ordered = useMemo(() => sortVersions(versions), [versions]);

  if (ordered.length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Need at least two versions to compare.</p>;
  }

  const [olderId, setOlderId] = useState(ordered[0].id);
  const [newerId, setNewerId] = useState(ordered[ordered.length - 1].id);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const older = ordered.find((v) => v.id === olderId) ?? ordered[0];
  const newer = ordered.find((v) => v.id === newerId) ?? ordered[ordered.length - 1];
  const sameVersion = older.id === newer.id;
  const diff = useMemo(() => (sameVersion ? null : diffVersions(older, newer)), [sameVersion, older, newer]);

  async function summarizeChanges() {
    if (!diff) return;
    setSummarizing(true);
    setSummary(null);
    try {
      setSummary(await stubSummarize(diff.rows.map((r) => r.text).join('\n')));
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <VersionPicker value={olderId} onChange={setOlderId} versions={ordered} />
        <span className="text-xs font-medium text-muted-foreground">compared with</span>
        <VersionPicker value={newerId} onChange={setNewerId} versions={ordered} />
        <Button variant="outline" size="sm" disabled={sameVersion || summarizing || diff?.error}
          className="ml-auto h-8 gap-1 border-[hsl(var(--olive-dark))]/40 px-2 text-xs text-[hsl(var(--olive-dark))]"
          onClick={summarizeChanges}>
          {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Summarize changes
        </Button>
      </div>

      {sameVersion ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Pick two different versions.</p>
      ) : diff?.error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t compute a diff for these versions.</p>
      ) : diff ? (
        <>
          {summary && (
            <div className="mb-3 rounded-md border border-[hsl(var(--olive-dark))]/40 bg-[hsl(var(--olive-soft))]/40 p-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--olive-dark))]">
                <Sparkles className="h-3 w-3" /> Summary of changes
              </span>
              <p className="mt-1 text-[12.5px] text-foreground/80">{summary}</p>
            </div>
          )}
          <div className="grid grid-cols-1 overflow-hidden rounded-md border font-mono text-[12px] sm:grid-cols-2">
            <DiffColumn label={diff.olderLabel} rows={diff.rows} keep="del" />
            <DiffColumn label={`${diff.newerLabel} · current`} rows={diff.rows} keep="add" className="border-t sm:border-l sm:border-t-0" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function VersionPicker({ value, onChange, versions }: { value: string; onChange: (v: string) => void; versions: BillVersion[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {versions.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Renders one side of the split. `keep` = which change-type this column shows
// (older shows removed lines, newer shows added lines); modified + context show
// on both; the opposite change-type renders as a blank spacer to keep alignment.
function DiffColumn({ label, rows, keep, className }: { label: string; rows: DiffRow[]; keep: 'del' | 'add'; className?: string }) {
  return (
    <div className={className}>
      <div className="bg-muted/60 px-2.5 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="py-1">
        {rows.map((row, i) => {
          const opposite = (keep === 'del' && row.type === 'add') || (keep === 'add' && row.type === 'del');
          if (opposite) return <div key={i} className="min-h-[18px] bg-muted/20 px-2.5 py-0.5">&nbsp;</div>;
          return <div key={i} className={cn('min-h-[18px] whitespace-pre-wrap px-2.5 py-0.5', COL_CLASS[row.type])}>{row.text}</div>;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/version-compare.tsx
git commit -m "feat: add version compare sub-tab (side-by-side diff, stubbed summary)"
```

---

### Task 8: Versions & Reports tab host (Timeline / Compare sub-tabs)

**Files:**
- Create: `src/components/kanban/versions-reports-tab.tsx`

**Interfaces:**
- Consumes: `BillVersion`, `CommitteeReport` from `@/types/legislation`; `BillVersionsPanel` from `./bill-versions-panel`; `VersionCompare` (Task 7); shadcn `Tabs` family.
- Produces: `VersionsReportsTab({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }): JSX.Element`

- [ ] **Step 1: Implement the host**

Create `src/components/kanban/versions-reports-tab.tsx`:

```typescript
'use client';

import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { BillVersionsPanel } from './bill-versions-panel';
import { VersionCompare } from './version-compare';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function VersionsReportsTab({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }) {
  return (
    <Tabs defaultValue="timeline" className="flex h-full min-h-0 flex-col">
      <TabsList className="mx-4 mt-3 w-fit shrink-0">
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="compare">Compare</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <BillVersionsPanel versions={versions} reports={reports} />
      </TabsContent>
      <TabsContent value="compare" className="mt-2 min-h-0 flex-1 overflow-auto px-4 pb-4 data-[state=inactive]:hidden">
        <VersionCompare versions={versions} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/versions-reports-tab.tsx
git commit -m "feat: add versions & reports tab host with timeline/compare sub-tabs"
```

---

### Task 9: Restructure the dialog into Overview + Versions & Reports tabs

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx`

**Interfaces:**
- Consumes: `BillBriefing` (Task 4), `CommitteeContacts` (Task 5), `VersionsReportsTab` (Task 8); existing `billDetails`, `bill`, panels.
- Produces: dialog with two top-level tabs; Overview = Briefing+Details+Committees (left) | Status Updates (right); Versions & Reports = full width.

**Context:** The dialog builds three panel vars inside an IIFE: `leftPanel` (details + status control), `activityPanel` (status updates), `versionsPanel` (the old versions panel). Desktop returns `leftPanel + rightPanel`; `rightPanel` wraps a tabbed activity/versions. Mobile uses a 3-tab `Tabs`. This task replaces that structure.

- [ ] **Step 1: Add imports**

In `src/components/kanban/bill-details-dialog.tsx`, add near the other component imports (after the `BillVersionsPanel` import line):

```typescript
import { BillBriefing } from './bill-briefing';
import { CommitteeContacts } from './committee-contacts';
import { VersionsReportsTab } from './versions-reports-tab';
```

Also add a ref-free tab state near the top of the component body (after `const isMobile = useIsMobile();`):

```typescript
  const [activeTab, setActiveTab] = useState<'overview' | 'versions'>('overview');
```

(`useState` is already imported.)

- [ ] **Step 2: Add the Briefing + Committees into the left panel**

The left panel currently starts (line ~334) with `const leftPanel = (` and a `<ScrollArea>` containing details. Insert the Briefing at the very top of that scroll area's inner `<div className="p-4 sm:p-6 space-y-4 sm:space-y-5">`, before the dead/deadline alert block:

The dialog already computes `const today = todayHawaii();` — pass it. The `'reports'` action switches to the Versions & Reports tab (where reports live):

```typescript
                  <BillBriefing
                    bill={billDetails ?? (bill as BillDetails)}
                    today={today}
                    onNextStep={(action) => {
                      if (action === 'diff' || action === 'reports') setActiveTab('versions');
                      else if (action === 'testimony') { onClose(); router.push(`/bills/${bill.id}/testimony`); }
                    }}
                  />
```

Then, still in the left panel, add a Committees section. Find the existing "Tracked By" section (`{canSeeTracking && (` block near the end of the left-panel scroll content) and insert BEFORE it:

```typescript
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Committees &amp; contacts</h3>
                    <CommitteeContacts bill={billDetails ?? (bill as BillDetails)} />
                  </div>
```

- [ ] **Step 3: Replace the desktop return with two top-level tabs**

Find the desktop `return (` block (line ~637) that renders `{leftPanel}{rightPanel}`. Replace that entire `return (...)` with a two-tab layout. `activityPanel` (Status Updates) becomes the Overview right pane; `VersionsReportsTab` becomes the second tab:

```typescript
            return (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'versions')} className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-6 mt-3 w-fit shrink-0">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="versions">Versions &amp; Reports</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                  <div className="flex h-full min-h-0">
                    {leftPanel}
                    <div className="flex flex-col bg-muted/20 min-h-0 w-[45%]">
                      {activityPanel}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="versions" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                  <VersionsReportsTab versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
                </TabsContent>
              </Tabs>
            );
```

Note: `leftPanel`'s outer div uses `w-[55%]` on desktop (from `isMobile ? ... : "w-[55%] border-r"`), which pairs with the `w-[45%]` activity pane. Remove the now-unused `rightPanel` var and its `versionsPanel` var (the old activity/versions tabbed wrapper at lines ~552–579) to avoid dead code — `activityPanel` and `VersionsReportsTab` replace them.

- [ ] **Step 4: Update the mobile return to two tabs**

Find the mobile `if (isMobile) { return (` block (line ~583). Replace its `<Tabs>` (currently 3 tabs: details/activity/versions) with two top-level tabs matching desktop — Overview (leftPanel then activityPanel stacked) and Versions:

```typescript
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'versions')} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="mx-4 mt-3 shrink-0 grid grid-cols-2">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="versions">Versions &amp; Reports</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden overflow-auto">
                      <div className="flex flex-col">
                        {leftPanel}
                        {activityPanel}
                      </div>
                    </TabsContent>
                    <TabsContent value="versions" className="flex-1 min-h-0 mt-2 flex flex-col data-[state=inactive]:hidden">
                      <VersionsReportsTab versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
                    </TabsContent>
                  </Tabs>
```

- [ ] **Step 5: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS. If build flags unused `versionsPanel`/`rightPanel`, delete those `const` blocks (Step 3 note).

- [ ] **Step 6: Commit**

```bash
git add src/components/kanban/bill-details-dialog.tsx
git commit -m "feat: restructure bill dialog into Overview and Versions & Reports tabs"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including `bill-diff.test.ts` and `committees.test.ts`.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 3: Manual smoke (dev server)**

Run `npm run dev`; open a demo bill (e.g. HB1334 or SB894 on the jkapali / Jaden Kapali board). Verify:
- Two top-level tabs: Overview, Versions & Reports.
- Overview left: Bill Briefing showing DERIVED facts with NO AI click (testimony open/closed message, where-it-stands, latest version, committee activity, next steps), plus an optional "Summarize with AI" that adds a placeholder narrative; Details; Committees directory (AGR/FIN with members + roles, no email/AI). Right: Status Updates scrolls independently.
- Versions & Reports: Timeline sub-tab is current-first; a version shows "Diff vs <prev>" that expands a real red/green diff. Compare sub-tab: two pickers + side-by-side diff + Summarize changes (placeholder).
- Mobile width (375px): two tabs; Overview stacks Briefing→Details→Committees→Status Updates; Compare columns stack.

- [ ] **Step 4: Commit any smoke-fix tweaks**

```bash
git add -A && git commit -m "fix: bill dialog rework polish"  # only if changes were needed
```

---

## Self-Review

**Spec coverage:**
- Bill Briefing DERIVED (no-AI) with next steps + optional AI narrative → Task 4 (facts engine + card) + Task 3 stub. ✓
- Briefing usable when AI opted out → Task 4 (`deriveBriefingFacts` renders with no AI call; tested). ✓
- Version diffs (real, hawaii-bill-diff) → Task 1 (service) + Task 6 (inline) + Task 7 (compare). ✓
- Per-version & per-report summaries → existing `bill-versions-panel` Summarize (kept) + Task 3 stub; per-version summary shown in timeline. ✓
- Compare (side-by-side, optional AI summary) → Task 7. ✓
- Committee directory (list only, no email/AI-draft) → Task 2 + Task 5. ✓
- Two top-level tabs; Overview = Briefing+Details+Committees | Status Updates; Versions full width → Task 9. ✓
- Timeline current-first + Compare sub-tabs → Task 6 + Task 7 + Task 8. ✓
- Optional AI stubbed via one module → Task 3. ✓
- Diff wrapper in services/ (plain module) → Task 1. ✓
- Olive=optional-AI, teal=primary, semantic red/green → Tasks 4/6/7 class choices. ✓
- Mobile stacking → Task 9 Step 4. ✓
- Error/empty states (no versions, same-version compare, missing text, diff error) → Task 1 (error flag), Task 6 (guards `previous && originalText`), Task 7 (sameVersion + error + <2 guards). ✓
- Tests for bill-diff + committees + briefing-facts → Tasks 1, 2, 4. ✓

**Placeholder scan:** No TBD/TODO left as work items; the only "(placeholder…)" strings are intentional stubbed-AI output copy. ✓

**Type consistency:** `VersionDiff`/`DiffRow` field names (`type`,`text`,`rows`,`olderLabel`,`newerLabel`,`summaryText`,`error`) identical across Tasks 1, 6, 7. `BriefingFacts`/`BriefingStep` (`testimony{open,urgent,message}`,`standing`,`latestVersionLabel`,`latestVersionHtml`,`committeeCodes`,`reportCount`,`nextSteps[{text,action}]`; action ∈ `testimony|diff|reports`) defined and consumed within Task 4. `CommitteeInfo`/`CommitteeMember` (`code`,`fullName`,`members[{name,role,email}]`) identical across Tasks 2, 5. `stubSummarize`/`stubBriefingNarrative` signatures match between Task 3 and consumers 4/7. `diffVersions(older, newer)` order consistent (older-first) everywhere. ✓

## Open Items (from spec, follow-ups)

- Real Genkit summarize/briefing/draft-note + persistence to `ai_summary`.
- Real committee-member data (replace placeholder `COMMITTEE_DIRECTORY`).
- Real message sending / contact logging.
- Upgrade diff from plain-text `compareBills` to HTML section-aware `compareBillContent` via `html_link`.
