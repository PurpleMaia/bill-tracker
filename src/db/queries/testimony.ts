import { sql } from 'kysely';
import { db } from '@/db/kysely/client';
import { tiptapExcerpt } from '@/lib/testimony/tiptap-text';
import { SCHEDULED_STATUSES } from '@/lib/testimony/testimony-eligibility';
import { ApiError } from '@/lib/core/errors';
import {
  coversRound,
  currentTestimonyRound,
  roundLabel,
  sameRound,
  type TestimonyChamber,
  type TestimonyRound,
} from '@/lib/testimony/testimony-round';
import type {
  TestimonyCreateInput,
  TestimonyDraft,
  TestimonyDraftInput,
  TestimonyUpdateInput,
  TestimonyListItem,
  TestimonyPosition,
  TestimonyProspect,
  TestimonyStatus,
} from '@/types/testimony';

const POSITIONS: TestimonyPosition[] = ['support', 'oppose', 'comments'];

function normalizePosition(value: string): TestimonyPosition {
  return (POSITIONS as string[]).includes(value) ? (value as TestimonyPosition) : 'comments';
}

const DRAFT_COLUMNS = [
  'id',
  'bill_id',
  'chamber',
  'committee',
  'author_name',
  'organization',
  'position',
  'content_json',
  'updated_at',
  'submitted_at',
] as const;

function toChamber(value: string | null): TestimonyChamber | null {
  return value === 'house' || value === 'senate' || value === 'conference' ? value : null;
}

function toRound(row: { chamber: string | null; committee: string | null }): TestimonyRound {
  return { chamber: toChamber(row.chamber), committee: row.committee };
}

function toDraft(row: {
  id: string;
  bill_id: string;
  chamber: string | null;
  committee: string | null;
  author_name: string;
  organization: string;
  position: string;
  content_json: unknown;
  updated_at: Date | string | null;
  submitted_at: Date | string | null;
}): TestimonyDraft {
  const round = toRound(row);
  return {
    id: row.id,
    billId: row.bill_id,
    chamber: round.chamber,
    committee: round.committee,
    label: roundLabel(round),
    authorName: row.author_name,
    organization: row.organization,
    position: normalizePosition(row.position),
    contentJson: row.content_json,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
  };
}

const NOT_FOUND = () => new ApiError('NOT_FOUND', 404, 'Testimony not found');

