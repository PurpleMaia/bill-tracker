# Contact Legislator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Contact Legislator" flow that shows a bill's committee chairs/vice-chairs with contact info and an auto-generated advocacy script, reached from a button next to "Write Testimony".

**Architecture:** Three layers matching the codebase. (1) A DB-query seam `getCommitteeChairs(codes)` backed by mock data today, swappable to real Kysely joins later. (2) A pure, testable script builder in `src/lib/legislators`. (3) A dedicated full page `/bills/[id]/contact` plus a button in the bill details dialog. Client reaches the seam through the data-client (`data.legislators.getCommitteeChairs`) per the `defineClient({ action, fetch })` contract.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Kysely (mock this pass), shadcn/ui + Tailwind, Vitest.

## Global Constraints

- **`src/lib/` is DB-free** — pure utilities only. The script builder must not import from `@/db`.
- **All queries live in `src/db/queries/*`** — the mock query seam goes there, not in a component or route.
- **Client components call `data.*`, never raw `fetch`** — the page uses `data.legislators.getCommitteeChairs`.
- **A `'use server'` file may only export async functions** — no type exports, no re-exports. Shared types live in a plain module.
- **Auth via guards** (`@/lib/auth/auth-guards`) — use `optionalSession` (committee chairs are public record; public bills are already public).
- **No barrel `index.ts` in `src/lib`** — import by deep path (`@/lib/legislators/contact-script`).
- **Button label is exactly "Contact Legislator"** (singular).
- **User must pick a position** (support/oppose) — no default; script/mailto gated until picked.
- **No left-edge accent strips** — role shown as an icon medallion/chip.
- **No horizontal scroll at 375px.** Mobile button lives in the sticky bottom action bar, not the header.
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`. **No `Co-Authored-By` lines.**
- Run `npm test`, `npm run typecheck`, and `npm run build` before finishing (build catches `'use server'` export violations).

## File Structure

- `src/db/queries/committee-chairs.ts` — **Create.** Types (`CommitteeRole`, `CommitteeChair`) + `getCommitteeChairs(codes)` seam. Plain module (NOT `'use server'`) so it can export types. Body reads `MOCK_CHAIRS`.
- `src/db/queries/committee-chairs.mock.ts` — **Create.** `MOCK_CHAIRS` map keyed by committee code. Imported only by the seam. Deleted when real tables land.
- `src/lib/legislators/contact-script.ts` — **Create.** Pure `buildContactScript(...)` + `ContactPosition` type.
- `src/lib/__tests__/contact-script.test.ts` — **Create.** Unit tests for the builder.
- `src/app/actions/legislators.ts` — **Create.** `'use server'` action arm.
- `src/app/api/bills/[id]/chairs/route.ts` — **Create.** GET fetch arm.
- `src/lib/data-client/legislators.client.ts` — **Create.** fetch wrapper + `defineClient` registration.
- `src/lib/data-client/index.ts` — **Modify.** Register `data.legislators`.
- `src/app/bills/[id]/contact/page.tsx` — **Create.** The contact page.
- `src/app/bills/[id]/contact/loading.tsx` — **Create.** Loading skeleton.
- `src/components/kanban/bill-details-dialog.tsx` — **Modify.** Add the button (desktop header + mobile action bar); remove the `CommitteeContacts` render.
- `src/components/kanban/committee-contacts.tsx` — **Delete.**

---

### Task 1: Committee-chair query seam + mock data

**Files:**
- Create: `src/db/queries/committee-chairs.ts`
- Create: `src/db/queries/committee-chairs.mock.ts`

**Interfaces:**
- Consumes: `committeeFullName` from `@/lib/testimony/committees`.
- Produces:
  - `type CommitteeRole = 'chair' | 'vice-chair'`
  - `interface CommitteeChair { committeeCode: string; committeeName: string; role: CommitteeRole; legislatorName: string; chamber: 'House' | 'Senate'; email: string | null; phone: string | null; }`
  - `async function getCommitteeChairs(codes: string[]): Promise<CommitteeChair[]>`

- [ ] **Step 1: Create the mock data file**

`src/db/queries/committee-chairs.mock.ts`. Covers exactly the codes on the Jaden Kapali org bills: AGR, PBS, CAA, CPC, FIN, WAL, EEP, HLT, EDN (House); AEN, WAM, CPN, EDU, HHS, TCA, JDC, ECD, JHA (Senate). Each entry has a chair and a vice-chair with a plausible name, capitol email, and phone. Chamber is fixed per code.

```ts
// MOCK committee chair/vice-chair data. Covers the committee codes present on the
// Jaden Kapali org's bills so every card lines up. Replaced by real
// committees → committee_chairs → legislators joins when those tables land.
export interface MockChairEntry {
  chamber: 'House' | 'Senate';
  chair: { name: string; email: string; phone: string };
  viceChair: { name: string; email: string; phone: string };
}

