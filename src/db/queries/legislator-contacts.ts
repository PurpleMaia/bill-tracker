import { db } from '@/db/kysely/client';
import { ApiError } from '@/lib/core/errors';
import { fullNameOrUsername } from '@/lib/auth/profile';
import { isUuid } from '@/lib/bills/search-params';
import { MAX_CONTACT_RECIPIENTS, isContactMethod, isContactStage } from '@/lib/legislators/contact-stage';
import type { ContactMethod, ContactStage, LegislatorContact, LogContactsInput } from '@/types/contacts';

// The Contact Legislators tab's history. Like every db/queries module these
// functions do no auth: callers (guarded actions/routes) pass the session's
// userId, and a tenantId only after checking membership.

const MAX_RECIPIENT_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;

function baseQuery() {
  return db
    .selectFrom('legislator_contacts as lc')
    .innerJoin('user as u', 'u.id', 'lc.user_id')
    .select([
      'lc.id',
      'lc.bill_id',
      'lc.user_id',
      'lc.stage',
      'lc.recipient',
      'lc.method',
      'lc.note',
      'lc.contacted_at',
      'u.first_name',
      'u.last_name',
      'u.username',
    ]);
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

function toContact(row: Row, userId: string): LegislatorContact {
  return {
    id: row.id,
    billId: row.bill_id,
    stage: row.stage as ContactStage,
    recipient: row.recipient,
    method: row.method as ContactMethod,
    note: row.note,
    contactedAt: new Date(row.contacted_at).toISOString(),
    contactedBy: fullNameOrUsername({
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
    }),
    mine: row.user_id === userId,
  };
}

/**
 * The user's own contacts, plus — with a tenantId — every contact logged for
 * that org by its members, newest first.
 */
export async function listContacts(userId: string, tenantId?: string): Promise<LegislatorContact[]> {
  const rows = await baseQuery()
    .where((eb) =>
      tenantId
        ? eb.or([eb('lc.user_id', '=', userId), eb('lc.tenant_id', '=', tenantId)])
        : eb('lc.user_id', '=', userId),
    )
    .orderBy('lc.contacted_at', 'desc')
    .execute();
  return rows.map((row) => toContact(row, userId));
}

/** Logs one contact per recipient; returns them newest-first like listContacts. */
export async function logContacts(userId: string, input: LogContactsInput): Promise<LegislatorContact[]> {
  if (!isContactStage(input.stage)) throw new ApiError('INVALID_INPUT', 400, 'Invalid contact stage');
  if (!isContactMethod(input.method)) throw new ApiError('INVALID_INPUT', 400, 'Invalid contact method');
  const recipients = [...new Set((input.recipients ?? []).map((r) => r?.trim()).filter(Boolean))];
  if (recipients.length === 0) throw new ApiError('INVALID_INPUT', 400, 'Choose who you contacted');
  if (recipients.length > MAX_CONTACT_RECIPIENTS || recipients.some((r) => r.length > MAX_RECIPIENT_LENGTH)) {
    throw new ApiError('INVALID_INPUT', 400, 'Too many or too long recipients');
  }
  const note = input.note?.trim() || null;
  if (note && note.length > MAX_NOTE_LENGTH) throw new ApiError('INVALID_INPUT', 400, 'Note is too long');

  if (typeof input.billId !== 'string' || !isUuid(input.billId)) throw new ApiError('NOT_FOUND', 404, 'Bill not found');
  const bill = await db.selectFrom('bills').select('id').where('id', '=', input.billId).executeTakeFirst();
  if (!bill) throw new ApiError('NOT_FOUND', 404, 'Bill not found');

  const inserted = await db
    .insertInto('legislator_contacts')
    .values(
      recipients.map((recipient) => ({
        bill_id: input.billId,
        user_id: userId,
        tenant_id: input.tenantId ?? null,
        stage: input.stage,
        recipient,
        method: input.method,
        note,
      })),
    )
    .returning('id')
    .execute();

  const rows = await baseQuery()
    .where('lc.id', 'in', inserted.map((r) => r.id))
    .orderBy('lc.contacted_at', 'desc')
    .execute();
  return rows.map((row) => toContact(row, userId));
}

/** Removes one of the user's own logged contacts. */
export async function deleteContact(userId: string, contactId: string): Promise<void> {
  if (!isUuid(contactId)) throw new ApiError('NOT_FOUND', 404, 'Contact not found');
  const result = await db
    .deleteFrom('legislator_contacts')
    .where('id', '=', contactId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (Number(result.numDeletedRows) === 0) throw new ApiError('NOT_FOUND', 404, 'Contact not found');
}
