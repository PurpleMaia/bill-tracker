import { defineClient } from './define-client';
import { summarizeDocumentAction, summarizeDiffAction } from '@/app/actions/summaries';
import type { SummaryResult } from '@/types/legislation';
import type { SummaryTarget } from '@/db/queries/summaries';

// ---- fetch arm ----

async function summarizeDocumentFetch(input: {
  target: SummaryTarget;
  id: string;
}): Promise<SummaryResult> {
  // The [id] segment is unused by the document route (the body carries the
  // target + id), but the path must still resolve — use the document id.
  const res = await fetch(`/api/bills/${input.id}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
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