export const MOCK_CHAIRS: Record<string, MockChairEntry> = {
  // ---- House ----
  AGR: {
    chamber: 'House',
    chair: { name: 'Rep. Kirstin Kahaloa', email: 'repkahaloa@capitol.hawaii.gov', phone: '808-586-8510' },
    viceChair: { name: 'Rep. Cory Chun', email: 'repchun@capitol.hawaii.gov', phone: '808-586-8520' },
  },
  PBS: {
    chamber: 'House',
    chair: { name: 'Rep. Della Au Belatti', email: 'repbelatti@capitol.hawaii.gov', phone: '808-586-9425' },
    viceChair: { name: 'Rep. Rachele Lamosao', email: 'replamosao@capitol.hawaii.gov', phone: '808-586-6440' },
  },
  CAA: {
    chamber: 'House',
    chair: { name: 'Rep. Adrian Tam', email: 'reptam@capitol.hawaii.gov', phone: '808-586-9425' },
    viceChair: { name: 'Rep. Jenna Takenouchi', email: 'reptakenouchi@capitol.hawaii.gov', phone: '808-586-6200' },
  },
  CPC: {
    chamber: 'House',
    chair: { name: 'Rep. Mark Nakashima', email: 'repnakashima@capitol.hawaii.gov', phone: '808-586-6680' },
    viceChair: { name: 'Rep. Jackson Sayama', email: 'repsayama@capitol.hawaii.gov', phone: '808-586-6900' },
  },
  FIN: {
    chamber: 'House',
    chair: { name: 'Rep. Kyle Yamashita', email: 'repyamashita@capitol.hawaii.gov', phone: '808-586-6200' },
    viceChair: { name: 'Rep. Jenna Takenouchi', email: 'reptakenouchi2@capitol.hawaii.gov', phone: '808-586-6210' },
  },
  WAL: {
    chamber: 'House',
    chair: { name: 'Rep. Elle Cochran', email: 'repcochran@capitol.hawaii.gov', phone: '808-586-6100' },
    viceChair: { name: 'Rep. Mahina Poepoe', email: 'reppoepoe@capitol.hawaii.gov', phone: '808-586-6790' },
  },
  EEP: {
    chamber: 'House',
    chair: { name: 'Rep. Nicole Lowen', email: 'replowen@capitol.hawaii.gov', phone: '808-586-8400' },
    viceChair: { name: 'Rep. Cory Chun', email: 'repchun2@capitol.hawaii.gov', phone: '808-586-8410' },
  },
  HLT: {
    chamber: 'House',
    chair: { name: 'Rep. Gregg Takayama', email: 'reptakayama@capitol.hawaii.gov', phone: '808-586-6340' },
    viceChair: { name: 'Rep. Jenna Takenouchi', email: 'reptakenouchi3@capitol.hawaii.gov', phone: '808-586-6350' },
  },
  EDN: {
    chamber: 'House',
    chair: { name: 'Rep. Justin Woodson', email: 'repwoodson@capitol.hawaii.gov', phone: '808-586-6210' },
    viceChair: { name: 'Rep. Trish La Chica', email: 'replachica@capitol.hawaii.gov', phone: '808-586-9470' },
  },
  // ---- Senate ----
  AEN: {
    chamber: 'Senate',
    chair: { name: 'Sen. Mike Gabbard', email: 'sengabbard@capitol.hawaii.gov', phone: '808-586-6830' },
    viceChair: { name: 'Sen. Herbert Richards', email: 'senrichards@capitol.hawaii.gov', phone: '808-586-7335' },
  },
  WAM: {
    chamber: 'Senate',
    chair: { name: 'Sen. Donovan Dela Cruz', email: 'sendelacruz@capitol.hawaii.gov', phone: '808-586-6090' },
    viceChair: { name: 'Sen. Sharon Moriwaki', email: 'senmoriwaki@capitol.hawaii.gov', phone: '808-586-6740' },
  },
  CPN: {
    chamber: 'Senate',
    chair: { name: 'Sen. Jarrett Keohokalole', email: 'senkeohokalole@capitol.hawaii.gov', phone: '808-586-6730' },
    viceChair: { name: 'Sen. Carol Fukunaga', email: 'senfukunaga@capitol.hawaii.gov', phone: '808-586-6890' },
  },
  EDU: {
    chamber: 'Senate',
    chair: { name: 'Sen. Michelle Kidani', email: 'senkidani@capitol.hawaii.gov', phone: '808-586-7100' },
    viceChair: { name: 'Sen. Samantha DeCorte', email: 'sendecorte@capitol.hawaii.gov', phone: '808-586-7793' },
  },
  HHS: {
    chamber: 'Senate',
    chair: { name: 'Sen. Joy San Buenaventura', email: 'sensanbuenaventura@capitol.hawaii.gov', phone: '808-586-9385' },
    viceChair: { name: 'Sen. Henry Aquino', email: 'senaquino@capitol.hawaii.gov', phone: '808-586-6180' },
  },
  TCA: {
    chamber: 'Senate',
    chair: { name: 'Sen. Chris Lee', email: 'senlee@capitol.hawaii.gov', phone: '808-586-6270' },
    viceChair: { name: 'Sen. Lynn DeCoite', email: 'sendecoite@capitol.hawaii.gov', phone: '808-586-7345' },
  },
  JDC: {
    chamber: 'Senate',
    chair: { name: 'Sen. Karl Rhoads', email: 'senrhoads@capitol.hawaii.gov', phone: '808-586-6130' },
    viceChair: { name: 'Sen. Mike Gabbard', email: 'sengabbard2@capitol.hawaii.gov', phone: '808-586-6140' },
  },
  ECD: {
    chamber: 'Senate',
    chair: { name: 'Sen. Lynn DeCoite', email: 'sendecoite2@capitol.hawaii.gov', phone: '808-586-7345' },
    viceChair: { name: 'Sen. Brandon Elefante', email: 'senelefante@capitol.hawaii.gov', phone: '808-586-6160' },
  },
  JHA: {
    chamber: 'Senate',
    chair: { name: 'Sen. Karl Rhoads', email: 'senrhoads2@capitol.hawaii.gov', phone: '808-586-6130' },
    viceChair: { name: 'Sen. Brandon Elefante', email: 'senelefante2@capitol.hawaii.gov', phone: '808-586-6160' },
  },
};
```

- [ ] **Step 2: Create the query seam**

`src/db/queries/committee-chairs.ts`. Plain module (NO `'use server'`) so it can export types. Normalizes codes (upper-case, de-dupe), looks each up in `MOCK_CHAIRS`, emits chair then vice-chair, skips unknown codes.

```ts
import { committeeFullName } from '@/lib/testimony/committees';
import { MOCK_CHAIRS } from './committee-chairs.mock';

