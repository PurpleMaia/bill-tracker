# Testimony Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-page testimony writer at `/bills/[id]/testimony` (launched from the bill-details dialog) with a Tiptap rich-text editor, a bill reference panel, DB-persisted drafts, client-side PDF/DOCX export, and a Hawaii capitol submission guide.

**Architecture:** Three-step page (Write → Export → Submit). Drafts live in a new `testimonies` table (one per user per bill, upserted), reached through the standard switchable data-client (`data.testimony.*` → action arm + fetch arm over the same `db/queries` function). Export walks the Tiptap JSON once into neutral blocks (pure, unit-tested), then emits DOCX (`docx`) and PDF (`pdfmake`) via dynamic imports.

**Tech Stack:** Next.js 15.2.6 (App Router), React 18, TypeScript, Kysely/Postgres, Tiptap v2, `docx` v9, `pdfmake` 0.2.x, shadcn/ui, Vitest.

## Global Constraints

- Work in the `demo-tree` worktree (`/Users/jkapali/Documents/Github/PMF/Food+/demo-tree`) on branch `feat/testimony-writer`. All paths below are relative to that root.
- Package manager is **pnpm** (`packageManager: pnpm@10.30.3`). Install with `pnpm add`, run scripts with `pnpm run <script>`.
- All Kysely queries go in `src/db/queries/*`; routes/actions are thin transports. `src/lib/` stays DB-free.
- Auth via `@/lib/auth-guards` (`requireSession`, `requireMembership`) — never hand-roll cookie→session checks.
- `'use server'` files may only export async functions (no type/const re-exports). The build (`pnpm run build`) catches violations that typecheck doesn't.
- Data-client contract: `action` and `fetch` arms take identical params and resolve to the same unwrapped value; register pairs with `defineClient`.
- Tenant scoping: `testimonies.tenant_id` comes from the client's `activeTenant.tenantId` and is validated server-side with `requireMembership` when non-null.
- Commit prefixes `feat:`/`fix:`/`refactor:`/`docs:`; **no `Co-Authored-By` lines**.
- Tests are pure unit tests in `src/lib/__tests__/` (vitest `describe`/`it`/`expect`, no DB, no mocks).
- Do not delete or rewrite existing API routes.

---

### Task 1: Migration + Kysely types + shared testimony types

**Files:**
- Create: `src/db/migrations/000024_create_testimonies_table.up.sql`
- Create: `src/db/migrations/000024_create_testimonies_table.down.sql`
- Modify: `src/db/types.ts` (add `Testimonies` interface + `DB` entry; file is codegen-output but `bill_versions` precedent shows hand-maintenance between codegen runs)
- Create: `src/types/testimony.ts`

**Interfaces:**
- Produces: table `testimonies`; Kysely `Testimonies` row type; client types `TestimonyPosition`, `TestimonyDraft`, `TestimonyDraftInput` used by every later task.

- [ ] **Step 1: Write the up migration**

`src/db/migrations/000024_create_testimonies_table.up.sql`:

```sql
CREATE TABLE testimonies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  author_name   text NOT NULL DEFAULT '',
  organization  text NOT NULL DEFAULT '',
  position      text NOT NULL DEFAULT 'comments' CHECK (position IN ('support', 'oppose', 'comments')),
  content_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, bill_id)
);

CREATE INDEX idx_testimonies_bill_id ON testimonies(bill_id);
```

- [ ] **Step 2: Write the down migration**

`src/db/migrations/000024_create_testimonies_table.down.sql`:

```sql
DROP TABLE IF EXISTS testimonies;
```

- [ ] **Step 3: Run the migration**

