# Testimony Writer — Design

**Date:** 2026-07-02
**Status:** Approved

## Purpose

Let users write testimony for a bill in a full-page rich-text editor, export it as PDF or DOCX, and follow a guide for submitting it on the Hawaii State Legislature website (capitol.hawaii.gov). Launched from the bill-details dialog.

## Decisions (confirmed with user)

- **Persistence:** Database-backed drafts, one draft per user per bill (upsert).
- **Structure:** Structured header fields (author name, organization, position) + free rich-text body.
- **AI:** None in v1. The existing "testimony help" settings toggle stays dormant for this feature.
- **Export:** Both PDF and DOCX, generated client-side.
- **Editor:** Tiptap (headless, JSON document model, styles with Tailwind/shadcn).

## Route & Entry Point

- New page: `src/app/bills/[id]/testimony/page.tsx` (client component). First bill-specific page in the app.
- Entry: a **"Write Testimony"** button in `src/components/kanban/bill-details-dialog.tsx` that navigates to `/bills/{billId}/testimony`.
- Requires a session. Logged-out users see a sign-in prompt instead of the editor. Unknown bill ID → redirect home with a toast.
- Bill data comes from the existing `GET /api/bills/[id]` → `getBillDetails()` shape, which already includes `description`, `introducer`, `committee_assignment`, and `updates: StatusUpdate[]`.

## Layout

- **Desktop:** two panes. Left: collapsible reference panel — bill number/title, description, introducer(s), committee assignment, status-update timeline (sorted date-desc, same as the dialog). Right: the writing workspace, full remaining width.
- **Mobile:** reference panel moves into a Sheet opened from a "Bill info" button; workspace gets the full screen.

## Multi-Step Flow

Stepper across the top; all state lives on the page (no route change between steps).

### Step 1 — Write
- Header form: author name (required), organization (optional), position (`Support` | `Oppose` | `Comments`).
- Tiptap editor with toolbar: font family select, headings H1–H3 + paragraph, bold, italic, underline, strikethrough, bullet list, ordered list, undo/redo.
- Draft auto-saves to the DB, debounced (~1.5s after typing stops), with a saved/saving indicator.

### Step 2 — Export
- Read-only preview of the composed testimony: formatted header block (bill number & title, committee assignment, position, author name/organization, date) followed by the rich-text body.
- "Download PDF" and "Download DOCX" buttons.

### Step 3 — Submit
- Static step-by-step guide for capitol.hawaii.gov: create/sign in to an account, find the measure, register to submit testimony for the hearing, upload the exported file or paste text, and the 24-hours-before-hearing deadline convention.
- Direct link to the bill's page using the existing `bill_url` field.

## Persistence

Migration `000023_create_testimonies_table` (up/down SQL, matching existing migration style):

```sql
CREATE TABLE testimonies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT 'comments',
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, bill_id)
);
```

- `content_json` stores the Tiptap document JSON.
- `tenant_id` is passed by the client from auth context (same pattern as other tenant-scoped calls) and validated server-side with `requireMembership` when non-null; null for public users.
- Queries in `src/db/queries/testimony.ts`: `getTestimonyDraft(userId, billId)` and `upsertTestimonyDraft(...)` (Kysely, `ON CONFLICT (user_id, bill_id) DO UPDATE`).
- Regenerate/extend `src/db/types.ts` with the new table.

## Data Access (switchable data-client contract)

Two ops in a new `testimony` domain, following the existing contract exactly:

- **Query layer (source of truth):** `src/db/queries/testimony.ts`.
- **Action arm:** `src/app/actions/testimony.ts` (`'use server'`, async-function exports only), wraps in `ActionResult`, authorizes via `requireSession.fromAction()`.
- **Fetch arm:** `GET` / `PUT` `src/app/api/bills/[id]/testimony/route.ts`, authorizes via `requireSession.fromRequest(request)`, maps `ApiError` via `statusCode`.
- **Client:** `src/lib/data-client/testimony.client.ts` registered with `defineClient` → `data.testimony.getDraft({ billId })`, `data.testimony.saveDraft({ billId, authorName, organization, position, contentJson })`. Both arms return the same unwrapped value.

## Export

`src/lib/testimony-export/` — pure, DB-free per `src/lib` convention:

- `blocks.ts` — pure converter: Tiptap JSON → neutral block list (`heading`, `paragraph` with styled text runs: bold/italic/underline/strike/font). Unit-tested in `src/lib/__tests__/testimony-blocks.test.ts`.
- `to-docx.ts` — blocks → `.docx` via the `docx` package.
- `to-pdf.ts` — blocks → `.pdf` via `pdfmake` (vector text, not rasterized).
- Both generators are dynamically imported on button click to keep them out of the main bundle.
- The structured header (bill info, position, author, date) is composed into every export so output follows conventional Hawaii testimony format regardless of body content.

## New Dependencies

`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text-style`, `@tiptap/extension-font-family`, `@tiptap/extension-underline`, `docx`, `pdfmake`.

## Components

```
src/components/testimony/
  testimony-stepper.tsx        # step indicator + navigation
  testimony-reference-panel.tsx# bill description/introducers/status updates
  testimony-editor.tsx         # Tiptap editor + toolbar
  testimony-header-form.tsx    # name / organization / position fields
  testimony-preview.tsx        # composed read-only preview (step 2)
  testimony-export-buttons.tsx # PDF / DOCX download actions
  testimony-submit-guide.tsx   # step 3 static guide
```

## Error Handling

- Auto-save failure: toast, retry on next debounce tick; editor state remains source of truth while the tab is open.
- Export failure: toast with message.
- Bill fetch failure / unknown ID: redirect to `/` with a toast.
- Guards throw `ApiError`; standard route/action mapping.

## Testing

- `testimony-blocks.test.ts` — Tiptap JSON → blocks converter (pure).
- Existing suite must stay green: `npm test`, `npm run typecheck`, `npm run build` (build catches `'use server'` export violations).

## Out of Scope (v1)

- AI-assisted drafting (future: behind the existing settings opt-in).
- Multiple drafts per bill per user; draft sharing within an org.
- Hearing-date scraping / deadline reminders.
- Server-side export rendering.