export type CommitteeRole = 'chair' | 'vice-chair';

export interface CommitteeChair {
  committeeCode: string;
  committeeName: string;
  role: CommitteeRole;
  legislatorName: string;
  chamber: 'House' | 'Senate';
  email: string | null;
  phone: string | null;
}

/**
 * Chairs + vice-chairs for the given committee codes.
 * MOCK-backed today; swap this body for committees → committee_chairs →
 * legislators joins when those tables exist. Callers do not change.
 */
export async function getCommitteeChairs(codes: string[]): Promise<CommitteeChair[]> {
  const seen = new Set<string>();
  const out: CommitteeChair[] = [];

  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);

    const entry = MOCK_CHAIRS[code];
    if (!entry) continue;

    const committeeName = committeeFullName(code);
    out.push({
      committeeCode: code, committeeName, role: 'chair',
      legislatorName: entry.chair.name, chamber: entry.chamber,
      email: entry.chair.email, phone: entry.chair.phone,
    });
    out.push({
      committeeCode: code, committeeName, role: 'vice-chair',
      legislatorName: entry.viceChair.name, chamber: entry.chamber,
      email: entry.viceChair.email, phone: entry.viceChair.phone,
    });
  }

  return out;
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/committee-chairs.ts src/db/queries/committee-chairs.mock.ts
git commit -m "feat: committee-chair query seam with mock data"
```

---

### Task 2: Pure contact-script builder (TDD)

**Files:**
- Create: `src/lib/legislators/contact-script.ts`
- Test: `src/lib/__tests__/contact-script.test.ts`

**Interfaces:**
- Consumes: `CommitteeChair` type from `@/db/queries/committee-chairs` (type-only import — allowed; no runtime DB pull).
- Produces:
  - `type ContactPosition = 'support' | 'oppose'`
  - `function buildContactScript(input: { billNumber: string; billTitle: string | null; chair: CommitteeChair; position: ContactPosition; userName?: string }): { subject: string; body: string }`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/contact-script.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildContactScript } from '@/lib/legislators/contact-script';
import type { CommitteeChair } from '@/db/queries/committee-chairs';

const CHAIR: CommitteeChair = {
  committeeCode: 'AGR',
  committeeName: 'Agriculture & Food Systems',
  role: 'chair',
  legislatorName: 'Rep. Kirstin Kahaloa',
  chamber: 'House',
  email: 'repkahaloa@capitol.hawaii.gov',
  phone: '808-586-8510',
};

describe('buildContactScript', () => {
  it('addresses the chair by name and states support', () => {
    const { subject, body } = buildContactScript({
      billNumber: 'HB9950',
      billTitle: 'Relating to Local Agriculture',
      chair: CHAIR,
      position: 'support',
      userName: 'Jaden Kapali',
    });
    expect(subject).toContain('HB9950');
    expect(subject).toContain('Support');
    expect(body).toContain('Rep. Kirstin Kahaloa');
    expect(body).toContain('HB9950');
    expect(body).toContain('Relating to Local Agriculture');
    expect(body).toMatch(/support/i);
    expect(body).toContain('Jaden Kapali');
  });

  it('states opposition when position is oppose', () => {
    const { subject, body } = buildContactScript({
      billNumber: 'HB9950', billTitle: 'Relating to Local Agriculture',
      chair: CHAIR, position: 'oppose',
    });
    expect(subject).toContain('Oppose');
    expect(body).toMatch(/oppose/i);
  });

  it('handles a missing bill title without printing null', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: null, chair: CHAIR, position: 'support',
    });
    expect(body).not.toContain('null');
    expect(body).toContain('HB9950');
  });

  it('uses a generic sign-off when no userName is given', () => {
    const { body } = buildContactScript({
      billNumber: 'HB9950', billTitle: 'X', chair: CHAIR, position: 'support',
    });
    expect(body).toMatch(/Sincerely,/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- contact-script`
