/**
 * Seeds a demo board with REAL food-related bills that already have draft
 * versions and committee reports in the DB, so the "Versions & Reports" panel
 * in the bill details dialog can be previewed with real data.
 *
 * Unlike scripts/seed-dummy-column-bills.ts, this does NOT create bills — the
 * measures already exist in `bills` (with rows in `bill_versions` /
 * `committee_reports`). It only adds tracking rows so they appear on a board:
 *   - user_bills (so the user tracks the bill)
 *   - org_bills  (org-scoped status → which kanban column the card lands in)
 *
 * Each demo bill is placed in a chosen column via org_bills.bill_status so the
 * board looks populated across several stages. For each bill_number we pick the
 * `bills` row that actually has versions (some numbers have multiple rows).
 *
 * Run:  npx tsx scripts/seed-versions-reports-demo.ts [username] [tenantName]
 *       defaults: username=jkapali, tenantName="Jaden Kapali"
 * Undo: npx tsx scripts/undo-seed-versions-reports-demo.ts [username] [tenantName]
 *
 * Idempotent: re-running only ensures the tracking rows exist (no duplicates).
 */
import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';

const TARGET_USERNAME = process.argv[2] ?? 'jkapali';
const TARGET_TENANT_NAME = process.argv[3] ?? 'Jaden Kapali';

/**
 * Curated real food-related bills that have versions + committee reports.
 * `column` is the kanban column the card should appear in (org_bills.bill_status),
 * chosen to spread the demo across several board stages.
 */
const DEMO_BILLS: Array<{ billNumber: string; column: BillStatus }> = [
  { billNumber: 'SB894 SD3 HD1', column: 'introduced' },
  { billNumber: 'HB1737', column: 'scheduled1' },
  { billNumber: 'SB2169', column: 'waiting2' },
  { billNumber: 'SB890 SD2 HD2', column: 'crossoverWaiting1' },
  { billNumber: 'SB763 SD2 HD3', column: 'crossoverScheduled2' },
  { billNumber: 'HB1334 HD3 SD2 CD2', column: 'passedCommittees' },
  { billNumber: 'HB2152 HD2 SD2 CD1', column: 'conferenceScheduled' },
  { billNumber: 'SB438 SD2 HD3', column: 'transmittedGovernor' },
];

async function main() {
  const user = await db
    .selectFrom('user')
    .select(['id', 'username'])
    .where('username', '=', TARGET_USERNAME)
    .executeTakeFirst();

  if (!user) {
    console.error(`User "${TARGET_USERNAME}" not found — nothing seeded.`);
    process.exit(1);
  }

  const tenant = await db
    .selectFrom('tenants')
    .select(['id', 'name'])
    .where('name', '=', TARGET_TENANT_NAME)
    .executeTakeFirst();

  if (!tenant) {
    console.error(`Tenant "${TARGET_TENANT_NAME}" not found — nothing seeded.`);
    process.exit(1);
  }

  const membership = await db
    .selectFrom('members')
    .select(['tenant_id'])
    .where('user_id', '=', user.id)
    .where('tenant_id', '=', tenant.id)
    .executeTakeFirst();

  if (!membership) {
    console.error(
      `User "${user.username}" is not a member of tenant "${tenant.name}" — nothing seeded.`,
    );
    process.exit(1);
  }

  const tenantId = tenant.id;
  let tracked = 0;
  const placed: string[] = [];
  const missing: string[] = [];

  await db.transaction().execute(async (trx) => {
    for (const { billNumber, column } of DEMO_BILLS) {
      // A bill_number can have more than one `bills` row; pick the one that
      // actually has versions (that's the row the dialog data hangs off).
      const bill = await trx
        .selectFrom('bills as b')
        .select(['b.id', 'b.bill_number'])
        .where('b.bill_number', '=', billNumber)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('bill_versions as bv')
              .select('bv.id')
              .whereRef('bv.bill_id', '=', 'b.id'),
          ),
        )
        .limit(1)
        .executeTakeFirst();

      if (!bill) {
        missing.push(billNumber);
        continue;
      }

      // org_bills: sets the displayed column for the org. Upsert the status so
      // re-runs re-pin the intended column.
      await trx
        .insertInto('org_bills')
        .values({ bill_id: bill.id, tenant_id: tenantId, bill_status: column })
        .onConflict((oc) =>
          oc.columns(['bill_id', 'tenant_id']).doUpdateSet({ bill_status: column }),
        )
        .execute();

      // user_bills: the user tracks the bill (org-scoped).
      const already = await trx
        .selectFrom('user_bills')
        .select('id')
        .where('user_id', '=', user.id)
        .where('bill_id', '=', bill.id)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!already) {
        await trx
          .insertInto('user_bills')
          .values({ user_id: user.id, bill_id: bill.id, tenant_id: tenantId })
          .execute();
        tracked++;
      }

      placed.push(`${billNumber} → ${column}`);
    }
  });

  console.log(
    `Demo seeded for ${user.username} / ${tenant.name}: ${placed.length} bills placed ` +
    `(${tracked} newly tracked).`,
  );
  for (const p of placed) console.log(`  • ${p}`);
  if (missing.length) {
    console.warn(`\nSkipped (no bills row with versions found): ${missing.join(', ')}`);
  }
  console.log(`\nUndo with: npx tsx scripts/undo-seed-versions-reports-demo.ts`);

  await db.destroy();
}

main().catch(async (err) => {
  console.error('Seeding failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
