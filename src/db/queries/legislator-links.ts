// NOTE: intentionally NOT a 'use server' module. These are write-side helpers
// for the backfill script (and later the scraper), never called from a client;
// marking them 'use server' would expose an unauthenticated write endpoint.
import { db } from '@/db/kysely/client';
import { currentCommitteeStep } from '@/lib/testimony/committees';
import { currentCommitteeForYear } from '@/lib/bills/current-committee-for-year';
import type { IntroducerLink, LegislatorRef } from '@/lib/legislators/introducer-links';

/**
 * Replaces a bill's introducer rows and its current_committee in ONE
 * transaction (delete → insert → update), so a re-run is idempotent.
 */
export async function writeBillLegislatorLinks(
  billId: string,
  links: IntroducerLink[],
  currentCommittee: string[] | null,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('bill_introducers').where('bill_id', '=', billId).execute();

    if (links.length > 0) {
      await trx
        .insertInto('bill_introducers')
        .values(
          links.map((l) => ({
            bill_id: billId,
            legislator_id: l.legislatorId,
            position: l.position,
          })),
        )
        .execute();
    }

    await trx
      .updateTable('bills')
      .set({ current_committee: currentCommittee })
      .where('id', '=', billId)
      .execute();
  });
}

/** Every legislator, in the shape `resolveIntroducers` needs. */
export async function getLegislatorRefs(): Promise<LegislatorRef[]> {
  const rows = await db
    .selectFrom('legislators')
    .select(['id', 'first_name', 'last_name', 'chamber'])
    .execute();
  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    chamber: r.chamber,
  }));
}

/**
 * Recomputes bills.current_committee from the bill's referral, dead flag, year,
 * CURRENT bill_status and status history. Call after anything in this app
 * writes bills.bill_status so the stored array never goes stale. Does not touch
 * bill_introducers.
 */
export async function recomputeCurrentCommittee(billId: string): Promise<void> {
  const bill = await db
    .selectFrom('bills')
    .select(['committee_assignment', 'dead', 'year', 'bill_status'])
    .where('id', '=', billId)
    .executeTakeFirst();
  if (!bill) return;

  const updates = await db
    .selectFrom('status_updates')
    .select('statustext')
    .where('bill_id', '=', billId)
    .execute();

  const step = currentCommitteeStep({
    committeeAssignment: bill.committee_assignment,
    updates: updates.map((u) => ({ statustext: u.statustext ?? '' })),
    billStatus: bill.bill_status ?? null,
    dead: bill.dead,
  });

  await db
    .updateTable('bills')
    .set({ current_committee: currentCommitteeForYear(bill.year, step) })
    .where('id', '=', billId)
    .execute();
}
