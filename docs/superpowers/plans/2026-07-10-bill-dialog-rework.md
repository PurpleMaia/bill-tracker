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
- **AI is STUBBED this pass** — Briefing, per-version/report summaries, compare "summarize changes", committee "draft note" all use one `ai-stub.ts` module returning labeled placeholders. Diffs are REAL.
- **Olive marks AI features, teal marks primary actions, semantic red/green for diffs.** Tailwind exposes named olive utilities (`text-olive-dark`, `border-olive-dark`, `bg-olive-soft`, `bg-olive`) — prefer these over arbitrary `text-[hsl(var(--olive-dark))]` forms. Where a task's code shows the arbitrary form, substitute the named utility (e.g. `text-[hsl(var(--olive-dark))]` → `text-olive-dark`, `bg-[hsl(var(--olive-soft))]/40` → `bg-olive-soft/40`).
- **Verification:** `npm test`/`pnpm test`, `npm run typecheck`, `npm run build` must pass (build catches `'use server'` violations). Use `npx vitest run <file>` for single-file test runs.
- **Commit style:** prefixes `feat:`/`fix:`/`refactor:`/`docs:`. No `Co-Authored-By` lines.

## File Structure

- `src/services/bill-diff.ts` (new) — wraps `hawaii-bill-diff`; `diffVersions()` → normalized `VersionDiff`.
- `src/lib/committees.ts` (new) — `parseCommitteeCodes()` + static `COMMITTEE_DIRECTORY` placeholder.
- `src/components/kanban/ai-stub.ts` (new) — `stubSummarize`, `stubBriefing`, `stubDraftNote`.
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
- Consumes: `BillDetails` from `@/types/legislation`; `CommitteeMember` from `@/lib/committees`.
- Produces:
  - `stubSummarize(text: string): Promise<string>`
  - `interface BriefingResult { lede: string; details: string; latestVersion: string; committees: string; nextSteps: { text: string; action: 'testimony' | 'diff' | 'note' }[]; }`
  - `stubBriefing(bill: BillDetails): Promise<BriefingResult>`
  - `stubDraftNote(member: CommitteeMember, bill: BillDetails): Promise<string>`

- [ ] **Step 1: Implement the module**

Create `src/components/kanban/ai-stub.ts`:

```typescript
// One place all AI features are stubbed. Swap these internals for real Genkit
// calls later; the component API stays the same.
import type { BillDetails } from '@/types/legislation';
import type { CommitteeMember } from '@/lib/committees';

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

export interface BriefingResult {
  lede: string;
  details: string;
  latestVersion: string;
  committees: string;
  nextSteps: { text: string; action: 'testimony' | 'diff' | 'note' }[];
}

export function stubBriefing(bill: BillDetails): Promise<BriefingResult> {
  return delay({
    lede: `${bill.bill_number} — an AI briefing of what this bill does and where it stands will appear here. ${STUB}`,
    details: bill.description?.slice(0, 160) || 'Bill details summary.',
    latestVersion: `Summary of the most recent version (${bill.versions.at(-1)?.label ?? 'n/a'}).`,
    committees: `Summary of what the ${bill.reports.length} committee report(s) recommend.`,
    nextSteps: [
      { text: 'Submit testimony before the next hearing.', action: 'testimony' },
      { text: 'Compare the two most recent drafts to see what changed.', action: 'diff' },
      { text: 'Contact a committee chair about this bill.', action: 'note' },
    ],
  });
}

export function stubDraftNote(member: CommitteeMember, bill: BillDetails): Promise<string> {
  return delay(
    `Dear ${member.name},\n\nRe: ${bill.bill_number}. A drafted message about this bill will appear here once AI is connected. ${STUB}`,
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (No test — this is a thin stub verified via consuming components. `bill.versions.at(-1)` requires the `versions`/`reports` fields on `BillDetails`, which exist from prior work.)

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/ai-stub.ts
git commit -m "feat: add stubbed-AI module for briefing, summaries, draft notes"
```

---

### Task 4: Bill Briefing card

**Files:**
- Create: `src/components/kanban/bill-briefing.tsx`

**Interfaces:**
- Consumes: `BillDetails`; `stubBriefing`, `BriefingResult` (Task 3); shadcn `Button`; `lucide-react`.
- Produces: `BillBriefing({ bill, onNextStep }: { bill: BillDetails; onNextStep: (action: 'testimony' | 'diff' | 'note') => void }): JSX.Element`

- [ ] **Step 1: Implement the component**