Expected: FAIL — cannot find module `@/lib/legislators/contact-script`.

- [ ] **Step 3: Write the minimal implementation**

`src/lib/legislators/contact-script.ts`:

```ts
import type { CommitteeChair } from '@/db/queries/committee-chairs';

export type ContactPosition = 'support' | 'oppose';

/**
 * Builds a short, polite advocacy message to a committee chair/vice-chair.
 * Pure — no DB, no LLM, no network. `subject` feeds a mailto link.
 */
export function buildContactScript(input: {
  billNumber: string;
  billTitle: string | null;
  chair: CommitteeChair;
  position: ContactPosition;
  userName?: string;
}): { subject: string; body: string } {
  const { billNumber, billTitle, chair, position, userName } = input;

  const stance = position === 'support' ? 'Support' : 'Oppose';
  const verb = position === 'support' ? 'support' : 'oppose';
  const measure = billTitle ? `${billNumber}, ${billTitle},` : `${billNumber}`;

  const subject = `${stance} for ${billNumber}`;

  const body = [
    `Dear ${chair.legislatorName},`,
    ``,
    `My name is ${userName ?? '[Your name]'}, and I am writing to ask you to ${verb} ${measure} currently before the ${chair.committeeName} committee.`,
    ``,
    position === 'support'
      ? `This measure matters to our community, and I respectfully urge the committee to advance it.`
      : `I have serious concerns about this measure, and I respectfully urge the committee to hold it.`,
    ``,
    `Thank you for your time and your service.`,
    ``,
    `Sincerely,`,
    `${userName ?? '[Your name]'}`,
  ].join('\n');

  return { subject, body };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- contact-script`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/legislators/contact-script.ts src/lib/__tests__/contact-script.test.ts
