import { db } from '@/db/kysely/client';
import type { TestimonyDraft, TestimonyDraftInput, TestimonyPosition } from '@/types/testimony';

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
    .select(['bill_id', 'author_name', 'organization', 'position', 'content_json', 'updated_at'])
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
