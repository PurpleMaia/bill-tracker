# Header Sub-Nav Suggestions

The app header has a contextual sub-nav slot in its center (`src/components/main/header-subnav.tsx`).
It currently renders the Kanban/Spreadsheet/Admin `ViewToggle` on **Your Bills** (`/`, logged-in only)
and nothing on the other pages. These are suggested options for filling those empty slots as each
page gets built out. Whatever renders here should keep the existing tab treatment: `bg-secondary`
container with the active pill in `bg-primary` (see `view-toggle.tsx` for the pattern).

## Search (`/search`)

Scope tabs for narrowing what is being searched:

- **All Bills · This Session · Archived** — time/scope based, or
- **Bills · Hearings · Committee Reports** — content-type based, once search indexes more than bills

## Your Testimonies (`/testimonies`)

Lifecycle tabs mirroring how a testimony progresses:

- **Drafts · Submitted · Past Sessions**
- Optionally a **Deadlines** tab surfacing bills with imminent hearing dates that still need testimony

## View Active Boards (`/boards`)

Audience tabs matching the multi-tenant model:

- **My Org · Public Boards · Following** — your org's board, boards other orgs chose to publish,
  and boards you watch

## Your Bills (`/`) — already live

- Currently **Kanban · Spreadsheet · Admin** (admin tab is org-role gated)
- If the Supervisor view becomes routable, it belongs in this toggle too

## Implementation note

Add a branch per route in `HeaderSubNav` and keep each page's sub-nav as its own small component
(e.g. `search-subnav.tsx`) rather than growing a single switch component. Sub-nav state that must
survive navigation belongs in a context (as `ViewToggle` uses `kanban-board-context`); otherwise
prefer URL params so tabs are shareable.