git commit -m "feat: pure contact-script builder with tests"
```

---

### Task 3: Data-client wiring (action + route + client + registration)

**Files:**
- Create: `src/app/actions/legislators.ts`
- Create: `src/app/api/bills/[id]/chairs/route.ts`
- Create: `src/lib/data-client/legislators.client.ts`
- Modify: `src/lib/data-client/index.ts`

**Interfaces:**
- Consumes: `getCommitteeChairs`, `CommitteeChair` from `@/db/queries/committee-chairs`; `parseCommitteeCodes` from `@/lib/testimony/committees`; `optionalSession` from `@/lib/auth/auth-guards`; `defineClient` from `./define-client`.
- Produces: `data.legislators.getChairs(committeeAssignment: string | null): Promise<CommitteeChair[]>`.

Note: the operation takes the raw `committee_assignment` string (nullable) and parses codes server-side, so the client passes `bill.committee_assignment` straight through.

- [ ] **Step 1: Create the server-action arm**

`src/app/actions/legislators.ts` (only async exports — no type exports). The signature is `(billId, committeeAssignment)` so it matches the fetch arm (which needs the id for its RESTful path); the action ignores the id and parses codes from the assignment string.

```ts
'use server';

import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeChairs } from '@/db/queries/committee-chairs';
import { parseCommitteeCodes } from '@/lib/testimony/committees';
import type { CommitteeChair } from '@/db/queries/committee-chairs';

/** Server-action arm for data.legislators.getChairs. Chairs are public record. */
export async function getCommitteeChairsAction(
  _billId: string,
  committeeAssignment: string | null,
): Promise<CommitteeChair[]> {
  await optionalSession.fromAction();
  return getCommitteeChairs(parseCommitteeCodes(committeeAssignment));
}
```

- [ ] **Step 2: Create the API-route (fetch) arm**

`src/app/api/bills/[id]/chairs/route.ts`. The bill id is in the path (RESTful, mirrors the testimony route); codes are derived from a `committees` query param the client passes. GET only.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeChairs } from '@/db/queries/committee-chairs';
import { parseCommitteeCodes } from '@/lib/testimony/committees';

export async function GET(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  try {
    await optionalSession.fromRequest(request);
    const committees = request.nextUrl.searchParams.get('committees');
    const chairs = await getCommitteeChairs(parseCommitteeCodes(committees));
    return NextResponse.json(chairs, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in chairs GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the client wrapper + defineClient**

`src/lib/data-client/legislators.client.ts`. Both arms share the `(billId, committeeAssignment)` signature (defined in Step 1); the fetch arm uses `billId` in its RESTful path and passes the assignment as a query param.

```ts
import { defineClient } from './define-client';
import { getCommitteeChairsAction } from '@/app/actions/legislators';
import type { CommitteeChair } from '@/db/queries/committee-chairs';

