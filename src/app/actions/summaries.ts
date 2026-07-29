'use server';

// Action arm for AI summaries. THE consent boundary: opt-in is read from the DB
// here, server-side, before any inference. The client-side check in
// report-summary.tsx is a UI courtesy, NOT enforcement (spec §3).
//
// A cache hit is not an inference — it returns without calling the model.

import { requireSession } from '@/lib/auth-guards';
import { getUserPreferences } from '@/db/queries/user-preferences';
import {
  getSummarySource,
  saveSummary,
  getBillCommittees,
  type SummaryTarget,
} from '@/db/queries/summaries';
import { getVersionHtmlLinks } from '@/db/queries/bills-read';
import { parseVersionLabelFromReport } from '@/lib/bill-versions';
import {
  summarizeDocumentWithLLM,
  summarizeReportWithLLM,
  summarizeDiffWithLLM,
  getSummaryModelName,
} from '@/services/llm';
import { compareVersionHtml } from '@/services/bill-diff';
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

  // Bill versions and committee reports get DIFFERENT prompts. A version is the
  // proposed law; a report is a record of what a committee did to it (passed,
  // amended, deferred, who testified). Summarizing a report with the bill prompt
  // produced a description of the measure and buried the actions.
  const rateLimitKey = `llm:summary:${input.target}:${input.id}`;
  const summary =
    input.target === 'report'
      ? await summarizeReportWithLLM({
          label: source.label,
          reportCode: source.reportCode,
          // A report label embeds the version it belongs to, e.g.
          // HB139_HD1_HSCR65 -> HB139_HD1.
          versionLabel: parseVersionLabelFromReport(source.label),
          text: source.originalText,
          rateLimitKey,
        })
      : await summarizeDocumentWithLLM({
          label: source.label,
          kind: 'bill version',
          committees: source.committees,
          text: source.originalText,
          rateLimitKey,
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
  const { older, newer } = await getVersionHtmlLinks(input.billId, input.olderId, input.newerId);
  if (!older || !newer) throw new ApiError('NOT_FOUND', 404, 'Version not found.');

  const committees = await getBillCommittees(input.billId);

  const comparison = await compareVersionHtml({
    olderLabel: older.label,
    newerLabel: newer.label,
    olderUrl: older.htmlLink,
    newerUrl: newer.htmlLink,
  });

  // No diff, no summary (spec §Error handling). An ungrounded account of a
  // legislative amendment is worse than none.
  //
  // "Nothing to summarize" covers two cases: the comparison failed outright, and
  // the comparison succeeded but found no CHANGED section. The second is why we
  // count changed sections rather than all sections — a parse can return a full
  // set of sections all tagged 'unchanged' (comparing a version against itself
  // does exactly this), and paying for an inference to be told "nothing changed"
  // is waste when the diff already knows it for free.
  const changedSections = comparison.sections.filter((s) => s.kind !== 'unchanged');
  if (comparison.error || changedSections.length === 0) {
    throw new ApiError('NO_DIFF', 422, 'These versions could not be compared, so there is nothing to summarize.');
  }

  const summary = await summarizeDiffWithLLM({
    comparison,
    committees,
    rateLimitKey: `llm:diff:${input.olderId}:${input.newerId}`,
  });

  if (!summary) {
    throw new ApiError('SUMMARY_FAILED', 502, "Couldn't summarize these changes. Try again.");
  }

  return { summary, model: await getSummaryModelName() };
}
