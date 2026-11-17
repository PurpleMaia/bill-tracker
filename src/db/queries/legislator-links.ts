// NOTE: intentionally NOT a 'use server' module. These are write-side helpers
// for the backfill script (and later the scraper), never called from a client;
// marking them 'use server' would expose an unauthenticated write endpoint.
import { db } from '@/db/kysely/client';
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