Run: `pnpm run migrate:up`
Expected: applies version 24 cleanly. (If no local `DATABASE_URL` is configured, note it in the task report and continue — SQL will be exercised in the maintainer's environment.)

- [ ] **Step 4: Add the Kysely row type**

In `src/db/types.ts`, after the `Tenants` interface add:

```ts
export type TestimonyPosition = "comments" | "oppose" | "support";

export interface Testimonies {
  author_name: Generated<string>;
  bill_id: string;
  content_json: Generated<Json>;
  created_at: Generated<Timestamp>;
  id: Generated<string>;
  organization: Generated<string>;
  position: Generated<TestimonyPosition>;
  tenant_id: string | null;
  updated_at: Generated<Timestamp>;
  user_id: string;
}
```

and in the `DB` interface (alphabetical position, after `tenants`):

```ts
  testimonies: Testimonies;
```

- [ ] **Step 5: Create shared client-facing types**

`src/types/testimony.ts`:

```ts
import type { TestimonyPosition } from '@/db/types';

export type { TestimonyPosition };

/** A user's saved testimony draft for one bill (already unwrapped for the client). */
export interface TestimonyDraft {
  billId: string;
  authorName: string;
  organization: string;
  position: TestimonyPosition;
  /** Tiptap document JSON ({ type: 'doc', content: [...] }). */
  contentJson: unknown;
  updatedAt: string | null;
}

/** Payload for saving a draft. */
export interface TestimonyDraftInput {
  billId: string;
  /** Active tenant to stamp on the row; null/undefined for public users. */
  tenantId?: string | null;
  authorName: string;
  organization: string;
  position: TestimonyPosition;
  contentJson: unknown;
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/000024_create_testimonies_table.up.sql src/db/migrations/000024_create_testimonies_table.down.sql src/db/types.ts src/types/testimony.ts
git commit -m "feat: add testimonies table, kysely row type, and testimony client types"
```

---

### Task 2: Query layer — `db/queries/testimony.ts`

**Files:**
- Create: `src/db/queries/testimony.ts`

**Interfaces:**
- Consumes: `Testimonies` row type, `TestimonyDraft`/`TestimonyDraftInput` from Task 1.
- Produces: `getTestimonyDraft(userId: string, billId: string): Promise<TestimonyDraft | null>` and `upsertTestimonyDraft(userId: string, input: TestimonyDraftInput): Promise<TestimonyDraft>` — used by Task 3's action and route.

- [ ] **Step 1: Write the query module**

`src/db/queries/testimony.ts` (mirror the style of `src/db/queries/user-preferences.ts`):

```ts
'use server';

import { db } from '@/db/kysely/client';
import type { TestimonyDraft, TestimonyDraftInput, TestimonyPosition } from '@/types/testimony';

const POSITIONS: TestimonyPosition[] = ['support', 'oppose', 'comments'];

function normalizePosition(value: string): TestimonyPosition {
  return (POSITIONS as string[]).includes(value) ? (value as TestimonyPosition) : 'comments';
}

/** Returns the user's draft for a bill, or null if none exists yet. */
export async function getTestimonyDraft(
  userId: string,
  billId: string,
): Promise<TestimonyDraft | null> {
  const row = await db
    .selectFrom('testimonies')
    .select(['bill_id', 'author_name', 'organization', 'position', 'content_json', 'updated_at'])
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .executeTakeFirst();

  if (!row) return null;
  return {
    billId: row.bill_id,
    authorName: row.author_name,
    organization: row.organization,
    position: normalizePosition(row.position),
    contentJson: row.content_json,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/** Upserts the user's draft for a bill (one row per user+bill) and returns it. */
export async function upsertTestimonyDraft(
  userId: string,
  input: TestimonyDraftInput,
): Promise<TestimonyDraft> {
  const values = {
    user_id: userId,
    bill_id: input.billId,
    tenant_id: input.tenantId ?? null,
    author_name: input.authorName,
    organization: input.organization,
    position: normalizePosition(input.position),
    content_json: JSON.stringify(input.contentJson ?? {}),
    updated_at: new Date(),
  };

  await db
    .insertInto('testimonies')
    .values(values)
    .onConflict((oc) =>
      oc.columns(['user_id', 'bill_id']).doUpdateSet({
        tenant_id: values.tenant_id,
        author_name: values.author_name,
        organization: values.organization,
        position: values.position,
        content_json: values.content_json,
        updated_at: values.updated_at,
      }),
    )
    .execute();

  const saved = await getTestimonyDraft(userId, input.billId);
  if (!saved) throw new Error('Failed to save testimony draft');
  return saved;
}
```

Note: `content_json` is stringified because `pg` requires explicit serialization for jsonb params in Kysely inserts (matches how `Json` columns are written elsewhere; if typecheck complains about the string, cast `JSON.stringify(...) as unknown as Json` with `import type { Json } from '@/db/types'`).

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/testimony.ts
git commit -m "feat: add testimony draft queries (get + upsert)"
```

---

### Task 3: Transport arms — server actions + API route

**Files:**
- Create: `src/app/actions/testimony.ts`
- Create: `src/app/api/bills/[id]/testimony/route.ts`

**Interfaces:**
- Consumes: `getTestimonyDraft` / `upsertTestimonyDraft` (Task 2), `requireSession` / `requireMembership` from `@/lib/auth-guards`.
- Produces: actions `getTestimonyDraftAction(billId: string): Promise<TestimonyDraft | null>`, `saveTestimonyDraftAction(input: TestimonyDraftInput): Promise<TestimonyDraft>`; route `GET/PUT /api/bills/[id]/testimony` returning the same values as bare JSON (`null` or the draft object). Task 4 wraps both.

- [ ] **Step 1: Write the action arm**

`src/app/actions/testimony.ts` (mirror `src/app/actions/preferences.ts`):

```ts
'use server';

import { requireSession, requireMembership } from '@/lib/auth-guards';
import { getTestimonyDraft, upsertTestimonyDraft } from '@/db/queries/testimony';
import type { TestimonyDraft, TestimonyDraftInput } from '@/types/testimony';

/** Server-action arm for data.testimony.getDraft. Returns the caller's own draft. */
export async function getTestimonyDraftAction(billId: string): Promise<TestimonyDraft | null> {
  const { user } = await requireSession.fromAction();
  return getTestimonyDraft(user.id, billId);
}

/** Server-action arm for data.testimony.saveDraft. Upserts the caller's own draft. */
export async function saveTestimonyDraftAction(
  input: TestimonyDraftInput,
): Promise<TestimonyDraft> {
  const { user } = input.tenantId
    ? await requireMembership.fromAction(input.tenantId)
    : await requireSession.fromAction();
  return upsertTestimonyDraft(user.id, input);
}
```

- [ ] **Step 2: Write the fetch-arm route**

`src/app/api/bills/[id]/testimony/route.ts` (error mapping mirrors `src/app/api/bills/[id]/route.ts`):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireMembership } from '@/lib/auth-guards';
import { getTestimonyDraft, upsertTestimonyDraft } from '@/db/queries/testimony';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { id: billId } = await params;
    const draft = await getTestimonyDraft(user.id, billId);
    return NextResponse.json(draft, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;
    const body = await request.json();
    const { user } = body.tenantId
      ? await requireMembership.fromRequest(request, body.tenantId)
      : await requireSession.fromRequest(request);
    const draft = await upsertTestimonyDraft(user.id, { ...body, billId });
    return NextResponse.json(draft, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/testimony.ts "src/app/api/bills/[id]/testimony/route.ts"
git commit -m "feat: add testimony draft action and API route transports"
```

---

### Task 4: Data-client registration — `data.testimony.*`

**Files:**
- Create: `src/lib/data-client/testimony.client.ts`
- Modify: `src/lib/data-client/index.ts`

**Interfaces:**
- Consumes: actions from Task 3; route `GET/PUT /api/bills/{billId}/testimony`.
- Produces: `data.testimony.getDraft(billId: string): Promise<TestimonyDraft | null>` and `data.testimony.saveDraft(input: TestimonyDraftInput): Promise<TestimonyDraft>` — used by the page in Task 8.

- [ ] **Step 1: Write the client**

`src/lib/data-client/testimony.client.ts` (mirror `preferences.client.ts`):

```ts
import { defineClient } from './define-client';
import {
  getTestimonyDraftAction,
  saveTestimonyDraftAction,
} from '@/app/actions/testimony';
import type { TestimonyDraft, TestimonyDraftInput } from '@/types/testimony';

// ---- fetch arm (hits /api/bills/[id]/testimony) ----

async function getTestimonyDraftFetch(billId: string): Promise<TestimonyDraft | null> {
  const res = await fetch(`/api/bills/${billId}/testimony`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load testimony draft');
  }
  return res.json();
}

async function saveTestimonyDraftFetch(input: TestimonyDraftInput): Promise<TestimonyDraft> {
  const res = await fetch(`/api/bills/${input.billId}/testimony`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save testimony draft');
  }
  return res.json();
}

export const testimonyClient = defineClient('testimony', {
  getDraft: { action: getTestimonyDraftAction, fetch: getTestimonyDraftFetch },
  saveDraft: { action: saveTestimonyDraftAction, fetch: saveTestimonyDraftFetch },
});
```

- [ ] **Step 2: Register the domain**

In `src/lib/data-client/index.ts` add the import and entry:

```ts
import { testimonyClient } from './testimony.client';
```

and inside `data`:

```ts
  testimony: testimonyClient,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS (defineClient structurally verifies the fetch arm matches the action arm).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data-client/testimony.client.ts src/lib/data-client/index.ts
git commit -m "feat: register testimony domain in the data client"
```

---

### Task 5: Pure export core — Tiptap JSON → blocks (TDD)

**Files:**
- Create: `src/lib/testimony-export/blocks.ts`
- Test: `src/lib/__tests__/testimony-blocks.test.ts`

**Interfaces:**
- Produces (used by Tasks 6 and 9):
  - `interface TextRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; font?: string }`
  - `type TestimonyBlock = { type: 'heading'; level: 1 | 2 | 3; runs: TextRun[] } | { type: 'paragraph'; runs: TextRun[] } | { type: 'list'; ordered: boolean; items: TextRun[][] }`
  - `tiptapToBlocks(doc: unknown): TestimonyBlock[]`
  - `interface TestimonyMeta { billNumber: string; billTitle: string; committee: string | null; position: TestimonyPosition; authorName: string; organization: string; dateStr: string }`
  - `composeHeaderLines(meta: TestimonyMeta): string[]`
  - `positionLabel(position: TestimonyPosition): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/testimony-blocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  tiptapToBlocks,
  composeHeaderLines,
  positionLabel,
} from '@/lib/testimony-export/blocks';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Aloha Chair and Members' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'I ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'strongly' },
        {
          type: 'text',
          marks: [
            { type: 'italic' },
            { type: 'textStyle', attrs: { fontFamily: 'Georgia, serif' } },
          ],
          text: ' support',
        },
        { type: 'text', text: ' this bill.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Food security' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Local farms' }] },
          ],
        },
      ],
    },
  ],
};

describe('tiptapToBlocks', () => {
  it('converts headings with level and text', () => {
    const blocks = tiptapToBlocks(doc);
    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 2,
      runs: [{ text: 'Aloha Chair and Members' }],
    });
  });

  it('maps bold/italic/fontFamily marks onto runs', () => {
    const blocks = tiptapToBlocks(doc);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      runs: [
        { text: 'I ' },
        { text: 'strongly', bold: true },
        { text: ' support', italic: true, font: 'Georgia, serif' },
        { text: ' this bill.' },
      ],
    });
  });

  it('flattens bullet lists into items of runs', () => {
    const blocks = tiptapToBlocks(doc);
    expect(blocks[2]).toEqual({
      type: 'list',
      ordered: false,
      items: [[{ text: 'Food security' }], [{ text: 'Local farms' }]],
    });
  });

  it('marks ordered lists as ordered', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ],
    });
    expect(blocks[0]).toEqual({ type: 'list', ordered: true, items: [[{ text: 'One' }]] });
  });

  it('maps underline and strike marks', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'underline' }], text: 'u' },
            { type: 'text', marks: [{ type: 'strike' }], text: 's' },
          ],
        },
      ],
    });
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      runs: [
        { text: 'u', underline: true },
        { text: 's', strike: true },
      ],
    });
  });

  it('clamps heading levels to 1–3 and keeps empty paragraphs', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: 'Deep' }] },
        { type: 'paragraph' },
      ],
    });
    expect(blocks[0]).toEqual({ type: 'heading', level: 3, runs: [{ text: 'Deep' }] });
    expect(blocks[1]).toEqual({ type: 'paragraph', runs: [] });
  });

  it('returns [] for null, non-doc, or empty input', () => {
    expect(tiptapToBlocks(null)).toEqual([]);
    expect(tiptapToBlocks({})).toEqual([]);
    expect(tiptapToBlocks('nope')).toEqual([]);
  });

  it('skips unknown node types', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [{ type: 'horizontalRule' }, { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(blocks).toEqual([{ type: 'paragraph', runs: [{ text: 'hi' }] }]);
  });
});

describe('positionLabel', () => {
  it('labels each position', () => {
    expect(positionLabel('support')).toBe('Testimony in SUPPORT of');
    expect(positionLabel('oppose')).toBe('Testimony in OPPOSITION to');
    expect(positionLabel('comments')).toBe('Comments on');
  });
});

describe('composeHeaderLines', () => {
  it('composes the full header', () => {
    expect(
      composeHeaderLines({
        billNumber: 'HB123',
        billTitle: 'Relating to Food Security',
        committee: 'AGR, FIN',
        position: 'support',
        authorName: 'Jane Doe',
        organization: 'Food+ Hui',
        dateStr: 'July 2, 2026',
      }),
    ).toEqual([
      'Testimony in SUPPORT of HB123',
      'Relating to Food Security',
      'Committee: AGR, FIN',
      'Submitted by: Jane Doe, Food+ Hui',
      'July 2, 2026',
    ]);
  });

  it('omits committee line and organization suffix when absent', () => {
    expect(
      composeHeaderLines({
        billNumber: 'SB55',
        billTitle: 'Relating to Agriculture',
        committee: null,
        position: 'comments',
        authorName: 'Jane Doe',
        organization: '',
        dateStr: 'July 2, 2026',
      }),
    ).toEqual([
      'Comments on SB55',
      'Relating to Agriculture',
      'Submitted by: Jane Doe',
      'July 2, 2026',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/lib/__tests__/testimony-blocks.test.ts`
Expected: FAIL — cannot resolve `@/lib/testimony-export/blocks`.

- [ ] **Step 3: Implement the converter**

`src/lib/testimony-export/blocks.ts`:

```ts
// ==============================================
// TESTIMONY EXPORT — pure Tiptap-JSON → blocks core
// ==============================================
// Pure functions only (no DB, no DOM). The PDF and DOCX generators both
// consume this neutral block shape so the two exports can never drift.

import type { TestimonyPosition } from '@/types/testimony';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** CSS font-family from the editor's textStyle mark, e.g. 'Georgia, serif'. */
  font?: string;
}

export type TestimonyBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: TextRun[] }
  | { type: 'paragraph'; runs: TextRun[] }
  | { type: 'list'; ordered: boolean; items: TextRun[][] };

interface TiptapMark {
  type?: string;
  attrs?: { fontFamily?: string };
}

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: { level?: number };
  marks?: TiptapMark[];
  content?: TiptapNode[];
}

function textRuns(node: TiptapNode): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type !== 'text' || typeof child.text !== 'string') continue;
    const run: TextRun = { text: child.text };
    for (const mark of child.marks ?? []) {
      if (mark.type === 'bold') run.bold = true;
      if (mark.type === 'italic') run.italic = true;
      if (mark.type === 'underline') run.underline = true;
      if (mark.type === 'strike') run.strike = true;
      if (mark.type === 'textStyle' && mark.attrs?.fontFamily) run.font = mark.attrs.fontFamily;
    }
    runs.push(run);
  }
  return runs;
}

function listItemRuns(item: TiptapNode): TextRun[] {
  // A listItem wraps one or more paragraphs; join their runs in order.
  return (item.content ?? [])
    .filter((child) => child.type === 'paragraph')
    .flatMap((child) => textRuns(child));
}

/** Converts a Tiptap document JSON into neutral testimony blocks. */
export function tiptapToBlocks(doc: unknown): TestimonyBlock[] {
  const root = doc as TiptapNode | null;
  if (!root || typeof root !== 'object' || !Array.isArray(root.content)) return [];

  const blocks: TestimonyBlock[] = [];
  for (const node of root.content) {
    switch (node.type) {
      case 'heading': {
        const raw = Number(node.attrs?.level) || 1;
        const level = Math.min(Math.max(raw, 1), 3) as 1 | 2 | 3;
        blocks.push({ type: 'heading', level, runs: textRuns(node) });
        break;
      }
      case 'paragraph':
        blocks.push({ type: 'paragraph', runs: textRuns(node) });
        break;
      case 'bulletList':
      case 'orderedList': {
        const items = (node.content ?? [])
          .filter((child) => child.type === 'listItem')
          .map(listItemRuns);
        blocks.push({ type: 'list', ordered: node.type === 'orderedList', items });
        break;
      }
      default:
        break; // unknown node types are skipped
    }
  }
  return blocks;
}

/** Everything the export header needs, resolved by the caller. */
export interface TestimonyMeta {
  billNumber: string;
  billTitle: string;
  committee: string | null;
  position: TestimonyPosition;
  authorName: string;
  organization: string;
  dateStr: string;
}

export function positionLabel(position: TestimonyPosition): string {
  switch (position) {
    case 'support':
      return 'Testimony in SUPPORT of';
    case 'oppose':
      return 'Testimony in OPPOSITION to';
    default:
      return 'Comments on';
  }
}

/** Header lines in conventional Hawaii testimony order. */
export function composeHeaderLines(meta: TestimonyMeta): string[] {
  const lines = [
    `${positionLabel(meta.position)} ${meta.billNumber}`,
    meta.billTitle,
  ];
  if (meta.committee) lines.push(`Committee: ${meta.committee}`);
  lines.push(
    `Submitted by: ${meta.authorName}${meta.organization ? `, ${meta.organization}` : ''}`,
    meta.dateStr,
  );
  return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- src/lib/__tests__/testimony-blocks.test.ts`
Expected: PASS (all tests). Then run the full suite: `pnpm run test` — all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/testimony-export/blocks.ts src/lib/__tests__/testimony-blocks.test.ts
git commit -m "feat: add pure tiptap-to-blocks converter and testimony header composer"
```

---

### Task 6: PDF + DOCX generators and download helper

**Files:**
- Create: `src/lib/testimony-export/to-docx.ts`
- Create: `src/lib/testimony-export/to-pdf.ts`
- Create: `src/lib/testimony-export/download.ts`
- Modify: `package.json` (via `pnpm add docx pdfmake @types/pdfmake`)

**Interfaces:**
- Consumes: `TestimonyBlock`, `TextRun`, `TestimonyMeta`, `composeHeaderLines` (Task 5).
- Produces (used by Task 9):
  - `generateTestimonyDocx(meta: TestimonyMeta, blocks: TestimonyBlock[]): Promise<Blob>`
  - `generateTestimonyPdf(meta: TestimonyMeta, blocks: TestimonyBlock[]): Promise<Blob>`
  - `downloadBlob(blob: Blob, filename: string): void`

- [ ] **Step 1: Install dependencies**

Run: `pnpm add docx@^9.5.0 pdfmake@^0.2.20 && pnpm add -D @types/pdfmake`
Expected: lockfile updated, no peer-dependency errors.

- [ ] **Step 2: Write the DOCX generator**

`src/lib/testimony-export/to-docx.ts`:

```ts
// DOCX generator. Imported dynamically from the export step so the `docx`
// bundle stays out of the main chunk.

import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun as DocxTextRun,
} from 'docx';
import type { TestimonyBlock, TestimonyMeta, TextRun } from './blocks';
import { composeHeaderLines } from './blocks';

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

