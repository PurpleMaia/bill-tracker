# Hawaiʻi Bill Tracker (Frontend)

A Next.js application for tracking and managing legislative bills related to food and agriculture in Hawaiʻi. This repository contains the frontend application, developer utilities, and scripts used to run and maintain the project. 

---

## Table of contents

- Project overview
- Architecture & key components
- Prerequisites
- Environment variables
- Local database setup
- Development (run & build)
- Backend services & integrations
- How the app works (high level)
- Contributing
- Testing & linting
- Deployment notes
- Troubleshooting & support
- Useful links

---

## Project overview

The Hawaiʻi Bill Tracker is a Kanban-style bill tracker focused on food- and agriculture-related legislation for Hawaiʻi, built by Purple Maiʻa & Food+ Policy. The UI shows bills as cards that can be searched, filtered, tracked, and (when authenticated) updated by contributors — plus plain-language explanations, testimony drafting, and legislator contact. Bill status is classified by an LLM (OpenAI), and an external `bill-scraper` service fetches legislative updates.

## Architecture & key components

> For the full architecture — the data-client transport seam, auth guards,
> multi-tenancy, and derived status — read
> [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md).
> Conventions for contributors (and AI agents) live in
> [`CLAUDE.md`](CLAUDE.md); the database schema is in
> [`docs/db/schema.md`](docs/db/schema.md).

- **Frontend:** Next.js 15 (app router) + React 18 + TypeScript + Tailwind CSS.
  UI primitives come from shadcn/ui components in `src/components/ui` + Radix.
- **Database access:** Kysely (Postgres) via `src/db/kysely/client.ts`. **All
  queries live in `src/db/queries/*`** — the single source of truth.
- **Authentication:** custom, cookie-based sessions (SHA-256 token, bcrypt
  passwords). Authorization goes through guards in `src/lib/auth/auth-guards.ts`.
- **Two transports, one client:** every data operation has a Server Action arm
  (`src/app/actions/*`) and an API-route arm (`src/app/api/*`); client code calls
  `data.*` from `@/lib/data-client` and the transport is chosen by a flag.
- **External integrations only** in `src/services/*`: `llm.ts` (OpenAI),
  `email.ts` (Resend), `scraper.ts` (the external `bill-scraper` service).
- **State & caching:** React Context (`src/hooks/contexts/*`) + TanStack React Query.

Project layout (important folders):

```
src/
├── app/            # Next.js app router: pages, actions/ (server actions), api/ (routes)
├── components/     # UI components (kanban, search, testimony, boards, admin, ui, …)
├── hooks/          # Custom hooks + contexts/ (Auth, Bills, KanbanBoard, …)
├── services/       # EXTERNAL integrations only (OpenAI, Resend, scraper, Google OAuth)
├── lib/            # Pure logic, grouped by domain (auth, bills, testimony, versions, core, data-client)
└── db/             # queries/ (data-access layer), kysely/ (client), migrations/, types.ts (generated)
```

## Prerequisites

- **Node.js 22.x** and **pnpm 10** (this repo pins `packageManager: pnpm@10`).
  Install pnpm via `corepack enable` or from https://pnpm.io.
