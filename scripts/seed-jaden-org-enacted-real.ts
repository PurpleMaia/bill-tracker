/**
 * Adds ONE real, enacted bill to the "Jaden Kapali" org board so the dialog can
 * show a full end-to-end breakdown backed by genuine scraped data:
 *
 *   SB1396 SD3 HD3 CD2 — "RELATING TO ECONOMIC DEVELOPMENT.", signed into law
 *   (governorSigns), with 13 bill_versions, 6 committee_reports, 71 status_updates.
 *
 * Unlike scripts/seed-jaden-org-showcase.ts, this touches a REAL bill, so it only
 * inserts the org-tracking rows (user_bills + org_bills) — it NEVER inserts,
 * edits, or deletes the bill or its versions/reports/status_updates. The undo
 * (scripts/undo-jaden-org-enacted-real.ts) removes only those two tracking rows.
 *
 * Tracked under `jkapali` (the Jaden Kapali org admin).
 *
 * Run:  npx tsx scripts/seed-jaden-org-enacted-real.ts
 * Undo: npx tsx scripts/undo-jaden-org-enacted-real.ts
 *
 * Idempotent: re-running only ensures the tracking rows exist.
 */
import { db } from '@/db/kysely/client';

const TENANT_SLUG = 'jaden-kapali';
const ADMIN_USERNAME = 'jkapali';
const BILL_NUMBER = 'SB1396 SD3 HD3 CD2';

async function main() {
  const user = await db
    .selectFrom('user')
    .select(['id', 'username'])
    .where('username', '=', ADMIN_USERNAME)
    .executeTakeFirst();
  if (!user) {
    console.error(`User "${ADMIN_USERNAME}" not found — nothing seeded.`);
    process.exit(1);
  }

  const tenant = await db
    .selectFrom('tenants')
    .select(['id', 'name'])
    .where('slug', '=', TENANT_SLUG)
    .executeTakeFirst();
  if (!tenant) {
    console.error(`Tenant "${TENANT_SLUG}" not found — nothing seeded.`);
    process.exit(1);
  }

  const bill = await db
    .selectFrom('bills')
    .select(['id', 'bill_number', 'bill_status'])
    .where('bill_number', '=', BILL_NUMBER)
    .executeTakeFirst();
  if (!bill) {
    console.error(`Bill "${BILL_NUMBER}" not found in the database — nothing seeded.`);
    process.exit(1);
  }

  await db.transaction().execute(async (trx) => {
    // Org status mirrors the bill's real status so it lands in the enacted column.
    await trx
      .insertInto('org_bills')
      .values({ bill_id: bill.id, tenant_id: tenant.id, bill_status: bill.bill_status ?? 'unassigned' })
      .onConflict((oc) => oc.columns(['bill_id', 'tenant_id']).doNothing())
      .execute();

    const alreadyTracked = await trx
      .selectFrom('user_bills')
      .select('id')
      .where('user_id', '=', user.id)
      .where('bill_id', '=', bill.id)
      .where('tenant_id', '=', tenant.id)
      .executeTakeFirst();

    if (!alreadyTracked) {
      await trx
        .insertInto('user_bills')
        .values({ user_id: user.id, bill_id: bill.id, tenant_id: tenant.id })
        .execute();
    }
  });

  console.log(
    `Added real enacted bill "${bill.bill_number}" (${bill.bill_status}) to "${tenant.name}", tracked by ${user.username}.`,
  );
  console.log('Undo with: npx tsx scripts/undo-jaden-org-enacted-real.ts');

  await db.destroy();
}

main().catch(async (err) => {
  console.error('Seeding failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
