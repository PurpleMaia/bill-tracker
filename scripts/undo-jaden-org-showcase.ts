/**
 * Removes everything created by scripts/seed-jaden-org-showcase.ts.
 *
 * Deletion is keyed strictly on the bill_url prefix used by that seed script,
 * so real bills, the existing ~62 Jaden-org bills, and the other dummy sets are
 * never touched. All rows referencing the seeded bills are removed first, then
 * the bills themselves.
 *
 * Run: npx tsx scripts/undo-jaden-org-showcase.ts
 */
import { db } from '@/db/kysely/client';
import { sql } from 'kysely';

const URL_PREFIX = 'https://dummy.test/jaden-showcase/';

async function main() {
  const bills = await db
    .selectFrom('bills')
    .select(['id', 'bill_number'])
    .where('bill_url', 'like', `${URL_PREFIX}%`)
    .execute();

  if (bills.length === 0) {
    console.log('No seeded Jaden showcase bills found — nothing to undo.');
    await db.destroy();
    return;
  }

  const ids = bills.map((b) => b.id);

  await db.transaction().execute(async (trx) => {
    // Referencing tables first (FKs), then the bills themselves.
    await trx.deleteFrom('user_bills').where('bill_id', 'in', ids).execute();
    await trx.deleteFrom('bill_tags').where('bill_id', 'in', ids).execute();
    await trx.deleteFrom('status_updates').where('bill_id', 'in', ids).execute();
    await trx.deleteFrom('pending_proposals').where('bill_id', 'in', ids).execute();
    await trx.deleteFrom('user_bill_preferences').where('bill_id', 'in', ids).execute();
    await trx.deleteFrom('org_bills').where('bill_id', 'in', ids).execute();
    await trx.deleteFrom('testimonies').where('bill_id', 'in', ids).execute();
    // Not in the generated Kysely types, so raw SQL (parameterized) for these.
    await sql`DELETE FROM bill_versions WHERE bill_id IN (${sql.join(ids)})`.execute(trx);
    await sql`DELETE FROM committee_reports WHERE bill_id IN (${sql.join(ids)})`.execute(trx);

    await trx.deleteFrom('bills').where('id', 'in', ids).execute();
  });

  console.log(`Removed ${bills.length} seeded showcase bills and all their related rows:`);
  console.log(bills.map((b) => b.bill_number).join(', '));

  await db.destroy();
}

main().catch(async (err) => {
  console.error('Undo failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