const NUMBERING_REF = 'testimony-ordered';

function docxRuns(runs: TextRun[]): DocxTextRun[] {
  return runs.map(
    (run) =>
      new DocxTextRun({
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        underline: run.underline ? {} : undefined,
        strike: run.strike,
        // Word wants a single family name, not a CSS stack.
        font: run.font ? run.font.split(',')[0].replace(/["']/g, '').trim() : undefined,
      }),
  );
}

export async function generateTestimonyDocx(
  meta: TestimonyMeta,
  blocks: TestimonyBlock[],
): Promise<Blob> {
  const children: Paragraph[] = [];

  composeHeaderLines(meta).forEach((line, index) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new DocxTextRun({ text: line, bold: index === 0 })],
      }),
    );
  });
  children.push(new Paragraph({ children: [] })); // spacer between header and body

  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(
        new Paragraph({ heading: HEADING_LEVELS[block.level], children: docxRuns(block.runs) }),
      );
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ children: docxRuns(block.runs) }));
    } else {
      for (const item of block.items) {
        children.push(
          new Paragraph({
            children: docxRuns(item),
            ...(block.ordered
              ? { numbering: { reference: NUMBERING_REF, level: 0 } }
              : { bullet: { level: 0 } }),
          }),
        );
      }
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
```

- [ ] **Step 3: Write the PDF generator**

`src/lib/testimony-export/to-pdf.ts`:

```ts
// PDF generator (pdfmake). Imported dynamically from the export step.
// pdfmake's bundled VFS ships Roboto only; embedding other fonts is out of
// scope for v1, so the PDF normalizes all fonts to Roboto (the DOCX export
// preserves the chosen font families). Roboto is Unicode-safe, which matters
// for Hawaiian diacriticals (ʻokina/kahakō).

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { TestimonyBlock, TestimonyMeta, TextRun } from './blocks';
import { composeHeaderLines } from './blocks';

const HEADING_SIZES = { 1: 18, 2: 15, 3: 13 } as const;

function pdfRuns(runs: TextRun[]): Content {
  if (runs.length === 0) return { text: ' ' }; // keep empty paragraphs as blank lines
  return {
    text: runs.map((run) => ({
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      // pdfmake takes one decoration; underline wins if both are set.
      decoration: run.underline ? ('underline' as const) : run.strike ? ('lineThrough' as const) : undefined,
    })),
  };
}

export async function generateTestimonyPdf(
  meta: TestimonyMeta,
  blocks: TestimonyBlock[],
): Promise<Blob> {
  const pdfMakeModule: any = await import('pdfmake/build/pdfmake');
  const pdfFontsModule: any = await import('pdfmake/build/vfs_fonts');
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
  const pdfFonts = pdfFontsModule.default ?? pdfFontsModule;
  pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs;

  const content: Content[] = [];

  composeHeaderLines(meta).forEach((line, index) => {
    content.push({ text: line, alignment: 'center', bold: index === 0, margin: [0, 0, 0, 2] });
  });
  content.push({ text: ' ', margin: [0, 0, 0, 8] });

  for (const block of blocks) {
    if (block.type === 'heading') {
      content.push({
        ...(pdfRuns(block.runs) as object),
        fontSize: HEADING_SIZES[block.level],
        bold: true,
        margin: [0, 8, 0, 4],
      } as Content);
    } else if (block.type === 'paragraph') {
      content.push({ ...(pdfRuns(block.runs) as object), margin: [0, 2, 0, 2] } as Content);
    } else {
      const items = block.items.map((item) => pdfRuns(item));
      content.push(block.ordered ? { ol: items, margin: [0, 2, 0, 2] } : { ul: items, margin: [0, 2, 0, 2] });
    }
  }

  const definition: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { fontSize: 11, lineHeight: 1.3 },
    content,
  };

  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(definition).getBlob((blob: Blob) => resolve(blob));
  });
}
```

- [ ] **Step 4: Write the download helper**

`src/lib/testimony-export/download.ts`:

```ts
/** Triggers a browser download for a generated file. Client-side only. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS. (If `pdfmake/build/vfs_fonts` lacks a type declaration, add `declare module 'pdfmake/build/vfs_fonts';` and `declare module 'pdfmake/build/pdfmake';` to a new `src/types/pdfmake-build.d.ts` and re-run.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/testimony-export/to-docx.ts src/lib/testimony-export/to-pdf.ts src/lib/testimony-export/download.ts package.json pnpm-lock.yaml
git add src/types/pdfmake-build.d.ts 2>/dev/null || true
git commit -m "feat: add client-side PDF and DOCX testimony generators"
```

---

### Task 7: Tiptap editor component with formatting toolbar

**Files:**
- Create: `src/components/testimony/testimony-editor.tsx`
- Modify: `package.json` (via `pnpm add` of Tiptap packages)

**Interfaces:**
- Consumes: shadcn `Button`, `Select`, `Separator`; `cn` from `@/lib/utils`.
- Produces (used by Task 8): `<TestimonyEditor initialContent={unknown | null} onChange={(json: unknown) => void} />` — calls `onChange` with `editor.getJSON()` on every edit.

- [ ] **Step 1: Install Tiptap (v2 line — React 18 compatible)**

Run: `pnpm add @tiptap/react@^2.14.0 @tiptap/pm@^2.14.0 @tiptap/starter-kit@^2.14.0 @tiptap/extension-underline@^2.14.0 @tiptap/extension-text-style@^2.14.0 @tiptap/extension-font-family@^2.14.0`
Expected: installs cleanly with react@18.

- [ ] **Step 2: Write the editor component**

`src/components/testimony/testimony-editor.tsx`:

```tsx
'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

const FONT_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

const HEADING_OPTIONS = [
  { label: 'Paragraph', value: 'p' },
  { label: 'Heading 1', value: '1' },
  { label: 'Heading 2', value: '2' },
  { label: 'Heading 3', value: '3' },
];

interface TestimonyEditorProps {
  /** Tiptap JSON to load once on mount (render only after the draft has loaded). */
  initialContent: unknown | null;
  onChange: (json: unknown) => void;
}

