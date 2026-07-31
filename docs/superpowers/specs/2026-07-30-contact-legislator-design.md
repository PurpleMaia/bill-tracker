# Contact Legislator — Design

**Date:** 2026-07-30
**Branch:** `feat/contact-legislators`
**Status:** Approved design, ready for implementation plan

## Overview

Add a **Contact Legislator** flow that lets a user reach the committee **chairs and
vice-chairs** for a given bill, with their contact info (name, role, committee, email,
phone) and an auto-generated advocacy script they can copy or drop into an email.

Entry point is a **Contact Legislator** button next to the existing **Write Testimony**
button in the bill details dialog header. It routes to a dedicated full page
`/bills/[id]/contact`, mirroring `/bills/[id]/testimony`. This keeps the bill details
dialog uncluttered (an explicit requirement — the dialog must not get congested).

**This is NOT part of the testimonies page.** It is a sibling flow: it shares the
bill-details entry point but has its own route and its own layout. Testimony submission
depends on a scheduled hearing; contacting a legislator does not.

### v1 scope

- Committee **chairs + vice-chairs** only (highest-leverage advocacy target, tractable data).
- Backed by **mock data** scoped to the committee codes present on the Jaden Kapali
  organization's bills. Real data (a `committees` lookup table + a `committee_chairs`
  linking table joined to `legislators`) comes later from a separate repo, via a
  migration authored outside this feature.
- The user **must pick a position** (support / oppose) — no default.
- Button label is **"Contact Legislator"** (singular).

## Existing context

- `src/components/kanban/committee-contacts.tsx` — a stub that lists committee codes +
  full names inside the bill details dialog. Comment notes "member-level contacts are a
  follow-up." This feature supersedes it.
- `src/lib/testimony/committees.ts` — `parseCommitteeCodes()` and `committeeFullName()`.
  Reused as-is for turning `bill.committee_assignment` into codes and names.
- `src/db/migrations/000021_create_legislators_table` — a `legislators` table
  (name, party, chamber, district, phone, email) exists but is **unpopulated** and has
  **no query code** and **no committee/chair linkage**. It is the eventual join target.
- `src/components/kanban/bill-details-dialog.tsx` — hosts the **Write Testimony** button
  in the dialog header next to the tabs (desktop) and in the mobile action bar. This
  feature adds a sibling **Contact Legislator** button in both places.
- `src/app/bills/[id]/testimony/page.tsx` — the full-page pattern the contact page mirrors.

### Real committee codes on Jaden Kapali org bills (mock must cover these)

Fetched from `org_bills` for tenant "Jaden Kapali":

```
AGR, PBS, CAA, CPC, FIN, WAL, EEP, HLT, EDN,
AEN, WAM, CPN, EDU, HHS, TCA, JDC, ECD, JHA
```

The mock chair map is keyed by exactly these codes so every card in the org lines up.

## Architecture

Three layers, matching the codebase's existing separation (DB queries in `src/db/queries`,
pure logic in `src/lib`, transport via the data-client, UI in `src/components`):

### 1. Data seam — `src/db/queries/committee-chairs.ts`

A real query module whose body is mock today and swaps to Kysely joins later. Callers
never change when the real tables land.

```ts
export type CommitteeRole = 'chair' | 'vice-chair';

export interface CommitteeChair {
  committeeCode: string;        // 'AGR'
  committeeName: string;        // 'Agriculture & Food Systems' (via committeeFullName)
  role: CommitteeRole;
  legislatorName: string;       // 'Rep. Kirstin Kahaloa'
  chamber: 'House' | 'Senate';
  email: string | null;
  phone: string | null;
}

// Today: reads from an in-memory MOCK_CHAIRS map keyed by committee code,
//        de-duped and ordered chair-before-vice-chair.
// Later: replace ONLY this body with:
//   committees → committee_chairs → legislators joins, filtered by codes.
export async function getCommitteeChairs(codes: string[]): Promise<CommitteeChair[]>;
```

- Mock data (`MOCK_CHAIRS`) lives in this file (or a sibling `committee-chairs.mock.ts`
  imported only here). It provides plausible chair/vice-chair names + capitol.hawaii.gov
  email pattern + phone for each of the ~18 codes above.
- Chambers are inferred from the code (House vs Senate committee sets already distinguished
  in `committees.ts`).
- When the migration lands: swap the function body, delete the mock file. Component, page,
  data-client wrapper, and script generator are untouched.

### 2. Transport — data-client wiring

Per CLAUDE.md, client components call `data.*`, not raw fetch. Add a `legislators` (or
`contact`) domain to the data-client with one operation, `getCommitteeChairs`, following
the `defineClient({ action, fetch })` contract:

- `db/queries/committee-chairs.ts` — source of truth (above).
- `src/app/actions/legislators.ts` — `'use server'` action wrapper (async only).
- `src/app/api/bills/[id]/chairs/route.ts` (or `/api/legislators/chairs`) — fetch arm.
- `src/lib/data-client/legislators.client.ts` — fetch wrapper + `defineClient` registration.
- Register the domain in `src/lib/data-client/index.ts` as `data.legislators`.

Auth: the contact page is a bill-scoped read. Use `optionalSession` guard (public bills are
already viewable publicly; committee chairs are public record). Match whatever guard the
bill-details read path already uses so scoping stays consistent.

### 3. Script generation — `src/lib/legislators/contact-script.ts` (PURE)

A pure, unit-testable function — no DB, no LLM, no network. Lives in `src/lib` per the
"src/lib is DB-free" convention; mirrors `derived-status.ts` and the testimony helpers.

