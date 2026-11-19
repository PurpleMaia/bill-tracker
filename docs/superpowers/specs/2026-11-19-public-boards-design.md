# Public Boards — Design

**Date:** 2026-11-19
**Status:** Approved direction (Jaden, 2026-11-19): "public board should mean both"

## Problem

An org can mark its board public (`tenants.public_board`), but today that only
lists it on Browse Orgs. Actually *viewing* the board needs an account:

- `/boards` renders `BoardsLoginWall` for signed-out visitors.
- `GET /api/boards/[tenantId]/bills` and `getBoardAction` call `requireSession`.
- Even signed-in visitors can only open a board after they **follow** it — the
  Browse card hides "View board" until `isFollowing`.

So an org can't hand anyone a link to its board, and nobody can preview a board
before deciding to follow it.

## Decision

`public_board = true` means **both** "listed on Browse" **and** "viewable by
anyone, no account needed". There is no separate setting.

## What ships

### 1. A shareable public board page — `/org/[slug]`

- One org's board, read-only, for anyone (signed in or not).
- Keyed on `tenants.slug` (already `UNIQUE NOT NULL`), so links read as
  `https://<app>/org/<slug>`. Not under `/boards/…` because `/boards/browse`
  would collide with a slug of `browse`.
- 404-style "This board isn't public" state when the slug is unknown **or** the
  org's board is private — the two are indistinguishable to the visitor.
- Server-rendered `<title>`/description (`generateMetadata`) so a pasted link
  previews as "<Org name> · Food+ board" in Slack, email, social.
- Chrome: the existing olive org banner (name, "Public board · read-only"), a
  **Copy link** button, and a follow control: **Follow / Following** when signed
  in, **Login to follow** (returns to this page) when signed out.
- Board body: the existing `KanbanHeader variant="active-boards"` +
  `KanbanBoard readOnly boardMode="active-boards"`, with org testimony badges.
- "Track this bill" on cards only when signed in. Signed-out cards show no
  track control (the bill details dialog still offers its own login prompt).
- The Active Boards nav tab is highlighted on `/org/*`, and its Following/Browse sub-nav shows with **Browse** active.

### 2. Browse Orgs changes

- **Every** org card gets a **View board** button linking to `/org/<slug>`, for
  everyone — no follow or login required. Follow/Login-to-follow stays beside it.
- The "Following" side panel and follow toast keep linking to `/boards?org=…`
  (the Following tab), unchanged.
- **Your organization** card, when the board is public, shows the public link
  with **Copy link** and **Open**. When private: admins see "Turn on public
  board visibility in Organization Settings to get a shareable link";
  members see "Ask your admin…".
- Intro step 2 copy becomes "Open any public board — no account needed."

### 3. Org Settings

- Under the public-board switch, when on: the full public URL with a Copy
  button. Copy text for the switch description becomes "When on, anyone —
  even without an account — can view this board at its public link and find it
  under Browse."

### 4. Data access

- New query `getPublicTenantBySlug(slug)` → `{ id, name, slug, description } | null`,
  gated on `public_board = true`.
- New data-client op `data.boards.getPublicBoard({ slug })` →
  `{ org: PublicBoardOrg; bills: Bill[]; testimonyBillIds: string[] }`, with both
  arms: `getPublicBoardAction` and `GET /api/boards/public/[slug]`. Both use
  `optionalSession` — never `requireSession`.
- Bills come from the same `getAllTrackedBills(false, tenantId, false)` the
  signed-in board already uses (`includeTrackedBy: false`, no per-person data).
  Since anyone can register an account today, this exposes nothing a stranger
  couldn't already see; it just removes the signup step.
- Existing `/boards?org=` Following flow and its `requireSession` endpoints are
  untouched.

## Out of scope (follow-ups)

- iframe embed route (`/embed/[slug]`) and framing headers (CSP
  `frame-ancestors`) — this page is the base for it.
- Rate limiting anonymous board reads.
- Making `/boards` (Following) itself usable signed-out.
- Custom/vanity slugs or slug editing.

## Pure, testable pieces

- `src/lib/boards/board-routes.ts`: `publicBoardPath(slug)`, `publicBoardUrl(slug)`, `isActiveBoardsPath(pathname)`, `isActiveBoardsTabActive(href, pathname)` (moved from the sub-nav component).
- `cardVisibility(mode, { signedIn })` — `showTrackForSelf` requires sign-in.
- `isNavItemActive('/boards', pathname)` delegates to `isActiveBoardsPath`.
