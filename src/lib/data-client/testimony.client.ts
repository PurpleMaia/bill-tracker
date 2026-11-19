import { defineClient } from './define-client';
import {
  createTestimonyAction,
  deleteTestimonyAction,
  deleteTestimonyByIdAction,
  getTestimonyByIdAction,
  getTestimonyDraftAction,
  getTestimonyStatusesAction,
  listBillTestimoniesAction,
  listTestimonyBillOptionsAction,
  listTestimonyProspectsAction,
  listUserTestimoniesAction,
  markTestimonySubmittedAction,
  markTestimonySubmittedByIdAction,
  saveTestimonyDraftAction,
  updateTestimonyAction,
} from '@/app/actions/testimony';
import type {
  TestimonyBillOption,
  TestimonyCreateInput,
  TestimonyDraft,
  TestimonyDraftInput,
  TestimonyListItem,
  TestimonyProspect,
  TestimonyStatus,
  TestimonyUpdateInput,
} from '@/types/testimony';

// ---- fetch arm (hits /api/bills/[id]/testimony) ----

async function getTestimonyDraftFetch(billId: string): Promise<TestimonyDraft | null> {
  const res = await fetch(`/api/bills/${billId}/testimony`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load testimony draft');
  }
  return res.json();
}

async function saveTestimonyDraftFetch(input: TestimonyDraftInput): Promise<TestimonyDraft> {
  const res = await fetch(`/api/bills/${input.billId}/testimony`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save testimony draft');
  }
  return res.json();
}

async function markTestimonySubmittedFetch(billId: string): Promise<TestimonyDraft> {
  const res = await fetch(`/api/bills/${billId}/testimony`, { method: 'PATCH' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to mark testimony as submitted');
  }
  return res.json();
}

async function deleteTestimonyFetch(billId: string): Promise<void> {
  const res = await fetch(`/api/bills/${billId}/testimony`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete testimony');
  }
}

async function listUserTestimoniesFetch(): Promise<TestimonyListItem[]> {
  const res = await fetch('/api/testimony/list');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load testimonies');
  }
  return res.json();
}

async function listTestimonyProspectsFetch(): Promise<TestimonyProspect[]> {
  const res = await fetch('/api/testimony/prospects');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load bills needing testimony');
  }
  return res.json();
}

async function getTestimonyStatusesFetch(): Promise<TestimonyStatus[]> {
  const res = await fetch('/api/testimony');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load testimony statuses');
  }
  return res.json();
}

// ---- fetch arm, per testimony (hits /api/testimony/[testimonyId] and /api/bills/[id]/testimonies) ----

async function getTestimonyByIdFetch(testimonyId: string): Promise<TestimonyDraft | null> {
  const res = await fetch(`/api/testimony/${testimonyId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load testimony');
  }
  return res.json();
}

async function listBillTestimoniesFetch(billId: string): Promise<TestimonyDraft[]> {
  const res = await fetch(`/api/bills/${billId}/testimonies`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load testimonies for this bill');
  }
  return res.json();
}

async function createTestimonyFetch(input: TestimonyCreateInput): Promise<TestimonyDraft> {
  const res = await fetch(`/api/bills/${input.billId}/testimonies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start testimony');
  }
  return res.json();
}

async function updateTestimonyFetch(
  testimonyId: string,
  input: TestimonyUpdateInput,
): Promise<TestimonyDraft> {
  const res = await fetch(`/api/testimony/${testimonyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save testimony');
  }
  return res.json();
}

async function markTestimonySubmittedByIdFetch(testimonyId: string): Promise<TestimonyDraft> {
  const res = await fetch(`/api/testimony/${testimonyId}`, { method: 'PATCH' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to mark testimony as submitted');
  }
  return res.json();
}

async function deleteTestimonyByIdFetch(testimonyId: string): Promise<void> {
  const res = await fetch(`/api/testimony/${testimonyId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete testimony');
  }
}

async function listTestimonyBillOptionsFetch(): Promise<TestimonyBillOption[]> {
  const res = await fetch('/api/testimony/bill-options');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load your bills');
  }
  return res.json();
}

export const testimonyClient = defineClient('testimony', {
  getDraft: { action: getTestimonyDraftAction, fetch: getTestimonyDraftFetch },
  saveDraft: { action: saveTestimonyDraftAction, fetch: saveTestimonyDraftFetch },
  markSubmitted: { action: markTestimonySubmittedAction, fetch: markTestimonySubmittedFetch },
  getStatuses: { action: getTestimonyStatusesAction, fetch: getTestimonyStatusesFetch },
  list: { action: listUserTestimoniesAction, fetch: listUserTestimoniesFetch },
  remove: { action: deleteTestimonyAction, fetch: deleteTestimonyFetch },
  prospects: { action: listTestimonyProspectsAction, fetch: listTestimonyProspectsFetch },
  getById: { action: getTestimonyByIdAction, fetch: getTestimonyByIdFetch },
  listForBill: { action: listBillTestimoniesAction, fetch: listBillTestimoniesFetch },
  create: { action: createTestimonyAction, fetch: createTestimonyFetch },
  update: { action: updateTestimonyAction, fetch: updateTestimonyFetch },
  markSubmittedById: { action: markTestimonySubmittedByIdAction, fetch: markTestimonySubmittedByIdFetch },
  removeById: { action: deleteTestimonyByIdAction, fetch: deleteTestimonyByIdFetch },
  billOptions: { action: listTestimonyBillOptionsAction, fetch: listTestimonyBillOptionsFetch },
});
