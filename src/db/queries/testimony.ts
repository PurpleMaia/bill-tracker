import { sql } from 'kysely';
import { db } from '@/db/kysely/client';
import { tiptapExcerpt } from '@/lib/tiptap-text';
import { isTestimonyUrgent } from '@/lib/testimony-eligibility';
import type { BillStatus } from '@/db/types';
import type {
  TestimonyDraft,
  TestimonyDraftInput,
  TestimonyListItem,
  TestimonyPosition,
  TestimonyProspect,
  TestimonyStatus,
} from '@/types/testimony';

const POSITIONS: TestimonyPosition[] = ['support', 'oppose', 'comments'];

function normalizePosition(value: string): TestimonyPosition {
  return (POSITIONS as string[]).includes(value) ? (value as TestimonyPosition) : 'comments';
}

/** Returns the user's draft for a bill, or null if none exists yet. */
export async function getTestimonyDraft(
  userId: string,
  billId: string,
): Promise<TestimonyDraft | null> {
  const row = await db
    .selectFrom('testimonies')
    .select(['bill_id', 'author_name', 'organization', 'position', 'content_json', 'updated_at', 'submitted_at'])
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .executeTakeFirst();

  if (!row) return null;
  return {
    billId: row.bill_id,
    authorName: row.author_name,
    organization: row.organization,
    position: normalizePosition(row.position),
    contentJson: row.content_json,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
  };
}

/** Upserts the user's draft for a bill (one row per user+bill) and returns it. */
export async function upsertTestimonyDraft(
  userId: string,
  input: TestimonyDraftInput,
): Promise<TestimonyDraft> {
  const values = {
    user_id: userId,
    bill_id: input.billId,
    tenant_id: input.tenantId ?? null,
    author_name: input.authorName,
    organization: input.organization,
    position: normalizePosition(input.position),
    content_json: JSON.stringify(input.contentJson ?? {}),
    updated_at: new Date(),
    // Explicit null so a brand-new draft is not marked submitted by the
    // column's DEFAULT now(); the conflict branch leaves submitted_at alone.
    submitted_at: null,
  };

  await db
    .insertInto('testimonies')
    .values(values)
    .onConflict((oc) =>
      oc.columns(['user_id', 'bill_id']).doUpdateSet({
        tenant_id: values.tenant_id,
        author_name: values.author_name,
        organization: values.organization,
        position: values.position,
        content_json: values.content_json,
        updated_at: values.updated_at,
      }),
    )
    .execute();

  const saved = await getTestimonyDraft(userId, input.billId);
  if (!saved) throw new Error('Failed to save testimony draft');
  return saved;
}

/** Marks the user's testimony for a bill as submitted (creates the row if needed). */
export async function markTestimonySubmitted(
  userId: string,
  billId: string,
): Promise<TestimonyDraft> {
  const now = new Date();
  await db
    .insertInto('testimonies')
    .values({ user_id: userId, bill_id: billId, submitted_at: now, updated_at: now })
    .onConflict((oc) =>
      oc.columns(['user_id', 'bill_id']).doUpdateSet({ submitted_at: now, updated_at: now }),
    )
    .execute();

  const saved = await getTestimonyDraft(userId, billId);
  if (!saved) throw new Error('Failed to mark testimony as submitted');
  return saved;
}

/** Deletes the user's testimony for a bill (no-op if none exists). */
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
  const updates = await db
    .selectFrom('status_updates as su')
    .select(['su.bill_id', 'su.statustext'])
    .where('su.bill_id', 'in', billIds)
    .orderBy('su.bill_id')
    .orderBy(sql`cast(su.date as date)`, 'desc')
    .execute();
  const latestByBillId: Record<string, string> = {};
  for (const update of updates) {
    if (!(update.bill_id in latestByBillId)) latestByBillId[update.bill_id] = update.statustext;
  }
  return latestByBillId;
}

/**
 * Tracked bills with a hearing scheduled where the user has not started a
 * testimony — the "needs testimony" list. Dead and archived bills excluded.
 */
export async function listTestimonyProspects(userId: string): Promise<TestimonyProspect[]> {
  const rows = await db
    .selectFrom('user_bills as ub')
    .innerJoin('bills as b', 'b.id', 'ub.bill_id')
    .leftJoin('testimonies as t', (join) =>
      join.onRef('t.bill_id', '=', 'b.id').on('t.user_id', '=', userId),
    )
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
    ])
    .distinct()
    .where('ub.user_id', '=', userId)
    .where('t.id', 'is', null)
    .where('b.dead', '=', false)
    .where('b.archived', '=', false)
    .execute();

  const scheduled = rows.filter((row) =>
    isTestimonyUrgent((row.bill_status ?? 'unassigned') as BillStatus),
  );
  if (scheduled.length === 0) return [];

  const latestByBillId = await latestStatusTextByBillId(scheduled.map((r) => r.id));

  return scheduled.map((row) => ({
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
      't.bill_id',
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
    .execute();

  if (rows.length === 0) return [];

  const latestByBillId = await latestStatusTextByBillId(rows.map((r) => r.bill_id));

  return rows.map((row) => ({
    billId: row.bill_id,
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
  }));
}

/** Per-bill testimony progress for the user — one entry per draft. */
export async function getTestimonyStatuses(userId: string): Promise<TestimonyStatus[]> {
  const rows = await db
    .selectFrom('testimonies')
    .select(['bill_id', 'submitted_at'])
    .where('user_id', '=', userId)
    .execute();

  return rows.map((row) => ({ billId: row.bill_id, submitted: row.submitted_at !== null }));
}