function MarkButton({
  editor,
  active,
  onClick,
  label,
  children,
}: {
  editor: Editor;
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-pressed={active}
      disabled={!editor.isEditable}
      onClick={onClick}
      className={cn('h-8 w-8 p-0', active && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  );
}

export function TestimonyEditor({ initialContent, onChange }: TestimonyEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, FontFamily],
    content: (initialContent as object) ?? '',
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
    editorProps: {
      attributes: {
        class: cn(
          'min-h-[55vh] px-4 py-3 text-sm leading-relaxed focus:outline-none',
          '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:my-3',
          '[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:my-3',
          '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:my-2',
          '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
        ),
      },
    },
  });

  if (!editor) return null;

  const activeHeading = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 })
        ? '3'
        : 'p';

  const activeFont =
    FONT_OPTIONS.find((f) => f.value !== 'default' && editor.isActive('textStyle', { fontFamily: f.value }))
      ?.value ?? 'default';

  return (
    <div className="rounded-lg border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <Select
          value={activeFont}
          onValueChange={(value) => {
            if (value === 'default') editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(value).run();
          }}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font.value} value={font.value} className="text-xs">
                {font.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeHeading}
          onValueChange={(value) => {
            if (value === 'p') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: Number(value) as 1 | 2 | 3 }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Style" />
          </SelectTrigger>
          <SelectContent>
            {HEADING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <MarkButton editor={editor} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </MarkButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <MarkButton editor={editor} label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </MarkButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <MarkButton editor={editor} label="Undo" active={false} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Redo" active={false} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </MarkButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS. (If `immediatelyRender` is not in this Tiptap version's `useEditor` options type, delete that line — it's an SSR guard that Next 15 client components don't strictly need.)

- [ ] **Step 4: Commit**

```bash
git add src/components/testimony/testimony-editor.tsx package.json pnpm-lock.yaml
git commit -m "feat: add tiptap testimony editor with formatting toolbar"
```

---

### Task 8: Supporting components + the testimony page (Write step wired end-to-end)

**Files:**
- Create: `src/components/testimony/testimony-stepper.tsx`
- Create: `src/components/testimony/testimony-reference-panel.tsx`
- Create: `src/components/testimony/testimony-header-form.tsx`
- Create: `src/app/bills/[id]/testimony/page.tsx`

**Interfaces:**
- Consumes: `TestimonyEditor` (Task 7), `data.testimony.getDraft/saveDraft` (Task 4), `getBillDetails` from `@/db/queries/bills-read` (existing — the dialog calls it the same way), `useAuth`, `useIsMobile`, `toast`, shadcn `Sheet`/`Card`/`Input`/`Label`/`RadioGroup`/`Button`/`ScrollArea`/`Badge`.
- Produces:
  - `<TestimonyStepper step={1|2|3} onStepChange={(s) => void} />`
  - `<TestimonyReferencePanel bill={BillDetails} />`
  - `<TestimonyHeaderForm value={{authorName, organization, position}} onChange={(v) => void} />`
  - Page route `/bills/[id]/testimony` with working step 1 (steps 2–3 render placeholders replaced in Task 9). Page-level state produced for Task 9: `bill: BillDetails`, `form: {authorName, organization, position}`, `contentJson: unknown`.

- [ ] **Step 1: Write the stepper**

`src/components/testimony/testimony-stepper.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const STEPS = [
  { number: 1, title: 'Write' },
  { number: 2, title: 'Export' },
  { number: 3, title: 'Submit' },
] as const;

export type TestimonyStep = 1 | 2 | 3;

interface TestimonyStepperProps {
  step: TestimonyStep;
  onStepChange: (step: TestimonyStep) => void;
}

export function TestimonyStepper({ step, onStepChange }: TestimonyStepperProps) {
  return (
    <nav aria-label="Testimony progress" className="flex items-center gap-2">
      {STEPS.map((item, index) => {
        const state = item.number < step ? 'done' : item.number === step ? 'current' : 'todo';
        return (
          <div key={item.number} className="flex items-center gap-2">
            {index > 0 && <div className="h-px w-6 sm:w-10 bg-border" />}
            <button
              type="button"
              onClick={() => onStepChange(item.number)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                state === 'current' && 'bg-primary text-primary-foreground',
                state === 'done' && 'text-primary hover:bg-primary/10',
                state === 'todo' && 'text-muted-foreground hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                  state === 'current' && 'border-primary-foreground',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'todo' && 'border-muted-foreground/40',
                )}
              >
                {state === 'done' ? <Check className="h-2.5 w-2.5" /> : item.number}
              </span>
              <span className="hidden sm:inline">{item.title}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Write the reference panel**

`src/components/testimony/testimony-reference-panel.tsx` (content mirrors the dialog's details/updates sections, read-only):

```tsx
'use client';

import type { BillDetails } from '@/types/legislation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestimonyReferencePanelProps {
  bill: BillDetails;
}

export function TestimonyReferencePanel({ bill }: TestimonyReferencePanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Bill</h3>
          <p className="text-sm font-semibold">{bill.bill_number}</p>
          <p className="text-sm text-muted-foreground">{bill.bill_title}</p>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</h3>
          <p className="text-sm leading-relaxed">{bill.description}</p>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Introducers</h3>
          <p className="text-sm">{bill.introducer || 'N/A'}</p>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Committees</h3>
          <p className="text-sm">{bill.committee_assignment || 'Not Assigned'}</p>
        </div>

        {bill.bill_url && (
          <a
            href={bill.bill_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Hawaii State Legislature
          </a>
        )}

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Status Updates
            {bill.updates && <span className="ml-1.5 text-muted-foreground/60">({bill.updates.length})</span>}
          </h3>
          {bill.updates && bill.updates.length > 0 ? (
            <div className="space-y-2">
              {bill.updates.map((update, index) => (
                <div
                  key={`${bill.id}-ref-update-${index}-${update.id || index}`}
                  className={cn(
                    'rounded-lg border p-2.5 text-sm',
                    index === 0 ? 'border-primary/20 bg-card shadow-sm' : 'border-border/50 bg-card/50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <Badge variant={index === 0 ? 'default' : 'outline'} className="h-4 px-1.5 text-[10px]">
                      {update.chamber}
                    </Badge>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {new Date(update.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{update.statustext}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              <FileText className="mx-auto mb-1 h-6 w-6 opacity-30" />
              <p className="text-xs">No status updates</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: Write the header form**

`src/components/testimony/testimony-header-form.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { TestimonyPosition } from '@/types/testimony';

export interface TestimonyHeaderValue {
  authorName: string;
  organization: string;
  position: TestimonyPosition;
}

interface TestimonyHeaderFormProps {
  value: TestimonyHeaderValue;
  onChange: (value: TestimonyHeaderValue) => void;
}

const POSITION_LABELS: Array<{ value: TestimonyPosition; label: string }> = [
  { value: 'support', label: 'Support' },
  { value: 'oppose', label: 'Oppose' },
  { value: 'comments', label: 'Comments only' },
];

export function TestimonyHeaderForm({ value, onChange }: TestimonyHeaderFormProps) {
  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="testimony-author">Your name</Label>
        <Input
          id="testimony-author"
          value={value.authorName}
          placeholder="Jane Doe"
          onChange={(e) => onChange({ ...value, authorName: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="testimony-org">Organization (optional)</Label>
        <Input
          id="testimony-org"
          value={value.organization}
          placeholder="Representing myself"
          onChange={(e) => onChange({ ...value, organization: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Position</Label>
        <RadioGroup
          value={value.position}
          onValueChange={(position) => onChange({ ...value, position: position as TestimonyPosition })}
          className="flex flex-wrap gap-4"
        >
          {POSITION_LABELS.map((option) => (
            <div key={option.value} className="flex items-center gap-1.5">
              <RadioGroupItem value={option.value} id={`position-${option.value}`} />
              <Label htmlFor={`position-${option.value}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

`src/app/bills/[id]/testimony/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BillDetails } from '@/types/legislation';
import type { TestimonyPosition } from '@/types/testimony';
import { getBillDetails } from '@/db/queries/bills-read';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { TestimonyStepper, type TestimonyStep } from '@/components/testimony/testimony-stepper';
import { TestimonyReferencePanel } from '@/components/testimony/testimony-reference-panel';
import { TestimonyHeaderForm, type TestimonyHeaderValue } from '@/components/testimony/testimony-header-form';
import { TestimonyEditor } from '@/components/testimony/testimony-editor';
import { ArrowLeft, ArrowRight, Info, Loader2, Lock } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export default function TestimonyPage() {
  const { id: billId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, activeTenant, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();

  const [bill, setBill] = useState<BillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<TestimonyStep>(1);
  const [form, setForm] = useState<TestimonyHeaderValue>({
    authorName: '',
    organization: '',
    position: 'comments' as TestimonyPosition,
  });
  const [contentJson, setContentJson] = useState<unknown>(EMPTY_DOC);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const hydrated = useRef(false); // true once bill + draft are loaded (enables autosave)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load bill + draft together.
  useEffect(() => {
    if (!billId || authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const [details, draft] = await Promise.all([
          getBillDetails(billId),
          data.testimony.getDraft(billId),
        ]);
        if (cancelled) return;
        details.updates = [...(details.updates ?? [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setBill(details);
        if (draft) {
          setForm({
            authorName: draft.authorName,
            organization: draft.organization,
            position: draft.position,
          });
          const hasContent =
            draft.contentJson && typeof draft.contentJson === 'object' &&
            Array.isArray((draft.contentJson as { content?: unknown[] }).content);
          setContentJson(hasContent ? draft.contentJson : EMPTY_DOC);
        } else {
          setForm((prev) => ({ ...prev, authorName: user.username || '' }));
        }
        hydrated.current = true;
      } catch {
        if (!cancelled) {
          toast({ title: 'Error', description: 'Failed to load this bill.', variant: 'destructive' });
          router.replace('/');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billId, authLoading, user, router]);

  // Debounced autosave (1.5s after the last change).
  const scheduleSave = useCallback(
    (nextForm: TestimonyHeaderValue, nextContent: unknown) => {
      if (!hydrated.current || !billId) return;
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await data.testimony.saveDraft({
            billId,
            tenantId: activeTenant?.tenantId ?? null,
            authorName: nextForm.authorName,
            organization: nextForm.organization,
            position: nextForm.position,
            contentJson: nextContent,
          });
          setSaveState('saved');
        } catch {
          setSaveState('error');
          toast({ title: 'Save failed', description: 'Your draft could not be saved. Retrying on next edit.', variant: 'destructive' });
        }
      }, 1500);
    },
    [billId, activeTenant?.tenantId],
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleFormChange = (next: TestimonyHeaderValue) => {
    setForm(next);
    scheduleSave(next, contentJson);
  };

  const handleContentChange = (json: unknown) => {
    setContentJson(json);
    scheduleSave(form, json);
  };

  if (authLoading || (user && loading)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading testimony writer...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center">
          <Lock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h1 className="mb-1 text-lg font-semibold">Login to write testimony</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Testimony drafts are saved to your account so you can come back to them.
          </p>
          <Button asChild>
            <Link href="/">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!bill) return null;

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : '';

  const referencePanel = <TestimonyReferencePanel bill={bill} />;

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Testimony — {bill.bill_number}</h1>
            <p className="truncate text-xs text-muted-foreground">{bill.bill_title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
            {saveLabel}
          </span>
          <TestimonyStepper step={step} onStepChange={setStep} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Reference panel — sidebar on desktop, sheet on mobile */}
        {!isMobile && (
          <aside className="w-[340px] shrink-0 border-r bg-muted/20">{referencePanel}</aside>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Info className="mr-1.5 h-3.5 w-3.5" />
                    Bill info
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[85vw] p-0 sm:w-[380px]">
                  <SheetHeader className="border-b px-4 py-3">
                    <SheetTitle className="text-sm">Bill reference</SheetTitle>
                  </SheetHeader>
                  <div className="h-[calc(100dvh-57px)]">{referencePanel}</div>
                </SheetContent>
              </Sheet>
            )}

            {step === 1 && (
              <>
                <TestimonyHeaderForm value={form} onChange={handleFormChange} />
                <TestimonyEditor initialContent={contentJson} onChange={handleContentChange} />
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)}>
                    Next: Export
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <TestimonyExportStep
                bill={bill}
                form={form}
                contentJson={contentJson}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}

            {step === 3 && <TestimonySubmitStep bill={bill} onBack={() => setStep(2)} />}
          </div>
        </main>
      </div>
    </div>
  );
}

// Placeholder step bodies — replaced with real components in the next task.
function TestimonyExportStep(props: {
  bill: BillDetails;
  form: TestimonyHeaderValue;
  contentJson: unknown;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Export step coming next.</p>
      <div className="flex justify-between">
        <Button variant="outline" onClick={props.onBack}>Back</Button>
        <Button onClick={props.onNext}>Next: Submit</Button>
      </div>
    </div>
  );
}

function TestimonySubmitStep(props: { bill: BillDetails; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Submission guide coming next.</p>
      <Button variant="outline" onClick={props.onBack}>Back</Button>
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

Run: `pnpm run typecheck` — expected PASS.
Then `pnpm run dev` and open `http://localhost:9002/bills/<some-bill-uuid>/testimony` while logged in (grab a bill id from the kanban board's dialog URL fetches or the DB). Expected: reference panel shows description/introducers/updates; typing in the editor and header fields shows "Saving… → Saved"; reloading the page restores the draft. Stop the dev server after checking. (If no local DB/session is available, note it and rely on typecheck + build.)

- [ ] **Step 6: Commit**

```bash
git add src/components/testimony/testimony-stepper.tsx src/components/testimony/testimony-reference-panel.tsx src/components/testimony/testimony-header-form.tsx "src/app/bills/[id]/testimony/page.tsx"
git commit -m "feat: add testimony writer page with reference panel and autosaving draft"
```

---

### Task 9: Export step — preview + PDF/DOCX downloads

**Files:**
- Create: `src/components/testimony/testimony-preview.tsx`
- Create: `src/components/testimony/testimony-export-step.tsx`
- Modify: `src/app/bills/[id]/testimony/page.tsx` (replace the placeholder `TestimonyExportStep`)

**Interfaces:**
- Consumes: `tiptapToBlocks`, `composeHeaderLines`, `TestimonyMeta` (Task 5); `generateTestimonyDocx`/`generateTestimonyPdf`/`downloadBlob` (Task 6, dynamic imports); `generateHTML` from `@tiptap/core`.
- Produces: `<TestimonyExportStep bill={BillDetails} form={TestimonyHeaderValue} contentJson={unknown} onBack={() => void} onNext={() => void} />`.

- [ ] **Step 1: Write the preview component**

`src/components/testimony/testimony-preview.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import type { TestimonyMeta } from '@/lib/testimony-export/blocks';
import { composeHeaderLines } from '@/lib/testimony-export/blocks';
import { cn } from '@/lib/utils';

interface TestimonyPreviewProps {
  meta: TestimonyMeta;
  contentJson: unknown;
}

export function TestimonyPreview({ meta, contentJson }: TestimonyPreviewProps) {
  const bodyHtml = useMemo(() => {
    try {
      return generateHTML(contentJson as Record<string, unknown>, [
        StarterKit,
        Underline,
        TextStyle,
        FontFamily,
      ]);
    } catch {
      return '<p></p>';
    }
  }, [contentJson]);

  const headerLines = composeHeaderLines(meta);

  return (
    <div className="rounded-lg border bg-white p-8 shadow-sm">
      <div className="mb-6 space-y-0.5 text-center">
        {headerLines.map((line, index) => (
          <p key={index} className={cn('text-sm', index === 0 && 'font-semibold')}>
            {line}
          </p>
        ))}
      </div>
      <div
        className={cn(
          'text-sm leading-relaxed',
          '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:my-3',
          '[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:my-3',
          '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:my-2',
          '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
        )}
        // Content is the user's own Tiptap doc; generateHTML escapes text nodes.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the export step**

`src/components/testimony/testimony-export-step.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import type { TestimonyMeta } from '@/lib/testimony-export/blocks';
import { tiptapToBlocks } from '@/lib/testimony-export/blocks';
import { downloadBlob } from '@/lib/testimony-export/download';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { TestimonyPreview } from './testimony-preview';
import type { TestimonyHeaderValue } from './testimony-header-form';
import { ArrowLeft, ArrowRight, FileDown, Loader2 } from 'lucide-react';

interface TestimonyExportStepProps {
  bill: BillDetails;
  form: TestimonyHeaderValue;
  contentJson: unknown;
  onBack: () => void;
  onNext: () => void;
}

export function TestimonyExportStep({ bill, form, contentJson, onBack, onNext }: TestimonyExportStepProps) {
  const [generating, setGenerating] = useState<'pdf' | 'docx' | null>(null);

  const meta: TestimonyMeta = {
    billNumber: bill.bill_number,
    billTitle: bill.bill_title,
    committee: bill.committee_assignment || null,
    position: form.position,
    authorName: form.authorName || 'Anonymous',
    organization: form.organization,
    dateStr: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    setGenerating(format);
    try {
      const blocks = tiptapToBlocks(contentJson);
      const filename = `${bill.bill_number.replace(/\s+/g, '')}-testimony.${format}`;
      if (format === 'pdf') {
        const { generateTestimonyPdf } = await import('@/lib/testimony-export/to-pdf');
        downloadBlob(await generateTestimonyPdf(meta, blocks), filename);
      } else {
        const { generateTestimonyDocx } = await import('@/lib/testimony-export/to-docx');
        downloadBlob(await generateTestimonyDocx(meta, blocks), filename);
      }
    } catch (error) {
      console.error('Testimony export failed:', error);
      toast({ title: 'Export failed', description: `Could not generate the ${format.toUpperCase()} file.`, variant: 'destructive' });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Review your testimony, then download it. The PDF uses a standard font; the DOCX keeps your chosen fonts.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={generating !== null} onClick={() => handleDownload('pdf')}>
            {generating === 'pdf' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            Download PDF
          </Button>
          <Button variant="outline" size="sm" disabled={generating !== null} onClick={() => handleDownload('docx')}>
            {generating === 'docx' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            Download DOCX
          </Button>
        </div>
      </div>

      <TestimonyPreview meta={meta} contentJson={contentJson} />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back: Write
        </Button>
        <Button onClick={onNext}>
          Next: Submit
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page**

In `src/app/bills/[id]/testimony/page.tsx`: delete the placeholder `TestimonyExportStep` function and add the import:

```ts
import { TestimonyExportStep } from '@/components/testimony/testimony-export-step';
```

(The JSX call site already matches the component's props.)

- [ ] **Step 4: Verify**

Run: `pnpm run typecheck` — PASS.
In the dev server, on step 2: preview shows the centered header block + formatted body; both download buttons produce files that open (PDF in the browser viewer, DOCX in Word/Pages/LibreOffice) with the header and formatting intact.

- [ ] **Step 5: Commit**

```bash
git add src/components/testimony/testimony-preview.tsx src/components/testimony/testimony-export-step.tsx "src/app/bills/[id]/testimony/page.tsx"
git commit -m "feat: add testimony preview and pdf/docx export step"
```

---

### Task 10: Submit-guide step

**Files:**
- Create: `src/components/testimony/testimony-submit-guide.tsx`
- Modify: `src/app/bills/[id]/testimony/page.tsx` (replace the placeholder `TestimonySubmitStep`)

**Interfaces:**
- Consumes: `BillDetails` (for `bill_url`, `bill_number`).
- Produces: `<TestimonySubmitGuide bill={BillDetails} onBack={() => void} />`.

- [ ] **Step 1: Write the guide component**

`src/components/testimony/testimony-submit-guide.tsx`:

```tsx
'use client';

import type { BillDetails } from '@/types/legislation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';

interface TestimonySubmitGuideProps {
  bill: BillDetails;
  onBack: () => void;
}

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Login to the Hawaii State Legislature website',
    body: 'Go to capitol.hawaii.gov and click "Sign In" (top right). If you don\'t have an account yet, register with your email — it\'s free and takes a minute.',
  },
  {
    title: 'Find this measure',
    body: 'Use the link below to open this bill\'s measure page, or search for the bill number on the site.',
  },
  {
    title: 'Wait for a hearing notice',
    body: 'Testimony can only be submitted once a committee schedules a hearing. When one is scheduled, a "Submit Testimony" option appears for the measure. Check the Status Updates panel here for hearing notices.',
  },
  {
    title: 'Submit your testimony',
    body: 'On the Submit Testimony form, select the measure and hearing, indicate your position (support/oppose/comments) and whether you will testify in person, remotely, or written-only, then upload the PDF or DOCX file you downloaded — or paste your text.',
  },
  {
    title: 'Beat the deadline',
    body: 'Submit at least 24 hours before the hearing start time. Late testimony is still accepted but may not be considered by the committee before the hearing.',
  },
];

export function TestimonySubmitGuide({ bill, onBack }: TestimonySubmitGuideProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">
          How to submit your testimony for {bill.bill_number}
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li key={index} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {index + 1}. {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap gap-2">
          {bill.bill_url && (
            <Button asChild variant="outline" size="sm">
              <a href={bill.bill_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open {bill.bill_number} on capitol.hawaii.gov
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href="https://www.capitol.hawaii.gov/submittestimony.aspx" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Go to Submit Testimony
            </a>
          </Button>
        </div>
      </div>

      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back: Export
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into the page**

In `src/app/bills/[id]/testimony/page.tsx`: delete the placeholder `TestimonySubmitStep` function, add the import, and update the step-3 call site:

```ts
import { TestimonySubmitGuide } from '@/components/testimony/testimony-submit-guide';
```

```tsx
{step === 3 && <TestimonySubmitGuide bill={bill} onBack={() => setStep(2)} />}
```

- [ ] **Step 3: Verify**

Run: `pnpm run typecheck` — PASS. In the dev server, step 3 shows the 5-step guide with both external links working.

- [ ] **Step 4: Commit**

```bash
git add src/components/testimony/testimony-submit-guide.tsx "src/app/bills/[id]/testimony/page.tsx"
git commit -m "feat: add capitol submission guide step to testimony writer"
```

---

### Task 11: "Write Testimony" button in the bill-details dialog

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx`

**Interfaces:**
- Consumes: route `/bills/[id]/testimony` (Task 8); existing dialog `onClose` prop.

- [ ] **Step 1: Add router + icon imports**

In `src/components/kanban/bill-details-dialog.tsx`:
- Add `import { useRouter } from 'next/navigation';` after the existing imports.
- Add `PenLine` to the existing lucide-react import: `import { FileText, Lock, Loader2, ExternalLink, Clock, Users, PenLine } from 'lucide-react';`
- Inside `BillDetailsDialog`, after `const isMobile = useIsMobile();` add: `const router = useRouter();`

- [ ] **Step 2: Add the button next to the legislature link**

Replace the existing `bill_url` anchor block (the `{billDetails?.bill_url && (<a ...>View on Hawaii State Legislature</a>)}` section, around line 344) with:

```tsx
                    <div className="flex flex-wrap items-center gap-3">
                      {billDetails?.bill_url && (
                        <a
                          href={billDetails.bill_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View on Hawaii State Legislature
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          onClose();
                          router.push(`/bills/${bill.id}/testimony`);
                        }}
                      >
                        <PenLine className="mr-1.5 h-3.5 w-3.5" />
                        Write Testimony
                      </Button>
                    </div>
```

- [ ] **Step 3: Verify**

Run: `pnpm run typecheck` — PASS. In the dev server: open a bill's dialog, click "Write Testimony" → dialog closes and the testimony page opens for that bill.

- [ ] **Step 4: Commit**

```bash
git add src/components/kanban/bill-details-dialog.tsx
git commit -m "feat: add write-testimony button to bill details dialog"
```

---

### Task 12: Full verification

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm run test`
Expected: all tests pass, including `testimony-blocks.test.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `pnpm run build`
Expected: builds cleanly — this is what catches `'use server'` export violations in `actions/testimony.ts` and `db/queries/testimony.ts`.

- [ ] **Step 4: Fix anything that surfaced, re-run all three, then commit any fixes**

```bash
git add -A
git commit -m "fix: address testimony writer verification findings"
```

(Skip the commit if nothing changed.)
