# Public Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone, signed in or not, can view a public org's board at `/org/<slug>`; Browse lets everyone preview any board, and orgs get a copyable link.

**Architecture:** One new read path (`getPublicTenantBySlug` → `data.boards.getPublicBoard` with action + fetch arms, no session needed) feeds a new client page that reuses the read-only Active Boards kanban through a generalized bills bridge. Browse, Org Settings and nav get small UI edits driven by pure helpers in `src/lib/boards/board-routes.ts`.

**Tech Stack:** Next.js 15 App Router, Kysely, data-client (`defineClient`), shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-public-boards-design.md`

## Global Constraints

- `public_board = true` means listed on Browse **and** viewable without an account. No new setting.
- Public page URL: `/org/<slug>`. Unknown slug and private board render the same "This board isn't public" state.
- Public read endpoints need no session (none is resolved; the response is viewer-independent); bills via `getAllTrackedBills(false, tenantId, false)` (no tracked-by data).
- Existing `/boards?org=` Following flow and its endpoints stay as they are.
- `db/queries/*` is not `'use server'`; `'use server'` files export only async functions; `src/lib` stays DB-free; no barrel files.
- Client code calls `data.*`, not raw `fetch`.

## Review Focus

1. Slug with URL-unsafe characters (spaces, `&`, unicode) → `publicBoardPath` encodes it; the page decodes it back to the same slug.
2. Org flips its board to private while someone has the link open → next load shows "This board isn't public", not an error toast or blank board.
3. Signed-out visitor clicks a card → no "Track this bill" control; bill dialog still opens.
4. Signed-out visitor clicks "Login to follow" on `/org/<slug>` → lands back on `/org/<slug>` after login.
5. Phone width (375px) → banner keeps name, Copy link and Follow on screen without horizontal page scroll.

Items 1 and 3 are pinned by unit tests (Tasks 1, 2); 2, 4, 5 are manual QA in the PR.

---

### Task 1: Board route helpers

**Files:**
- Create: `src/lib/boards/board-routes.ts`
- Modify: `src/components/boards/active-boards-subnav.tsx` (import `isActiveBoardsTabActive` from lib, delete local copy)
- Modify: `src/components/main/header-nav.tsx` (`/boards` case → `isActiveBoardsPath(pathname)`)
- Modify: `src/components/main/header-subnav.tsx` (`pathname.startsWith('/boards')` → `isActiveBoardsPath(pathname)`)
- Test: `src/lib/__tests__/board-routes.test.ts`

**Interfaces — Produces:**
- `publicBoardPath(slug: string): string` → `/org/${encodeURIComponent(slug)}`
- `publicBoardUrl(slug: string): string` → `getAppUrl() + publicBoardPath(slug)`
- `isActiveBoardsPath(pathname: string): boolean` → `/boards` tree or `/org/…`
- `isActiveBoardsTabActive(href: string, pathname: string): boolean` — `/boards` only exact; `/boards/browse` also active on `/org/…`

- [ ] **Step 1: Write failing tests**

```ts
expect(publicBoardPath('food-plus')).toBe('/org/food-plus');
expect(publicBoardPath('a b&c')).toBe('/org/a%20b%26c');
// NEXT_PUBLIC_APP_URL = 'https://x.org/'
expect(publicBoardUrl('food-plus')).toBe('https://x.org/org/food-plus');
expect(isActiveBoardsPath('/boards')).toBe(true);
expect(isActiveBoardsPath('/boards/browse')).toBe(true);
expect(isActiveBoardsPath('/org/food-plus')).toBe(true);
expect(isActiveBoardsPath('/organization')).toBe(false);
expect(isActiveBoardsPath('/your-bills')).toBe(false);
expect(isActiveBoardsTabActive('/boards', '/boards')).toBe(true);
expect(isActiveBoardsTabActive('/boards', '/org/x')).toBe(false);
expect(isActiveBoardsTabActive('/boards/browse', '/org/x')).toBe(true);
expect(isActiveBoardsTabActive('/boards/browse', '/boards')).toBe(false);
```

- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/board-routes.test.ts` → FAIL (module missing)
- [ ] **Step 3:** Implement the module; rewire the three components.
- [ ] **Step 4:** Same command → PASS
- [ ] **Step 5:** Commit `feat: add public board route helpers`

### Task 2: Hide track-for-self from signed-out viewers

**Files:**
- Modify: `src/lib/bills/board-display.ts`
- Modify: `src/components/kanban/kanban-card.tsx:137` (pass `{ signedIn: !!user }`)
- Test: `src/lib/__tests__/board-display.test.ts`

**Interfaces — Produces:** `cardVisibility(mode: BoardMode, opts?: { signedIn?: boolean }): CardVisibility`; `signedIn` defaults to `true` so existing callers are unchanged.

- [ ] **Step 1: Add failing tests**

```ts
expect(cardVisibility('active-boards', { signedIn: false }).showTrackForSelf).toBe(false);
expect(cardVisibility('active-boards', { signedIn: true }).showTrackForSelf).toBe(true);
expect(cardVisibility('active-boards').showTrackForSelf).toBe(true);
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat: only offer track-for-self to signed-in viewers`

### Task 3: Public board read path

**Files:**
- Modify: `src/db/queries/tenants.ts` — add `getPublicTenantBySlug`
- Modify: `src/types/tenant.ts` — add `PublicBoardOrg`, `PublicBoard`
- Modify: `src/lib/data-client/boards.params.ts` — add `PublicBoardParams`
- Modify: `src/app/actions/boards.ts` — add `getPublicBoardAction`
- Create: `src/app/api/boards/public/[slug]/route.ts`
- Modify: `src/lib/data-client/boards.client.ts` — fetch arm + register `getPublicBoard`

**Interfaces — Produces:**
- `getPublicTenantBySlug(slug: string): Promise<{ id: string; name: string; slug: string; description: string } | null>` — `where public_board = true`
- `interface PublicBoardOrg { tenantId: string; name: string; slug: string; description: string }`
- `interface PublicBoard { org: PublicBoardOrg; bills: Bill[]; testimonyBillIds: string[] }`
- `interface PublicBoardParams { slug: string }`
- `data.boards.getPublicBoard(params: PublicBoardParams): Promise<PublicBoard>` — throws `ApiError('BOARD_NOT_FOUND', 404, 'Board not found')` / HTTP 404 `{ error: 'Board not found' }` when missing or private.

Both arms: no session; tenant lookup, then `getAllTrackedBills(false, org.id, false)`, then `getOrgTestimonyBillIds(org.id, bills.map(b => b.id))`. Route maps `error.statusCode` like `boards/[tenantId]/bills/route.ts`.

- [ ] **Step 1:** Implement. **Step 2:** `pnpm typecheck` → clean (defineClient enforces matching arms).
- [ ] **Step 3:** Commit `feat: add public board read endpoint`

### Task 4: `/org/[slug]` page

**Files:**
- Modify: `src/components/boards/active-boards-bills-bridge.tsx` — extract `BoardBillsBridge({ bills, loadingBills, children })`; `ActiveBoardsBillsBridge` becomes a wrapper reading `useActiveBoards()`.
- Create: `src/app/(main)/org/[slug]/page.tsx` — server component; `generateMetadata` via `getPublicTenantBySlug` → title `"<name> · Food+ board"`, description = org description or "Bills <name> is tracking in the Hawaiʻi legislature."; renders `<PublicBoardView slug={slug} />`.
- Create: `src/components/boards/public-board-view.tsx` — client; loads `data.boards.getPublicBoard`; states: skeleton (`KanbanBoardSkeleton`), not-found card (Lock icon, "This board isn't public", Browse organizations button), board.
- Create: `src/components/boards/public-board-banner.tsx` — olive banner like `ActiveBoardBanner` (reuse its `initials`, export it), subtitle "Public board · read-only", `CopyLinkButton`, follow control.
- Create: `src/components/boards/copy-link-button.tsx` — `CopyLinkButton({ url, label?, size? })`: `navigator.clipboard.writeText`, toast "Link copied", Check icon for 2s; toast with the URL on failure.

Follow control: signed out → `<LoginLink>` "Login to follow"; signed in → Follow/Following toggle through `data.boards.follow/unfollow`, initial state from `data.boards.listFollowed()` membership. Track-for-self (signed in only) mirrors `ActiveBoardView.handleTrackForSelf` via `data.bills`-equivalent call already used there, with `trackedBillIds` from `data.boards.getMyTrackedBillIds()`.

- [ ] **Step 1:** Implement. **Step 2:** `pnpm typecheck` clean.
- [ ] **Step 3:** `pnpm dev`, open `/org/<public slug>` signed out → board renders; `/org/nope` → not-found card.
- [ ] **Step 4:** Commit `feat: public org board page at /org/[slug]`

### Task 5: Browse + Org Settings links

**Files:**
- Modify: `src/components/boards/browse-orgs-list.tsx`
- Modify: `src/components/admin/org-settings-dialog.tsx`

Browse:
- `OrgCard`: "View board" (`Eye` icon, outline) → `publicBoardPath(org.slug)` always shown; Follow / Login-to-follow next to it. Remove the follow-gated "View board".
- `MyOrgCard`: public → row with truncated `publicBoardUrl(slug)`, `CopyLinkButton`, "Open" link; private → admin/member hint text from spec.
- `BrowseIntro` step 2: title "Open any board", text "Public boards open for anyone — no account needed."

Org Settings: when `publicBoard` is true, show URL + `CopyLinkButton` below the switch (slug from `activeTenant.slug`); switch description copy from spec.

- [ ] **Step 1:** Implement. **Step 2:** `pnpm typecheck && pnpm test && pnpm build` all pass.
- [ ] **Step 3:** Commit `feat: preview any public board from Browse and share its link`
