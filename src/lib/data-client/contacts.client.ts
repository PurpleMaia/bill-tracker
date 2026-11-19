import { defineClient } from './define-client';
import { deleteContactAction, listContactsAction, logContactsAction } from '@/app/actions/contacts';
import type { LegislatorContact, LogContactsInput } from '@/types/contacts';

// ---- fetch arm (hits /api/contacts and /api/contacts/[contactId]) ----

async function listContactsFetch(tenantId?: string): Promise<LegislatorContact[]> {
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  const res = await fetch(`/api/contacts${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load your contacts');
  }
  return res.json();
}

async function logContactsFetch(input: LogContactsInput): Promise<LegislatorContact[]> {
  const res = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save your contact');
  }
  return res.json();
}

async function deleteContactFetch(contactId: string): Promise<void> {
  const res = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove the contact');
  }
}

export const contactsClient = defineClient('contacts', {
  list: { action: listContactsAction, fetch: listContactsFetch },
  log: { action: logContactsAction, fetch: logContactsFetch },
  remove: { action: deleteContactAction, fetch: deleteContactFetch },
});