async function getCommitteeChairsFetch(
  billId: string,
  committeeAssignment: string | null,
): Promise<CommitteeChair[]> {
  const qs = committeeAssignment ? `?committees=${encodeURIComponent(committeeAssignment)}` : '';
  const res = await fetch(`/api/bills/${billId}/chairs${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load committee chairs');
  }
  return res.json();
}

export const legislatorsClient = defineClient('legislators', {
  getChairs: { action: getCommitteeChairsAction, fetch: getCommitteeChairsFetch },
});
```

- [ ] **Step 4: Register the domain**

Modify `src/lib/data-client/index.ts`: add the import and the `legislators` entry.

```ts
import { legislatorsClient } from './legislators.client';
// ...
export const data = {
  bills: billsClient,
  proposals: proposalsClient,
  access: accessClient,
  preferences: preferencesClient,
  testimony: testimonyClient,
  boards: boardsClient,
  summaries: summariesClient,
  legislators: legislatorsClient,
};
```

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no errors. Build must pass — it catches any `'use server'` export violation in `actions/legislators.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/legislators.ts "src/app/api/bills/[id]/chairs/route.ts" src/lib/data-client/legislators.client.ts src/lib/data-client/index.ts
git commit -m "feat: wire committee-chairs through the data-client"
```

---

### Task 4: Contact page — chairs list + position selector + script

**Files:**
- Create: `src/app/bills/[id]/contact/page.tsx`
- Create: `src/app/bills/[id]/contact/loading.tsx`

**Interfaces:**
- Consumes: `getBillDetails` from `@/db/queries/bills-read` (called directly — valid server action, same as the testimony page); `data.legislators.getChairs`; `buildContactScript`, `ContactPosition` from `@/lib/legislators/contact-script`; `CommitteeChair` from `@/db/queries/committee-chairs`; `useIsMobile` from `@/hooks/use-mobile`; `useAuth`; `toast`.
- Produces: route `/bills/[id]/contact` (no exported symbols consumed elsewhere).

- [ ] **Step 1: Create the loading skeleton**

`src/app/bills/[id]/contact/loading.tsx` (mirror the testimony `loading.tsx` structure — centered spinner):

```tsx
import { Loader2 } from 'lucide-react';

export default function ContactLoading() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

`src/app/bills/[id]/contact/page.tsx`. Requirements baked in: (a) container matches testimony page (`flex h-dvh flex-col`, body `mx-auto max-w-3xl p-4 sm:p-6`); (b) position selector has NO default and gates the script/mailto; (c) role shown as an icon chip, no left strip; (d) chair cards single-column on mobile, `sm:grid-cols-2`; (e) copy button + mailto; (f) empty state when no committees.

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { BillDetails } from '@/types/legislation';
import { getBillDetails } from '@/db/queries/bills-read';
import { data } from '@/lib/data-client';
import type { CommitteeChair } from '@/db/queries/committee-chairs';
import { buildContactScript, type ContactPosition } from '@/lib/legislators/contact-script';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Gavel, Loader2, Mail, Phone, ShieldCheck, User } from 'lucide-react';

export default function ContactLegislatorPage() {
  const { id: billId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const backHref = searchParams.get('from') === 'testimonies' ? '/testimonies' : '/';

  const [bill, setBill] = useState<BillDetails | null>(null);
  const [chairs, setChairs] = useState<CommitteeChair[]>([]);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<ContactPosition | null>(null);

  useEffect(() => {
    if (!billId) return;
    let cancelled = false;
    (async () => {
      try {
        const details = await getBillDetails(billId);
        if (cancelled) return;
        setBill(details);
        const list = await data.legislators.getChairs(billId, details?.committee_assignment ?? null);
        if (!cancelled) setChairs(list);
      } catch {
        if (!cancelled) toast({ title: 'Error', description: 'Could not load contacts.', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [billId]);

  const userName = user?.username ?? undefined;

  const scriptFor = useCallback(
    (chair: CommitteeChair) =>
      position && bill
        ? buildContactScript({
            billNumber: bill.bill_number,
            billTitle: bill.bill_title ?? null,
            chair, position, userName,
          })
        : null,
    [position, bill, userName],
  );

  const genericScript = useMemo(() => {
    if (!position || !bill || chairs.length === 0) return null;
    return buildContactScript({
      billNumber: bill.bill_number, billTitle: bill.bill_title ?? null,
      chair: chairs[0], position, userName,
    });
  }, [position, bill, chairs, userName]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: 'Script copied to your clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the text manually.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Back header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Back</span>
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Contact Legislator{bill ? ` — ${bill.bill_number}` : ''}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
          {/* Position selector — REQUIRED, no default */}
          <div className="rounded-lg border bg-card p-4">
            <p className="mb-2 text-sm font-medium">Choose your position</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Position">
              {(['support', 'oppose'] as ContactPosition[]).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={position === p}
                  onClick={() => setPosition(p)}
                  className={[
                    'h-11 rounded-md border text-sm font-medium capitalize transition-colors',
                    position === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </div>
            {!position && (
              <p className="mt-2 text-xs text-muted-foreground">Pick support or oppose to generate a script.</p>
            )}
          </div>

          {/* Generic script */}
          {genericScript && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Your script</p>
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => copy(genericScript.body)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <pre className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{genericScript.body}</pre>
            </div>
          )}

          {/* Chairs */}
          {chairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No committees assigned yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {chairs.map((chair, i) => {
                const script = scriptFor(chair);
                const RoleIcon = chair.role === 'chair' ? Gavel : ShieldCheck;
                const mailto = chair.email && script
                  ? `mailto:${chair.email}?subject=${encodeURIComponent(script.subject)}&body=${encodeURIComponent(script.body)}`
                  : chair.email ? `mailto:${chair.email}` : null;
                return (
                  <div key={`${chair.committeeCode}-${chair.role}-${i}`} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <RoleIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{chair.legislatorName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {chair.role === 'chair' ? 'Chair' : 'Vice-Chair'} · {chair.committeeName}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      {chair.email && (
                        <p className="flex items-center gap-1.5 break-all">
                          <Mail className="h-3.5 w-3.5 shrink-0" /> {chair.email}
                        </p>
                      )}
                      {chair.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" /> {chair.phone}
                        </p>
                      )}
                    </div>
                    {mailto && (
                      <Button asChild size="sm" variant="outline" className="mt-2 w-full" disabled={!position}>
                        <a href={mailto}>
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email {chair.role === 'chair' ? 'Chair' : 'Vice-Chair'}
                        </a>
                      </Button>
                    )}
                    {!position && chair.email && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Pick a position to fill the email.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Note: the unused `User` import is intentional-free — remove any lucide import you did not use before committing (the build's lint step flags unused imports). Keep only: `ArrowLeft, Copy, Gavel, Loader2, Mail, Phone, ShieldCheck`.

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no errors. If lint flags an unused import, delete it and re-run.

- [ ] **Step 4: Manual smoke via the run skill (deferred)**

Leave the app-run verification to the reviewer / a later `/verify` pass — the page is exercised end-to-end in Task 6.

- [ ] **Step 5: Commit**

```bash
git add "src/app/bills/[id]/contact/page.tsx" "src/app/bills/[id]/contact/loading.tsx"
git commit -m "feat: contact legislator page with chairs, position, and script"
```

---

### Task 5: Bill-details button + remove the old committee-contacts stub

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx`
- Delete: `src/components/kanban/committee-contacts.tsx`

**Interfaces:**
- Consumes: existing `router`, `bill`, `onClose` in the dialog; `Users` icon from lucide.
- Produces: nothing new; wires the button to `/bills/${bill.id}/contact`.

- [ ] **Step 1: Remove the CommitteeContacts import and render**

In `src/components/kanban/bill-details-dialog.tsx`:
- Delete the import line `import { CommitteeContacts } from './committee-contacts';` (around line 39).
- Delete the `<CommitteeContacts bill={billForPanels} />` render (around line 517) and any now-empty wrapper/heading that only existed for it.

- [ ] **Step 2: Add the desktop button next to Write Testimony**

Locate the desktop Write Testimony block (the `hidden sm:flex` container around line 343). Immediately AFTER the closing of the Write Testimony `TooltipProvider`/button, still inside that `hidden sm:flex` container (so both buttons sit inline), add:

```tsx
<Button
  size="sm"
  variant="outline"
  onClick={() => {
    onClose();
    router.push(`/bills/${bill.id}/contact`);
  }}
>
  <Users className="mr-1.5 h-3.5 w-3.5" />
  Contact Legislator
</Button>
```

If the Write Testimony button is wrapped in a branch where `testimonyEligibility.allowed` is false (the disabled variant, around line 379), make sure the Contact Legislator button renders in BOTH branches — it is always enabled regardless of testimony eligibility. Simplest: lift the Contact Legislator button out to sit next to whichever Write Testimony variant renders, in a shared `hidden sm:flex shrink-0 items-center gap-2` wrapper.

- [ ] **Step 3: Add the mobile button to the sticky action bar**

Locate the mobile sticky action bar (around line 656, the `<div className="shrink-0 border-t bg-background px-4 ...">` containing the full-width Write Testimony button). Add, directly after the Write Testimony `<Button>` (and before the countdown/`reason` messages):

```tsx
<Button
  variant="outline"
  className="w-full h-11"
  onClick={() => {
    onClose();
    router.push(`/bills/${bill.id}/contact`);
  }}
>
  <Users className="mr-2 h-4 w-4" />
  Contact Legislator
</Button>
```

- [ ] **Step 4: Ensure `Users` is imported**

Confirm `Users` is in the lucide-react import at the top of the file; add it if missing.

- [ ] **Step 5: Delete the stub component**

```bash
git rm src/components/kanban/committee-contacts.tsx
```

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no errors (no dangling reference to `CommitteeContacts`).

- [ ] **Step 7: Commit**

```bash
git add src/components/kanban/bill-details-dialog.tsx
git commit -m "feat: add Contact Legislator button, remove committee-contacts stub"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including `contact-script.test.ts` (4 tests).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success (confirms no `'use server'` export violations, no unused imports).

- [ ] **Step 4: Drive the flow in the app**

Start the dev server (`npm run dev`, port 9002), log in as `jkapali`, open the Jaden Kapali board, open a bill with a committee assignment (e.g. HB9950 → AGR, WAL, FIN). Verify:
  - "Contact Legislator" appears next to "Write Testimony" (desktop header) and in the mobile action bar (narrow the viewport to 375px — no horizontal scroll).
  - Clicking it lands on `/bills/[id]/contact` with chair + vice-chair cards for AGR, WAL, FIN (6 cards).
  - The script is hidden until a position is picked; picking Support/Oppose fills it and enables the per-chair Email button; the mailto opens a prefilled draft.
  - A bill with no committee assignment shows "No committees assigned yet."

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: contact-legislator verification fixups"
```

(Skip if nothing changed.)

---

## Self-Review

**Spec coverage:**
- Data seam `getCommitteeChairs` + mock for Jaden Kapali codes → Task 1. ✓
- Pure `buildContactScript` + tests → Task 2. ✓
- data-client domain (action + route + client + registration) → Task 3. ✓
- Contact page: container parity, required position, role chip (no left strip), `sm:grid-cols-2`, copy + mailto, empty state → Task 4. ✓
- Button next to Write Testimony (desktop) + sticky mobile action bar; remove `CommitteeContacts` → Task 5. ✓
- Mobile/responsive rules (section 5 of spec): sticky bar, `h-11`, no 375px h-scroll, no tooltips-on-touch (button always enabled) → Tasks 4–6. ✓
- Testing conventions (pure lib, flat `__tests__`) → Task 2. ✓
- Out-of-scope items (my-legislators, all members, real scraping, sending email, history, LLM) → not implemented. ✓

**Placeholder scan:** No TBD/TODO. All code steps carry real code. The only "[Your name]" strings are intentional literal fallbacks in the script body, covered by a test.

**Type consistency:** `CommitteeChair` shape is identical across Tasks 1–4. `getChairs(billId, committeeAssignment)` signature matches between action arm, fetch arm, and the page caller. `ContactPosition` is `'support' | 'oppose'` everywhere. `buildContactScript` input keys match the test in Task 2.
