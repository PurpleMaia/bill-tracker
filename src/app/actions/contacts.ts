'use server';

import { requireMembership, requireSession } from '@/lib/auth/auth-guards';
import { deleteContact, listContacts, logContacts } from '@/db/queries/legislator-contacts';
import type { LegislatorContact, LogContactsInput } from '@/types/contacts';

/** Server-action arm for data.contacts.list. The caller's contacts, plus their org's with a tenantId. */
export async function listContactsAction(tenantId?: string): Promise<LegislatorContact[]> {
  const { user } = tenantId
    ? await requireMembership.fromAction(tenantId)
    : await requireSession.fromAction();
  return listContacts(user.id, tenantId);
}

/** Server-action arm for data.contacts.log. Logs the caller's outreach on a bill. */
export async function logContactsAction(input: LogContactsInput): Promise<LegislatorContact[]> {
  const { user } = input.tenantId
    ? await requireMembership.fromAction(input.tenantId)
    : await requireSession.fromAction();
  return logContacts(user.id, input);
}

/** Server-action arm for data.contacts.remove. Removes one of the caller's own contacts. */
export async function deleteContactAction(contactId: string): Promise<void> {
  const { user } = await requireSession.fromAction();
  return deleteContact(user.id, contactId);
}