```ts
export type ContactPosition = 'support' | 'oppose';

export function buildContactScript(input: {
  billNumber: string;
  billTitle: string | null;
  chair: CommitteeChair;      // greeting uses role + name
  position: ContactPosition;  // required — the user picked it
  userName?: string;          // optional sign-off name
}): { subject: string; body: string };
```

Produces a short, polite advocacy message: greeting by role/name, the bill number and
title, a clear support/oppose statement, one or two sentences of ask, sign-off. Plain
deterministic template — cheap and testable. `subject` feeds the `mailto:` link.

### 4. UI

Responsive/mobile behavior for every element below is specified in **section 5 (Mobile &
responsive formatting)**.

**Button** — `src/components/kanban/bill-details-dialog.tsx`:
- Add a `Contact Legislator` button next to `Write Testimony` in the desktop dialog header
  and in the mobile action bar. Icon: `Mail` or `Users` (lucide). **Always enabled** — no
  hearing dependency.
- On click: `onClose()` then `router.push(`/bills/${bill.id}/contact`)`, matching the
  testimony button's behavior.

**Page** — `src/app/bills/[id]/contact/page.tsx` (+ `loading.tsx`):
- Bill header (number, title, link to capitol.hawaii.gov).
- **Position selector** (support / oppose) — no preselection; the script and mailto are
  gated until the user picks. This is a hard requirement.
- Chair/vice-chair cards grouped by committee. Each card: legislator name, role chip
  (Chair / Vice-Chair as an **icon medallion or chip — NOT a colored left-edge strip**, per
  the project's design memory), committee name, email (as `mailto:` with the generated
  subject/body when present), phone.
- Generated script block with a **Copy** button. Per-chair mailto uses that chair's
  greeting; a general copy uses a neutral greeting.
- Empty state when the bill has no committee assignment ("No committees assigned yet").

**Removal**: delete the `CommitteeContacts` render from `bill-details-dialog.tsx` and the
`committee-contacts.tsx` component. `committees.ts` (names/codes helper) stays — it is
reused by the new query and page.

### 5. Mobile & responsive formatting

The dialog and the testimony page already carry a mobile convention; this feature follows
it exactly rather than inventing a new one. Concretely:

**Button entry point (bill details dialog):**
- **Desktop** (`hidden sm:flex`): `Contact Legislator` sits inline in the dialog header
  next to `Write Testimony`, matching that button's `size="sm" variant="outline"` treatment.
- **Mobile**: it does NOT go in the header (no room — three tabs already crowd 375px).
  It joins the **sticky bottom action bar** alongside Write Testimony, in thumb reach.
  Two full-width buttons stacked (`w-full h-11`), Contact Legislator as the secondary
  (`variant="outline"`). The bar keeps the existing
  `pb-[max(0.75rem,env(safe-area-inset-bottom))]` safe-area padding.
- **No tooltips on mobile** — tooltips don't fire on touch. Since Contact Legislator is
  always enabled, there is no disabled-reason text to surface (unlike Write Testimony).

**Contact page (`/bills/[id]/contact`) — full-page responsive layout:**
- Root `flex h-dvh flex-col`; a back header row; scrollable body
  `mx-auto max-w-3xl space-y-4 p-4 sm:p-6` — identical container to the testimony page so
  the two flows feel the same. Back label collapses on mobile
  (`<span className="ml-1 hidden sm:inline">Back</span>`).
- **Position selector (support / oppose)** — the media form control. On mobile it is a
  **stacked, full-width segmented control / two large tap targets** (min ~44px height),
  full width; on `sm+` it sits inline. Selection is required before the script/mailto
  unlock, on every breakpoint. Use radio semantics for a11y; large hit areas on touch.
- **Chair cards** — single column on mobile, `sm:grid-cols-2` on wider screens. Each card
  wraps its own contact rows; long emails/committee names use `break-words` / `truncate`
  as appropriate so nothing forces horizontal scroll. Role shown as an icon medallion/chip
  (NOT a colored left-edge strip).
- **Script block** — full-width textarea/readonly block that grows with content; **Copy**
  button full-width on mobile, inline on desktop. `mailto:` links are plain anchors (open
  the device mail app). Nothing here relies on hover.
- **No horizontal scroll at 375px** — the body never scrolls sideways; wide content
  (emails, phone, committee names) wraps or truncates within its card.

## Testing

Pure unit tests only, in `src/lib/__tests__/contact-script.test.ts` (flat, per convention):
- support vs oppose wording
- missing bill title handled gracefully
- chair greeting uses role + name
- subject line format

No DB tests (matches the repo's pure-logic-only testing convention). Run `npm test`,
`npm run typecheck`, and `npm run build` before committing (the build catches
`'use server'` export violations).

## Out of scope (YAGNI — deferred)

- "My legislators" by the user's district/address.
- All committee members (beyond chair + vice-chair).
- Real scraping / populating `legislators` (separate repo, later migration).
- Sending email from within the app (we hand off via `mailto:` / copy).
- Saving contact history or tracking who was contacted.
- LLM-generated scripts (deterministic template is sufficient for v1).

## Migration path (future, out of this feature)

When the separate repo adds `committees` + `committee_chairs` tables and populates
`legislators`:
1. Author the migrations in this repo (later).
2. Replace the body of `getCommitteeChairs()` with the real Kysely joins.
3. Delete `MOCK_CHAIRS` / the mock file.
No changes to the action, route, data-client wrapper, page, or script generator.
