// THE data-access layer for AI summaries. Per CLAUDE.md all Kysely queries live
// in src/db/queries/* — routes and actions are thin transports over these.
//
// Cache rule (spec §1): a summary is a HIT when ai_summary IS NOT NULL. The
// prompt version is provenance, NOT a staleness check — bumping it must not
// re-bill the corpus. Regeneration is explicit: clear ai_summary.

import { db } from '@/db/kysely/client';
import { SUMMARY_PROMPT_VERSION } from '@/lib/summary-prompts';

export type SummaryTarget = 'version' | 'report';

const TABLE = {
  version: 'bill_versions',
  report: 'committee_reports',
} as const;

export interface SummarySource {
  billId: string;
  label: string;
  originalText: string | null;
  aiSummary: string | null;
  /** bills.committee_assignment — the same field the status classifier uses. */
  committees: string | null;
  /** committee_reports.report_code (e.g. "HSCR65"); always null for versions. */
  reportCode: string | null;
}

/**
 * Loads everything needed to summarize one document, plus the bill's committee
 * assignments for the prompt's pipeline-position block. Returns null when the
 * row does not exist.
 *
 * SCOPED BY bill_id, for the same reason getVersionHtmlLinks is: the document id
 * arrives from the client, and a bare primary-key lookup would let any caller
 * summarize — and persist an ai_summary against — any row in the corpus by
 * guessing ids, including documents for bills they cannot see. Requiring the
 * document to belong to the bill in the request path means a mismatched pair
 * reads as "not found" rather than silently succeeding.
 */
export async function getSummarySource(
  target: SummaryTarget,
  billId: string,
  id: string,
): Promise<SummarySource | null> {
  const row = await db
    .selectFrom(TABLE[target])
    .innerJoin('bills', 'bills.id', `${TABLE[target]}.bill_id`)
    .select([
      `${TABLE[target]}.bill_id as billId`,
      `${TABLE[target]}.label as label`,
      `${TABLE[target]}.original_text as originalText`,
      `${TABLE[target]}.ai_summary as aiSummary`,
      'bills.committee_assignment as committees',
    ])
    .where(`${TABLE[target]}.id`, '=', id)
    .where(`${TABLE[target]}.bill_id`, '=', billId)
    .executeTakeFirst();

  if (!row) return null;

  // report_code exists only on committee_reports, so it cannot be part of the
  // shared select above. Fetched separately rather than duplicating the whole
  // query per table. Carries the same bill_id predicate as the row above — this
  // point is only reachable once the scoped lookup succeeded, so it is redundant
  // today, but an unscoped lookup here would quietly become a hole if this block
  // were ever hoisted above that check.
  if (target === 'report') {
    const codeRow = await db
      .selectFrom('committee_reports')
      .select('report_code')
      .where('id', '=', id)
      .where('bill_id', '=', billId)
      .executeTakeFirst();
    return { ...row, reportCode: codeRow?.report_code ?? null };
  }

  return { ...row, reportCode: null };
}

/**
 * Persists a generated summary with its provenance. Scoped by bill_id to match
 * getSummarySource — the read is the authorization check, so the write must be
 * constrained identically or it reintroduces the id-guessing hole on the write
 * side.
 */
export async function saveSummary(
  target: SummaryTarget,
  billId: string,
  id: string,
  summary: string,
): Promise<void> {
  await db
    .updateTable(TABLE[target])
    .set({
      ai_summary: summary,
      summary_prompt_version: SUMMARY_PROMPT_VERSION,
      summary_generated_at: new Date(),
    })
    .where('id', '=', id)
    .where('bill_id', '=', billId)
    .execute();
}

/**
 * The bill's committee assignments, for the diff-summary prompt's pipeline-
 * position block. Null both when the bill row is missing and when the column
 * itself is null.
 */
export async function getBillCommittees(billId: string): Promise<string | null> {
  const row = await db
    .selectFrom('bills')
    .select('committee_assignment')
    .where('id', '=', billId)
    .executeTakeFirst();

  return row?.committee_assignment ?? null;
}
