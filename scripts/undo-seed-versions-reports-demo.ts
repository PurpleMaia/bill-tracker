/**
 * Removes the tracking rows created by scripts/seed-versions-reports-demo.ts.
 *
 * IMPORTANT: this only deletes the user_bills / org_bills rows that link the
 * demo bills to the target user/tenant. The bills themselves and their
 * bill_versions / committee_reports are REAL data and are never touched.
 *
 * Run: npx tsx scripts/undo-seed-versions-reports-demo.ts [username] [tenantName]
 *      defaults: username=jkapali, tenantName="Jaden Kapali"
 */
import { db } from '@/db/kysely/client';

const TARGET_USERNAME = process.argv[2] ?? 'jkapali';
const TARGET_TENANT_NAME = process.argv[3] ?? 'Jaden Kapali';

// Keep in sync with DEMO_BILLS in seed-versions-reports-demo.ts.
const DEMO_BILL_NUMBERS = [
  'SB894 SD3 HD1',
  'HB1737',
  'SB2169',
  'SB890 SD2 HD2',
  'SB763 SD2 HD3',
  'HB1334 HD3 SD2 CD2',
  'HB2152 HD2 SD2 CD1',
  'SB438 SD2 HD3',
];

async function main() {
  const user = await db
    .selectFrom('user')
    .select(['id', 'username'])
    .where('username', '=', TARGET_USERNAME)
    .executeTakeFirst();

  const tenant = await db
    .selectFrom('tenants')
    .select(['id', 'name'])
    .where('name', '=', TARGET_TENANT_NAME)
    .executeTakeFirst();

  if (!user || !tenant) {
    console.log('User or tenant not found — nothing to undo.');
    await db.destroy();
    return;
  }

  const bills = await db
    .selectFrom('bills')
    .select(['id', 'bill_number'])
    .where('bill_number', 'in', DEMO_BILL_NUMBERS)
    .execute();

  if (bills.length === 0) {
    console.log('No demo bills found — nothing to undo.');
    await db.destroy();
    return;
  }

  const ids = bills.map((b) => b.id);
  let removedUserBills = 0;
  let removedOrgBills = 0;

  await db.transaction().execute(async (trx) => {
    const ub = await trx
      .deleteFrom('user_bills')
      .where('bill_id', 'in', ids)
      .where('user_id', '=', user.id)
      .where('tenant_id', '=', tenant.id)
      .executeTakeFirst();
    removedUserBills = Number(ub.numDeletedRows ?? 0);

    const ob = await trx
      .deleteFrom('org_bills')
      .where('bill_id', 'in', ids)
      .where('tenant_id', '=', tenant.id)
      .executeTakeFirst();
    removedOrgBills = Number(ob.numDeletedRows ?? 0);
  });

  console.log(
    `Removed demo tracking for ${user.username} / ${tenant.name}: ` +
    `${removedUserBills} user_bills, ${removedOrgBills} org_bills rows. ` +
    `(Real bills, versions, and reports left intact.)`,
  );

  await db.destroy();
}

main().catch(async (err) => {
  console.error('Undo failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
