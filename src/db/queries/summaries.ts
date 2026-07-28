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
}

/**
 * Loads everything needed to summarize one document, plus the bill's committee
 * assignments for the prompt's pipeline-position block. Returns null when the
 * row does not exist.
 */
export async function getSummarySource(
  target: SummaryTarget,
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
    .executeTakeFirst();

  return row ?? null;
}

/** Persists a generated summary with its provenance. */
export async function saveSummary(
  target: SummaryTarget,
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
