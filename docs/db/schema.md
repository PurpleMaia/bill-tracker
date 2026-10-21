# Database Schema

> **Source of truth:** this document is written by hand, but the authoritative
> schema is the generated file [`src/db/types.ts`](../../src/db/types.ts)
> (produced by `kysely-codegen` — run `pnpm codegen`) plus the SQL migrations in
> [`src/db/migrations/`](../../src/db/migrations). If this doc and `types.ts`
> ever disagree, `types.ts` wins. After changing the schema (a new migration),
> run `pnpm codegen` and update this file.

PostgreSQL. All IDs are `uuid` unless noted (a few legacy tables use `serial`).
`Generated<>` marks columns the database fills in (defaults, `DEFAULT
gen_random_uuid()`, `DEFAULT now()`), so inserts may omit them.

## Table of contents

- [Auth & identity](#auth--identity): `user`, `auth_key`, `sessions`, `password_reset_tokens`
- [Multi-tenancy](#multi-tenancy): `tenants`, `members`, `invite_tokens`, `org_follows`
- [Bills & tracking](#bills--tracking): `bills`, `user_bills`, `org_bills`, `status_updates`, `user_bill_preferences`, `user_preferences`
- [Tags](#tags): `tags`, `bill_tags`
- [Proposals & supervision](#proposals--supervision): `pending_proposals`, `supervisor_users`
- [Bill versions & reports](#bill-versions--reports): `bill_versions`, `committee_reports`
- [Legislators & committees](#legislators--committees): `legislators`, `committees`, `committee_chairs`
- [Testimony](#testimony): `testimonies`
- [Operational](#operational): `scraping_stats`, `schema_migrations`
- [Foreign keys summary](#foreign-keys-summary)
- [Enumerated types](#enumerated-types)

---

## Auth & identity

### user
The `user` table is quoted (`"user"`) in SQL because `user` is a reserved word.

| Column                | Type                    | Notes                                              |
| --------------------- | ----------------------- | -------------------------------------------------- |
| id                    | uuid PK (Generated)     |                                                    |
| username              | text                    |                                                    |
| email                 | text                    |                                                    |
| account_status        | text                    | e.g. `active` / `suspended`                        |
| system_role           | enum `Sysrole`          | `sysadmin` \| `user` — global role                 |
| role                  | text (Generated)        | **Legacy** org-ish role (`admin`/`supervisor`/`user`); being phased out in favor of `system_role` + per-org `members.org_role` |
| requested_admin       | boolean (Generated)     | user asked to be an org admin                      |
| requested_supervisor  | boolean \| null (Gen.)  |                                                    |
| email_verified        | boolean \| null (Gen.)  |                                                    |
| verification_token    | text \| null            | email-verification token                           |
| auth_provider         | text \| null (Gen.)     | e.g. `password` / `google`                         |
| google_id             | text \| null            | set for Google-OAuth accounts                      |
| profile_picture_url   | text \| null            |                                                    |
| created_at            | timestamp \| null (Gen.)|                                                    |

### auth_key
Password (and Google refresh token) storage, one row per user.

| Column                | Type                    | Notes                        |
| --------------------- | ----------------------- | ---------------------------- |
| id                    | uuid PK (Generated)     |                              |
| user_id               | uuid \| null FK         | → `user.id`                  |
| hashed_password       | text \| null            | bcrypt hash                  |
| google_refresh_token  | text \| null            |                              |
| created_at            | timestamp \| null (Gen.)|                              |

### sessions
Custom session store (see `src/lib/auth/session.ts`). The cookie holds a raw
token; this table stores the value it is matched against.

| Column         | Type                     | Notes         |
| -------------- | ------------------------ | ------------- |
| id             | uuid PK (Generated)      |               |
| user_id        | uuid \| null FK          | → `user.id`   |
| session_token  | text                     |               |
| expires_at     | timestamp                |               |
| created_at     | timestamp \| null (Gen.) |               |

### password_reset_tokens
Backs the forgot-password flow. Only a hash of the token is stored.

| Column      | Type                 | Notes                    |
| ----------- | -------------------- | ------------------------ |
| id          | uuid PK (Generated)  |                          |
| user_id     | uuid FK              | → `user.id` (CASCADE)    |
| token_hash  | text                 |                          |
| expires_at  | timestamp            |                          |
| used_at     | timestamp \| null    | set once redeemed        |
| created_at  | timestamp (Generated)|                          |

---

## Multi-tenancy

### tenants
An organization. Each has its own members, tracked bills, tags, and statuses.

| Column           | Type                     | Notes                                          |
| ---------------- | ------------------------ | ---------------------------------------------- |
| id               | uuid PK (Generated)      |                                                |
| name             | text                     |                                                |
| slug             | text                     | URL-friendly identifier                        |
| description      | text (Generated)         | shown on the org's public board                |
| public_board     | boolean (Generated)      | if true, the org's board is viewable publicly  |
| branding_config  | jsonb \| null            | per-org branding (colors, logo, …)             |
| created_at       | timestamp \| null (Gen.) |                                                |

### members
Join table linking users to tenants, with a per-org role.

| Column      | Type                     | Notes                          |
| ----------- | ------------------------ | ------------------------------ |
| id          | uuid PK (Generated)      |                                |
| tenant_id   | uuid FK                  | → `tenants.id`                 |
| user_id     | uuid FK                  | → `user.id`                    |
| org_role    | enum `OrgRole` (Gen.)    | `admin` \| `worker`            |
| created_at  | timestamp \| null (Gen.) |                                |

### invite_tokens
Email invitations to join a tenant. Claimed atomically at registration.

| Column      | Type                     | Notes                                     |
| ----------- | ------------------------ | ----------------------------------------- |
| id          | uuid PK (Generated)      |                                           |
| tenant_id   | uuid FK                  | → `tenants.id`                            |
| email       | text                     | invitee's email (must match at register)  |
| token       | text                     |                                           |
| status      | text (Generated)         | `pending` → `accepted` / expired          |
| invited_by  | uuid FK                  | → `user.id` (CASCADE)                     |
| expires_at  | timestamp                |                                           |
| accepted_at | timestamp \| null        |                                           |
| created_at  | timestamp \| null (Gen.) |                                           |

### org_follows
A user "following" a public org board (without being a member).

| Column      | Type                | Notes           |
| ----------- | ------------------- | --------------- |
| id          | uuid PK (Generated) |                 |
| tenant_id   | uuid FK             | → `tenants.id`  |
| user_id     | uuid FK             | → `user.id`     |
| created_at  | timestamp (Generated)|                |

---

## Bills & tracking

### bills
Global bill records scraped from the Hawaii Legislature. Not tenant-scoped —
organizations relate to bills through `user_bills` / `org_bills`.

| Column                   | Type                      | Notes                                                    |
| ------------------------ | ------------------------- | -------------------------------------------------------- |
| id                       | uuid PK (Generated)       |                                                          |
| bill_number              | text \| null              | e.g. `HB1494`                                            |
| bill_title               | text \| null              |                                                          |
| bill_url                 | text                      | canonical capitol.hawaii.gov URL                         |
| description              | text                      |                                                          |
| introducer               | text \| null              |                                                          |
| committee_assignment     | text \| null              | ordered committee list; **first = met first** (referral order) |
| current_status_string    | text                      | raw status text from the scraper                         |
| bill_status              | enum `BillStatus` \| null (Gen.) | **derived public status** (see `deriveBillStatus`) |
| ai_status                | enum `BillStatus` \| null | LLM's classification (the floor for derivation)          |
| ai_misclassification_type| enum `AiMisclassification` \| null | `false_negative` \| `false_positive` (feedback)  |
| food_related             | boolean \| null (Gen.)    | AI-flagged; public users see only food-related bills     |
| dead                     | boolean (Generated)       | missed a legislative deadline (see `dead-bill.ts`)       |
| archived                 | boolean (Generated)       | hidden at end of session                                 |
| nickname                 | text \| null              | global nickname (per-user override in `user_bill_preferences`) |
| year                     | integer \| null           | session year                                             |
| created_at               | timestamp \| null (Gen.)  |                                                          |
| updated_at               | timestamp \| null (Gen.)  |                                                          |

### user_bills
Which user tracks which bill, scoped to a tenant. **Note:** `tenant_id` is
nullable and a large fraction of legacy rows have `tenant_id = NULL` — strict
tenant-scoped queries can miss them (see `docs/architecture/ARCHITECTURE.md`).
A unique index (migration 000032) prevents duplicate `(user, bill, tenant)`
tracking.

| Column      | Type                     | Notes                              |
| ----------- | ------------------------ | ---------------------------------- |
| id          | uuid PK (Generated)      |                                    |
| user_id     | uuid \| null FK          | → `user.id`                        |
| bill_id     | uuid \| null FK          | → `bills.id`                       |
| tenant_id   | uuid \| null FK          | → `tenants.id` (org scope)         |
| adopted_at  | timestamp \| null (Gen.) | when the bill was tracked          |

### org_bills
Each organization's own status for a bill. The set of org statuses for a bill
feeds the derived public `bills.bill_status`.

| Column      | Type                        | Notes                     |
| ----------- | --------------------------- | ------------------------- |
| bill_id     | uuid FK                     | → `bills.id`              |
| tenant_id   | uuid FK                     | → `tenants.id`            |
| bill_status | enum `BillStatus` (Gen.)    | this org's status         |
| updated_at  | timestamp \| null (Gen.)    |                           |

### status_updates
Individual status lines scraped for a bill (the newest ~10 feed the LLM).

| Column      | Type                | Notes         |
| ----------- | ------------------- | ------------- |
| id          | uuid PK (Generated) |               |
| bill_id     | uuid FK             | → `bills.id`  |
| chamber     | text                | `H` / `S`     |
| date        | text                |               |
| statustext  | text                |               |

### user_bill_preferences
Per-user overrides for a bill (currently just a nickname). Unique on
`(user_id, bill_id)`.

| Column      | Type                | Notes        |
| ----------- | ------------------- | ------------ |
| id          | uuid PK (Generated) |              |
| user_id     | uuid FK             | → `user.id`  |
| bill_id     | uuid FK             | → `bills.id` |
| nickname    | text                |              |
| created_at  | timestamp (Generated)|             |
| updated_at  | timestamp (Generated)|             |

### user_preferences
Per-user app settings (one row per user; `user_id` is the PK).

| Column               | Type                 | Notes                                  |
| -------------------- | -------------------- | -------------------------------------- |
| user_id              | uuid PK FK           | → `user.id` (CASCADE)                  |
| ai_opt_in            | boolean (Generated)  | opt in to AI features                  |
| kanban_detailed_view | boolean (Generated)  | detailed vs. simplified board columns  |
| created_at           | timestamp (Generated)|                                        |
| updated_at           | timestamp (Generated)|                                        |

---

## Tags
Tags are **tenant-scoped**: a bill can carry different tags per organization.

### tags

| Column      | Type                 | Notes            |
| ----------- | -------------------- | ---------------- |
| id          | uuid PK (Generated)  |                  |
| name        | text                 |                  |
| color       | text \| null         |                  |
| tenant_id   | uuid FK              | → `tenants.id`   |
| created_at  | timestamp (Generated)|                  |
| updated_at  | timestamp (Generated)|                  |

### bill_tags
Join table between bills and tags.

| Column      | Type                 | Notes         |
| ----------- | -------------------- | ------------- |
| id          | uuid PK (Generated)  |               |
| bill_id     | text                 | → `bills.id`  |
| tag_id      | text                 | → `tags.id` (CASCADE) |
| created_at  | timestamp (Generated)|               |

---

## Proposals & supervision

### pending_proposals
A worker-proposed status change awaiting admin approval (workers cannot commit
status directly).

| Column                | Type                     | Notes                                    |
| --------------------- | ------------------------ | ---------------------------------------- |
| id                    | uuid PK (Generated)      |                                          |
| bill_id               | uuid FK                  | → `bills.id`                             |
| tenant_id             | uuid \| null FK          | → `tenants.id`                           |
| current_status        | text                     | status when proposed                     |
| proposed_status       | text                     | requested status                         |
| note                  | text \| null             |                                          |
| approval_status       | text \| null (Generated) | `pending` / `approved` / `rejected`      |
| proposed_by_user_id   | uuid FK                  | → `user.id`                              |
| approved_by_user_id   | uuid \| null FK          | → `user.id`                              |
| proposed_at           | timestamp (Generated)    |                                          |
| approved_at           | timestamp \| null        |                                          |

### supervisor_users
Supervisor → worker relationships (legacy supervision model).

| Column         | Type                 | Notes                        |
| -------------- | -------------------- | ---------------------------- |
| id             | uuid PK (Generated)  |                              |
| supervisor_id  | uuid FK              | → `user.id` (CASCADE)        |
| user_id        | uuid FK              | → `user.id` (the worker)     |
| created_at     | timestamp (Generated)|                              |

---

## Bill versions & reports
Both back the "Versions & Reports" tab. Each stores a document link plus an
optional AI summary with provenance (`summary_prompt_version`,
`summary_generated_at`).

### bill_versions

| Column                  | Type                     | Notes                                   |
| ----------------------- | ------------------------ | --------------------------------------- |
| id                      | uuid PK (Generated)      |                                         |
| bill_id                 | uuid FK                  | → `bills.id`                            |
| label                   | text                     | e.g. `HD1`, `SD2`, `CD1`                |
| html_link               | text \| null             |                                         |
| pdf_link                | text \| null             |                                         |
| original_text           | text \| null             | extracted plain text                    |
| ai_summary              | text \| null             |                                         |
| summary_prompt_version  | text \| null             | which prompt produced the summary       |
| summary_generated_at    | timestamp \| null        |                                         |
| created_at              | timestamp \| null (Gen.) |                                         |
| updated_at              | timestamp \| null (Gen.) |                                         |

### committee_reports

| Column                  | Type                     | Notes                          |
| ----------------------- | ------------------------ | ------------------------------ |
| id                      | uuid PK (Generated)      |                                |
| bill_id                 | uuid FK                  | → `bills.id`                   |
| label                   | text                     |                                |
| report_code             | text \| null             | e.g. `HSCR123`                 |
| html_link               | text \| null             |                                |
| pdf_link                | text \| null             |                                |
| original_text           | text \| null             |                                |
| ai_summary              | text \| null             |                                |
| summary_prompt_version  | text \| null             |                                |
| summary_generated_at    | timestamp \| null        |                                |
| created_at              | timestamp \| null (Gen.) |                                |
| updated_at              | timestamp \| null (Gen.) |                                |

---

## Legislators & committees

### legislators

| Column      | Type                     | Notes                          |
| ----------- | ------------------------ | ------------------------------ |
| id          | uuid PK (Generated)      |                                |
| member_id   | text                     | capitol member identifier      |
| first_name  | text \| null             |                                |
| last_name   | text \| null             |                                |
| chamber     | text \| null             | `House` / `Senate`             |
| district    | integer \| null          |                                |
| area        | text \| null             |                                |
| party       | text \| null             |                                |
| email       | text \| null             |                                |
| phone       | text \| null             |                                |
| room        | text \| null             |                                |
| in_office   | boolean (Generated)      |                                |
| term_ended  | timestamp \| null        |                                |
| created_at  | timestamp (Generated)    |                                |
| updated_at  | timestamp (Generated)    |                                |

### committees

| Column      | Type                     | Notes                     |
| ----------- | ------------------------ | ------------------------- |
| id          | uuid PK (Generated)      |                           |
| acronym     | text                     | e.g. `FIN`, `WAM`         |
| name        | text                     |                           |
| chamber     | text \| null             |                           |
| is_active   | boolean (Generated)      |                           |
| created_at  | timestamp \| null (Gen.) |                           |
| updated_at  | timestamp \| null (Gen.) |                           |

### committee_chairs
Which legislator chairs which committee (used to route legislator-contact
outreach when a bill is awaiting a hearing).

| Column         | Type                     | Notes                        |
| -------------- | ------------------------ | ---------------------------- |
| id             | uuid PK (Generated)      |                              |
| committee_id   | uuid FK                  | → `committees.id` (CASCADE)  |
| legislator_id  | uuid FK                  | → `legislators.id`           |
| role           | text                     | e.g. `chair` / `vice`        |
| is_active      | boolean (Generated)      |                              |
| started_at     | timestamp (Generated)    |                              |
| ended_at       | timestamp \| null        |                              |
| created_at     | timestamp \| null (Gen.) |                              |
| updated_at     | timestamp \| null (Gen.) |                              |

---

## Testimony
Rich-text testimony drafted in the app (Tiptap JSON), optionally submitted.

### testimonies

| Column        | Type                     | Notes                                     |
| ------------- | ------------------------ | ----------------------------------------- |
| id            | uuid PK (Generated)      |                                           |
| bill_id       | uuid FK                  | → `bills.id`                              |
| user_id       | uuid FK                  | → `user.id`                               |
| tenant_id     | uuid \| null FK          | → `tenants.id`                            |
| author_name   | text (Generated)         |                                           |
| organization  | text (Generated)         |                                           |
| position      | text (Generated)         | `support` / `oppose` / `comments`         |
| content_json  | jsonb (Generated)        | Tiptap document                           |
| submitted_at  | timestamp \| null (Gen.) | null while a draft                        |
| created_at    | timestamp (Generated)    |                                           |
| updated_at    | timestamp (Generated)    |                                           |

---

## Operational

### scraping_stats
One row per scrape run (health/telemetry for the ingest job).

| Column           | Type                     | Notes         |
| ---------------- | ------------------------ | ------------- |
| id               | uuid PK (Generated)      |               |
| last_scrape_time | timestamp                |               |
| bills_scraped    | integer \| null (Gen.)   |               |
| success          | boolean \| null (Gen.)   |               |
| error_message    | text \| null             |               |
| created_at       | timestamp \| null (Gen.) |               |

### schema_migrations
Managed by the `golang-migrate` CLI — **do not edit by hand.**

| Column  | Type    | Notes                                   |
| ------- | ------- | --------------------------------------- |
| version | int8    | current migration version               |
| dirty   | boolean | true if a migration failed partway (see `pnpm migrate:force`) |

---

## Foreign keys summary

Grouped by referenced table (all `ON DELETE CASCADE` unless noted):

**→ `user.id`**
- `auth_key.user_id`, `sessions.user_id`, `password_reset_tokens.user_id`
- `members.user_id`, `org_follows.user_id`, `invite_tokens.invited_by`
- `user_bills.user_id`, `user_bill_preferences.user_id`, `user_preferences.user_id`
- `pending_proposals.proposed_by_user_id`, `pending_proposals.approved_by_user_id` (no cascade)
- `supervisor_users.supervisor_id`, `supervisor_users.user_id`
- `testimonies.user_id`

**→ `tenants.id`**
- `members.tenant_id`, `invite_tokens.tenant_id`, `org_follows.tenant_id`
- `tags.tenant_id`, `org_bills.tenant_id`
- `user_bills.tenant_id` (`ON DELETE SET NULL`), `pending_proposals.tenant_id`, `testimonies.tenant_id`

**→ `bills.id`**
- `user_bills.bill_id`, `org_bills.bill_id`, `status_updates.bill_id`
- `bill_tags.bill_id`, `user_bill_preferences.bill_id`
- `bill_versions.bill_id`, `committee_reports.bill_id`
- `pending_proposals.bill_id`, `testimonies.bill_id`

**→ others**
- `bill_tags.tag_id` → `tags.id`
- `committee_chairs.committee_id` → `committees.id`
- `committee_chairs.legislator_id` → `legislators.id`

---

## Enumerated types

Postgres enums surfaced in `src/db/types.ts`:

- **`Sysrole`** — `sysadmin` | `user` (global role on `user.system_role`)
- **`OrgRole`** — `admin` | `worker` (per-org role on `members.org_role`)
- **`AiMisclassification`** — `false_negative` | `false_positive`
- **`BillStatus`** — the full legislative pipeline. Non-deferred values also
  appear as Kanban columns (see `src/lib/bills/kanban-columns.ts`); deferred
  values are mapped to a pipeline position for status derivation:
  `unassigned`, `introduced`, `scheduled1`, `deferred1`, `waiting2`,
  `scheduled2`, `deferred2`, `waiting3`, `scheduled3`, `deferred3`,
  `crossoverWaiting1`, `crossoverScheduled1`, `crossoverDeferred1`,
  `crossoverWaiting2`, `crossoverScheduled2`, `crossoverDeferred2`,
  `crossoverWaiting3`, `crossoverScheduled3`, `crossoverDeferred3`,
  `passedCommittees`, `conferenceAssigned`, `conferenceScheduled`,
  `conferenceDeferred`, `conferencePassed`, `transmittedGovernor`, `vetoList`,
  `governorSigns`, `lawWithoutSignature`.