Create `src/components/kanban/bill-briefing.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import { stubBriefing, type BriefingResult } from './ai-stub';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RotateCw } from 'lucide-react';

const AI_ACCENT = 'text-[hsl(var(--olive-dark))]';

export function BillBriefing({
  bill,
  onNextStep,
}: {
  bill: BillDetails;
  onNextStep: (action: 'testimony' | 'diff' | 'note') => void;
}) {
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      setResult(await stubBriefing(bill));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--olive-dark))]/40 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${AI_ACCENT}`}>
          <Sparkles className="h-3.5 w-3.5" /> Bill briefing
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={loading}
          className="h-7 gap-1 border-[hsl(var(--olive-dark))]/40 px-2 text-xs text-[hsl(var(--olive-dark))]"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
          {result ? 'Regenerate' : 'Generate'}
        </Button>
      </div>

      {!result && !loading && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Generate an AI briefing that summarizes this bill, its latest version, and what committees are reporting — with suggested next steps.
        </p>
      )}

      {result && (
        <>
          <p className="text-[13.5px] leading-relaxed">{result.lede}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { h: 'Bill details', p: result.details },
              { h: 'Latest version', p: result.latestVersion },
              { h: 'What committees say', p: result.committees },
            ].map((cell) => (
              <div key={cell.h} className="rounded-md border p-2.5">
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">{cell.h}</h4>
                <p className="text-[12px] text-foreground/80">{cell.p}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed pt-3">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested next steps</h4>
            <div className="space-y-1.5">
              {result.nextSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">{i + 1}</span>
                  <span className="flex-1 text-[12.5px]">{step.text}</span>
                  <Button variant="ghost" size="sm" className="h-6 flex-none px-2 text-[11px] text-primary" onClick={() => onNextStep(step.action)}>
                    Go
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/bill-briefing.tsx
git commit -m "feat: add AI bill briefing card (stubbed)"
```

---

### Task 5: Committee contacts block

**Files:**
- Create: `src/components/kanban/committee-contacts.tsx`

**Interfaces:**
- Consumes: `BillDetails`; `parseCommitteeCodes`, `getCommitteeInfo`, `CommitteeMember` (Task 2); `stubDraftNote` (Task 3); shadcn `Button`; `lucide-react`; `toast` from `@/hooks/use-toast`.
- Produces: `CommitteeContacts({ bill }: { bill: BillDetails }): JSX.Element`

- [ ] **Step 1: Implement the component**

Create `src/components/kanban/committee-contacts.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import { parseCommitteeCodes, getCommitteeInfo, type CommitteeMember } from '@/lib/committees';
import { stubDraftNote } from './ai-stub';
import { Button } from '@/components/ui/button';
import { Copy, Mail, Sparkles, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

function MemberRow({ member }: { member: CommitteeMember }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[12.5px]">
      <span className="min-w-0 truncate">{member.name}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${member.role === 'Chair' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {member.role}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-6 w-6" title="Copy email"
          onClick={() => { navigator.clipboard?.writeText(member.email); toast({ title: 'Email copied', description: member.email }); }}>
          <Copy className="h-3 w-3" />
        </Button>
        <Button asChild variant="outline" size="icon" className="h-6 w-6" title="Email">
          <a href={`mailto:${member.email}`}><Mail className="h-3 w-3" /></a>
        </Button>
      </span>
    </div>
  );
}

export function CommitteeContacts({ bill }: { bill: BillDetails }) {
  const codes = parseCommitteeCodes(bill.committee_assignment);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftingCode, setDraftingCode] = useState<string | null>(null);

  if (codes.length === 0) {
    return <p className="text-xs text-muted-foreground">No committees assigned.</p>;
  }

  async function draftFor(code: string, member: CommitteeMember) {
    setDraftingCode(code);
    setDraft(null);
    try {
      setDraft(await stubDraftNote(member, bill));
    } finally {
      setDraftingCode(null);
    }
  }

  return (
    <div className="space-y-2">
      {codes.map((code) => {
        const info = getCommitteeInfo(code);
        const chair = info.members[0];
        return (
          <div key={code} className="rounded-md border p-2.5">
            <div className="text-[12.5px] font-bold">{code}</div>
            <div className="mb-1 text-[11px] text-muted-foreground">{info.fullName}</div>
            {info.members.length > 0 ? (
              info.members.map((m) => <MemberRow key={m.email} member={m} />)
            ) : (
              <p className="text-[11px] text-muted-foreground">Member contacts unavailable.</p>
            )}
            {chair && (
              <Button variant="outline" size="sm"
                className="mt-1.5 h-7 gap-1 border-[hsl(var(--olive-dark))]/40 px-2 text-xs text-[hsl(var(--olive-dark))]"
                disabled={draftingCode === code}
                onClick={() => draftFor(code, chair)}>
                {draftingCode === code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Draft note with AI
              </Button>
            )}
          </div>
        );
      })}
      {draft && (
        <div className="rounded-md border border-[hsl(var(--olive-dark))]/40 bg-[hsl(var(--olive-soft))]/40 p-2.5">
          <p className="whitespace-pre-wrap text-[12px] text-foreground/80">{draft}</p>
        </div>
      )}
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
git commit -m "feat: add committee contacts block (UI shell, placeholder members)"
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

```typescript
                  <BillBriefing bill={billDetails ?? (bill as BillDetails)} onNextStep={(action) => {
                    if (action === 'diff') setActiveTab('versions');
                    else if (action === 'testimony') { onClose(); router.push(`/bills/${bill.id}/testimony`); }
                    // 'note' — the committees section is just below; no-op scroll for now.
                  }} />
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
- Overview left: Bill Briefing (Generate → placeholder briefing + next steps), Details, Committees & contacts (AGR/FIN with copy/mailto + Draft note). Right: Status Updates scrolls independently.
- Versions & Reports: Timeline sub-tab is current-first; a version shows "Diff vs <prev>" that expands a real red/green diff. Compare sub-tab: two pickers + side-by-side diff + Summarize changes (placeholder).
- Mobile width (375px): two tabs; Overview stacks Briefing→Details→Committees→Status Updates; Compare columns stack.

- [ ] **Step 4: Commit any smoke-fix tweaks**

```bash
git add -A && git commit -m "fix: bill dialog rework polish"  # only if changes were needed
```

---

## Self-Review

**Spec coverage:**
- Bill Briefing + next steps → Task 4 (+ Task 3 stub). ✓
- Version diffs (real, hawaii-bill-diff) → Task 1 (service) + Task 6 (inline) + Task 7 (compare). ✓
- Per-version & per-report summaries → existing `bill-versions-panel` Summarize (kept) + Task 3 stub; per-version summary shown in timeline. ✓
- Compare (side-by-side, optional AI summary) → Task 7. ✓
- Committee contacts (info + copy/mailto + AI draft, UI shell) → Task 2 + Task 5. ✓
- Two top-level tabs; Overview = Briefing+Details+Committees | Status Updates; Versions full width → Task 9. ✓
- Timeline current-first + Compare sub-tabs → Task 6 + Task 7 + Task 8. ✓
- All AI stubbed via one module → Task 3. ✓
- Diff wrapper in services/ (plain module) → Task 1. ✓
- Olive=AI, teal=primary, semantic red/green → Tasks 4/5/6/7 class choices. ✓
- Mobile stacking → Task 9 Step 4. ✓
- Error/empty states (no versions, same-version compare, missing text, diff error) → Task 1 (error flag), Task 6 (guards `previous && originalText`), Task 7 (sameVersion + error + <2 guards). ✓
- Tests for bill-diff + committees → Tasks 1, 2. ✓

**Placeholder scan:** No TBD/TODO left as work items; the only "(placeholder…)" strings are intentional stubbed-AI output copy, and the `// 'note' — no-op` comment is a deliberate, documented non-action. ✓

**Type consistency:** `VersionDiff`/`DiffRow` field names (`type`,`text`,`rows`,`olderLabel`,`newerLabel`,`summaryText`,`error`) identical across Tasks 1, 6, 7. `BriefingResult` (`lede`,`details`,`latestVersion`,`committees`,`nextSteps[{text,action}]`) identical across Tasks 3, 4. `CommitteeInfo`/`CommitteeMember` (`code`,`fullName`,`members[{name,role,email}]`) identical across Tasks 2, 5. `stubSummarize`/`stubBriefing`/`stubDraftNote` signatures match between Task 3 and consumers 4/5/7. `diffVersions(older, newer)` order consistent (older-first) everywhere. ✓

## Open Items (from spec, follow-ups)

- Real Genkit summarize/briefing/draft-note + persistence to `ai_summary`.
- Real committee-member data (replace placeholder `COMMITTEE_DIRECTORY`).
- Real message sending / contact logging.
- Upgrade diff from plain-text `compareBills` to HTML section-aware `compareBillContent` via `html_link`.