/** One of the user's testimonies by id, or null if it doesn't exist or isn't theirs. */
export async function getTestimonyById(
  userId: string,
  testimonyId: string,
): Promise<TestimonyDraft | null> {
  const row = await db
    .selectFrom('testimonies')
    .select(DRAFT_COLUMNS)
    .where('id', '=', testimonyId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return row ? toDraft(row) : null;
}

/** All of the user's testimonies for a bill (one per hearing round), newest edit first. */
export async function listBillTestimonies(userId: string, billId: string): Promise<TestimonyDraft[]> {
  const rows = await db
    .selectFrom('testimonies')
    .select(DRAFT_COLUMNS)
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map(toDraft);
}

/** The hearing round a bill is in right now, read from the DB. Throws 404 for an unknown bill. */
async function billCurrentRound(billId: string): Promise<TestimonyRound> {
  const bill = await db
    .selectFrom('bills')
    .select(['bill_number', 'bill_status', 'current_committee', 'committee_assignment', 'dead'])
    .where('id', '=', billId)
    .executeTakeFirst();
  if (!bill) throw new ApiError('NOT_FOUND', 404, 'Bill not found');
  const updates = await db
    .selectFrom('status_updates')
    .select('statustext')
    .where('bill_id', '=', billId)
    .execute();
  return currentTestimonyRound({
    billNumber: bill.bill_number ?? '',
    billStatus: bill.bill_status,
    currentCommittee: bill.current_committee,
    committeeAssignment: bill.committee_assignment,
    updates,
    dead: bill.dead,
  });
}

async function findRoundTestimony(
  userId: string,
  billId: string,
  round: TestimonyRound,
): Promise<TestimonyDraft | null> {
  const all = await listBillTestimonies(userId, billId);
  return all.find((t) => sameRound(t, round)) ?? null;
}

/**
 * Starts the user's testimony for the bill's current hearing round, or returns
 * the existing one for that round. Copies header + body from `copyFromId` when
 * it is one of the user's own testimonies. A concurrent create for the same
 * round (two tabs) hits the unique index and resolves to the winner's row.
 */
export async function createTestimonyForCurrentRound(
  userId: string,
  input: TestimonyCreateInput,
): Promise<TestimonyDraft> {
  const round = await billCurrentRound(input.billId);
  const existing = await findRoundTestimony(userId, input.billId, round);
  if (existing) return existing;

  const source = input.copyFromId ? await getTestimonyById(userId, input.copyFromId) : null;
  const now = new Date();
  try {
    const row = await db
      .insertInto('testimonies')
      .values({
        user_id: userId,
        bill_id: input.billId,
        tenant_id: input.tenantId ?? null,
        chamber: round.chamber,
        committee: round.committee,
        author_name: source?.authorName ?? input.authorName ?? '',
        organization: source?.organization ?? '',
        position: source?.position ?? 'comments',
        content_json: JSON.stringify(source?.contentJson ?? {}),
        created_at: now,
        updated_at: now,
        // Explicit null so a new testimony is not marked submitted by the column's DEFAULT now().
        submitted_at: null,
      })
      .returning(DRAFT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toDraft(row);
  } catch (error: any) {
    if (error?.code !== '23505') throw error;
    const winner = await findRoundTestimony(userId, input.billId, round);
    if (!winner) throw error;
    return winner;
  }
}

/** Saves header + body of one of the user's testimonies. Throws 404 if it isn't theirs. */
export async function updateTestimony(
  userId: string,
  testimonyId: string,
  input: TestimonyUpdateInput,
): Promise<TestimonyDraft> {
  const row = await db
    .updateTable('testimonies')
    .set({
      tenant_id: input.tenantId ?? null,
      author_name: input.authorName,
      organization: input.organization,
      position: normalizePosition(input.position),
      content_json: JSON.stringify(input.contentJson ?? {}),
      updated_at: new Date(),
    })
    .where('id', '=', testimonyId)
    .where('user_id', '=', userId)
    .returning(DRAFT_COLUMNS)
    .executeTakeFirst();
  if (!row) throw NOT_FOUND();
  return toDraft(row);
}

/** Marks one of the user's testimonies as submitted. Throws 404 if it isn't theirs. */
export async function markTestimonySubmittedById(
  userId: string,
  testimonyId: string,
): Promise<TestimonyDraft> {
  const now = new Date();
  const row = await db
    .updateTable('testimonies')
    .set({ submitted_at: now, updated_at: now })
    .where('id', '=', testimonyId)
    .where('user_id', '=', userId)
    .returning(DRAFT_COLUMNS)
    .executeTakeFirst();
  if (!row) throw NOT_FOUND();
  return toDraft(row);
}

/** Deletes one of the user's testimonies (no-op if it doesn't exist or isn't theirs). */
export async function deleteTestimonyById(userId: string, testimonyId: string): Promise<void> {
  await db
    .deleteFrom('testimonies')
    .where('id', '=', testimonyId)
    .where('user_id', '=', userId)
    .execute();
}

// ---- Legacy bill-keyed operations (old routes/actions). They act on the
// user's most recently edited testimony for the bill. ----

/** The user's most recently edited testimony for a bill, or null if none exists yet. */
export async function getTestimonyDraft(
  userId: string,
  billId: string,
): Promise<TestimonyDraft | null> {
  const [newest] = await listBillTestimonies(userId, billId);
  return newest ?? null;
}

/** Saves into the newest testimony for the bill, starting one for the current round if none exists. */
export async function upsertTestimonyDraft(
  userId: string,
  input: TestimonyDraftInput,
): Promise<TestimonyDraft> {
  const target =
    (await getTestimonyDraft(userId, input.billId)) ??
    (await createTestimonyForCurrentRound(userId, { billId: input.billId, tenantId: input.tenantId }));
  const { billId: _billId, ...update } = input;
  return updateTestimony(userId, target.id, update);
}

/** Marks the newest testimony for the bill as submitted (starting one if none exists). */
export async function markTestimonySubmitted(
  userId: string,
  billId: string,
): Promise<TestimonyDraft> {
  const target =
    (await getTestimonyDraft(userId, billId)) ??
    (await createTestimonyForCurrentRound(userId, { billId }));
  return markTestimonySubmittedById(userId, target.id);
}

/** Deletes all of the user's testimonies for a bill (no-op if none exist). */
export async function deleteTestimony(userId: string, billId: string): Promise<void> {
  await db
    .deleteFrom('testimonies')
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .execute();
}

/** Latest scraped status update per bill, for hearing-datetime parsing. */
async function latestStatusTextByBillId(billIds: string[]): Promise<Record<string, string>> {
  if (billIds.length === 0) return {};
  // DISTINCT ON returns exactly one row per bill; id DESC breaks ties
  // deterministically when several updates share the most recent date.
  const updates = await db
    .selectFrom('status_updates as su')
    .distinctOn('su.bill_id')
    .select(['su.bill_id', 'su.statustext'])
    .where('su.bill_id', 'in', billIds)
    .orderBy('su.bill_id')
    .orderBy(sql`cast(su.date as date)`, 'desc')
    .orderBy('su.id', 'desc')
    .execute();
  const latestByBillId: Record<string, string> = {};
  for (const update of updates) {
    latestByBillId[update.bill_id] = update.statustext;
  }
  return latestByBillId;
}

/**
 * Tracked bills with a hearing scheduled where the user has no testimony for
 * the bill's CURRENT hearing round — the "needs testimony" list. A bill the
 * user testified on in the House comes back once it is heard in the Senate.
 * Dead and archived bills excluded.
 */
export async function listTestimonyProspects(userId: string): Promise<TestimonyProspect[]> {
  const rows = await db
    .selectFrom('user_bills as ub')
    .innerJoin('bills as b', 'b.id', 'ub.bill_id')
    .select([
      'b.id',
      'b.bill_number',
      'b.bill_title',
      'b.nickname',
      'b.description',
      'b.bill_url',
      'b.year',
      'b.bill_status',
      'b.committee_assignment',
      'b.current_committee',
      'b.dead',
    ])
    .distinct()
    .where('ub.user_id', '=', userId)
    .where('b.dead', '=', false)
    .where('b.archived', '=', false)
    .where('b.bill_status', 'in', SCHEDULED_STATUSES)
    .execute();

  if (rows.length === 0) return [];
  const billIds = rows.map((r) => r.id);

  const [latestByBillId, updates, written] = await Promise.all([
    latestStatusTextByBillId(billIds),
    db.selectFrom('status_updates').select(['bill_id', 'statustext']).where('bill_id', 'in', billIds).execute(),
    db
      .selectFrom('testimonies')
      .select(['bill_id', 'chamber', 'committee'])
      .where('user_id', '=', userId)
      .where('bill_id', 'in', billIds)
      .execute(),
  ]);

  const updatesByBill = new Map<string, { statustext: string }[]>();
  for (const u of updates) {
    const list = updatesByBill.get(u.bill_id) ?? [];
    list.push(u);
    updatesByBill.set(u.bill_id, list);
  }

  return rows
    .filter((row) => {
      const round = currentTestimonyRound({
        billNumber: row.bill_number ?? '',
        billStatus: row.bill_status,
        currentCommittee: row.current_committee,
        committeeAssignment: row.committee_assignment,
        updates: updatesByBill.get(row.id) ?? [],
        dead: row.dead,
      });
      return !coversRound(written.filter((t) => t.bill_id === row.id).map(toRound), round);
    })
    .map((row) => ({
      billId: row.id,
      billNumber: row.bill_number ?? '',
      billTitle: row.bill_title,
      nickname: row.nickname,
      description: row.description,
      billUrl: row.bill_url,
      year: row.year,
      billStatus: row.bill_status ?? 'unassigned',
      committeeAssignment: row.committee_assignment,
      latestStatusText: latestByBillId[row.id] ?? null,
    }));
}

/**
 * All of the user's testimonies with the bill context the Testimonies page
 * needs — drafts first (newest edit first), then submitted (newest first).
 */
export async function listUserTestimonies(userId: string): Promise<TestimonyListItem[]> {
  const rows = await db
    .selectFrom('testimonies as t')
    .innerJoin('bills as b', 'b.id', 't.bill_id')
    .select([
      't.id',
      't.bill_id',
      't.chamber',
      't.committee',
      't.position',
      't.author_name',
      't.organization',
      't.content_json',
      't.updated_at',
      't.submitted_at',
      'b.bill_number',
      'b.bill_title',
      'b.nickname',
      'b.bill_url',
      'b.year',
      'b.bill_status',
      'b.committee_assignment',
      'b.dead',
    ])
    .where('t.user_id', '=', userId)
    .orderBy(sql`t.submitted_at IS NULL`, 'desc')
    .orderBy(sql`coalesce(t.submitted_at, t.updated_at)`, 'desc')
    .orderBy('t.id', 'desc')
    .execute();

  if (rows.length === 0) return [];

  const latestByBillId = await latestStatusTextByBillId(rows.map((r) => r.bill_id));

  return rows.map((row) => {
    const round = toRound(row);
    return {
      id: row.id,
      billId: row.bill_id,
      chamber: round.chamber,
      committee: round.committee,
      label: roundLabel(round),
      billNumber: row.bill_number ?? '',
      billTitle: row.bill_title,
      nickname: row.nickname,
      billUrl: row.bill_url,
      year: row.year,
      billStatus: row.bill_status ?? 'unassigned',
      committeeAssignment: row.committee_assignment,
      dead: row.dead,
      position: normalizePosition(row.position),
      authorName: row.author_name,
      organization: row.organization,
      excerpt: tiptapExcerpt(row.content_json),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      latestStatusText: latestByBillId[row.bill_id] ?? null,
    };
  });
}

/**
 * Per-bill testimony progress for the user — one entry per bill. A bill is
 * 'submitted' only when every one of its hearing-round testimonies is.
 */
export async function getTestimonyStatuses(userId: string): Promise<TestimonyStatus[]> {
  const rows = await db
    .selectFrom('testimonies')
    .select(['bill_id', 'submitted_at'])
    .where('user_id', '=', userId)
    .execute();

  const submittedByBill = new Map<string, boolean>();
  for (const row of rows) {
    submittedByBill.set(row.bill_id, (submittedByBill.get(row.bill_id) ?? true) && row.submitted_at !== null);
  }
  return Array.from(submittedByBill, ([billId, submitted]) => ({ billId, submitted }));
}

/**
 * Of the given billIds, which have at least one testimony written by anyone
 * in this org. The org-level "testimony written" signal for Active Boards
 * (distinct from the per-user getTestimonyStatuses).
 */
export async function getOrgTestimonyBillIds(
  tenantId: string,
  billIds: string[],
): Promise<string[]> {
  if (billIds.length === 0) return [];
  const rows = await db
    .selectFrom('testimonies')
    .select('bill_id')
    .distinct()
    .where('tenant_id', '=', tenantId)
    .where('bill_id', 'in', billIds)
    .execute();
  return rows.map((r) => r.bill_id);
}
