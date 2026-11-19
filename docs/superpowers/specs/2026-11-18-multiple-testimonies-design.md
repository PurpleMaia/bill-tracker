# Multiple testimonies per bill — design

## Intent

A bill can be heard several times in one session: by each committee it is
referred to in its originating chamber, again after crossover, and in
conference. Each hearing takes its own testimony. Today a user can keep only
one testimony per bill, so they overwrite their House testimony to write the
Senate one. Let a user keep one testimony per hearing round and switch between
them in the writer and on the bill's card in Your Testimonies.

## Goals / non-goals

- Goal: one testimony per (user, bill, hearing round), labeled automatically
  ("House · AGR", "Senate · AGL/WTL", "Conference").
- Goal: switch rounds in the testimony writer and on the Your Testimonies card.
- Goal: "Needs testimony" resurfaces a bill when it reaches a round the user
  has not written for.
- Non-goal: free-text naming, multiple testimonies for the same round, sharing
  testimonies across users.
- Anti-goal: losing or silently overwriting an existing testimony.

## Approaches considered

- **A. Hearing-linked (picked).** Each row stores chamber + committee, derived
  from the bill when the testimony is created. Self-labeling; lets the app know
  which round still needs testimony. Costs: round derivation, legacy rows have
  no label.
- B. Free-text label. Simpler, but the app can't tell which hearing a
  testimony belongs to, so "Needs testimony" can't resurface bills.

## Database — migration 000036

- `testimonies` already relates user ↔ bill (`user_id`, `bill_id`); no join
  table is needed. The blocker is `UNIQUE (user_id, bill_id)` from 000024 —
  drop it.
- Add `chamber text NULL CHECK (chamber IN ('house','senate','conference'))`
  and `committee text NULL` (the joint step joined with `/`, e.g. `AGL/WTL`;
  null for conference or unknown).
- Uniqueness per round: unique index on
  `(user_id, bill_id, coalesce(chamber,''), coalesce(committee,''))`.
  Builder's call: expression index instead of `NULLS NOT DISTINCT`, so it works
  on any Postgres version. Inserts can't use `ON CONFLICT` on it; creation
  looks up the existing row first and treats a unique violation as "already
  exists → return it".
- Index `(user_id, bill_id)` for per-bill lookups.
- Legacy rows keep null chamber/committee and render as "Earlier testimony".
- Down migration: delete all but the most recently updated row per
  (user_id, bill_id), drop new index/columns, restore the unique constraint.
- Update `src/db/types.ts` by hand to match.

## Round derivation (pure, `src/lib/testimony/testimony-round.ts`)

- `chamber`: originating chamber from bill number prefix (HB/HR/HCR → house,
  SB/SR/SCR → senate); flips for `crossover*` statuses; `conference*` →
  conference.
- `committee`: `bills.current_committee` joined with `/` when non-empty,
  otherwise `currentCommitteeStep(...)` computed live; null for conference.
- `roundLabel(chamber, committee)` → "House · AGR", "Conference",
  "Earlier testimony" (both null).
- Unit-tested in `src/lib/__tests__/testimony-round.test.ts`.

## Data layer

- `db/queries/testimony.ts`: operations keyed by testimony id and always
  filtered by `user_id` (ownership): `getTestimony`, `updateTestimony`,
  `markTestimonySubmittedById`, `deleteTestimonyById`, plus
  `listBillTestimonies(userId, billId)` (rounds for the switcher) and
  `createTestimonyForCurrentRound(userId, billId, tenantId, copyFromId?)`.
- `TestimonyDraft` gains `id`, `chamber`, `committee`, `label`.
- Data-client `testimony` domain gains `getById`, `listForBill`, `create`,
  `update`, `markSubmittedById`, `removeById` (action + fetch arms).
  New routes: `/api/testimony/[testimonyId]` (GET/PUT/PATCH/DELETE) and
  `/api/bills/[id]/testimonies` (GET list, POST create). Old bill-keyed routes
  and actions stay (CLAUDE.md) and act on the newest testimony for the bill.
- `listUserTestimonies` returns one item per testimony (with id/label);
  the view groups by bill.
- `getTestimonyStatuses`: per bill, 'draft' if any round unsubmitted, else
  'submitted'.
- `listTestimonyProspects`: a scheduled bill is a prospect when the user has no
  testimony for its current round (compared in JS after computing the round).

## Writer (`/bills/[id]/testimony?t=<id>`)

- No `t`: open the testimony for the current round if one exists, else the
  newest; if the user has none, create one for the current round (as today a
  first visit starts a draft).
- Header gets a round dropdown: each testimony with a submitted/draft dot, plus
  "New for <current round>" when the current round has none. New round
  testimony starts as a copy of the most recent one (header + body, not
  submitted) — builder's call, since most people revise rather than rewrite.
- Switching flushes pending autosave first, then swaps via `router.replace`.

## Your Testimonies card

- Still one card per bill. When the bill has more than one testimony, a row of
  small pills (round label + state) switches the excerpt, state, deadline,
  action label, and menu actions (copy/delete) to the selected testimony; the
  card link opens `?t=<selected id>`. Default selection: newest.
- Drafts/Submitted filters apply per testimony: a bill shows if any of its
  testimonies match, with pills limited to the matching ones.

## Left to the builder

Exact pill/dropdown styling (follow existing chip styles; no left-edge accent
strips), copy text, loading states.