- Git
- PostgreSQL database for local development (or a hosted Postgres instance)
- The [`golang-migrate`](https://github.com/golang-migrate/migrate) CLI for
  running migrations (`brew install golang-migrate`)
- Optional: an OpenAI key (bill classification / summaries) and Resend key (email)

## Environment variables

Create a `.env` file in the repository root (do not commit secrets). There is no
`.env.example`; the variables the app actually reads are:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (Kysely, migrations, codegen) |
| `OPENAI_API_KEY` | OpenAI key used by `src/services/llm.ts` |
| `OPENAI_BASE_URL` | Optional: proxy / alternate OpenAI endpoint |
| `RESEND_API_KEY` | Resend key for transactional email (invites, verification, resets) |
| `SCRAPER_API_URL` | Base URL of the external `bill-scraper` service |
| `NEXT_PUBLIC_DATA_TRANSPORT` | `fetch` (default) or `action` — data-client transport |
| `NEXT_PUBLIC_DEMO_DEADLINES` | Optional: use demo session deadlines instead of the real calendar |

## Local database setup

With `DATABASE_URL` set, apply migrations and generate the Kysely types:

```bash
pnpm migrate:up dev   # apply all pending migrations (golang-migrate, .sql files)
pnpm codegen          # regenerate src/db/types.ts from the live DB
```

Migrations are sequential `.sql` files in `src/db/migrations/`. See
[`docs/db/migration-guide.md`](docs/db/migration-guide.md) for creating,
rolling back, and force-fixing migrations.

## Development (run & build)

Install dependencies and run the dev server:

```bash
pnpm install
pnpm dev
# Open http://localhost:9002
```

Available scripts (high level):

- `pnpm dev` — Start dev server (Next.js, port 9002)
- `pnpm build` — Build production app (the real CI/deploy gate)
- `pnpm start` — Start the built app
- `pnpm lint` — Run ESLint
- `pnpm typecheck` — Run TypeScript typecheck
- `pnpm test` — Run the Vitest suite
- `pnpm codegen` — Generate DB types from `DATABASE_URL` with kysely-codegen
- `pnpm migrate:up` / `pnpm migrate:down` — Apply / roll back migrations (note you will need to install golang-migrate to your local machine)

> ⚠️ `next.config.ts` sets `ignoreBuildErrors` and `ignoreDuringBuilds`, so
> `pnpm build` does **not** fail on type or lint errors. Run `pnpm typecheck`
> and `pnpm lint` explicitly.

If the app does not pick up `.env`, confirm your terminal has the environment variables exported (zsh profile, direnv, or use a .env loader).

## Backend services & integrations

This repo interacts with several backend services and APIs:

- PostgreSQL (primary DB) — stores bills, status updates, users, auth keys, and user-bill relationships. Accessed via Kysely in `db/kysely/client.ts` and `src/lib/*` utilities.
- OpenAI — used by `src/services/llm.ts` to classify bill status from recent status lines. Requires `OPENAI_API_KEY`.
- External Scraper / Scraping API — the app expects bill data scraped periodically or on-demand. Scraper triggers live in `src/services/scraper.ts` and UI buttons in `src/components/scraper`.

Security note: the frontend never connects directly to the database. Server-side services (server actions / API routes) perform DB operations and enforce authentication.

## How the app works (high level flow)

1. Public users visit the site and can view bills and statuses (read-only).
2. Authenticated users (created via scripts or admin flow) can adopt bills, drag-and-drop cards on the Kanban board, edit bill details, and trigger scrapes or LLM reclassification.
3. When a UI action requires a DB change, the frontend calls a server-side service (server action or API route) in `src/services/*`. Those services validate input, check the session, and use Kysely (or `db` client) to update Postgres.
4. LLM classification: when the app needs a bill status classification, it calls `src/services/llm.ts`, which sends a minimal prompt to OpenAI and returns a single canonical status category.
5. Background scraping: the scraper can be triggered manually from the UI or run as a scheduled job externally. Scraped updates are written to the `status_updates` table and may trigger reclassification.

## Contributing

Follow these steps to contribute to the project:

1. Check issues and existing documentation to find a task.
2. Create a feature branch from `main` (or the repo default branch):

```bash
git checkout -b feature/<short-description>
```

3. Make changes in a focused, well-scoped commit. Use clear commit messages and include the issue number if applicable.
4. Run linting and type checking locally:

```bash
pnpm lint
pnpm typecheck
```

5. If your changes touch database types, regenerate Kysely types:

```bash
pnpm codegen
```

6. Create a pull request. In the PR description:
   - Summarize the change and motivation
   - Include screenshots or code snippets if UI/UX changed
   - Provide technical details on the change

7. Address code review feedback, re-run tests/lint, and squash or clean commits if requested.

Branch naming and PR guidance:
- Use `feature/`, `bugfix/`, `optimize/` prefixes.

Coding style:
- TypeScript + React functional components
- Use existing hooks and context providers instead of reimplementing state behavior
- Prefer server-side services in `src/services/` for DB interactions

## Testing & linting

- **Tests:** `pnpm test` runs the Vitest suite (~38 files in `src/lib/__tests__/`,
  covering pure logic — status derivation, kanban columns, filters/search,
  version diff, testimony eligibility, validators, etc.). `pnpm test:watch` for
  watch mode. All tests must pass before a PR.
- **Lint:** `pnpm lint` (ESLint). Fix lint errors before submitting.
- **Types:** `pnpm typecheck`. Note the production build ignores type/lint
  errors, so run these two commands explicitly.

## Deployment notes

- Build for production: `pnpm build` then `pnpm start`.
- Ensure production has the required env vars (at least `DATABASE_URL`,
  `OPENAI_API_KEY`, `RESEND_API_KEY`, `SCRAPER_API_URL`).
- **Database migrations** run via `golang-migrate` against `src/db/migrations/`.
  `app.json` configures a Dokku `predeploy` hook (`pnpm migrate:up p`) that
  applies pending migrations on deploy.
- When deploying to a platform (Dokku, Vercel, Cloud Run, etc.), set environment
  variables in the platform settings and ensure Postgres is reachable.

## Useful links

- Architecture guide: [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)
- Conventions (for contributors & AI agents): [`CLAUDE.md`](CLAUDE.md)
- Database schema: [`docs/db/schema.md`](docs/db/schema.md)
- Migration guide: [`docs/db/migration-guide.md`](docs/db/migration-guide.md)
- Capitol API reference: [`docs/capitol-api-reference.md`](docs/capitol-api-reference.md)
- Contributing & branch/PR conventions: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Kysely codegen config: `.kysely-codegenrc.json`; migration scripts: `scripts/migrations/`

---

License

Add license information here (e.g., MIT) and include a LICENSE file at the repository root.
