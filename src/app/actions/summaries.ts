'use server';

// Action arm for AI summaries. THE consent boundary: opt-in is read from the DB
// here, server-side, before any inference. The client-side check in
// report-summary.tsx is a UI courtesy, NOT enforcement (spec §3).
//
// A cache hit is not an inference — it returns without calling the model.

import { requireSession } from '@/lib/auth-guards';
import { getUserPreferences } from '@/db/queries/user-preferences';
import { getSummarySource, saveSummary, type SummaryTarget } from '@/db/queries/summaries';
import { summarizeDocumentWithLLM, summarizeDiffWithLLM, getSummaryModelName } from '@/services/llm';
import { compareVersionHtml } from '@/services/bill-diff';
import { db } from '@/db/kysely/client';
import { ApiError } from '@/lib/errors';
import type { SummaryResult } from '@/types/legislation';

const AI_NOT_OPTED_IN = new ApiError(
  'AI_NOT_OPTED_IN',
  403,
  'AI summaries are off for your account. Enable them in Settings.',
);

/** Reads consent from the DB. Never trust a client-supplied flag. */
async function requireAiOptIn(): Promise<void> {
  const { user } = await requireSession.fromAction();
  const prefs = await getUserPreferences(user.id);
  if (prefs.ai_opt_in !== true) throw AI_NOT_OPTED_IN;
}

export async function summarizeDocumentAction(input: {
  target: SummaryTarget;
  id: string;
}): Promise<SummaryResult> {
  await requireAiOptIn();

  const source = await getSummarySource(input.target, input.id);
  if (!source) throw new ApiError('NOT_FOUND', 404, 'Document not found.');

  const model = await getSummaryModelName();

  // Cache hit: no inference, no tokens, no write.
  if (source.aiSummary) return { summary: source.aiSummary, model };

  if (!source.originalText || source.originalText.trim().length === 0) {
    throw new ApiError('NO_TEXT', 422, 'This document has no stored text to summarize.');
  }

  const summary = await summarizeDocumentWithLLM({
    label: source.label,
    kind: input.target === 'version' ? 'bill version' : 'committee report',
    committees: source.committees,
    text: source.originalText,
    rateLimitKey: `llm:summary:${input.target}:${input.id}`,
  });

  if (!summary) {
    throw new ApiError('SUMMARY_FAILED', 502, "Couldn't summarize this document. Try again.");
  }

  await saveSummary(input.target, input.id, summary);
  return { summary, model };
}

export async function summarizeDiffAction(input: {
  billId: string;
  olderId: string;
  newerId: string;
}): Promise<SummaryResult> {
  await requireAiOptIn();

  // Diff summaries are never persisted (spec §2), so this recomputes the
  // comparison every call. The input is small — changed fragments only.
  const versions = await db
    .selectFrom('bill_versions')
    .select(['id', 'label', 'html_link'])
    .where('bill_id', '=', input.billId)
    .execute();

  const older = versions.find((v) => v.id === input.olderId);
  const newer = versions.find((v) => v.id === input.newerId);
  if (!older || !newer) throw new ApiError('NOT_FOUND', 404, 'Version not found.');

  const bill = await db
    .selectFrom('bills')
    .select('committee_assignment')
    .where('id', '=', input.billId)
    .executeTakeFirst();

  const comparison = await compareVersionHtml({
    olderLabel: older.label,
    newerLabel: newer.label,
    olderUrl: older.html_link,
    newerUrl: newer.html_link,
  });

  // No diff, no summary (spec §Error handling). An ungrounded account of a
  // legislative amendment is worse than none.
  if (comparison.error || comparison.sections.length === 0) {
    throw new ApiError('NO_DIFF', 422, 'These versions could not be compared, so there is nothing to summarize.');
  }

  const summary = await summarizeDiffWithLLM({
    comparison,
    committees: bill?.committee_assignment ?? null,
    rateLimitKey: `llm:diff:${input.olderId}:${input.newerId}`,
  });

  if (!summary) {
    throw new ApiError('SUMMARY_FAILED', 502, "Couldn't summarize these changes. Try again.");
  }

  return { summary, model: await getSummaryModelName() };
}
