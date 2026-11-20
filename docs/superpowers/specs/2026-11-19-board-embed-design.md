# Board Embed — Design

**Date:** 2026-11-19
**Status:** Draft for approval
**Builds on:** `2026-11-19-public-boards-design.md` (this was its "iframe embed" follow-up)

## Why

Orgs want their Tracker *on their own website*, not just a link to it. A
public board's link already works for anyone; framing it today would drag in
the whole app (header, nav, Login) and broken sign-in inside the frame.

## What ships

### 1. `/embed/<slug>` — the board, nothing else

- Lives outside the `(main)` layout: no header, nav, sub-nav or tour.
- Same data as the public page (`data.boards.getPublicBoard({ slug })`), same
  read-only Kanban (`KanbanHeader variant="active-boards"` + `KanbanBoard`).
- Thin top strip: org initials, "<Org>’s Tracker", and
  "Open on Hawaiʻi Bill Tracker ↗" (new tab → `/community/<slug>`).
- **Clicking a bill opens a new tab** at `/community/<slug>?bill=<id>`, the
  org's public page with that bill's details open. No dialog inside the frame.
- Always behaves signed-out: no Follow, Track or Login prompts, even if the
  viewer happens to have a session (third-party frames mostly can't use it).
- Private or unknown slug → small "This board isn’t public" message with a
  link to Hawaiʻi Bill Tracker. Same rule as the public page.
- Fills the frame's height; columns scroll inside it.

### 2. Framing headers (next.config `headers()`)

- `/embed/:path*` → `Content-Security-Policy: frame-ancestors *` (any site may frame it).
- Everything else → `X-Frame-Options: SAMEORIGIN` +
  `Content-Security-Policy: frame-ancestors 'self'`, so other sites can't
  wrap the real app (login, settings) in a frame — clickjacking protection
  the app doesn't have today.

### 3. Embed code in Org Settings

- Under the public link (only when the board is public): an "Embed on your
  website" snippet with the same copy button:
  `<iframe src="<app>/embed/<slug>" title="<Org>’s Tracker" width="100%" height="600" style="border:0" loading="lazy"></iframe>`
- Built by a pure helper (`embedBoardUrl(slug)`, `embedSnippet(slug, orgName)`)
  in `src/lib/boards/board-routes.ts`, unit-tested (escapes quotes/`<` in the
  org name).

### 4. Product name

Titles I added earlier switch from "Food+" to **Hawaiʻi Bill Tracker**:
`<Org>’s Tracker · Hawaiʻi Bill Tracker`, "Board not found · Hawaiʻi Bill Tracker".
Same pattern for the embed page's `<title>`.

## Approaches considered

- **A. Reuse the live read-only board in a chrome-less page.** Picked: looks
  like the real Tracker, inherits future board changes, little new code.
- B. Separate server-rendered list view for embedding. Lighter, but a second
  board rendering to keep in sync.
- C. JS widget drawing into the host page (no iframe). Separate bundle and
  host-CSS conflicts; overkill now.

## Non-goals

- Sign-in, follow or tracking inside the embed.
- Per-org allowlists of which sites may frame (anyone may; the board is public anyway).
- Theming/size options in the snippet, auto-resizing height (`postMessage`).
- Rate limiting anonymous reads (still a public-boards follow-up).

## Left to the builder

- How `KanbanBoard` takes the "open in new tab" click (e.g. an optional
  `onCardClick` override that skips the URL dialog).
- Strip styling (reuse the olive banner look), loading skeleton.
