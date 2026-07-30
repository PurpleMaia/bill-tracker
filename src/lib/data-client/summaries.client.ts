import { defineClient } from './define-client';
import { summarizeDocumentAction, summarizeDiffAction } from '@/app/actions/summaries';
import type { SummaryResult } from '@/types/legislation';
import type { SummaryTarget } from '@/db/queries/summaries';

// ---- fetch arm ----

async function summarizeDocumentFetch(input: {
  target: SummaryTarget;
  billId: string;
  id: string;
}): Promise<SummaryResult> {
  // The [id] segment carries the BILL id, which the server uses to scope the
  // document lookup — the document's own id goes in the body.
  const res = await fetch(`/api/bills/${input.billId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: input.target, id: input.id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to summarize document');
  }
  return res.json();
}

async function summarizeDiffFetch(input: {
  billId: string;
  olderId: string;
  newerId: string;
}): Promise<SummaryResult> {
  const res = await fetch(`/api/bills/${input.billId}/summarize-diff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderId: input.olderId, newerId: input.newerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to summarize changes');
  }
  return res.json();
}

export const summariesClient = defineClient('summaries', {
  summarizeDocument: { action: summarizeDocumentAction, fetch: summarizeDocumentFetch },
  summarizeDiff: { action: summarizeDiffAction, fetch: summarizeDiffFetch },
});
