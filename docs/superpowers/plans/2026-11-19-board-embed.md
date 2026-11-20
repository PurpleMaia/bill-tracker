# Board Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orgs can put their public Tracker on their own website with an iframe at `/embed/<slug>`.

**Architecture:** A chrome-less page outside `(main)` reuses `ReadOnlyOrgBoard` (non-trackable) with a thin strip; `KanbanBoard` gains an optional click override so bills open on the site in a new tab. Framing is allowed only for `/embed/*` via `next.config` `headers()`. Pure URL/snippet helpers live in `board-routes.ts`.

**Tech Stack:** Next.js 15 App Router, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-board-embed-design.md`

## Global Constraints

- Product name: **Hawaiʻi Bill Tracker** (ʻokina U+02BB). Titles: `<Org>’s Tracker · Hawaiʻi Bill Tracker`, `Board not found · Hawaiʻi Bill Tracker`.
- Strip link text: `Open on Hawaiʻi Bill Tracker` (new tab → `/community/<slug>`).
- Bill click → new tab `/community/<slug>?bill=<id>` (`rel="noopener"`).
- Embed never offers Follow/Track/Login.
- Snippet: `<iframe src="<embedUrl>" title="<Org>’s Tracker" width="100%" height="600" style="border:0" loading="lazy"></iframe>`.
- `/embed/:path*`: `Content-Security-Policy: frame-ancestors *`. All other paths: `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`.

## Review Focus

1. Org name with `"`, `<`, `&` → snippet attribute stays valid HTML (escaped). Pinned in Task 1.
2. Board goes private while embedded → frame shows "This board isn’t public", not a blank board. Manual QA.
3. `/embed/x` response carries `frame-ancestors *` and no `X-Frame-Options`; `/community` carries `SAMEORIGIN`. curl check in Task 3.
4. Narrow host column (~360px) → columns scroll inside the frame, no page-level overflow. Manual QA.
5. Signed-in viewer opening `/embed/<slug>` directly → still no Track button. Manual QA.

---

### Task 1: URL and snippet helpers

**Files:** Modify `src/lib/boards/board-routes.ts`; Test `src/lib/__tests__/board-routes.test.ts`

**Produces:**
- `embedBoardPath(slug): string` → `/embed/<encoded slug>`
- `embedBoardUrl(slug): string` → `getAppUrl() + embedBoardPath(slug)`
- `publicBillUrl(slug, billId): string` → `publicBoardUrl(slug) + '?bill=' + encodeURIComponent(billId)`
- `embedSnippet(slug, orgName): string` → the Global Constraints snippet, `title` HTML-attribute-escaped (`&`→`&amp;`, `"`→`&quot;`, `<`→`&lt;`, `>`→`&gt;`)

- [ ] Tests: `embedBoardPath('a b')` → `/embed/a%20b`; `embedBoardUrl('food-plus')` with `NEXT_PUBLIC_APP_URL='https://x.org/'` → `https://x.org/embed/food-plus`; `publicBillUrl('food-plus','b 1')` → `https://x.org/community/food-plus?bill=b%201`; `embedSnippet('food-plus','A "B" <C> & D')` contains `title="A &quot;B&quot; &lt;C&gt; &amp; D’s Tracker"` and `src="https://x.org/embed/food-plus"`.
- [ ] Run → FAIL; implement; run → PASS.

### Task 2: Embed page

**Files:**
- Modify `src/components/kanban/kanban-board.tsx` — optional prop `onCardClick?: (bill: Bill) => void`; when set, `handleCardClick` calls it instead of `openBill`.
- Modify `src/components/boards/read-only-org-board.tsx` — optional `onCardClick` passed through.
- Create `src/components/boards/embed-board-view.tsx` — client; loads `data.boards.getPublicBoard`; skeleton / not-public message (link "Hawaiʻi Bill Tracker" → app root, `target="_blank"`) / `ReadOnlyOrgBoard trackable={false}` with strip; card click `window.open(publicBillUrl(slug, bill.id), '_blank', 'noopener')`.
- Create `src/app/embed/[slug]/page.tsx` — `generateMetadata` like the community page; `robots: { index: false }`; wraps view in `h-dvh` container.
- Modify `src/app/(main)/community/[slug]/page.tsx` — titles to the Hawaiʻi Bill Tracker form.

- [ ] Implement; `pnpm typecheck` clean.
- [ ] Browser (signed out, 375 and 1280 wide): `/embed/food-plus` shows strip + board, no app header; bill click opens a new tab on `/community/food-plus?bill=…`; `/embed/nope` shows the not-public message.

### Task 3: Framing headers

**Files:** Modify `next.config.ts` — `async headers()` with the two rules from Global Constraints (catch-all source `/((?!embed/).*)` so the embed route gets no `X-Frame-Options`).

- [ ] `curl -sI localhost:<port>/embed/food-plus` → `frame-ancestors *`, no `X-Frame-Options`; `curl -sI …/community` → `X-Frame-Options: SAMEORIGIN`.
- [ ] Browser: a local HTML file with `<iframe src=".../embed/food-plus">` renders the board; one framing `/community` is refused.

### Task 4: Embed code in Org Settings

**Files:** Modify `src/components/admin/org-settings-dialog.tsx` — when public, below the link row: label "Embed on your website", read-only `<code>` block (wraps, `break-all`, small) with `embedSnippet(activeTenant.slug, activeTenant.name)` and `CopyLinkButton` (`label="Copy embed code"`), plus one line of help: "Paste this into your website’s HTML."

- [ ] `pnpm typecheck && pnpm test && pnpm build` pass; commit `feat: embed public boards on other websites`.
