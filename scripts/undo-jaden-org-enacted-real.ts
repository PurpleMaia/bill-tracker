/**
 * Removes the org-tracking rows created by scripts/seed-jaden-org-enacted-real.ts.
 *
 * Deletes ONLY the user_bills + org_bills rows that link SB1396 SD3 HD3 CD2 to
 * the Jaden Kapali org. The real bill and its versions/reports/status_updates are
 * never touched.
 *
 * Run: npx tsx scripts/undo-jaden-org-enacted-real.ts
 */
import { db } from '@/db/kysely/client';

const TENANT_SLUG = 'jaden-kapali';
const ADMIN_USERNAME = 'jkapali';
const BILL_NUMBER = 'SB1396 SD3 HD3 CD2';

async function main() {
  const tenant = await db
    .selectFrom('tenants')
    .select(['id'])
    .where('slug', '=', TENANT_SLUG)
    .executeTakeFirst();
  const user = await db
    .selectFrom('user')
    .select(['id'])
    .where('username', '=', ADMIN_USERNAME)
    .executeTakeFirst();
  const bill = await db
    .selectFrom('bills')
    .select(['id'])
    .where('bill_number', '=', BILL_NUMBER)
    .executeTakeFirst();

  if (!tenant || !user || !bill) {
    console.log('Tenant, user, or bill not found — nothing to undo.');
    await db.destroy();
    return;
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('user_bills')
      .where('bill_id', '=', bill.id)
      .where('tenant_id', '=', tenant.id)
      .where('user_id', '=', user.id)
      .execute();
    await trx
      .deleteFrom('org_bills')
      .where('bill_id', '=', bill.id)
      .where('tenant_id', '=', tenant.id)
      .execute();
  });

  console.log(`Removed "${BILL_NUMBER}" tracking rows from the Jaden Kapali org (bill itself untouched).`);
  await db.destroy();
}

main().catch(async (err) => {
  console.error('Undo failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
